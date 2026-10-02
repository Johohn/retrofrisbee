// main.js — Entry point: set up canvas, input, game, renderer, and run the loop

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

// Curve type is switched with the ↑ / ↓ arrow keys or a second-finger tap
// (both handled in game.js — see updateThrowing).

// ── Game loop (variable timestep, capped) ──
let lastTime = 0;
const MAX_DT = 1 / 30; // never drop below ~33 fps

function loop(timestamp) {
  const rawDt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  const dt = Math.min(rawDt, MAX_DT);

  // 1. Read input
  const iState = input.getState();

  // 2. Update game
  game.update(dt, iState);

  // 3. Get renderable state
  const gState = game.getState();

  // 4. Render
  renderer.render(gState, iState);

  requestAnimationFrame(loop);
}

// ── Kick off ──
game.init();
resizeCanvas();
requestAnimationFrame(loop);