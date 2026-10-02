// data.js — Teams & tournament calendar.
// Everything in this file is meant to be edited by hand: change the names,
// add/remove teams, retitle tournaments. The manager reads from here.

// ── The 8 franchise teams ──
// The player manages FRANCHISE. `power` (1..5) drives simulated opponent
// strength: higher = better opponents (advance + score chances).
const TEAMS = [
  { name: 'Wall City',   short: 'WCY', power: 3 },
  { name: 'Mooncatchers', short: 'MOC', power: 5 },
  { name: 'Tchac', short: 'TCH', power: 3 },
  { name: 'Clapham',short: 'CLH', power: 4 },
  { name: 'La Fotta',short: 'LAF', power: 5 },
  { name: 'Gentle',  short: 'GEN', power: 2 },
  { name: 'GRUT', short: 'GRU', power: 2 },
  { name: '3SB',short:'3SB', power: 1 },
];

// The team the player controls (must match a name above)
const FRANCHISE = 'Wall City';

// ── Season calendar: 4 tournaments per year, played in this order ──
// Regular tournaments (no `finals` flag): full 8-team brackets, points are
// awarded per placement and accumulate across the season.
// The last tournament is the season FINALS: only the top 4 teams by season
// points qualify; they play 1v4 / 2v3 semis, a grand final and a 3rd-place
// match.
const TOURNAMENTS = [
  { name: 'Pagonella',     month: 'April',     venue: 'Rimini' },
  { name: 'Tims Tourney',  month: 'May',       venue: 'Bruges' },
  { name: 'Millwind',      month: 'June',      venue: 'Amsterdam' },
  { name: 'EUCF',          month: 'October',   venue: 'Wroclaw', finals: true },
];

// ── Bracket format ──
// 8 teams → Quarterfinals, Semifinals, Final — plus placement: losers of the
// quarters play a semi for 5th place, and both placement semis' losers play
// for 7th. Every team ends the tournament with a final position 1..8.
const FORMAT = {
  TARGET_SCORE: 5,   // points to win a match (game-to)
};