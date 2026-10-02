// Headless sanity test: drive the game through a throw for each curve type
// and verify the real disc flight follows the previewed trajectory line.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = { console, Math, Date };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'config.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8'), ctx);
const game = vm.runInContext('createGame()', ctx);

function input(over) {
  return Object.assign({
    isDown: false, justPressed: false, justReleased: false, anyPressed: false,
    secondTapPressed: false, startX: 0, startY: 0, currentX: 0, currentY: 0,
    dragDistance: 0, dragAngle: 0, arrowUpPressed: false, arrowDownPressed: false,
  }, over);
}

game.init();
game.update(0.016, input({ anyPressed: true }));           // MENU -> RESULT (coin toss)
for (let i = 0; i < 40; i++) game.update(0.1, input({}));  // RESULT -> THROWING (resetPoint)

const st0 = game.getState();
if (st0.phase !== 'THROWING') throw new Error('expected THROWING, got ' + st0.phase);

// Drag left 100px -> throw goes right, power 100/170
const drag = { startX: 500, startY: 225, currentX: 400, currentY: 225, dragDistance: 100 };

let failures = 0;
for (const curve of ['straight', 'inside', 'outside']) {
  game.setCurve(curve);
  // Aim for a few frames (solves heading, builds trajectory preview)
  for (let i = 0; i < 10; i++) game.update(0.016, input(Object.assign({ isDown: true }, drag)));
  const aim = game.getState().aim;
  const traj = aim.trajectory;

  // Release
  game.update(0.016, input(Object.assign({ justReleased: true }, drag)));
  let st = game.getState();
  if (st.phase !== 'DISC_FLYING') throw new Error('expected DISC_FLYING, got ' + st.phase);

  // Track the flight: max deviation of the disc from the preview line
  let maxDev = 0, frames = 0;
  while (st.phase === 'DISC_FLYING' && st.disc) {
    let best = Infinity;
    for (const p of traj) {
      const d = Math.hypot(st.disc.x - p.x, st.disc.y - p.y);
      if (d < best) best = d;
    }
    if (best > maxDev) maxDev = best;
    frames++;
    game.update(0.016, input({}));
    st = game.getState();
  }

  const pass = frames > 30 && maxDev < 8; // float parity ⇒ ~1px, allow frame-phase slack
  console.log(
    `${curve.padEnd(8)} flight frames: ${frames}, max deviation from preview: ` +
    `${maxDev.toFixed(2)}px, ended in ${st.phase}  -> ${pass ? 'PASS' : 'FAIL'}`
  );
  if (!pass) failures++;

  // Get back to THROWING for the next curve (RESULT auto-resets the point)
  for (let i = 0; i < 40; i++) game.update(0.1, input({}));
  if (game.getState().phase !== 'THROWING') throw new Error('did not return to THROWING');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);