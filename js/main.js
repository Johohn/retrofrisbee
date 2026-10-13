// main.js — Entry point: set up canvas, input, game, manager, renderers,
// and run the loop. The manager wraps the match engine: outside a match it
// draws its own career screens; during a match it delegates to the game.

// ── Canvas setup ──
const canvas = document.getElementById('game-canvas');

// The match viewport keeps its logical height; its width follows the window
// aspect (clamped to the field width), so a wide screen shows more of the
// field and a narrow one less. Manager screens keep a fixed 800x450 layout
// and are scaled to fit the canvas instead.
const LOGICAL_H = CONFIG.FIELD.VIEWPORT_H;
const MIN_VIEWPORT_W = 600;   // keeps the HUD / layouts usable on portrait windows

function resizeCanvas() {
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const aspect = winW / winH;

  const w = Math.max(MIN_VIEWPORT_W, Math.min(CONFIG.FIELD.TOTAL_W, Math.round(LOGICAL_H * aspect)));
  CONFIG.FIELD.VIEWPORT_W = w;
  canvas.width = w;
  canvas.height = LOGICAL_H;

  // CSS size: fill the window when the aspect matches, letterbox when the
  // logical width was clamped
  const ratio = w / LOGICAL_H;
  let cw = winW, ch = winH;
  if (ch * ratio > cw) ch = cw / ratio;
  else cw = ch * ratio;
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Modules ──
const game = createGame();
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const manager = createManager(game);
const managerRenderer = createManagerRenderer(canvas);

// Curve type is switched with the ↑ / ↓ arrow keys or a second-finger tap
// (both handled in game.js — see updateThrowing).

// Career reset — hold Shift and press R on any manager screen; wipes the
// save and returns to the team-selection screen
window.addEventListener('keydown', e => {
  if (e.key === 'R' && e.shiftKey) {
    manager.resetCareer();
  }
});

// ── Manager screen scaling ──
// Manager screens draw in their fixed logical space and are uniformly
// scaled + centred on the canvas; taps are mapped back into that space so
// hit-testing works at any canvas size.
function managerView() {
  const MW = CONFIG.MANAGER.W, MH = CONFIG.MANAGER.H;
  const s = Math.min(canvas.width / MW, canvas.height / MH);
  return { s, offX: (canvas.width - MW * s) / 2, offY: (canvas.height - MH * s) / 2 };
}

function toManagerSpace(i) {
  const v = managerView();
  const tx = x => (x - v.offX) / v.s;
  const ty = y => (y - v.offY) / v.s;
  return {
    ...i,
    startX: tx(i.startX), startY: ty(i.startY),
    currentX: tx(i.currentX), currentY: ty(i.currentY),
  };
}

// ── Game loop (variable timestep, capped) ──
let lastTime = 0;
let lastScreen = 'SELECT';   // manager screen of the previous frame
const MAX_DT = 1 / 30; // never drop below ~33 fps

function loop(timestamp) {
  const rawDt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  const dt = Math.min(rawDt, MAX_DT);

  // 1. Read input
  const iState = input.getState();

  // 2. Update (manager delegates to the game while a match runs). Manager
  // screens get their taps remapped into their fixed logical space; the
  // match reads raw viewport coordinates.
  const inManager = lastScreen !== 'MATCH';
  manager.update(dt, inManager ? toManagerSpace(iState) : iState);

  // 3. Render — match screens use the game renderer, everything else the
  // manager renderer. getState() reflects any screen change that happened
  // during update (e.g. the match-end callback).
  const mState = manager.getState();
  lastScreen = mState.screen;
  if (mState.screen === 'MATCH') {
    renderer.render(game.getState(), iState);
  } else {
    managerRenderer.render(mState);
  }

  requestAnimationFrame(loop);
}

// ── Kick off ──
game.init();          // match engine ready; the manager starts the first match
resizeCanvas();
requestAnimationFrame(loop);