// renderer.js — All canvas drawing (placeholder pixel-art style)

const C = CONFIG.COLORS;
const F = CONFIG.FIELD;

function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  // ── Coordinate helpers ──
  // Screen Y is canvas y; world Y is the same (no vertical scroll).
  // World X offset by camera.
  function sx(wx) { return Math.round(wx - view.camX); }
  function sy(wy) { return Math.round(wy); }

  // ── View offsets (set each frame) ──
  const view = { camX: 0 };

  // ── Draw field (tiled grass with end zones) ──
  function drawField() {
    const W = F.VIEWPORT_W;
    const H = F.VIEWPORT_H;

    // Background fill (sky / crowd area)
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, F.FIELD_TOP);
    ctx.fillRect(0, F.FIELD_BOTTOM, W, H - F.FIELD_BOTTOM);

    // Grass
    ctx.fillStyle = C.GRASS;
    ctx.fillRect(0, F.FIELD_TOP, W, F.FIELD_BOTTOM - F.FIELD_TOP);

    // End zones (striped)
    // Left end zone in world space: 0..END_ZONE_W
    drawEndZone(0, F.END_ZONE_W);
    // Right end zone: TOTAL_W - END_ZONE_W .. TOTAL_W
    drawEndZone(F.TOTAL_W - F.END_ZONE_W, F.TOTAL_W);

    // Brick marks — white X marks 300px into the playing field from each end zone
    function drawBrickMark(wx) {
      const scx = sx(wx);
      if (scx < -10 || scx > W + 10) return;
      const sz = 10;
      const my = (F.FIELD_TOP + F.FIELD_BOTTOM) / 2;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(scx - sz, my - sz); ctx.lineTo(scx + sz, my + sz);
      ctx.moveTo(scx + sz, my - sz); ctx.lineTo(scx - sz, my + sz);
      ctx.stroke();
    }
    drawBrickMark(F.END_ZONE_W + 300);
    drawBrickMark(F.TOTAL_W - F.END_ZONE_W - 300);

    // Mid-field mark — small hash on the top sideline outside the field
    const midX = sx(F.TOTAL_W / 2);
    if (midX > -5 && midX < W + 5) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(midX, F.FIELD_TOP - 4);
      ctx.lineTo(midX, F.FIELD_TOP - 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX, F.FIELD_BOTTOM + 4);
      ctx.lineTo(midX, F.FIELD_BOTTOM + 12);
      ctx.stroke();
    }

    // Sidelines
    ctx.strokeStyle = C.SIDELINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, F.FIELD_TOP);
    ctx.lineTo(W, F.FIELD_TOP);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, F.FIELD_BOTTOM);
    ctx.lineTo(W, F.FIELD_BOTTOM);
    ctx.stroke();

    // End lines (in view)
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.END_LINE;
    // Left end line at world x = END_ZONE_W
    const lx = sx(F.END_ZONE_W);
    if (lx >= 0 && lx <= W) {
      ctx.beginPath(); ctx.moveTo(lx, F.FIELD_TOP); ctx.lineTo(lx, F.FIELD_BOTTOM); ctx.stroke();
    }
    // Right end line
    const rx = sx(F.TOTAL_W - F.END_ZONE_W);
    if (rx >= 0 && rx <= W) {
      ctx.beginPath(); ctx.moveTo(rx, F.FIELD_TOP); ctx.lineTo(rx, F.FIELD_BOTTOM); ctx.stroke();
    }
  }

  function drawEndZone(startWorldX, endWorldX) {
    const W = F.VIEWPORT_W;
    let x1 = sx(startWorldX);
    let x2 = sx(endWorldX);
    if (x1 > W || x2 < 0) return;
    x1 = Math.max(0, x1);
    x2 = Math.min(W, x2);
    ctx.fillStyle = C.END_ZONE;
    ctx.fillRect(x1, F.FIELD_TOP, x2 - x1, F.FIELD_BOTTOM - F.FIELD_TOP);
  }

  // ── Draw a player ──
  function drawPlayer(x, y, color, radius, label, glow) {
    const scrX = sx(x);
    const scrY = sy(y);

    // Glow for open receiver
    if (glow) {
      ctx.shadowColor = C.OPEN_GLOW;
      ctx.shadowBlur = 12;
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(scrX, scrY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label
    if (label) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, scrX, scrY - radius - 4);
    }
  }

  // ── Draw the disc ──
  function drawDisc(dState) {
    if (!dState) return;
    const scrX = sx(dState.x);
    const scrY = sy(dState.y);

    // Shadow
    const shadowScale = 1 - Math.min(dState.z / 120, 1) * 0.4;
    ctx.fillStyle = C.DISC_SHADOW;
    ctx.beginPath();
    ctx.ellipse(scrX + 2, sy(F.FIELD_BOTTOM - 2), 6 * shadowScale, 3 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Z elevation offset
    const elev = -Math.min(dState.z, 80) * 0.3;
    const drawY = scrY + elev;

    // Disc body
    ctx.fillStyle = C.DISC_COLOR;
    ctx.beginPath();
    ctx.arc(scrX, drawY, CONFIG.DISC.RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Rim highlight
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ── Draw the aim line with curved trajectory preview ──
  // The trajectory is solved & simulated in game.js each frame while aiming,
  // so this draws the exact path the disc will fly, ending on the target.
  function drawAim(gs) {
    if (!gs.aim || gs.phase !== 'THROWING') return;
    const { power, trajectory } = gs.aim;
    if (power < 0.01 || !trajectory || trajectory.length < 2) return;

    ctx.save();
    const n = trajectory.length;
    const stride = Math.max(1, Math.round(n / 30)); // finer sim → keep the dotted look

    // Dotted trajectory — smaller & dimmer early, brighter near the end
    for (let i = 0; i < n; i += stride) {
      const t = i / (n - 1);
      ctx.globalAlpha = 0.25 + t * 0.35;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx(trajectory[i].x), sy(trajectory[i].y), 2 + t * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Target crosshair at the final simulated position (= aimed target)
    const last = trajectory[n - 1];
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx(last.x), sy(last.y), CONFIG.DISC.CATCH_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    // Power bar (vertical, top-left area)
    const barX = 16;
    const barY = F.FIELD_TOP + 20;
    const barH = 100;
    const barW = 12;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX, barY, barW, barH);

    const fillH = power * barH;
    ctx.fillStyle = power > 0.7 ? '#44ff44' : power > 0.35 ? '#ffdd44' : '#ff8844';
    ctx.fillRect(barX, barY + barH - fillH, barW, fillH);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PWR', barX + barW / 2, barY - 4);

    ctx.restore();
  }

  // ── Draw receiver route previews (football-style route flash) ──
  function drawRoutePreviews(gs) {
    if (!gs.routePreview) return;
    ctx.save();
    for (let i = 0; i < gs.routePreview.length; i++) {
      const pts = gs.routePreview[i];
      if (!pts || pts.length < 2) continue;

      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(sx(pts[0].x), sy(pts[0].y));
      for (let j = 1; j < pts.length; j++) {
        ctx.lineTo(sx(pts[j].x), sy(pts[j].y));
      }
      ctx.stroke();

      // Arrowhead at the far end — aligned with the FINAL leg, not the overall
      // displacement (fall back to the previous segment if the last is tiny)
      const last = pts[pts.length - 1];
      let prev = pts[pts.length - 2];
      if (pts.length > 2 && dist(last.x, last.y, prev.x, prev.y) < 4) {
        prev = pts[pts.length - 3];
      }
      const lx = sx(last.x), ly = sy(last.y);
      const px = sx(prev.x), py = sy(prev.y);
      const aLen = 10;
      const ang = Math.atan2(ly - py, lx - px);
      ctx.fillStyle = '#cccccc';
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx - aLen * Math.cos(ang - 0.5), ly - aLen * Math.sin(ang - 0.5));
      ctx.lineTo(lx - aLen * Math.cos(ang + 0.5), ly - aLen * Math.sin(ang + 0.5));
      ctx.closePath();
      ctx.fill();
    }
    ctx.lineWidth = 1;
    ctx.restore();
  }

  // ── HUD ──
  function drawHUD(gs) {
    const W = F.VIEWPORT_W;

    // ── Score ──
    ctx.fillStyle = C.HUD_BG;
    ctx.fillRect(W / 2 - 70, 4, 140, 28);

    ctx.fillStyle = C.HUD_TEXT;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`YOU ${gs.score}  OPP ${gs.defScore}`, W / 2, 23);

    if (gs.phase === 'THROWING' || gs.phase === 'DISC_FLYING') {
      // ── Stall count ──
      const st = gs.stallCount;
      let color = C.STALL_OK;
      if (st >= 8) color = C.STALL_CRIT;
      else if (st >= 5) color = C.STALL_WARN;

      ctx.fillStyle = C.HUD_BG;
      ctx.fillRect(W - 70, 4, 60, 28);

      ctx.fillStyle = color;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Stall ${st}`, W - 40, 23);

      // ── Wind (top left) ──
      ctx.fillStyle = C.HUD_BG;
      ctx.fillRect(10, 4, 90, 28);

      const windDir = gs.wind > 0 ? '→' : gs.wind < 0 ? '←' : '—';
      const windMag = Math.abs(Math.round(gs.wind));
      ctx.fillStyle = C.WIND_COLOR;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Wind ${windDir} ${windMag}`, 16, 23);
    }

    // ── Curve label (bottom-left, only in THROWING) ──
    // Curve is switched with ↑/↓ or a second-finger tap anywhere
    if (gs.phase === 'THROWING') {
      const label = { straight: 'STRAIGHT', inside: 'INSIDE', outside: 'OUTSIDE' }[gs.curveType];
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Curve: ${label}`, 10, F.FIELD_BOTTOM - 20);
    }

    // ── Message overlay (result) ──
    if (gs.phase === 'RESULT' || gs.phase === 'GAME_OVER') {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, F.FIELD_TOP, W, F.FIELD_BOTTOM - F.FIELD_TOP);

      ctx.fillStyle = gs.message && gs.message.includes('CALLAHAN')
        ? (gs.message.includes('Opponent') ? '#ff4444' : '#00ff88')
        : gs.message && gs.message.includes('SCORE')
        ? '#ffdd44' : gs.message && gs.message.includes('Intercepted')
        ? '#ff4444' : '#ffffff';
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(gs.message || '', W / 2, (F.FIELD_TOP + F.FIELD_BOTTOM) / 2 - 10);
      ctx.textBaseline = 'alphabetic';

      if (gs.phase === 'RESULT') {
        ctx.fillStyle = '#aaa';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Continuing...', W / 2, (F.FIELD_TOP + F.FIELD_BOTTOM) / 2 + 25);
      }
    }
  }

  // ── Menu screen ──
  function drawMenu() {
    const W = F.VIEWPORT_W;
    const H = F.VIEWPORT_H;
    const cy = H / 2;

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.fillStyle = '#ffdd44';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RETRO FRISBEE', W / 2, cy - 60);

    // Subtitle
    ctx.fillStyle = '#88ccff';
    ctx.font = '14px monospace';
    ctx.fillText('Ultimate Frisbee — Pixel Edition', W / 2, cy - 20);

    // Instructions
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px monospace';
    ctx.fillText('Drag back to aim & throw    ↑/↓ or 2nd-finger tap to change curve', W / 2, cy + 30);
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '11px monospace';
    ctx.fillText('Complete passes to march downfield', W / 2, cy + 55);
    ctx.fillText('Score in the end zone to win!', W / 2, cy + 70);

    // Blink prompt
    const blink = Math.sin(Date.now() / 600) > 0;
    if (blink) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('TAP TO START', W / 2, cy + 110);
    }

    // Decorative disc
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(W / 2, cy - 100, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffdd44';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textBaseline = 'alphabetic';
  }

  // ── Game Over screen ──
  function drawGameOver(gs) {
    const W = F.VIEWPORT_W;
    const H = F.VIEWPORT_H;
    const cy = H / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#ffdd44';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER', W / 2, cy - 40);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`Final:  You ${gs.score}  -  OPP ${gs.defScore}`, W / 2, cy + 10);

    const won = gs.score >= gs.targetScore && gs.score > gs.defScore;
    const msg = won ? 'You won!' : 'Opponent wins! Better luck next time!';
    ctx.fillStyle = '#88ccff';
    ctx.font = '14px monospace';
    ctx.fillText(msg, W / 2, cy + 45);

    const blink = Math.sin(Date.now() / 600) > 0;
    if (blink) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('TAP TO RESTART', W / 2, cy + 90);
    }

    ctx.textBaseline = 'alphabetic';
  }

  // ── Main render entry point ──
  function render(gs, inputState) {
    view.camX = gs.camera.x;
    const W = F.VIEWPORT_W;
    const H = F.VIEWPORT_H;

    ctx.clearRect(0, 0, W, H);

    if (gs.phase === 'MENU') {
      drawMenu();
      return;
    }

    // 1. Field
    drawField();

    // 2. Cutters (offense without disc)
    for (let i = 0; i < gs.cutters.length; i++) {
      const cut = gs.cutters[i];
      drawPlayer(cut.x, cut.y, C.PLAYER_O, CONFIG.CUTTER.RADIUS, `R${i+1}`, cut.isOpen);
      // Open marker
      if (cut.isOpen) {
        const scrX = sx(cut.x);
        const scrY = sy(cut.y);
        ctx.fillStyle = C.OPEN_GLOW;
        ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 250) * 0.2;
        ctx.beginPath();
        ctx.arc(scrX, scrY, CONFIG.CUTTER.RADIUS + 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // 4. Route previews (below players so dots sit under the units)
    drawRoutePreviews(gs);

    // 5. Defenders
    for (const d of gs.defenders) {
      drawPlayer(d.x, d.y, C.PLAYER_D, CONFIG.DEFENDER.RADIUS, 'D', false);
    }

    // 6. Thrower
    if (gs.phase === 'THROWING' || gs.phase === 'RESULT') {
      drawPlayer(gs.thrower.x, gs.thrower.y, C.THROWER, CONFIG.THROWER.RADIUS, 'YOU', false);
    }

    // 7. Disc
    drawDisc(gs.disc);

    // 8. Aim line
    drawAim(gs);

    // 9. HUD
    drawHUD(gs);

    // 10. Game over overlay
    if (gs.phase === 'GAME_OVER') {
      drawGameOver(gs);
    }
  }

  return { render };
}