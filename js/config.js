// config.js — All tuning numbers in one place
const CONFIG = {
  // ── Field dimensions (logical pixels) ──
  FIELD: {
    VIEWPORT_W: 800,
    VIEWPORT_H: 450,
    FIELD_TOP: 50,
    FIELD_BOTTOM: 400,
    FIELD_HEIGHT: 350,
    END_ZONE_W: 300,          // ~20 yards
    FIELD_PLAYING: 1050,        // ~70 yards between end zones
    TOTAL_W: 1650,             // 180 + 640 + 180
    SCORE_RESET_YARD: 300,     // 10px into the playing field from left end zone line
  },

  // ── Thrower ──
  THROWER: {
    RADIUS: 9,
  },

  // ── Cutters (offensive players without disc) ──
  CUTTER: {
    COUNT: 4,
    RADIUS: 8,
    SPEED: 80,            // px / s  (cut speed — field is 1000px now)
  },

  // ── Defenders ──
  DEFENDER: {
    COUNT: 5,             // one per cutter + one marker for the thrower
    RADIUS: 8,
    SPEED: 70,            // px / s  (slower than cutters)
    REACTION_DELAY: 0.25,  // seconds before they start tracking
    MARK_DISTANCE: 12,     // how close they try to stay
    INTERCEPT_RADIUS: 18,  // close enough to intercept in resolveCatch
    INTERCEPT_FLIGHT_RADIUS: 28,  // larger radius used during flight
    INTERCEPT_FLIGHT_CHANCE: 0.30,// per-frame chance when defender is at disc
  },

  // ── Thrower's mark (the defender standing in front of the thrower) ──
  MARKER: {
    STAND_DISTANCE: 18,          // px in front of the thrower
    INTERCEPT_RADIUS: 9,         // smaller reach than a cutter-marking defender
    INTERCEPT_FLIGHT_RADIUS: 14,
  },

  // ── Point setup (bands measured downfield of the disc pickup spot) ──
  // Goal-line pickup (start of game / after opponent scores = x 300):
  // cutters 300..600 (end line → brick mark), defenders 600..825 (brick mark
  // → centre). Deep pickups shift the bands with the disc.
  SETUP: {
    CUTTER_MIN: 0,          // px downfield of the pickup spot
    CUTTER_MAX: 300,        // brick-mark distance
    DEFENDER_MIN: 300,      // brick mark
    DEFENDER_MAX: 525,      // centre of the field (825 from the goal line)
    Y_PAD: 25,              // y-margin kept clear of the sidelines
  },

  // ── Disc / Throwing ──
  DISC: {
    RADIUS: 5,
    SPEED_MIN: 120,
    SPEED_MAX: 500,
    CURVE_ACCEL: 500,       // px/s²  perpendicular acceleration
    CURVE_DECAY_TIME: 1.5,  // seconds until the curve force has fully faded
    GRAVITY: 300,          // px/s²  z-axis fall
    Z_VELOCITY: 80,        // initial z velocity at full power
    CATCH_RADIUS: 25,
    AIR_RESISTANCE: 0.997, // velocity multiplier per (normalised) frame
    DRAG_MAX_LENGTH: 170,  // screen px drag = full power (field is only 1000px now)
    SIM_STEP: 1 / 60,      // fixed physics step — flight and aim preview MUST share it
    OOB_HARD_MARGIN: 150,  // px outside the lines that counts as out immediately, even airborne
    LAND_SPEED: 25,        // px/s — at ground level below this speed a disc counts as settled
  },

  // ── Wind ──
  WIND: {
    MIN: -50,              // px/s²  (negative = pushes left / upfield)
    MAX: 50,
    CHANGE_INTERVAL: 15,   // seconds
    EFFECT: 0.3,           // how much of the wind force actually reaches the disc (0..1)
  },

  // ── Stall ──
  STALL: {
    COUNT: 10,
    COUNT_SPEED: 1,        // 1 count per second
  },

  // ── Scoring ──
  SCORE: {
    WIN: 5,
    TURNOVER_OPP_CHANCE: 0.8, // opponent scores on turnover
  },

  // ── Catch probabilities ──
  CATCH: {
    BASE_CHANCE: 0.92,
    DIST_PENALTY: 0.002,   // per px distance
    DEF_PENALTY: 0.20,     // defender within MARK_DISTANCE
    HANDS_BONUS: 0.15,     // max bonus from receiver hands stat
  },

  // ── Camera ──
  CAMERA: {
    LEAD_FACTOR: 0.35,     // how far ahead the target sits
    SMOOTHING: 0.08,       // lerp factor per frame
  },

  // ── Aim preview (trajectory dotted line) ──
  AIM_PREVIEW: {
    STEPS: 90,           // dots to simulate at SIM_STEP = 1.5 s of flight
    STEP_DT: 1 / 60,     // forced to DISC.SIM_STEP below — preview must match flight
  },

  // ── Disc chasing (players abandon route when disc comes near) ──
  CHASE_DISC: {
    RADIUS: 70,            // how close the disc must be (px) to pull a player off their route
  },

  // ── Receiver routes ──
  // Every cutter runs the same shape: one straight leg in a cardinal
  // direction (N/S/E/W/NE/...), a cut, then a second cardinal leg they keep
  // following until a new thrower is established (it runs on to the field
  // edge). `kind` buckets the templates so each possession gets one DEEP
  // route (stays downfield), one UNDER route (comes back across/under) and
  // one FLEX — the cuts spread over the field instead of everyone striking
  // into the same space. Templates are authored for a cutter in the TOP
  // half of the field; N/S directions get mirrored for cutters below the
  // thrower so every route makes sense spatially.
  ROUTES: {
    SHOW_DURATION: 3.0,    // seconds the once-per-possession preview stays up
    THEN_LENGTH: 340,      // leg-2 length — shapes the cut; re-cuts take over after
    SIDE_MARGIN: 20,       // px kept clear of the sidelines / end lines
    TEMPLATES: [
      // deep — attack downfield
      { id: 'DEEP_CROSS',       kind: 'deep',  first: 'NE', firstLen: [260, 340], then: 'E'  },
      { id: 'SIDELINE_STRETCH', kind: 'deep',  first: 'N',  firstLen: [110, 170], then: 'E'  },
      { id: 'DEEP_BOMB',        kind: 'deep',  first: 'E',  firstLen: [200, 280], then: 'NE' },
      { id: 'POST_CORNER',      kind: 'deep',  first: 'NE', firstLen: [150, 220], then: 'SE' },
      // under — come back into the thrower's reach
      { id: 'DEEP_THEN_UNDER',  kind: 'under', first: 'E',  firstLen: [240, 320], then: 'SW' },
      { id: 'COMEBACK',         kind: 'under', first: 'NE', firstLen: [200, 280], then: 'W'  },
      { id: 'IN_CUT',           kind: 'under', first: 'SE', firstLen: [180, 240], then: 'W'  },
      { id: 'UNDER_ACROSS',     kind: 'under', first: 'E',  firstLen: [110, 160], then: 'N'  },
      // flex — spread laterally before attacking
      { id: 'FLUSH_DEEP',       kind: 'flex',  first: 'S',  firstLen: [80, 130],  then: 'NE' },
      { id: 'FLUSH_UNDER',      kind: 'flex',  first: 'N',  firstLen: [80, 130],  then: 'SW' },
      { id: 'LATERAL_DRIVE',    kind: 'flex',  first: 'S',  firstLen: [100, 160], then: 'E'  },
      { id: 'CROSS_FIELD',      kind: 'flex',  first: 'E',  firstLen: [140, 200], then: 'N'  },
    ],
    // ── Re-cuts: when a route (or a re-cut) ends, the cutter picks a fresh
    // straight sprint from the situation on the pitch — never stands still ──
    RECUT_MIN_ROOM: 90,    // a direction is only considered with this much room
    RECUT_LEN: [180, 420], // re-cut sprint length before field truncation
    DEEP_DEPTH: 320,       // this far downfield of the thrower = deep → cut back
    BEHIND_DEPTH: -90,     // this far behind the thrower = behind → cut forward
    SPREAD_DIST: 80,       // don't converge on a teammate closer than this
  },

  // ── Sprites (offensive players) ──
  SPRITES: {
    SCALE: 1.8,          // upscale factor for the pixel-art frames
    FRAME_MS: 140,       // duration of one running animation frame
  },

  // ── Colours (retro-ish palette) ──
  COLORS: {
    GRASS:        '#206d0e',
    GRASS_DARK:   '#27681a',
    END_ZONE:     '#5d8d52',
    END_ZONE_STRIPE: '#4d7d42',
    YARD_LINE:    'rgba(255,255,255,0.12)',
    SIDELINE:     '#ffffff',
    END_LINE:     '#ffffff',
    PLAYER_O:     '#fcdb03',
    PLAYER_D:     '#ff4136',
    THROWER:      '#ffe81a',
    DISC_COLOR:   '#ffffff',
    DISC_SHADOW:  'rgba(0,0,0,0.35)',
    HUD_TEXT:     '#ffffff',
    HUD_BG:       'rgba(0,0,0,0.6)',
    OPEN_GLOW:    '#00ff88',
    WIND_COLOR:   '#88ccff',
    STALL_OK:     '#ffffff',
    STALL_WARN:   '#ff8800',
    STALL_CRIT:   '#ff3333',
    AIM_LINE:     'rgba(255,255,255,0.5)',
    BUTTON_BG:    '#333333',
    BUTTON_ACTIVE:'#555555',
  },
};

// The aim preview must integrate with the same step as the real disc flight,
// otherwise the two paths bend differently.
CONFIG.AIM_PREVIEW.STEP_DT = CONFIG.DISC.SIM_STEP;