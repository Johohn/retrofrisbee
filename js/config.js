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
    COUNT: 3,
    RADIUS: 8,
    SPEED: 65,            // px / s  (cut speed — field is 1000px now)
  },

  // ── Defenders ──
  DEFENDER: {
    COUNT: 4,
    RADIUS: 8,
    SPEED: 55,            // px / s  (slower than cutters)
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

  // ── Disc / Throwing ──
  DISC: {
    RADIUS: 5,
    SPEED_MIN: 120,
    SPEED_MAX: 280,
    CURVE_ACCEL: 400,       // px/s²  perpendicular acceleration
    CURVE_DECAY_TIME: 1.5,  // seconds until the curve force has fully faded
    GRAVITY: 400,          // px/s²  z-axis fall
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
    THEN_LENGTH: 800,      // leg-2 length — exceeds the field, runs to the edge
    SIDE_MARGIN: 20,       // px kept clear of the sidelines / end lines
    TEMPLATES: [
      // deep — ends up downfield
      { id: 'DEEP_CROSS',       first: 'NE', firstLen: [260, 340], then: 'E'  },
      { id: 'SIDELINE_STRETCH', first: 'N',  firstLen: [110, 170], then: 'E'  },
      // under — comes back across / underneath
      { id: 'DEEP_THEN_UNDER',  first: 'E',  firstLen: [240, 320], then: 'SW'  },
      { id: 'UNDER_ACROSS',     first: 'E',  firstLen: [110, 160], then: 'N'  },
      // flex — possession filler, picked third
      { id: 'FLUSH_DEEP',       first: 'S',  firstLen: [80, 130],  then: 'NE' },
      { id: 'IN_CUT',           first: 'SE', firstLen: [180, 240], then: 'W'  },
    ],
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