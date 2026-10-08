// manager.js — RFA career mode.
// 22 teams in 4 divisions (2×6, 2×5). A 12-week regular season where every
// team plays every week (schedule.js builds the fixtures), then the division
// playoffs — top 3 per division, seeds 2 vs 3 with the winner facing seed 1 —
// and Championship Weekend: two semifinals and the RFA Final. No third-place
// game; the final's winner is RFA champion.
// Screens: HUB (season overview) → WEEK (this week's schedule) → MATCH (the
// game itself, via game.js) → back to WEEK → … → SUMMARY (season result).

const SAVE_KEY = 'retro-frisbee-manager-v2';

const REGULAR_WEEKS = 12;   // weeks 0..11 = regular season
const WEEK_DIV_SF = 12;     // division semifinals (2 vs 3)
const WEEK_DIV_F = 13;      // division finals (1 vs SF winner)
const WEEK_CHAMP = 14;      // championship weekend (semis, then the final)

function createManager(game) {
  // ── Persistent career state ──
  let year = 1;
  let week = 0;          // 0..14
  let champStage = 0;    // championship weekend sub-stage: 0 = semis, 1 = final
  let schedule = null;   // { weeks: [[{a,b,div,inter}]] } — regular season only
  let games = [];        // every game (regular season + postseason)
  let champion = null;   // RFA champion team name once the season is over
  let history = [];      // franchise season results: {year, w, l, note}

  // ── Runtime state ──
  let screen = 'HUB';    // HUB | WEEK | MATCH | SUMMARY
  let lastMatch = null;  // { myScore, oppScore, won, opp, oppShort, tag, _fresh }
  let summary = null;    // season-end snapshot for the SUMMARY screen
  let tapCooldown = 0;   // ignore taps right after a screen change

  // ── Team helpers ──
  function teamByName(name) { return TEAMS.find(t => t.name === name); }
  function teamShort(name) {
    const t = teamByName(name);
    return t ? t.short : name.slice(0, 3).toUpperCase();
  }
  function divisionOf(name) {
    return DIVISIONS.find(d => d.teams.some(t => t.name === name));
  }

  // ── Save / load (browser storage; the game still works without it) ──
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 2, year, week, champStage, schedule, games, champion, history,
      }));
    } catch (e) { /* storage unavailable — career runs in-session only */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (s.v !== 2 || !s.schedule || !Array.isArray(s.games)) return false;
      year = s.year || 1;
      week = s.week || 0;
      champStage = s.champStage || 0;
      schedule = s.schedule;
      games = s.games;
      champion = s.champion || null;
      history = Array.isArray(s.history) ? s.history : [];
      return true;
    } catch (e) { return false; }
  }

  // ── Season setup ──
  // A game: { id, week, sub, a, b, scoreA, scoreB, played, tag, div, isPlayer }
  // `sub` only matters on championship weekend (0 = semis, 1 = final).
  function startSeason() {
    schedule = createSchedule(DIVISIONS, (year * 7919 + 104729) >>> 0);
    games = [];
    schedule.weeks.forEach((list, w) => {
      for (const g of list) {
        games.push({
          id: games.length, week: w, sub: 0, a: g.a, b: g.b,
          scoreA: 0, scoreB: 0, played: false,
          tag: g.inter ? 'Interdivisional' : g.div, div: g.inter ? 'RFA' : g.div,
          isPlayer: g.a === FRANCHISE || g.b === FRANCHISE,
        });
      }
    });
    champion = null;
    champStage = 0;
    week = 0;
    lastMatch = null;
    summary = null;
    save();
  }

  // ── Standings (regular-season games only) ──
  // Order: wins, then point differential, then points for.
  function computeStandings() {
    const tables = DIVISIONS.map(d => ({
      name: d.name,
      rows: d.teams.map(t => ({ name: t.name, short: t.short, w: 0, l: 0, pf: 0, pa: 0, diff: 0 })),
    }));
    const rowOf = new Map();
    tables.forEach(t => t.rows.forEach(r => rowOf.set(r.name, r)));
    for (const g of games) {
      if (g.week >= REGULAR_WEEKS || !g.played) continue;
      const ra = rowOf.get(g.a), rb = rowOf.get(g.b);
      if (!ra || !rb) continue;
      ra.pf += g.scoreA; ra.pa += g.scoreB;
      rb.pf += g.scoreB; rb.pa += g.scoreA;
      if (g.scoreA > g.scoreB) { ra.w++; rb.l++; } else { rb.w++; ra.l++; }
    }
    for (const t of tables) {
      for (const r of t.rows) r.diff = r.pf - r.pa;
      t.rows.sort((x, y) =>
        y.w - x.w || y.diff - x.diff || y.pf - x.pf || x.name.localeCompare(y.name));
    }
    return tables;
  }

  function franchiseRecord() {
    let w = 0, l = 0;
    for (const g of games) {
      if (g.week >= REGULAR_WEEKS || !g.played) continue;
      if (g.a !== FRANCHISE && g.b !== FRANCHISE) continue;
      const my = g.a === FRANCHISE ? g.scoreA : g.scoreB;
      const opp = g.a === FRANCHISE ? g.scoreB : g.scoreA;
      if (my > opp) w++; else l++;
    }
    return { w, l };
  }

  // ── Postseason construction (built lazily as each round completes) ──
  function pushGame(w, sub, a, b, tag, div) {
    games.push({
      id: games.length, week: w, sub, a, b, scoreA: 0, scoreB: 0,
      played: false, tag, div,
      isPlayer: a === FRANCHISE || b === FRANCHISE,
    });
  }
  function winner(m) { return m.scoreA > m.scoreB ? m.a : m.b; }
  function loser(m) { return m.scoreA > m.scoreB ? m.b : m.a; }

  function buildDivisionSemis() {
    for (const t of computeStandings()) {
      pushGame(WEEK_DIV_SF, 0, t.rows[1].name, t.rows[2].name, 'Division Semifinal', t.name);
    }
  }
  function buildDivisionFinals() {
    for (const sf of weekGames(WEEK_DIV_SF)) {
      const table = computeStandings().find(t => t.name === sf.div);
      pushGame(WEEK_DIV_F, 0, table.rows[0].name, winner(sf), 'Division Final', sf.div);
    }
  }
  function buildChampSemis() {
    // The 4 division champions, seeded by regular-season record
    const champs = weekGames(WEEK_DIV_F).map(winner);
    const order = champs.slice().sort((x, y) => {
      const rx = seedStats(x), ry = seedStats(y);
      return ry.w - rx.w || ry.diff - rx.diff || ry.pf - rx.pf || x.localeCompare(y);
    });
    pushGame(WEEK_CHAMP, 0, order[0], order[3], 'RFA Semifinal (1v4)', 'RFA');
    pushGame(WEEK_CHAMP, 0, order[1], order[2], 'RFA Semifinal (2v3)', 'RFA');
  }
  function buildChampFinal() {
    const [s1, s2] = weekGames(WEEK_CHAMP, 0);
    pushGame(WEEK_CHAMP, 1, winner(s1), winner(s2), 'RFA Final', 'RFA');
  }

  function seedStats(name) {
    for (const t of computeStandings()) {
      const r = t.rows.find(r => r.name === name);
      if (r) return r;
    }
    return { w: 0, diff: 0, pf: 0 };
  }

  // ── Week helpers ──
  function weekGames(w, sub) {
    return games.filter(g => g.week === w && (sub == null || g.sub === sub));
  }
  function activeGames() {
    return week === WEEK_CHAMP ? weekGames(WEEK_CHAMP, champStage) : weekGames(week);
  }
  function weekComplete() {
    const list = activeGames();
    return list.length > 0 && list.every(g => g.played);
  }
  function seasonOver() { return !!champion; }
  function playerMatch() {
    return activeGames().find(g => g.isPlayer && !g.played) || null;
  }

  // Simulate a CPU match from team power ratings
  function simulate(m) {
    const pa = teamByName(m.a).power, pb = teamByName(m.b).power;
    const pWin = clamp(0.5 + (pa - pb) * 0.08, 0.15, 0.85);
    const aWins = Math.random() < pWin;
    // Loser scores 0..3, weighted toward the low end
    const loseScore = Math.floor(Math.random() * Math.random() * 4);
    m.scoreA = aWins ? FORMAT.TARGET_SCORE : loseScore;
    m.scoreB = aWins ? loseScore : FORMAT.TARGET_SCORE;
    m.played = true;
  }

  // ── Advancing ──
  function advance() {
    if (week === WEEK_CHAMP) {
      if (champStage === 0) {
        buildChampFinal();
        champStage = 1;
        return; // stay on championship weekend for the final
      }
      champion = winner(weekGames(WEEK_CHAMP, 1)[0]);
      crownSeason();
      return;
    }
    week++;
    if (week === WEEK_DIV_SF) buildDivisionSemis();
    else if (week === WEEK_DIV_F) buildDivisionFinals();
    else if (week === WEEK_CHAMP) buildChampSemis();
    screen = 'HUB';
    save();
  }

  function crownSeason() {
    const fin = weekGames(WEEK_CHAMP, 1)[0];
    const rec = franchiseRecord();
    const ps = games.filter(g => g.isPlayer && g.week >= REGULAR_WEEKS && g.played);
    let note;
    if (champion === FRANCHISE) {
      note = 'RFA CHAMPIONS — an unforgettable run!';
    } else if (ps.length === 0) {
      note = 'Missed the playoffs';
    } else {
      // The franchise's last postseason game was a loss
      const lost = ps[ps.length - 1];
      const round = lost.tag.split(' (')[0].toLowerCase().replace(/^rfa/, 'RFA');
      note = 'Eliminated in the ' + round;
    }
    history.push({ year, w: rec.w, l: rec.l, note });
    if (history.length > 8) history.shift();
    summary = {
      year, champion, runnerUp: loser(fin),
      finalScore: {
        a: fin.a, b: fin.b,
        aShort: teamShort(fin.a), bShort: teamShort(fin.b),
        scoreA: fin.scoreA, scoreB: fin.scoreB,
      },
      divWinners: weekGames(WEEK_DIV_F).map(g => ({ div: g.div, team: winner(g) })),
      note, record: rec,
    };
    save();
  }

  // ── Playing the player's match ──
  function beginMatch(m) {
    const opp = m.a === FRANCHISE ? m.b : m.a;
    const oppTeam = teamByName(opp);
    screen = 'MATCH';
    tapCooldown = 0.5;
    game.startMatch({
      myName: FRANCHISE,
      oppName: opp,
      oppPower: oppTeam ? oppTeam.power : 3,
      target: FORMAT.TARGET_SCORE,
      tag: m.tag,
      tournament: `RFA Season ${year} — ${weekLabel(week)}`,
      onEnd: res => onMatchEnd(m, res),
    });
  }

  function onMatchEnd(m, res) {
    m.scoreA = m.a === FRANCHISE ? res.myScore : res.oppScore;
    m.scoreB = m.a === FRANCHISE ? res.oppScore : res.myScore;
    m.played = true;
    lastMatch = {
      myScore: res.myScore, oppScore: res.oppScore,
      won: res.myScore > res.oppScore,
      opp: m.a === FRANCHISE ? m.b : m.a,
      oppShort: teamShort(m.a === FRANCHISE ? m.b : m.a),
      tag: m.tag, _fresh: true,
    };
    screen = 'WEEK';
    tapCooldown = 0.6;
    save();
  }

  function weekLabel(w) {
    if (w < REGULAR_WEEKS) return `Week ${w + 1}`;
    if (w === WEEK_DIV_SF) return 'Division Semifinals';
    if (w === WEEK_DIV_F) return 'Division Finals';
    return 'Championship Weekend';
  }

  // ── Per-frame update ──
  function update(dt, input) {
    if (tapCooldown > 0) tapCooldown -= dt;

    if (screen === 'MATCH') {
      game.update(dt, input);
      return; // game's onEnd callback switches us back to WEEK
    }

    if (screen === 'WEEK' && !seasonOver()) {
      // While the franchise has a game this round, the rest of the slate
      // simulates around it; with no franchise game a tap plays out the round
      const mine = activeGames().find(g => g.isPlayer);
      if (mine) {
        for (const g of activeGames()) {
          if (!g.played && !g.isPlayer) simulate(g);
        }
      }
      // Championship weekend: semis done → build the final in place
      if (week === WEEK_CHAMP && champStage === 0 && weekComplete()) {
        buildChampFinal();
        champStage = 1;
      }
    }

    if (input.justPressed && tapCooldown <= 0) {
      if (screen === 'HUB') {
        if (seasonOver()) {
          if (!summary) crownSeason();
          screen = 'SUMMARY';
        } else {
          screen = 'WEEK';
        }
        tapCooldown = 0.4;
      } else if (screen === 'WEEK') {
        if (lastMatch) lastMatch._fresh = false;
        if (seasonOver()) {
          if (!summary) crownSeason();
          screen = 'SUMMARY';
          tapCooldown = 0.4;
        } else {
          const pm = playerMatch();
          if (weekComplete()) {
            advance();
            tapCooldown = 0.4;
          } else if (pm) {
            beginMatch(pm);
          } else {
            for (const g of activeGames()) if (!g.played) simulate(g);
            tapCooldown = 0.4;
          }
        }
      } else if (screen === 'SUMMARY') {
        summary = null;
        year++;
        startSeason();
        screen = 'HUB';
        tapCooldown = 0.4;
      }
    }
  }

  // ── Render snapshot ──
  function getState() {
    const standings = computeStandings();
    const myTable = standings.find(t => t.name === divisionOf(FRANCHISE).name);
    const myRank = myTable.rows.findIndex(r => r.name === FRANCHISE) + 1;
    const wkGames = week === WEEK_CHAMP
      ? weekGames(WEEK_CHAMP)      // show semis + final together
      : activeGames();
    const pm = wkGames.find(g => g.isPlayer && !g.played);

    const weekView = {
      label: weekLabel(week),
      games: wkGames.map(m => ({
        tag: m.tag, div: m.div, a: m.a, b: m.b,
        shortA: teamShort(m.a), shortB: teamShort(m.b),
        scoreA: m.scoreA, scoreB: m.scoreB,
        played: m.played, isPlayer: m.isPlayer,
      })),
      complete: weekComplete(),
      next: null,
    };
    if (week + 1 < REGULAR_WEEKS) {
      weekView.next = {
        label: weekLabel(week + 1),
        games: schedule.weeks[week + 1].map(g => ({
          a: g.a, b: g.b,
          shortA: teamShort(g.a), shortB: teamShort(g.b),
          div: g.inter ? 'RFA' : g.div,
        })),
      };
    }

    return {
      screen, year, week,
      weekLabel: weekLabel(week),
      rfaName: RFA,
      franchise: FRANCHISE, franchiseShort: teamShort(FRANCHISE),
      franchiseRecord: franchiseRecord(), franchiseRank: myRank,
      franchiseDivision: divisionOf(FRANCHISE).name,
      seasonOver: seasonOver(), champion, summary,
      standings, history,
      playoffsLive: week >= REGULAR_WEEKS,
      weekView,
      playerMatch: pm ? {
        opp: pm.a === FRANCHISE ? pm.b : pm.a,
        oppShort: teamShort(pm.a === FRANCHISE ? pm.b : pm.a),
        tag: pm.tag,
      } : null,
      lastMatch,
    };
  }

  // ── Debug / testing hook: wipe the save ──
  function resetCareer() {
    year = 1;
    champion = null;
    history = [];
    startSeason();
    summary = null;
    screen = 'HUB';
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  if (!load()) startSeason();
  return { update, getState, resetCareer };
}
