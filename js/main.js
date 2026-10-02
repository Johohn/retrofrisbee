// main.js — Entry point: set up canvas, input, game, manager, renderers,
// and run the loop. The manager wraps the match engine: outside a match it
// draws its own career screens; during a match it delegates to the game.

// ── Canvas setup ──
const canvas = document.getElementById('game-canvas');

const LOGICAL_W = CONFIG.FIELD.VIEWPORT_W;
const LOGICAL_H = CONFIG.FIELD.VIEWPORT_H;
canvas.width = LOGICAL_W;
canvas.height = LOGICAL_H;

// Responsive sizing — scale canvas via CSS to fill viewport while maintaining ratio
function resizeCanvas() {
  const ratio = LOGICAL_W / LOGICAL_H;
  let w = window.innerWidth;
  let h = window.innerHeight;
  // Prefer landscape; if portrait, rotate aspect logic
  if (h * ratio > w) {
    canvas.style.width = w + 'px';
    canvas.style.height = (w / ratio) + 'px';
  } else {
    canvas.style.height = h + 'px';
    canvas.style.width = (h * ratio) + 'px';
  }
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

// Career reset — hold Shift and press R on any manager screen
window.addEventListener('keydown', e => {
  if (e.key === 'R' && e.shiftKey) {
    manager.resetCareer();
  }
});

// ── Game loop (variable timestep, capped) ──
let lastTime = 0;
const MAX_DT = 1 / 30; // never drop below ~33 fps

function loop(timestamp) {
  const rawDt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  const dt = Math.min(rawDt, MAX_DT);

  // 1. Read input
  const iState = input.getState();

  // 2. Update (manager delegates to the game while a match runs)
  manager.update(dt, iState);

  // 3. Render — match screens use the game renderer, everything else the
  // manager renderer. getState() reflects any screen change that happened
  // during update (e.g. the match-end callback).
  const mState = manager.getState();
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