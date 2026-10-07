// game.js — State machine, physics, AI, catch logic

const GF = CONFIG.FIELD;
const C_CUT = CONFIG.CUTTER;
const C_DEF = CONFIG.DEFENDER;
const C_MARK = CONFIG.MARKER;
const C_DSC = CONFIG.DISC;
const C_CTH = CONFIG.CATCH;

// ── Helpers ──
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
function norm(x, y) { const l = Math.hypot(x, y); return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 }; }

// ── Opponent zone-advance system ──
// After a turnover the enemy gets the disc and tries to advance through
// zones toward the right end zone (our end zone). Each zone has a
// probability of successfully advancing to the next one.
const OPP_ZONES = [
  { id: 'myEndzone',   minX: 0,    maxX: 300,  nextChance: 0.7, label: 'your end zone' },
  { id: 'redzone',     minX: 300,  maxX: 600,  nextChance: 0.6, label: 'the red zone' },
  { id: 'middle',      minX: 600,  maxX: 1050, nextChance: 0.6, label: 'mid-field' },
  { id: 'farBack',     minX: 1050, maxX: 1350, nextChance: 0.7, label: 'back-field' },
];
// Callahan chance (intercept in opponent's end zone = instant point)
const OPP_CALLAHAN_CHANCE = 0.02;

function oppZoneForX(x) {
  for (const z of OPP_ZONES) {
    if (x >= z.minX && x < z.maxX) return z;
  }
  return OPP_ZONES[OPP_ZONES.length - 1]; // default to last zone
}

// (Space-based route planning removed — routes are now cardinal cut routes;
// see assignRoutes inside createGame.)

function createGame() {
  // ── State ──
  let phase = 'MENU';         // MENU | THROWING | DISC_FLYING | RESULT | GAME_OVER
  let score = 0;
  let defScore = 0;           // opponent's score
  let wind = 0;
  let windTimer = 0;
  let stallCount = 0;         // raw seconds
  let curveType = 'straight'; // 'straight' | 'outside' | 'inside'
  let message = '';
  let messageTimer = 0;
  let oppAdvanceSpot = null;  // where the player gets the disc after an opponent advance
  let oppState = null;         // { zoneLabel, results[], resultIdx } for stepped messages
  let defenseView = false;     // true while the opponent's possession is narrated — our players are hidden

  // ── Match context (set by the tournament manager via startMatch) ──
  let teams = { my: 'You', opp: 'OPP' };
  let matchTarget = CONFIG.SCORE.WIN;   // points to win the match
  let oppPower = 3;                     // 1..5 opponent strength (see OPP_FACTOR)
  let matchTag = '';                    // e.g. 'Quarterfinal'
  let tournamentLabel = '';
  let onMatchEnd = null;                // callback({myScore, oppScore, won})
  let matchEndSent = false;
  // Opponent skill multiplier on their advance/interception rolls
  const OPP_FACTOR = () => 0.8 + (oppPower - 3) * 0.07;

  const camera = { x: 0, tgtX: 0 };

  // Entities
  let thrower = { x: 0, y: 0 };
  let cutters = [];
  let defenders = [];
  let disc = null;

  // ── Aim state for renderer (computed each frame in THROWING) ──
  let currentAim = null;

  // ── Route preview ──
  let routePreviewPaths = [];   // per-cutter arrays of {x, y} preview points

  // ── Cutter "hands" stat (randomised per cutter per point) ──
  let handsStats = [];

  // ── Init ──
  function init() {
    score = 0;
    defScore = 0;
    thrower = { x: -100, y: -100, id: C_CUT.COUNT + 1 }; // off-screen until the first resetPoint
    wind = 10 + Math.random() * 15;
    wind = Math.random() < 0.5 ? wind : -wind;
    windTimer = Math.random() * CONFIG.WIND.CHANGE_INTERVAL; // stagger first change
    phase = 'MENU';
    camera.x = 0; camera.tgtX = 0;
  }

  // ── Coin toss: random team gets the first possession ──
  function coinToss() {
    if (Math.random() < 0.5) {
      // We start on offense (RESULT falls through to a normal reset)
      message = 'Coin toss: you start with the disc.';
      messageTimer = 1.8;
    } else {
      // Opponent starts on offense, disc in their back-field
      setupOppAdvance(OPP_ZONES.length - 1);
      message = 'Coin toss: OPP ball (back-field).';
      messageTimer = 1.8;
    }
    phase = 'RESULT';
  }

  // ── Start a tournament match (called by the manager) ──
  function startMatch(opts) {
    teams = { my: opts.myName || 'You', opp: opts.oppName || 'OPP' };
    matchTarget = opts.target || CONFIG.SCORE.WIN;
    oppPower = opts.oppPower || 3;
    matchTag = opts.tag || '';
    tournamentLabel = opts.tournament || '';
    onMatchEnd = opts.onEnd || null;
    matchEndSent = false;

    score = 0;
    defScore = 0;
    oppState = null;
    oppAdvanceSpot = null;
    defenseView = false;
    cutters = []; defenders = []; disc = null;
    thrower = { x: -100, y: -100, id: C_CUT.COUNT + 1 };
    wind = 10 + Math.random() * 15;
    wind = Math.random() < 0.5 ? wind : -wind;
    windTimer = Math.random() * CONFIG.WIND.CHANGE_INTERVAL;
    curveType = 'straight';
    camera.x = 0; camera.tgtX = 0;

    coinToss();
  }

  // ── Reset for a new point ──
  // `freshSetup` = start of the game or after the opponent scored: the
  // thrower stands on his goal line, cutters line up between the end line
  // and the brick mark, and the defenders start between the brick mark and
  // centre (all bands measured from the disc — see CONFIG.SETUP), running
  // back to their men. A turnover pickup instead keeps everyone near the
  // disc spot.
  function resetPoint(startX, freshSetup) {
    const cx = startX || GF.SCORE_RESET_YARD;
    defenseView = false;   // our possession lines up — players visible again
    // Random y across the field — anywhere between the sidelines (25px margin)
    const yPad = CONFIG.SETUP.Y_PAD;
    const yMin = GF.FIELD_TOP + yPad;
    const yMax = GF.FIELD_BOTTOM - yPad;
    const cy = yMin + Math.random() * (yMax - yMin);
    // Never spawn into / past the opponent end zone on deep pickups
    const downfieldCap = GF.TOTAL_W - GF.END_ZONE_W - 20;

    thrower = { x: cx, y: cy, id: C_CUT.COUNT + 1 };
    disc = null;
    stallCount = 0;
    routePreviewPaths = [];

    const S = CONFIG.SETUP;
    cutters = [];
    handsStats = [];

    if (freshSetup) {
      // Cutters between the own end zone line and the brick mark
      const cutterXMax = Math.min(cx + S.CUTTER_MAX, downfieldCap);
      for (let i = 0; i < C_CUT.COUNT; i++) {
        handsStats.push(0.60 + Math.random() * 0.35);
        cutters.push({
          x: cx + S.CUTTER_MIN + Math.random() * (cutterXMax - (cx + S.CUTTER_MIN)),
          y: yMin + Math.random() * (yMax - yMin),
          id: i + 1,         // stable O-label across possessions
          path: [], wpIdx: 0, flashTimer: 0, preview: null,
          facing: 'right',   // sprite sheet faces right; flipped frames run left
        });
      }
    } else {
      // Turnover pickup: spread cutters just ahead of the thrower
      const spread = [
        { x: cx + 50,  y: cy - 50 },
        { x: cx + 85,  y: cy + 15 },
        { x: cx + 40,  y: cy + 70 },
      ];
      for (let i = 0; i < C_CUT.COUNT; i++) {
        const sp = spread[i];
        handsStats.push(0.60 + Math.random() * 0.35);
        cutters.push({
          x: sp.x,
          y: clamp(sp.y, GF.FIELD_TOP + 15, GF.FIELD_BOTTOM - 15),
          id: i + 1,         // stable O-label across possessions
          path: [], wpIdx: 0, flashTimer: 0, preview: null,
          facing: 'right',   // sprite sheet faces right; flipped frames run left
        });
      }
    }
    assignRoutes(cy);

    // Defenders — one per cutter, plus one mark for the thrower
    // (targetCutter = -1 means "marking the thrower"). On a fresh line-up
    // they all start between the brick mark and the centre, downfield of
    // the cutters, then run back to their assignment in movePlayers.
    const defXMin = Math.min(cx + S.DEFENDER_MIN, downfieldCap);
    const defXMax = Math.min(cx + S.DEFENDER_MAX, downfieldCap);
    defenders = [];
    for (let i = 0; i < C_DEF.COUNT; i++) {
      const c = cutters[i];
      defenders.push({
        x: freshSetup
          ? defXMin + Math.random() * (defXMax - defXMin)
          : (c ? c.x + 10 : thrower.x + C_MARK.STAND_DISTANCE),
        y: freshSetup
          ? yMin + Math.random() * (yMax - yMin)
          : (c ? c.y : thrower.y),
        targetCutter: c ? i : -1,
        reactionTimer: 0,
        facing: 'right',
      });
    }

    phase = 'THROWING';
  }

  // ── Move all players (cutters + defenders) ──
  // Cutters run their assigned route, then keep going on situational
  // re-cuts (planNextCut inside moveAlongPath). If the disc comes near, they
  // abandon the route and run toward the disc (CHASE_DISC.RADIUS).
  // A player counts as moving only when they were actually displaced this
  // frame — pushing against a field edge or sitting on the disc spot must
  // not play the run animation.
  const MOVING_EPS = 0.05; // px of displacement per frame that counts as running
  function movePlayers(dt) {
    const chaseR = CONFIG.CHASE_DISC.RADIUS;
    const hasDisc = !!disc;

    for (let i = 0; i < cutters.length; i++) {
      const c = cutters[i];
      const px = c.x, py = c.y;
      if (hasDisc && dist(c.x, c.y, disc.x, disc.y) < chaseR) {
        // Disc is near — run toward it instead of the route
        const dir = norm(disc.x - c.x, disc.y - c.y);
        c.x += dir.x * C_CUT.SPEED * dt;
        c.y += dir.y * C_CUT.SPEED * dt;
      } else {
        moveAlongPath(c, dt, C_CUT.SPEED);
      }
      c.x = clamp(c.x, 10, GF.TOTAL_W - 10);
      c.y = clamp(c.y, GF.FIELD_TOP + 6, GF.FIELD_BOTTOM - 6);
      c.moving = dist(px, py, c.x, c.y) > MOVING_EPS;
      // Face the direction of horizontal travel (vertical-only motion keeps
      // the last facing)
      if (Math.abs(c.x - px) > MOVING_EPS) c.facing = c.x < px ? 'left' : 'right';
    }
    for (let i = 0; i < defenders.length; i++) {
      const d = defenders[i];
      const px = d.x, py = d.y;
      if (d.targetCutter < 0) {
        // The thrower's mark: stands directly in front of the thrower on the
        // downfield side and never chases the disc. Only walks when a new
        // catch moves the thrower — otherwise he holds his spot.
        const markX = thrower.x + C_MARK.STAND_DISTANCE;
        const markY = thrower.y;
        // Stall gating: the count only runs while the marker is on his spot
        d.inPosition = dist(d.x, d.y, markX, markY) <= 2;
        if (!d.inPosition) {
          const dir = norm(markX - d.x, markY - d.y);
          d.x += dir.x * C_DEF.SPEED * dt;
          d.y += dir.y * C_DEF.SPEED * dt;
        }
      } else if (hasDisc && dist(d.x, d.y, disc.x, disc.y) < chaseR) {
        // Defenders are drawn toward the disc too, for interception chances
        const dir = norm(disc.x - d.x, disc.y - d.y);
        d.x += dir.x * C_DEF.SPEED * dt;
        d.y += dir.y * C_DEF.SPEED * dt;
      } else {
        const c = cutters[d.targetCutter];
        if (c) {
          const markX = c.x - 8;
          const markY = c.y + (c.y > 200 ? -6 : 6);
          // Settle when on the mark — stepping toward it every frame would keep
          // the run animation going forever
          if (dist(d.x, d.y, markX, markY) > 2) {
            const dir = norm(markX - d.x, markY - d.y);
            d.x += dir.x * C_DEF.SPEED * dt;
            d.y += dir.y * C_DEF.SPEED * dt;
          }
        }
      }
      d.x = clamp(d.x, 0, GF.TOTAL_W);
      d.y = clamp(d.y, GF.FIELD_TOP + 5, GF.FIELD_BOTTOM - 5);
      d.moving = dist(px, py, d.x, d.y) > MOVING_EPS;
      if (Math.abs(d.x - px) > MOVING_EPS) d.facing = d.x < px ? 'left' : 'right';
    }
  }

  // ── Route assignment (once per possession) ──
  // Every cutter opens with a template: one straight leg in a cardinal
  // direction, a cut, then a second straight leg. Which template they get
  // depends on where they stand relative to the thrower — cutters already
  // deep get under routes that bring them back into reach, cutters well
  // behind get deep routes into the play, and level cutters rotate the
  // deep / under / flex buckets so a fresh possession always shows one of
  // each. When the route ends, the cutter keeps going on situational
  // re-cuts (see planNextCut) — a cutter never stands still.
  const COMPASS = {
    N:  { x: 0, y: -1 },          S:  { x: 0, y: 1 },
    E:  { x: 1, y: 0 },           W:  { x: -1, y: 0 },
    NE: { x: 0.7071, y: -0.7071 }, SE: { x: 0.7071, y: 0.7071 },
    SW: { x: -0.7071, y: 0.7071 }, NW: { x: -0.7071, y: -0.7071 },
  };
  // Templates are authored for a cutter in the TOP half of the field
  // (relative to the thrower); mirror N/S components for cutters below.
  const MIRROR_Y = { N: 'S', S: 'N', NE: 'SE', SE: 'NE', NW: 'SW', SW: 'NW', E: 'E', W: 'W' };

  // Endpoint of a straight cardinal leg from (fromX, fromY): runs `len` px,
  // truncated where it would cross the field margins — the segment stays
  // exactly on its compass direction.
  function legEnd(fromX, fromY, dirName, len) {
    const d = COMPASS[dirName];
    const my = CONFIG.ROUTES.SIDE_MARGIN;
    const mx = CONFIG.ROUTES.SIDE_MARGIN;
    let t = len;
    if (d.y < 0) t = Math.min(t, (fromY - (GF.FIELD_TOP + my)) / -d.y);
    if (d.y > 0) t = Math.min(t, (GF.FIELD_BOTTOM - my - fromY) / d.y);
    if (d.x > 0) t = Math.min(t, (GF.TOTAL_W - mx - fromX) / d.x);
    if (d.x < 0) t = Math.min(t, (fromX - mx) / -d.x);
    t = Math.max(t, 0);
    return { x: fromX + d.x * t, y: fromY + d.y * t };
  }

  // Legs of a cutter's route from their current position: one straight
  // cardinal leg in the template's first direction, then the template's
  // second leg (truncated where it runs into the field margins). N/S
  // components are mirrored for cutters below the thrower.
  function legsFor(c, ty, tpl) {
    const R = CONFIG.ROUTES;
    const side = c.y <= ty ? 1 : -1;
    const d1Name = side === 1 ? tpl.first : MIRROR_Y[tpl.first];
    const d2Name = side === 1 ? tpl.then : MIRROR_Y[tpl.then];
    const len1 = lerp(tpl.firstLen[0], tpl.firstLen[1], Math.random());
    const cutPt = legEnd(c.x, c.y, d1Name, len1);
    const endPt = legEnd(cutPt.x, cutPt.y, d2Name, R.THEN_LENGTH);
    c.lastDir = d2Name;   // re-cuts shouldn't retrace the leg this route ends on
    return [cutPt, endPt];
  }

  // Where this cutter stands relative to the thrower. Deep cutters (in or
  // near the end zone, or well past the thrower) need to come back into
  // reach; cutters well behind the play need to push forward into it.
  function situationOf(c) {
    const R = CONFIG.ROUTES;
    const depth = c.x - thrower.x;
    const redZoneX = GF.TOTAL_W - GF.END_ZONE_W - 120;
    if (c.x > redZoneX || depth > R.DEEP_DEPTH) return 'deep';
    if (depth < R.BEHIND_DEPTH) return 'behind';
    return 'level';
  }

  function assignRoutes(ty) {
    const R = CONFIG.ROUTES;
    const pool = [...R.TEMPLATES];
    const KIND_CYCLE = ['flex', 'deep', 'under'];

    for (let i = 0; i < cutters.length; i++) {
      const c = cutters[i];
      // Situation first: deep/behind cutters get the bucket that brings them
      // back into reach; level cutters rotate the buckets so a fresh
      // possession always shows a deep, an under and a flex route.
      const sit = situationOf(c);
      const wanted = sit === 'deep' ? 'under'
        : sit === 'behind' ? 'deep'
        : KIND_CYCLE[i % KIND_CYCLE.length];
      // A template only fits if its first leg actually goes somewhere from
      // this cutter's spot (a N leg against the top sideline is a dead leg).
      const viable = pool.filter(tpl => {
        const side = c.y <= ty ? 1 : -1;
        const d1 = side === 1 ? tpl.first : MIRROR_Y[tpl.first];
        const probe = legEnd(c.x, c.y, d1, tpl.firstLen[0]);
        return dist(c.x, c.y, probe.x, probe.y) >= 60;
      });
      let pickFrom = viable.filter(tpl => tpl.kind === wanted);
      if (!pickFrom.length) pickFrom = viable.length ? viable : pool;
      const tpl = pickFrom[Math.floor(Math.random() * pickFrom.length)];
      if (!tpl) continue;
      pool.splice(pool.indexOf(tpl), 1);

      c.path = legsFor(c, ty, tpl);
      c.wpIdx = 0;
      c.preview = [{ x: c.x, y: c.y }, ...c.path];
      c.flashTimer = R.SHOW_DURATION;
    }
  }

  // ── Re-cuts ──
  // A finished route (or finished re-cut) is replaced by a fresh straight
  // sprint chosen from the situation on the pitch: a deep cutter cuts back
  // into the thrower's reach, a cutter well behind pushes forward into the
  // play, and a cutter in the pocket keeps flowing downfield with some
  // lateral variety. Every candidate direction is straight (compass),
  // truncated by the field margins — never into the out of bounds.
  function planNextCut(c) {
    const R = CONFIG.ROUTES;
    const sit = situationOf(c);
    let best = null;
    let fallback = null;   // roomiest direction, for a corner-pinned cutter

    for (const name in COMPASS) {
      const d = COMPASS[name];
      const probe = legEnd(c.x, c.y, name, R.RECUT_LEN[1]);
      const room = dist(c.x, c.y, probe.x, probe.y);
      if (!fallback || room > fallback.room) fallback = { name, d, room };
      if (room < R.RECUT_MIN_ROOM) continue;

      let score;
      if (sit === 'deep')        score = -d.x * 130 + Math.abs(d.y) * 10 + Math.random() * 40;
      else if (sit === 'behind') score =  d.x * 130 + Math.abs(d.y) * 10 + Math.random() * 40;
      else                       score =  d.x * 55  + Math.abs(d.y) * 12 + Math.random() * 60;
      if (name === c.lastDir) score -= 120;   // don't retrace the leg just ran

      // Keep the shape of the offense: don't converge on a teammate, and
      // don't finish standing on the thrower
      const endX = c.x + d.x * room, endY = c.y + d.y * room;
      for (const o of cutters) {
        if (o !== c && dist(endX, endY, o.x, o.y) < R.SPREAD_DIST) score -= 50;
      }
      if (dist(endX, endY, thrower.x, thrower.y) < 40) score -= 30;

      if (!best || score > best.score) best = { name, d, room, score };
    }

    const pick = best || fallback;
    const len = Math.min(pick.room, lerp(R.RECUT_LEN[0], R.RECUT_LEN[1], Math.random()));
    c.path = [{ x: c.x + pick.d.x * len, y: c.y + pick.d.y * len }];
    c.wpIdx = 0;
    c.lastDir = pick.name;
  }

  // Walk along the current route waypoints. When they run out (route or re-cut
  // finished) the cutter immediately plans a fresh straight sprint — see
  // planNextCut — so a cutter never stands still. Whether the cutter is
  // actually running is derived from displacement in movePlayers.
  function moveAlongPath(c, dt, speed) {
    if (c.wpIdx >= c.path.length) planNextCut(c);
    const wp = c.path[c.wpIdx];
    const d = dist(c.x, c.y, wp.x, wp.y);
    if (d < 8) {
      c.wpIdx++;
      return;
    }
    const dir = norm(wp.x - c.x, wp.y - c.y);
    c.x += dir.x * speed * dt;
    c.y += dir.y * speed * dt;
  }

  // ── Disc flight physics (2-D, shared) ──
  // One flight step used by the real disc, the throw solver and the aim
  // preview — keeping them identical guarantees the preview always shows the
  // true path. Returns the pre-step speed (used for the slow-disc check).
  function stepDiscFlight(d, curveAccel, windF, dt) {
    // Curve acceleration decays over flight time — strong bend at release,
    // gradually flattens to a straight line (more controllable).
    const curveDecay = Math.max(0, 1 - d.age / C_DSC.CURVE_DECAY_TIME);
    const spd = Math.hypot(d.vx, d.vy);
    if (spd > 1 && curveDecay > 0) {
      const pnx = -d.vy / spd;
      const pny =  d.vx / spd;
      d.vx += pnx * curveAccel * curveDecay * dt;
      d.vy += pny * curveAccel * curveDecay * dt;
    }
    // Wind (x-axis only = crosswind / headwind; scaled so it nudges, not dominates)
    d.vx += windF * CONFIG.WIND.EFFECT * dt;
    // Air resistance (dt-independent — normalised to 60 fps)
    const resist = Math.pow(C_DSC.AIR_RESISTANCE, dt * 60);
    d.vx *= resist;
    d.vy *= resist;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.age += dt;
    return spd;
  }

  // X where the segment (x0,y0) → (x1,y1) leaves the playing-field rectangle
  // (x0,y0) is inside; (x1,y1) is the first sub-step position outside it, so
  // the crossing is over a sideline or end line. Used for the out-of-bounds
  // turnover spot.
  function fieldExitX(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    let t = 1;
    if (x1 < 0 || x1 > GF.TOTAL_W) {
      const tx = x1 < 0 ? -x0 / dx : (GF.TOTAL_W - x0) / dx;
      if (tx >= 0) t = Math.min(t, tx);
    }
    if (y1 < GF.FIELD_TOP || y1 > GF.FIELD_BOTTOM) {
      const ty = y1 < GF.FIELD_TOP ? (GF.FIELD_TOP - y0) / dy : (GF.FIELD_BOTTOM - y0) / dy;
      if (ty >= 0) t = Math.min(t, ty);
    }
    return x0 + dx * clamp(t, 0, 1);
  }

  // Simulate a flight and return its path points (no z — previews are 2-D).
  function simulateFlight(startX, startY, heading, speed, curveAccel, windF, steps, stepDt) {    const d = {
      x: startX, y: startY, age: 0,
      vx: Math.cos(heading) * speed,
      vy: Math.sin(heading) * speed,
    };
    const pts = [];
    for (let i = 0; i < steps; i++) {
      stepDiscFlight(d, curveAccel, windF, stepDt);
      pts.push({ x: d.x, y: d.y });
    }
    return pts;
  }

  // Solve the launch heading whose curved flight ends on the target: aimed
  // direction + power pick the landing spot, the selected curve only shapes
  // the path there. Wind is NOT compensated — it stays a real aim factor.
  // Bisects the heading over a span around the direct line; falls back to
  // the closest heading when the curve can't reach the target.
  function solveThrowHeading(aimX, aimY, power, curveAccel) {
    const speed = C_DSC.SPEED_MIN + power * (C_DSC.SPEED_MAX - C_DSC.SPEED_MIN);
    const direct = Math.atan2(aimY - thrower.y, aimX - thrower.x);
    if (!curveAccel) return { heading: direct, speed };

    const steps = CONFIG.AIM_PREVIEW.STEPS;
    const stepDt = CONFIG.AIM_PREVIEW.STEP_DT;
    const tX = aimX - thrower.x, tY = aimY - thrower.y;
    const tLen = Math.hypot(tX, tY) || 1;
    // Signed lateral error: endpoint offset from the target, measured along
    // the perpendicular of the thrower→target line.
    const errAt = h => {
      const end = simulateFlight(thrower.x, thrower.y, h, speed, curveAccel, 0, steps, stepDt).pop();
      return ((end.x - aimX) * -tY + (end.y - aimY) * tX) / tLen;
    };

    const SPAN = 1.2;  // rad of heading searched either side of the direct line
    const SCAN = 24;
    let a = direct - SPAN, aErr = errAt(a);
    let best = { h: a, e: Math.abs(aErr) };
    for (let i = 1; i <= SCAN; i++) {
      const b = direct - SPAN + (2 * SPAN) * i / SCAN;
      const bErr = errAt(b);
      if (Math.abs(bErr) < best.e) best = { h: b, e: Math.abs(bErr) };
      if (aErr * bErr <= 0) {
        // Sign change found — bisect down to sub-pixel precision
        let lo = a, loErr = aErr, hi = b;
        for (let j = 0; j < 20; j++) {
          const m = (lo + hi) / 2;
          const mErr = errAt(m);
          if (loErr * mErr <= 0) hi = m; else { lo = m; loErr = mErr; }
        }
        return { heading: (lo + hi) / 2, speed };
      }
      a = b; aErr = bErr;
    }
    return { heading: best.h, speed };
  }

  // ── Throw ──
  // (aimX, aimY) is the target the preview showed; the launch heading is
  // solved so the selected curve's bend cancels out and the disc still ends
  // up on the target — the curve changes the path shape, not the destination.
  function curveAccelFor() {
    if (curveType === 'outside') return C_DSC.CURVE_ACCEL;
    if (curveType === 'inside')  return -C_DSC.CURVE_ACCEL;
    return 0;
  }

  function doThrow(aimX, aimY, power) {
    const curveAccel = curveAccelFor();
    const solved = solveThrowHeading(aimX, aimY, power, curveAccel);

    disc = {
      x: thrower.x,
      y: thrower.y,
      z: 0,
      vx: Math.cos(solved.heading) * solved.speed,
      vy: Math.sin(solved.heading) * solved.speed,
      vz: C_DSC.Z_VELOCITY * (0.4 + power * 0.6),
      curveAccel,
      simAcc: 0, // fixed-step integration accumulator (see updateDiscFlying)
      prevX: thrower.x, prevY: thrower.y, // last completed sub-step, for render interpolation
      age: 0,
    };

    currentAim = null; // release the aiming pose
    phase = 'DISC_FLYING';
  }

  // ── Set up a stepped opponent advance ──
  // Pre-rolls one success/fail roll per zone between startIdx and our end
  // zone; the first failure stops the sequence (we then pick up in that
  // zone). Used for opponent possessions (coin toss / after we score) and
  // for turnover recoveries. `extra` merges turnOverMsg / callahanRisk flags.
  function setupOppAdvance(startIdx, extra) {
    const results = [];
    for (let i = startIdx; i > 0; i--) {
      const z = OPP_ZONES[i];
      results.push({ zone: z, success: Math.random() < z.nextChance * OPP_FACTOR() });
      if (!results[results.length - 1].success) break;
    }
    oppState = {
      step: 0,
      results,
      startLabel: OPP_ZONES[startIdx].label,
      turnOverMsg: null,
      callahanRisk: false,
      ...(extra || {}),
    };
    // The field follows the action: center the view on the zone the
    // opponent starts their advance from, and hide our players — the
    // narration plays on an empty field.
    defenseView = true;
    centerOnZone(OPP_ZONES[startIdx]);
  }

  // ── Camera: center the view on a spot / opponent zone (defense) ──
  // Defense is narrated zone by zone (RESULT messages); the view pans to
  // whatever zone the current message is about.
  function centerOnX(x) {
    camera.tgtX = clamp(x - GF.VIEWPORT_W / 2, 0, GF.TOTAL_W - GF.VIEWPORT_W);
  }
  function centerOnZone(z) { centerOnX((z.minX + z.maxX) / 2); }

  // ── Show a result message then wait ──
  function showResult(msg, turnoverX) {
    const isTurnover = !msg.startsWith('SCORE');
    if (isTurnover && turnoverX !== undefined) {
      // ── Callahan against us: picked off in our own end zone = instant point ──
      if (msg.startsWith('Intercepted') && turnoverX < GF.END_ZONE_W) {
        defScore++;
        const over = defScore >= matchTarget ? '  Game Over.' : '';
        message = `CALLAHAN! Opponent scores.  ${score}-${defScore}.${over}`;
        messageTimer = 2.5;
        centerOnZone(OPP_ZONES[0]);
        oppState = null;
        disc = null;
        phase = defScore >= matchTarget ? 'GAME_OVER' : 'RESULT';
        return;
      }

      // ── Other turnover in our own end zone: opponent on our goal line ──
      // (drop / out of bounds / stall). One goal-line pass to score.
      if (turnoverX < GF.END_ZONE_W) {
        const z = OPP_ZONES[0];
        oppState = {
          step: 0,
          results: [{ zone: z, success: Math.random() < z.nextChance * OPP_FACTOR() }],
          startLabel: z.label,
          turnOverMsg: msg,
        };
        message = `${msg}.  OPP on our goal line.`;
        messageTimer = 2.0;
        defenseView = true;
        centerOnZone(OPP_ZONES[0]);
        phase = 'RESULT';
        disc = null;
        return;
      }

      // ── Set up stepped opponent advance ──
      const startZone = oppZoneForX(turnoverX);
      // We turned it over in THEIR end zone — their clearing pass can be
      // picked off for a player Callahan (rolled in updateResult).
      const inTheirEndZone = turnoverX >= GF.TOTAL_W - GF.END_ZONE_W;
      setupOppAdvance(OPP_ZONES.indexOf(startZone), {
        turnOverMsg: msg,
        callahanRisk: inTheirEndZone,
      });

      const where = inTheirEndZone ? 'their own end zone' : startZone.label;
      message = `${msg}.  OPP starts in ${where}.`;
      messageTimer = 2.0;
      phase = 'RESULT';
      disc = null;
      return;
    }
    // Score or fallback — no opponent advance
    message = msg;
    messageTimer = 2.0;
    phase = 'RESULT';
    disc = null;
  }

  // ── Resolve a catch attempt ──
  function resolveCatch(nearX, nearY) {
    // Find closest cutter to the disc
    let best = null;
    let bestD = Infinity;
    let bestIdx = -1;
    for (let i = 0; i < cutters.length; i++) {
      const d = dist(cutters[i].x, cutters[i].y, nearX, nearY);
      if (d < bestD) { bestD = d; best = cutters[i]; bestIdx = i; }
    }
    if (!best || bestD > C_DSC.CATCH_RADIUS * 2.5) {
      showResult('Incomplete', nearX);
      return;
    }

    // Interception check — defender close to disc (the thrower's mark has a
    // smaller reach)
    for (let i = 0; i < defenders.length; i++) {
      const d = defenders[i];
      const dd = dist(d.x, d.y, disc.x, disc.y);
      const radius = d.targetCutter < 0 ? C_MARK.INTERCEPT_RADIUS : C_DEF.INTERCEPT_RADIUS;
      if (dd < radius && Math.random() < 0.40 * OPP_FACTOR()) {
        // Turnover spot = the intercepting defender's position (decides
        // Callahans and where the opponent picks up)
        showResult('Intercepted!', d.x);
        return;
      }
    }

    let chance = C_CTH.BASE_CHANCE;
    chance -= bestD * C_CTH.DIST_PENALTY;
    chance += handsStats[bestIdx] * C_CTH.HANDS_BONUS;

    // Defender pressure
    for (let i = 0; i < defenders.length; i++) {
      if (defenders[i].targetCutter === bestIdx) {
        const dd = dist(defenders[i].x, defenders[i].y, best.x, best.y);
        if (dd < C_DEF.MARK_DISTANCE) chance -= C_CTH.DEF_PENALTY;
        break;
      }
    }

    chance = clamp(chance, 0.05, 0.98);

    if (Math.random() < chance) {
      // Caught! A point counts only when the CATCHER is in the end zone —
      // the disc can land short of the line while the player crosses it.
      if (best.x > GF.TOTAL_W - GF.END_ZONE_W) {
        // Score! The conceding team takes the next possession.
        score++;
        disc = null;
        if (score >= matchTarget) {
          message = `SCORE!  You win ${score}-${defScore}`;
          messageTimer = 3.0;
          phase = 'GAME_OVER';
        } else {
          // You scored — opponent starts on offense in their back-field.
          // The start zone gets its own message before the advance rolls.
          message = `SCORE!  You ${score} - OPP ${defScore}.`;
          messageTimer = 2.0;
          phase = 'RESULT';
          setupOppAdvance(OPP_ZONES.length - 1, {
            announceNext: `OPP starts in the ${OPP_ZONES[OPP_ZONES.length - 1].label}.`,
          });
        }
      } else {
        // Complete — receiver becomes thrower. The old thrower rejoins as a
        // cutter at their current position; everyone gets a fresh route.
        const oldTx = thrower.x, oldTy = thrower.y;
        const oldTId = thrower.id;
        thrower.x = best.x;
        thrower.y = best.y;
        thrower.id = best.id;   // the catcher keeps his O-label as thrower
        disc = null;

        // Replace the catcher's slot with the old thrower (new cutter)
        const newC = { x: oldTx, y: oldTy, id: oldTId, path: [], wpIdx: 0, flashTimer: 0, preview: null, facing: 'right' };
        cutters[bestIdx] = newC;
        handsStats[bestIdx] = 0.60 + Math.random() * 0.35;

        // New thrower → everyone re-routes relative to the new spot and
        // shows their route preview once for this possession
        assignRoutes(thrower.y);

        // Reassign defenders by identity: the new thrower's defender becomes
        // the marker; the previous marker takes over his man (the old
        // thrower, now a cutter at bestIdx). Every other matchup is untouched.
        for (let i = 0; i < defenders.length; i++) {
          if (defenders[i].targetCutter === bestIdx) defenders[i].targetCutter = -1;
          else if (defenders[i].targetCutter === -1) defenders[i].targetCutter = bestIdx;
          defenders[i].reactionTimer = 0;
        }

        phase = 'THROWING';
        stallCount = 0;
      }
    } else {
      showResult('Dropped!', disc.x);
    }
  }

  // ── Main update ──
  function update(dt, input) {
    // 1. Wind
    windTimer += dt;
    if (windTimer >= CONFIG.WIND.CHANGE_INTERVAL) {
      windTimer = 0;
      wind = CONFIG.WIND.MIN + Math.random() * (CONFIG.WIND.MAX - CONFIG.WIND.MIN);
      // snap to non-tiny value for visibility
      if (Math.abs(wind) < 8) wind = wind < 0 ? -15 : 15;
    }

    // 2. Phase dispatch
    switch (phase) {
      case 'MENU':
        // Coin toss — random team gets the first possession
        if (input.anyPressed) coinToss();
        break;

      case 'THROWING':
        updateThrowing(dt, input);
        break;

      case 'DISC_FLYING':
        updateDiscFlying(dt);
        break;

      case 'RESULT':
        updateResult(dt);
        break;

      case 'GAME_OVER':
        // Notify the tournament manager (or, standalone, offer a restart)
        if (input.anyPressed && !matchEndSent) {
          matchEndSent = true;
          if (onMatchEnd) {
            onMatchEnd({ myScore: score, oppScore: defScore, won: score > defScore });
          } else {
            score = 0; defScore = 0; phase = 'MENU';
          }
        }
        break;
    }

    // 3. Route previews — shown once per possession (assignRoutes), fade after
    // ROUTES.SHOW_DURATION seconds. No auto-refresh: next preview comes with
    // the next new thrower.
    for (const c of cutters) {
      if (c.flashTimer > 0) {
        c.flashTimer -= dt;
        if (c.flashTimer <= 0) c.preview = null;
      }
    }
    routePreviewPaths = (phase === 'THROWING' || phase === 'DISC_FLYING')
      ? cutters.map(c => (c.flashTimer > 0 && c.preview) ? c.preview : null)
      : [];
    if (phase === 'MENU' || phase === 'GAME_OVER') routePreviewPaths = [];

    // 4. Camera smoothing
    camera.x = lerp(camera.x, camera.tgtX, CONFIG.CAMERA.SMOOTHING);
  }

  // ── THROWING phase ──
  const CURVE_ORDER = ['straight', 'inside', 'outside'];

  function updateThrowing(dt, input) {
    // Curve switching — ↑/↓ arrows or a second-finger tap cycle
    // straight → inside → outside (tap alternates forward)
    if (input.arrowUpPressed || input.arrowDownPressed || input.secondTapPressed) {
      const idx = CURVE_ORDER.indexOf(curveType);
      let dir = 1;
      if (input.arrowDownPressed && !input.arrowUpPressed) dir = -1;
      const next = (idx + dir + CURVE_ORDER.length) % CURVE_ORDER.length;
      curveType = CURVE_ORDER[next];
    }

    // Stall count — only while the marker is on his marking spot (before
    // that the thrower is not being marked yet). No marker at all → count
    // unconditionally, as before.
    const marker = defenders.find(d => d.targetCutter < 0);
    if (!marker || marker.inPosition) {
      stallCount += dt;
      if (stallCount >= CONFIG.STALL.COUNT) {
        showResult('Stall — Turnover', thrower.x);
        return;
      }
    }

    // Move players
    movePlayers(dt);

    // Camera — follow thrower
    camera.tgtX = thrower.x - GF.VIEWPORT_W * CONFIG.CAMERA.LEAD_FACTOR;
    camera.tgtX = clamp(camera.tgtX, 0, GF.TOTAL_W - GF.VIEWPORT_W);

    // ── Slingshot throw ──
    // Drag anywhere. Direction and power come from the drag vector itself
    // (press start → current pointer), NOT from the thrower's position, so a
    // straight pull-back always throws straight. Throw direction = REVERSE of
    // drag direction. Power = drag distance.
    // The aimed point is the TARGET the disc lands on; the selected curve
    // only shapes the path there (the launch heading is solved so the curved
    // flight still ends on the target).
    const dragOffX = input.currentX - input.startX;
    const dragOffY = input.currentY - input.startY;
    const dragDist = Math.hypot(dragOffX, dragOffY);
    const power = clamp(dragDist / C_DSC.DRAG_MAX_LENGTH, 0, 1);

    if (input.isDown && dragDist > 5) {
      // Reverse direction: if you drag NW, throw goes SE
      const revDir = norm(-dragOffX, -dragOffY);
      const targetDist = 60 + power * 280;
      const targetX = thrower.x + revDir.x * targetDist;
      const targetY = thrower.y + revDir.y * targetDist;
      const curveAccel = curveAccelFor();
      const solved = solveThrowHeading(targetX, targetY, power, curveAccel);
      // Preview the exact flight path, wind included
      const trajectory = simulateFlight(
        thrower.x, thrower.y, solved.heading, solved.speed,
        curveAccel, wind, CONFIG.AIM_PREVIEW.STEPS, CONFIG.AIM_PREVIEW.STEP_DT
      );
      currentAim = { targetX, targetY, power, trajectory };
    } else {
      currentAim = null;
    }

    if (input.justReleased && dragDist > 15) {
      const revDir = norm(-dragOffX, -dragOffY);
      const targetDist = 60 + power * 280;
      const targetX = thrower.x + revDir.x * targetDist;
      const targetY = thrower.y + revDir.y * targetDist;
      doThrow(targetX, targetY, power);
    }
  }

  // ── DISC_FLYING phase ──
  function updateDiscFlying(dt) {
    if (!disc) return;

    // Players run their routes (disc-proximity override inside movePlayers)
    movePlayers(dt);

    // Shared 2-D flight step (curve decay, wind, air resistance, position),
    // integrated in fixed SIM_STEP sub-steps so the real flight follows the
    // preview trajectory exactly — variable frame dt would bend differently.
    disc.simAcc += dt;
    let spd = Math.hypot(disc.vx, disc.vy);
    while (disc.simAcc >= C_DSC.SIM_STEP) {
      disc.simAcc -= C_DSC.SIM_STEP;
      // Remember the sub-step start so the renderer can interpolate smoothly
      // between physics steps (fixed steps alone look jerky at high Hz)
      disc.prevX = disc.x;
      disc.prevY = disc.y;
      spd = stepDiscFlight(disc, disc.curveAccel, wind, C_DSC.SIM_STEP);
      // First sub-step that leaves the playing field: record the crossing
      // point. An out-of-bounds turnover is taken from there — not from
      // where the disc finally settles.
      if (disc.oobX === undefined &&
          (disc.x < 0 || disc.x > GF.TOTAL_W ||
           disc.y < GF.FIELD_TOP || disc.y > GF.FIELD_BOTTOM)) {
        disc.oobX = fieldExitX(disc.prevX, disc.prevY, disc.x, disc.y);
      }
    }

    // Z-axis arc
    disc.vz -= C_DSC.GRAVITY * dt;
    disc.z += disc.vz * dt;
    if (disc.z > 0) disc.hasFlown = true;
    if (disc.z < 0) {
      disc.z = 0;
      disc.vz = 0;
      // A fast disc at ground level is skimming, not landed — the z-arc is
      // far shorter than the horizontal flight, so "touched z=0" happens
      // mid-flight for nearly every throw. Only a settled disc (slow) is
      // genuinely down, and only then can it be out-of-bounds on the ground.
      if (disc.hasFlown && spd < C_DSC.LAND_SPEED) disc.landed = true;
    }

    // (disc.age is advanced inside stepDiscFlight with each physics sub-step)

    // Camera — follow disc
    camera.tgtX = disc.x - GF.VIEWPORT_W * 0.38;
    camera.tgtX = clamp(camera.tgtX, 0, GF.TOTAL_W - GF.VIEWPORT_W);

    // Out of bounds? While airborne the disc may leave the playing field and
    // curve back in — it only counts as out once the flight is effectively
    // over (landed, timed out, or slowed to a crawl) while outside the lines,
    // or when it strays really far (no realistic way back). The slow/timeout
    // resolutions below are therefore only reached for in-bounds discs — an
    // out-of-bounds disc never resolves as a mere 'Incomplete'.
    const m = C_DSC.OOB_HARD_MARGIN;
    const outside =
      disc.x < 0 || disc.x > GF.TOTAL_W ||
      disc.y < GF.FIELD_TOP || disc.y > GF.FIELD_BOTTOM;
    const reallyFar =
      disc.x < -m || disc.x > GF.TOTAL_W + m ||
      disc.y < GF.FIELD_TOP - m || disc.y > GF.FIELD_BOTTOM + m;
    const flightOver =
      disc.landed || disc.age > 3.5 || (disc.age > 0.8 && spd < 25);
    if (reallyFar || (outside && flightOver)) {
      // Take the turnover from where the disc crossed the line (recorded at
      // the sub-step it left the field); settle position as a fallback
      const spotX = disc.oobX !== undefined ? disc.oobX : disc.x;
      showResult('Out of bounds', clamp(spotX, 20, GF.TOTAL_W - 20));
      return;
    }

    // Disc flight timeout (max ~3.5 s of flight)
    if (disc.age > 3.5) {
      resolveCatch(disc.x, disc.y);
      return;
    }

    // If disc is moving very slowly after being airborne, resolve
    if (disc.age > 0.8 && spd < 25) {
      resolveCatch(disc.x, disc.y);
      return;
    }

    // Check for catch / interception during flight (when disc is low enough)
    if (disc.z < 20) {
      // Receiver catch
      for (const c of cutters) {
        if (dist(c.x, c.y, disc.x, disc.y) < C_DSC.CATCH_RADIUS) {
          resolveCatch(disc.x, disc.y);
          return;
        }
      }

      // Defender interception during flight (the thrower's mark has a
      // smaller reach)
      for (const d of defenders) {
        const dd = dist(d.x, d.y, disc.x, disc.y);
        const radius = d.targetCutter < 0 ? C_MARK.INTERCEPT_FLIGHT_RADIUS : C_DEF.INTERCEPT_FLIGHT_RADIUS;
        if (dd < radius &&
            Math.random() < C_DEF.INTERCEPT_FLIGHT_CHANCE &&
            disc.z < 12) {
          showResult('Intercepted!', d.x);
          return;
        }
      }
    }
  }

  // ── RESULT phase ──
  function updateResult(dt) {
    messageTimer -= dt;
    if (messageTimer > 0 || phase === 'GAME_OVER') return;

    // ── Stepped opponent advance ──
    if (oppState) {
      // One-time start-zone announcement (e.g. after we scored): show it,
      // then pick up the advance rolls on the next expiration
      if (oppState.announceNext) {
        message = oppState.announceNext;
        messageTimer = 1.8;
        oppState.announceNext = null;
        return;
      }

      const res = oppState.results[oppState.step];
      oppState.step++;

      if (res.success && oppState.step >= oppState.results.length) {
        // All steps succeeded — opponent scores!
        defScore++;
        // oppAdvanceSpot stays null → resetPoint does the fresh line-up
        const over = defScore >= matchTarget ? '  Game Over.' : '';
        message = `Opponent scores!  ${score}-${defScore}.${over}`;
        messageTimer = 2.5;
        centerOnZone(OPP_ZONES[0]);
        oppState = null;
        if (defScore >= matchTarget) phase = 'GAME_OVER';
        return;
      }

      if (res.success) {
        // Advance to the next zone — the view follows them into it
        const zIdx = OPP_ZONES.indexOf(res.zone);
        const nextLabel = zIdx - 1 > 0
          ? OPP_ZONES[zIdx - 1].label : 'scoring position';
        message = `Opponent advances to ${nextLabel}.`;
        messageTimer = 1.5;
        centerOnZone(OPP_ZONES[Math.max(zIdx - 1, 0)]);
        return;
      }

      // Failed — player picks up somewhere in this zone.
      // If we turned it over in their end zone, their failed clearing pass
      // can be picked off in their own end zone → player Callahan!
      if (oppState.callahanRisk && oppState.step === 1 &&
          Math.random() < OPP_CALLAHAN_CHANCE) {
        score++;
        oppAdvanceSpot = GF.SCORE_RESET_YARD;
        const over = score >= matchTarget ? '  Game Over.' : '';
        message = `CALLAHAN! You score!  ${score}-${defScore}.${over}`;
        messageTimer = 2.5;
        centerOnX(GF.TOTAL_W - GF.END_ZONE_W / 2);
        oppState = null;
        if (score >= matchTarget) phase = 'GAME_OVER';
        return;
      }
      // Stopped them in our own end zone? Take the disc at the goal line,
      // not inside our own end zone.
      const stoppedInOurEndZone = res.zone.id === 'myEndzone';
      if (stoppedInOurEndZone) {
        oppAdvanceSpot = GF.END_ZONE_W;
        message = `Goal-line stand!  You pick up.`;
      } else {
        oppAdvanceSpot = clamp(
          res.zone.minX + Math.random() * (res.zone.maxX - res.zone.minX) * 0.7,
          30, GF.TOTAL_W - 30
        );
        message = `Turnover in ${res.zone.label}.  You pick up.`;
      }
      messageTimer = 2.0;
      centerOnZone(res.zone);
      oppState = null;
      return;
    }

    // ── Normal reset (score, fallback) ──
    // Fresh line-up only when there is no turnover spot: start of the game
    // (coin toss) or after the opponent scored. A turnover pickup keeps the
    // players where they are.
    const spot = oppAdvanceSpot !== null ? oppAdvanceSpot : GF.SCORE_RESET_YARD;
    const fresh = oppAdvanceSpot === null;
    oppAdvanceSpot = null;
    resetPoint(spot, fresh);
  }

  // ── Produce renderable state snapshot ──
  function getState() {
    // Compute open-ness for each cutter
    let openIdx = -1;
    let bestScore = -Infinity;
    const cutterInfos = cutters.map((c, i) => {
      // Pair each cutter with the defender actually assigned to him (index
      // pairing broke once matchups became identity-based)
      const d = defenders.find(dd => dd.targetCutter === i);
      const defDist = d ? dist(d.x, d.y, c.x, c.y) : 999;
      const scoreRaw = defDist - C_DEF.MARK_DISTANCE;
      if (scoreRaw > bestScore) { bestScore = scoreRaw; openIdx = i; }
      return { x: c.x, y: c.y, id: c.id, isOpen: false, moving: !!c.moving, facing: c.facing };
    });
    if (openIdx >= 0) cutterInfos[openIdx].isOpen = true;
    const openReceiver = openIdx >= 0 ? cutters[openIdx] : null;

    // Defense: the opponent's possession is narrated zone by zone on an
    // empty field — our players (stale from the last possession) stay hidden
    // until resetPoint lines up the next one
    const shownCutters = defenseView ? [] : cutterInfos;
    const shownDefenders = defenseView ? [] : defenders;
    const shownThrower = defenseView ? { x: -100, y: -100, id: thrower.id } : thrower;

    // Disc render state: interpolate between the last two physics sub-steps so
    // the disc glides at the display's refresh rate (logic stays fixed-step).
    let discState = null;
    if (disc) {
      const alpha = clamp(disc.simAcc / C_DSC.SIM_STEP, 0, 1);
      discState = {
        x: disc.prevX !== undefined ? lerp(disc.prevX, disc.x, alpha) : disc.x,
        y: disc.prevY !== undefined ? lerp(disc.prevY, disc.y, alpha) : disc.y,
        z: disc.z,
      };
    }

    return {
      phase,
      camera: { x: camera.x },
      teams,
      matchTag,
      tournamentLabel,
      thrower: shownThrower,
      cutters: shownCutters,
      defenders: shownDefenders.map(d => ({ x: d.x, y: d.y, moving: !!d.moving, facing: d.facing, targetCutter: d.targetCutter })),
      disc: discState,
      stallCount: Math.min(Math.ceil(stallCount), CONFIG.STALL.COUNT),
      stallRaw: stallCount,
      score,
      defScore,
      targetScore: matchTarget,
      message,
      messageTimer,
      wind,
      curveType,
      openReceiver: defenseView ? null : openReceiver,
      windTimer,
      aim: currentAim,  // { targetX, targetY, power, trajectory } or null
      routePreview: routePreviewPaths.length > 0 ? routePreviewPaths : null,
    };
  }

  return { init, update, getState, startMatch, curveType: () => curveType, setCurve: t => { curveType = t; } };
}