// schedule.js — Builds the RFA regular-season schedule.
//
// 22 teams in 4 divisions (two with 6 teams, two with 5). 12 weeks, every
// team plays every week — no byes anywhere:
//
//   Weeks 1–10   Divisional double round robin in all four divisions.
//                6-team divisions: 3 games per week, everyone busy.
//                5-team divisions: 2 games per week and one team idle —
//                that idle team plays the idle team of the OTHER 5-team
//                division, so the interdivisional series absorbs the byes.
//   Weeks 11–12  Interdivisional only. The two 6-team divisions cross-play
//                (each team meets 2 teams of the other). The two 5-team
//                divisions finish their 4-game inter slate: they have 2
//                games banked from the bye weeks and play 2 more here, so
//                each team meets 4 distinct opponents of its partner
//                division and skips exactly one.
//
// Each team therefore plays exactly 12 games: every divisional opponent
// twice, plus 2 (6-team divisions) or 4 (5-team divisions) interdivisional
// opponents once — never an interdivisional rematch.
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

  // ── Weeks 1–10: divisional double round robin everywhere ──
  // Division 2 (first 5-team division) repeats its round order — its bye
  // pattern is what the bye-week inter games hang on. Division 3 rotates
  // its order, so its bye weeks move and the same pairings don't repeat.
  for (let w = 0; w < 10; w++) {
    divisions.forEach((d, di) => {
      const base = w < 5 ? w : (di === 2 ? w - 5 : ROT[w - 5]);
      for (const [a, b] of rr[di][base].pairs) add(w, a, b, d.name, false);
    });
  }

  // ── Weeks 1–10: interdivisional games on the 5-team bye slots ──
  // Each week the idle team of division 2 plays the idle team of division
  // 3. The rotated bye pattern means every team gets 2 inter games here —
  // against 2 different opponents.
  const byePairs = [];
  for (let w = 0; w < 10; w++) {
    const c = rr[2][w % 5].bye;
    const d = rr[3][w < 5 ? w : ROT[w - 5]].bye;
    byePairs.push([c, d]);
    add(w, c, d, 'RFA', true);
  }

  // ── Weeks 11–12: interdivisional only ──
  // The two 6-team divisions cross-play: team i of one meets team i, then
  // team i+1, of the other — 2 games each, perfect weeks of 6.
  for (let i = 0; i < 6; i++) {
    add(10, order[0][i], order[1][i], 'RFA', true);
    add(11, order[0][i], order[1][(i + 1) % 6], 'RFA', true);
  }

  // The two 5-team divisions need 2 more inter games each, against
  // opponents they haven't met. The remaining allowed pairs form a
  // 3-regular bipartite graph — decompose it into perfect matchings and
  // use two of them; the third is the one opponent each team skips.
  const C = order[2], D = order[3];
  const played = new Set(byePairs.map(([c, d]) => c + '|' + d));
  const allowedIdx = C.map(c =>
    D.map((d, di) => di).filter(di => !played.has(c + '|' + D[di])));
  const m1 = perfectMatching(allowedIdx, D.length);
  if (!m1) throw new Error('schedule.js — no interdivisional matching found');
  const allowed2 = allowedIdx.map((list, ci) => list.filter(di => di !== m1[ci]));
  const m2 = perfectMatching(allowed2, D.length);
  if (!m2) throw new Error('schedule.js — no second interdivisional matching');
  C.forEach((c, ci) => add(10, c, D[m1[ci]], 'RFA', true));
  C.forEach((c, ci) => add(11, c, D[m2[ci]], 'RFA', true));

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
