// manager.js — Career mode: seasons of tournaments, 8-team brackets,
// full placement (1st through 8th), franchise progression.
// Screens: HUB (season overview) → TOURNAMENT (bracket) → MATCH (the game
// itself, via game.js) → SUMMARY (tournament result) → back to HUB.

const SAVE_KEY = 'retro-frisbee-manager-v1';

// Points awarded per tournament placement (index = place - 1)
const PLACE_POINTS = [10, 7, 5, 3, 2, 1, 1, 0];

function createManager(game) {
  // ── Persistent career state ──
  let year = 1;
  let tIdx = 0;                 // which tournament of the season is next (0..3)
  let standings = {};           // team name → season points
  let franchiseResults = [];    // [{year, tName, place}] most recent last

  // ── Runtime state ──
  let screen = 'HUB';           // HUB | TOURNAMENT | MATCH | SUMMARY
  let tour = null;              // active tournament object (see newTournament)
  let lastMatch = null;         // { myScore, oppScore, won, oppName } banner on bracket
  let summary = null;           // tournament-end snapshot for the SUMMARY screen
  let tapCooldown = 0;          // ignore taps right after a screen change

  // ── Team helpers ──
  function teamByName(name) {
    return TEAMS.find(t => t.name === name);
  }
  function teamShort(name) {
    const t = teamByName(name);
    return t ? t.short : name.slice(0, 3).toUpperCase();
  }

  // ── Save / load (browser storage; the game still works without it) ──
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        year, tIdx, standings, franchiseResults,
      }));
    } catch (e) { /* storage unavailable — career runs in-session only */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.year === 'number') year = s.year;
      if (typeof s.tIdx === 'number') tIdx = s.tIdx;
      if (s.standings) standings = s.standings;
      if (Array.isArray(s.franchiseResults)) franchiseResults = s.franchiseResults;
    } catch (e) { /* corrupt or missing save — start fresh */ }
  }

  // ── Tournament construction ──
  // A match: { id, stage, a, b, scoreA, scoreB, played, isPlayer, tag }
  // `tag` is a human label ('Quarterfinal', 'Semifinal', 'Final', …).
  // Stages build lazily: QF → (SF + placement semis) → (Final + 3rd +
  // 5th + 7th). That leaves every team with one final match and a full
  // placement 1..8.
  function newTournament() {
    const tdef = TOURNAMENTS[tIdx];

    if (tdef.finals) {
      // ── Season finals (EUCF): top 4 by season points only ──
      // Seeds 1–4: 1v4 and 2v3 semis, then grand final + 3rd place.
      const seeds = TEAMS
        .map(t => ({ name: t.name, pts: standings[t.name] || 0 }))
        .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name))
        .slice(0, 4);
      const matches = [
        {
          id: 0, stage: 0, a: seeds[0].name, b: seeds[3].name,
          scoreA: 0, scoreB: 0, played: false, tag: 'Semifinal (1v4)',
        },
        {
          id: 1, stage: 0, a: seeds[1].name, b: seeds[2].name,
          scoreA: 0, scoreB: 0, played: false, tag: 'Semifinal (2v3)',
        },
      ];
      tour = {
        name: tdef.name, month: tdef.month, venue: tdef.venue,
        type: 'finals', stage: 0, matches, done: false, placements: [],
        qualified: seeds.map(s => s.name),
      };
    } else {
      // ── Regular tournament: full 8-team bracket ──
      // Random draw each tournament
      const pool = [...TEAMS].sort(() => Math.random() - 0.5);
      const matches = [];
      let id = 0;
      for (let i = 0; i < 8; i += 2) {
        matches.push({
          id: id++, stage: 0, a: pool[i].name, b: pool[i + 1].name,
          scoreA: 0, scoreB: 0, played: false, tag: 'Quarterfinal',
        });
      }
      tour = {
        name: tdef.name, month: tdef.month, venue: tdef.venue,
        type: 'regular', stage: 0, matches, done: false, placements: [],
      };
    }
    lastMatch = null;
    markPlayer();
  }

  function winner(m) { return m.scoreA > m.scoreB ? m.a : m.b; }
  function loser(m)  { return m.scoreA > m.scoreB ? m.b : m.a; }

  function markPlayer() {
    for (const m of tour.matches) {
      if (!m.played) {
        m.isPlayer = (m.a === FRANCHISE || m.b === FRANCHISE);
      }
    }
  }

  // Simulate a CPU match from team power ratings
  function simulate(m) {
    const pa = teamByName(m.a).power, pb = teamByName(m.b).power;
    const pWin = clamp(0.5 + (pa - pb) * 0.08, 0.15, 0.85);
    const aWins = Math.random() < pWin;
    const winScore = FORMAT.TARGET_SCORE;
    // Loser scores 0..3, weighted toward the low end
    const loseScore = Math.floor(Math.random() * Math.random() * 4);
    m.scoreA = aWins ? winScore : loseScore;
    m.scoreB = aWins ? loseScore : winScore;
    m.played = true;
  }

  function stageMatches(stage) { return tour.matches.filter(m => m.stage === stage); }
  function stageComplete(stage) {
    return stageMatches(stage).every(m => m.played);
  }

  // Build the next stage once the current one is fully played
  function buildNextStage() {
    const st = tour.stage;
    const push = (a, b, tag, stage) => tour.matches.push({
      id: tour.matches.length, stage, a, b,
      scoreA: 0, scoreB: 0, played: false, tag,
    });

    if (tour.type === 'finals') {
      // Semis done → grand final + 3rd place
      if (st === 0) {
        const sf = stageMatches(0);
        push(winner(sf[0]), winner(sf[1]), 'Grand Final (1st–2nd)', 1);
        push(loser(sf[0]), loser(sf[1]), "3rd Place (3rd–4th)", 1);
        tour.stage = 1;
      }
      markPlayer();
      return;
    }

    if (st === 0) {
      // Quarterfinals done → winner semis + placement semis (QF losers play
      // on for 5th–8th, so nobody's done after one loss)
      const qf = stageMatches(0);
      push(winner(qf[0]), winner(qf[1]), 'Semifinal', 1);
      push(winner(qf[2]), winner(qf[3]), 'Semifinal', 1);
      push(loser(qf[0]), loser(qf[1]), 'Placement Semi (5th–8th)', 1);
      push(loser(qf[2]), loser(qf[3]), 'Placement Semi (5th–8th)', 1);
      tour.stage = 1;
    } else if (st === 1) {
      // Semis done → all placement finals. Winner semis (first two of the
      // stage) feed Final + 3rd place; placement semis feed 5th + 7th.
      const all = stageMatches(1);
      const sf1 = all[0], sf2 = all[1], ps1 = all[2], ps2 = all[3];
      push(winner(sf1), winner(sf2), 'Final (1st–2nd)', 2);
      push(loser(sf1), loser(sf2), "3rd Place (3rd–4th)", 2);
      push(winner(ps1), winner(ps2), "5th Place (5th–6th)", 2);
      push(loser(ps1), loser(ps2), "7th Place (7th–8th)", 2);
      tour.stage = 2;
    }
    markPlayer();
  }

  // ── Tournament end: assign places, update standings, advance calendar ──
  function finishTournament() {
    const fin = tour.matches.find(x => x.tag.startsWith(tour.type === 'finals' ? 'Grand' : 'Final'));
    const third = tour.matches.find(x => x.tag.startsWith('3rd'));

    const places = [];
    places[winner(fin)] = 1;  places[loser(fin)] = 2;
    places[winner(third)] = 3; places[loser(third)] = 4;

    if (tour.type === 'finals') {
      // Four qualified teams only: 1–4 decided, 5–8 unplayed (DNQ teams
      // already sit out with their season points)
      tour.placements = tour.qualified.map(name => ({
        team: name, place: places[name],
        points: PLACE_POINTS[places[name] - 1],
      })).sort((x, y) => x.place - y.place);
    } else {
      const p5 = tour.matches.find(x => x.tag.startsWith('5th'));
      const p7 = tour.matches.find(x => x.tag.startsWith('7th'));
      places[winner(p5)] = 5;    places[loser(p5)] = 6;
      places[winner(p7)] = 7;    places[loser(p7)] = 8;
      tour.placements = TEAMS.map(t => ({
        team: t.name, place: places[t.name],
        points: PLACE_POINTS[places[t.name] - 1],
      })).sort((x, y) => x.place - y.place);
    }

    for (const p of tour.placements) {
      standings[p.team] = (standings[p.team] || 0) + p.points;
    }

    const me = tour.placements.find(p => p.team === FRANCHISE);
    franchiseResults.push({
      year, tName: tour.name,
      place: me ? me.place : 0,   // 0 = did not qualify (finals only)
    });
    if (franchiseResults.length > 8) franchiseResults.shift();

    summary = {
      name: tour.name, month: tour.month, venue: tour.venue,
      finals: tour.type === 'finals',
      placements: tour.placements,
      myPlace: me ? me.place : 0,
      myPoints: me ? me.points : 0,
      champion: tour.placements[0].team,
    };
    tour.done = true;

    // Advance the calendar; a new season starts with fresh standings
    tIdx++;
    if (tIdx >= TOURNAMENTS.length) { tIdx = 0; year++; standings = {}; }
    tapCooldown = 0.4; // let the "TOURNAMENT COMPLETE" banner breathe
    save();
  }

  // ── Playing the player's match ──
  function playerMatch() {
    if (!tour || tour.done) return null;
    return tour.matches.find(m => !m.played && (m.a === FRANCHISE || m.b === FRANCHISE)) || null;
  }

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
      tournament: `${tour.name} — ${tour.venue}`,
      onEnd: res => onMatchEnd(m, res),
    });
  }

  function onMatchEnd(m, res) {
    m.scoreA = m.a === FRANCHISE ? res.myScore : res.oppScore;
    m.scoreB = m.a === FRANCHISE ? res.oppScore : res.myScore;
    m.played = true;
    lastMatch = {
      myScore: res.myScore, oppScore: res.oppScore,
      won: res.myScore > res.oppScore, opp: m.a === FRANCHISE ? m.b : m.a,
      tag: m.tag, _fresh: true,
    };
    screen = 'TOURNAMENT';
    tapCooldown = 0.6;
    save();
  }

  // ── Per-frame update ──
  function update(dt, input) {
    if (tapCooldown > 0) tapCooldown -= dt;

    if (screen === 'MATCH') {
      game.update(dt, input);
      return; // game's onEnd callback switches us back to TOURNAMENT
    }

    // Advance CPU matches: when the player's team is out of the running
    // (or between stages) the rest of the bracket simulates round by round —
    // one stage of CPU matches per tap keeps the bracket fun to follow.
    if (screen === 'TOURNAMENT' && tour && !tour.done) {
      const pm = playerMatch();
      if (!pm && !stageComplete(tour.stage)) {
        // No player match in this stage → waiting for a tap to simulate it
        if (input.justPressed && tapCooldown <= 0) {
          for (const m of stageMatches(tour.stage)) if (!m.played) simulate(m);
          if (lastMatch) lastMatch._fresh = false;
          tapCooldown = 0.4;
        }
      } else if (!pm && stageComplete(tour.stage)) {
        const maxStage = tour.type === 'finals' ? 1 : 2;
        if (tour.stage < maxStage) buildNextStage();
        else finishTournament();
      } else if (pm) {
        // Player's match is ready — other matches of the stage simulate
        // automatically so the bracket fills in around it.
        for (const m of stageMatches(tour.stage)) {
          if (!m.played && !m.isPlayer) simulate(m);
        }
        if (input.justPressed && tapCooldown <= 0) {
          if (lastMatch) lastMatch._fresh = false;
          beginMatch(pm);
        }
      }
    }

    if (input.justPressed && tapCooldown <= 0) {
      if (screen === 'HUB') {
        if (!tour || tour.done) newTournament();
        screen = 'TOURNAMENT';
        tapCooldown = 0.4;
      } else if (screen === 'SUMMARY') {
        summary = null;
        screen = 'HUB';
        tapCooldown = 0.4;
      } else if (screen === 'TOURNAMENT' && tour && tour.done) {
        screen = 'SUMMARY';
        tapCooldown = 0.4;
      }
    }
  }

  // ── Render snapshot ──
  function getState() {
    const season = TOURNAMENTS.map((t, i) => ({
      name: t.name, month: t.month, venue: t.venue,
      done: i < tIdx, current: i === tIdx,
    }));
    const standingsArr = TEAMS
      .map(t => ({ name: t.name, short: t.short, power: t.power, pts: standings[t.name] || 0 }))
      .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));

    // Bracket grouped by stage for the renderer
    let bracket = null;
    if (tour) {
      bracket = {
        name: tour.name, month: tour.month, venue: tour.venue,
        type: tour.type, done: tour.done, stage: tour.stage,
        qualified: tour.qualified || null,
        hasPlayer: tour.matches.some(m => m.isPlayer),
        stages: [0, 1, 2].map(st =>
          stageMatches(st).map(m => ({
            tag: m.tag, a: m.a, b: m.b,
            scoreA: m.scoreA, scoreB: m.scoreB,
            played: m.played, isPlayer: m.isPlayer,
            shortA: teamShort(m.a), shortB: teamShort(m.b),
          }))
        ),
      };
    }

    // Season rank of the franchise (for the finals qualification display)
    const seasonRank = standingsArr.findIndex(s => s.name === FRANCHISE) + 1;
    const nextIsFinals = !!TOURNAMENTS[tIdx].finals;

    return {
      screen, year, tIdx, season, standings: standingsArr,
      franchise: FRANCHISE, franchiseShort: teamShort(FRANCHISE),
      franchiseResults,
      nextIsFinals, seasonRank,
      qualifies: nextIsFinals ? seasonRank >= 1 && seasonRank <= 4 : null,
      tour, bracket, lastMatch, summary,
      nextTournament: TOURNAMENTS[tIdx],
    };
  }

  // ── Debug / testing hook: wipe the save ──
  function resetCareer() {
    year = 1; tIdx = 0; standings = {}; franchiseResults = [];
    tour = null; summary = null; lastMatch = null;
    screen = 'HUB';
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  load();
  return { update, getState, resetCareer };
}