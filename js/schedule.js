// schedule.js — Builds the RFA regular-season schedule.
//
// 22 teams in 4 divisions (two with 6 teams, two with 5). 12 weeks, every
// team plays every week — no byes anywhere:
//
//   10 weeks per division  Divisional double round robin. 6-team divisions:
//                          3 games per week, everyone busy. 5-team
//                          divisions: 2 games per week and one team idle —
//                          that idle team plays the idle team of the OTHER
//                          5-team division, so the interdivisional series
//                          absorbs the byes.
//   2 weeks per division pair  Full cross-play. The two 6-team divisions
//                          cross-play (6 games, everyone busy); the two
//                          5-team divisions play a full inter round (5
//                          games). WHICH weeks these are is seeded, so
//                          cross-division games are scattered over the
//                          calendar instead of piling up at the end.
//
// Each team therefore plays exactly 12 games: every divisional opponent
// twice, plus 2 (6-team divisions) or 4 (5-team divisions) interdivisional
// opponents once — never an interdivisional rematch. The 5-team divisions
// bank 2 inter games on their bye weeks and play 2 more on the cross weeks,
// so each meets 4 distinct opponents of its partner division and skips
// exactly one.
//
// The second half of each double round robin runs in rotated order so no
// team meets the same opponent two weeks running. Team order inside each
// division is seeded-shuffled per season, so the fixture list changes from
// year to year while the structure stays fixed.

// ── Deterministic PRNG (a season's schedule can be rebuilt from its seed) ──
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Circle-method round robin ──
// `ids` may be odd — a null ghost pads it, and the ghost's opponent for the
// round sits out (reported as `bye`). Returns one round per opponent.
function roundRobin(ids) {
  const ring = ids.slice();
  if (ring.length % 2) ring.push(null);
  const n = ring.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    let bye = null;
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i], b = ring[n - 1 - i];
      if (a == null || b == null) bye = a == null ? b : a;
      else pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push({ pairs, bye });
    ring.splice(1, 0, ring.pop()); // rotate; the first seat stays fixed
  }
  return rounds;
}

// ── Perfect matching in a bipartite graph (Kuhn's augmenting paths) ──
// adj: per left vertex, an array of right-vertex INDICES.
// Returns matchL (left index → right index), or null if none exists.
function perfectMatching(adj, nR) {
  const matchL = new Array(adj.length).fill(-1);
  const matchR = new Array(nR).fill(-1);
  function augment(u, seen) {
    for (const v of adj[u]) {
      if (seen[v]) continue;
      seen[v] = true;
      if (matchR[v] === -1 || augment(matchR[v], seen)) {
        matchL[u] = v;
        matchR[v] = u;
        return true;
      }
    }
    return false;
  }
  for (let u = 0; u < adj.length; u++) {
    if (!augment(u, new Array(nR).fill(false))) return null;
  }
  return matchL;
}

// Rotated order for the second half of every double round robin: a
// derangement of 0..4, so no round repeats and no opponent reappears in
// consecutive weeks. For the 5-team divisions it also moves the bye
// pattern between the halves (see below).
const ROT = [2, 3, 4, 0, 1];

function createSchedule(divisions, seed) {
  // ── Structural checks — data.js must feed this exactly ──
  if (!Array.isArray(divisions) || divisions.length !== 4) {
    throw new Error('schedule.js — DIVISIONS must hold exactly 4 divisions');
  }
  const sizes = divisions.map(d => d.teams.length);
  if (sizes[0] !== 6 || sizes[1] !== 6 || sizes[2] !== 5 || sizes[3] !== 5) {
    throw new Error('schedule.js — divisions must be 6/6/5/5 teams, got ' + sizes.join('/'));
  }

  const rng = mulberry32(seed);
  const N_WEEKS = 12;
  const weeks = Array.from({ length: N_WEEKS }, () => []);
  const add = (w, a, b, div, inter) => weeks[w].push({ a, b, div, inter: !!inter });

  // Season-specific working order inside each division (the fixture list
  // varies from season to season; the structure does not)
  const order = divisions.map(d => shuffled(d.teams.map(t => t.name), rng));
  const rr = order.map(roundRobin);

  // Round-consumption order per division: the first half of the double
  // round robin in natural order, the second half rotated — except division
  // 2, which repeats its order so its bye pattern is what the bye-week
  // inter games hang on (see below).
  const SEQ_ROT = [0, 1, 2, 3, 4, ROT[0], ROT[1], ROT[2], ROT[3], ROT[4]];
  const SEQ_REP = [0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
  const seq = [SEQ_ROT, SEQ_ROT, SEQ_REP, SEQ_ROT];

  // ── Pick the cross-play weeks (seeded — they move every season) ──
  // Each division pair spends two of the twelve weeks on full interdivisional
  // rounds; every other week is divisional play (with the 5-team divisions'
  // byes soaking up one inter game each). Which weeks get picked is random,
  // so cross-division games land all over the calendar.
  const weekOrder = shuffled([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], rng);
  const cross61 = [weekOrder[0], weekOrder[1]]; // 6-team divisions cross-play
  const cross53 = [weekOrder[2], weekOrder[3]]; // 5-team divisions cross-play

  // ── Lay out the divisional weeks and bank the bye-week inter games ──
  const pos = [0, 0, 0, 0]; // next index into seq[] per division
  const byePairs = [];
  for (let w = 0; w < N_WEEKS; w++) {
    if (cross61.includes(w)) {
      // The two 6-team divisions cross-play: team i of one meets team i
      // (first cross week) then team i+1 (second) of the other — a perfect
      // week of 6 games.
      const half = cross61.indexOf(w);
      for (let i = 0; i < 6; i++) {
        add(w, order[0][i], order[1][half === 0 ? i : (i + 1) % 6], 'RFA', true);
      }
    } else {
      for (const [a, b] of rr[0][seq[0][pos[0]++]].pairs) add(w, a, b, divisions[0].name, false);
      for (const [a, b] of rr[1][seq[1][pos[1]++]].pairs) add(w, a, b, divisions[1].name, false);
    }
    if (cross53.includes(w)) continue; // filled in below, after the matchings
    for (const [a, b] of rr[2][seq[2][pos[2]]].pairs) add(w, a, b, divisions[2].name, false);
    for (const [a, b] of rr[3][seq[3][pos[3]]].pairs) add(w, a, b, divisions[3].name, false);
    // Each week the idle team of division 2 plays the idle team of division
    // 3. The shifted bye patterns mean every team gets 2 inter games here —
    // against 2 different opponents.
    const c = rr[2][seq[2][pos[2]]].bye;
    const d = rr[3][seq[3][pos[3]]].bye;
    byePairs.push([c, d]);
    add(w, c, d, 'RFA', true);
    pos[2]++; pos[3]++;
  }

  // ── Fill the two 5-team cross-play weeks ──
  // After the bye games each team of divisions 2/3 has met 2 inter opponents
  // and needs 2 more, against opponents it hasn't played. The remaining
  // allowed pairs form a 3-regular bipartite graph — decompose it into
  // perfect matchings and use two of them; the third is the one opponent
  // each team skips.
  const C = order[2], D = order[3];
  const played = new Set(byePairs.map(([c, d]) => c + '|' + d));
  const allowedIdx = C.map(c =>
    D.map((d, di) => di).filter(di => !played.has(c + '|' + D[di])));
  const m1 = perfectMatching(allowedIdx, D.length);
  if (!m1) throw new Error('schedule.js — no interdivisional matching found');
  const allowed2 = allowedIdx.map((list, ci) => list.filter(di => di !== m1[ci]));
  const m2 = perfectMatching(allowed2, D.length);
  if (!m2) throw new Error('schedule.js — no second interdivisional matching');
  cross53.forEach((w, half) => {
    const m = half === 0 ? m1 : m2;
    C.forEach((c, ci) => add(w, c, D[m[ci]], 'RFA', true));
  });

  // ── Sanity check: 12 games per team, once per week, no triple rematches ──
  const errs = validateSchedule(weeks, order.flat());
  if (errs.length) console.error('schedule.js — invalid schedule:', errs);

  return { weeks };
}

function validateSchedule(weeks, names) {
  const errs = [];
  const totals = new Map(names.map(n => [n, 0]));
  const pairCount = new Map();
  weeks.forEach((list, w) => {
    const seen = new Set();
    for (const g of list) {
      for (const t of [g.a, g.b]) {
        if (!totals.has(t)) { errs.push('unknown team: ' + t); continue; }
        totals.set(t, totals.get(t) + 1);
        if (seen.has(t)) errs.push(`week ${w}: ${t} plays twice`);
        seen.add(t);
      }
      const key = [g.a, g.b].sort().join('|');
      pairCount.set(key, (pairCount.get(key) || 0) + 1);
    }
  });
  for (const [t, n] of totals) if (n !== 12) errs.push(`${t}: ${n} games (want 12)`);
  for (const [k, n] of pairCount) if (n > 2) errs.push(`${k}: ${n} meetings`);
  return errs;
}
