// input.js — Unified mouse / touch / pointer input
// Reports in CANVAS coordinates (CSS pixels relative to the canvas element).

function createInput(canvas) {
  let isDown = false;
  let startX = 0, startY = 0;
  let curX = 0, curY = 0;
  let justPressed = false;
  let justReleased = false;
  let lastDragDist = 0;  // persists after release so throw can read it

  // Track pointer ID so we only follow one finger
  let activePointer = null;

  // One-shot: a second finger tapped while the first was down (curve switch)
  let secondTapPressed = false;

  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    // Mouse events expose clientX/Y; pointer events also do via getBoundingClientRect
    const clientX = e.clientX;
    const clientY = e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function onDown(e) {
    e.preventDefault();
    if (activePointer !== null) {
      // A second finger came down while the first is aiming — alternate curve
      secondTapPressed = true;
      return;
    }
    activePointer = e.pointerId;
    const p = getCanvasCoords(e);
    isDown = true;
    justPressed = true;
    lastDragDist = 0;
    startX = p.x;
    startY = p.y;
    curX = p.x;
    curY = p.y;
  }

  function onMove(e) {
    e.preventDefault();
    if (e.pointerId !== activePointer) return;
    const p = getCanvasCoords(e);
    curX = p.x;
    curY = p.y;
    lastDragDist = Math.hypot(curX - startX, curY - startY);
  }

  function onUp(e) {
    e.preventDefault();
    if (e.pointerId !== activePointer) return;
    const p = getCanvasCoords(e);
    curX = p.x;
    curY = p.y;
    activePointer = null;
    if (isDown) {
      justReleased = true;
    }
    isDown = false;
  }

  function onCancel() {
    if (isDown) justReleased = true;
    isDown = false;
    activePointer = null;
  }

  // Register events – passive: false so we can preventDefault (no scrolling)
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);

  // Prevent context menu on long-press
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ── Keyboard (arrow keys switch curve type) ──
  let arrowUpPressed = false;
  let arrowDownPressed = false;

  window.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();   // keep the page from scrolling
    if (e.repeat) return; // ignore auto-repeat — one switch per press
    if (e.key === 'ArrowUp') arrowUpPressed = true;
    else arrowDownPressed = true;
  });

  // ── Public API ──
  function getState() {
    const dragDist = isDown
      ? Math.hypot(curX - startX, curY - startY)
      : lastDragDist;  // preserve distance through the release frame

    const dx = curX - startX;
    const dy = curY - startY;
    const dragAngle = dragDist > 5 ? Math.atan2(dy, dx) : 0;

    // "any pressed" – one-shot check for menu clicks etc.
    const anyPressed = justPressed || justReleased;

    const state = {
      isDown,
      justPressed,
      justReleased,
      anyPressed,
      secondTapPressed,
      startX,
      startY,
      currentX: curX,
      currentY: curY,
      dragDistance: dragDist,
      dragAngle,
      arrowUpPressed,
      arrowDownPressed,
    };

    // Clear one-shot flags after reading
    justPressed = false;
    justReleased = false;
    secondTapPressed = false;
    arrowUpPressed = false;
    arrowDownPressed = false;

    return state;
  }

  return { getState };
}