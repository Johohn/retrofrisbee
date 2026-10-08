// data.js — RFA setup: divisions, teams, season format.
// Everything in this file is meant to be edited by hand: change the names,
// swap teams between divisions, retitle divisions. The manager and the
// schedule builder read from here.

// ── The league ──
const RFA = 'Retro Frisbee Association';

// ── The 4 divisions ──
// The FIRST TWO divisions must have 6 teams each, the LAST TWO must have 5
// each — that's what makes the 12-week schedule work without byes:
//   6-team divisions: every divisional opponent twice (10 games) + 2 games
//     against the other 6-team division
//   5-team divisions: every divisional opponent twice (8 games) + 4 games
//     against the other 5-team division
// The two 6-team divisions are paired with each other for interdivisional
// play, and the two 5-team divisions are paired with each other.
// `power` (1..5) drives simulated opponent strength: higher = stronger.
const DIVISIONS = [
  {
    name: 'East',
    teams: [
      { name: 'Boston Glory',    short: 'BOS', power: 3 },
      { name: 'New York Empire', short: 'NY', power: 5 },
      { name: 'DC Breeze',       short: 'DC', power: 2 },
      { name: 'Toronto Rush',       short: 'TOR', power: 4 },
      { name: 'Montreal Royal',       short: 'MON', power: 1 },
      { name: 'Philadelphia Phoenix',       short: 'PHI', power: 3 },
    ],
  },
  {
    name: 'South',
    teams: [
      { name: 'Austin Sol',      short: 'AUS', power: 4 },
      { name: 'Carolina Flyers',         short: 'CAR', power: 2 },
      { name: 'San Diego Growlers',         short: 'SD', power: 4 },
      { name: 'Atlanta Hustle',        short: 'ATL', power: 3 },
      { name: 'Houston Havoc',        short: 'HOU', power: 2 },
      { name: 'Vegas Bighorns',        short: 'LV', power: 5 },
    ],
  },
  {
    name: 'West',
    teams: [
      { name: 'Oakland Spiders',        short: 'OAK', power: 3 },
      { name: 'Seattle Cascades',          short: 'SEA', power: 1 },
      { name: 'Salt Lake Shred',    short: 'SLC', power: 3 },
      { name: 'Colorado Apex',       short: 'COL', power: 4 },
      { name: 'Oregon Steel',      short: 'ORE', power: 2 },
    ],
  },
  {
    name: 'Central',
    teams: [
      { name: 'Minnesota Wind Chill',     short: 'MIN', power: 5 },
      { name: 'Madison Radicals',       short: 'MAD', power: 3 },
      { name: 'Indianapolis AlleyCats',      short: 'IND', power: 2 },
      { name: 'Pittsburgh Thunderbirds',         short: 'PIT', power: 4 },
      { name: 'Chicago Union',      short: 'CHI', power: 1 },
    ],
  },
];

// Flat list of every team (derived — no need to edit)
const TEAMS = DIVISIONS.flatMap(d => d.teams);

// The team the player manages (must match a name above)
const FRANCHISE = 'Austin Sol';

// ── Season format ──
// 12 regular-season weeks (everyone plays every week — see schedule.js),
// then the division playoffs: top 3 of each division qualify, seeds 2 vs 3
// play, the winner faces seed 1 for the division title. The 4 division
// champions advance to Championship Weekend: two semifinals and the RFA
// Final — no third-place game.
const FORMAT = {
  TARGET_SCORE: 5,     // points to win a match (game-to)
  PLAYOFF_SEEDS: 3,    // teams per division that make the playoffs
};
