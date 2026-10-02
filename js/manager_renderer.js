// manager_renderer.js — Draws the manager screens (HUB, bracket, summary)
// onto the same canvas the match renderer uses.

function createManagerRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const W = CONFIG.FIELD.VIEWPORT_W;
  const H = CONFIG.FIELD.VIEWPORT_H;

  const INK      = '#e8e8e8';
  const DIM      = '#9aa0b0';
  const GOLD     = '#ffdd44';
  const GREEN    = '#00ff88';
  const RED      = '#ff5555';
  const PANEL    = 'rgba(20,24,40,0.92)';
  const PANEL_HI = 'rgba(40,48,80,0.95)';
  const LINE     = 'rgba(255,255,255,0.15)';

  function text(str, x, y, size, color, align, bold) {
    ctx.fillStyle = color || INK;
    ctx.font = `${bold ? 'bold ' : ''}${size}px monospace`;
    ctx.textAlign = align || 'left';
    ctx.fillText(str, x, y);
  }

  function panel(x, y, w, h, fill) {
    ctx.fillStyle = fill || PANEL;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function blinking(str, x, y, size, color) {
    if (Math.sin(Date.now() / 500) > -0.2) text(str, x, y, size, color || GOLD, 'center', true);
  }

  // ── Background ──
  function drawBackground() {
    // Retro desktop-ish gradient stripes
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#10142a');
    g.addColorStop(1, '#1a1030');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // faint disc motif in the corner
    ctx.strokeStyle = 'rgba(255,221,68,0.12)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(W - 60, H - 40, 20 + i * 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ── HUB ──
  function drawHub(gs) {
    drawBackground();

    text('RETRO FRISBEE MANAGER', W / 2, 30, 24, GOLD, 'center', true);
    text(`Season ${gs.year}  ·  ${gs.franchise}`, W / 2, 52, 13, DIM, 'center');

    // ── Next tournament card ──
    const nt = gs.nextTournament;
    panel(20, 72, 360, 108, PANEL_HI);
    text('NEXT TOURNAMENT', 32, 92, 11, DIM);
    text(nt.name, 32, 116, 16, GOLD, 'left', true);
    text(`${nt.month}  ·  ${nt.venue}`, 32, 136, 12, INK);
    if (gs.nextIsFinals) {
      text('Season finals — top 4 by season points qualify', 32, 156, 11, DIM);
      text(`You are rank ${gs.seasonRank} — ${gs.qualifies ? 'QUALIFIED' : 'MISSED OUT'}`,
        32, 174, 11, gs.qualifies ? GREEN : RED, 'left', true);
    } else {
      text(`Teams: 8  ·  Format: game to ${FORMAT.TARGET_SCORE}`, 32, 156, 11, DIM);
    }
    blinking('TAP TO ENTER', 200, 196, 13);

    // ── Season standings ──
    panel(400, 72, 380, 300);
    text('SEASON STANDINGS', 412, 92, 12, GOLD, 'left', true);
    text('TEAM          Pts', 560, 92, 11, DIM);
    gs.standings.forEach((s, i) => {
      const y = 114 + i * 30;
      const me = s.name === gs.franchise;
      if (me) ctx.fillStyle = 'rgba(255,221,68,0.14)', ctx.fillRect(404, y - 13, 372, 26);
      text(`${String(i + 1).padStart(2)}. ${s.short}`, 412, y, 12, me ? GOLD : INK, 'left', me);
      text(String(s.pts), 766, y, 12, me ? GOLD : INK, 'right', me);
    });

    // ── Franchise recent results ──
    panel(20, 240, 360, 132);
    text('RECENT RESULTS', 32, 260, 12, GOLD, 'left', true);
    if (gs.franchiseResults.length === 0) {
      text('First season — no history yet.', 32, 284, 11, DIM);
    }
    gs.franchiseResults.slice().reverse().slice(0, 5).forEach((r, i) => {
      const y = 282 + i * 18;
      const col = r.place === 0 ? RED : r.place === 1 ? GOLD : r.place <= 4 ? GREEN : DIM;
      text(`S${r.year}  ${r.tName}`, 32, y, 11, INK);
      text(placeLabel(r.place), 368, y, 11, col, 'right', r.place === 0 || r.place <= 4);
    });

    text('Career: play every match — the bracket runs to 8th place.', W / 2, 408, 11, DIM, 'center');
  }

  function placeLabel(p) {
    return p === 0 ? 'DNQ' : p === 1 ? 'CHAMPION' : `${p}${['st','nd','rd'][p-1] || 'th'}`;
  }

  // ── Bracket screen ──
  function drawBracket(gs) {
    drawBackground();
    const b = gs.bracket;
    if (!b) return;

    text(b.name.toUpperCase(), W / 2, 26, 18, GOLD, 'center', true);
    text(`${b.month}  ·  ${b.venue}  ·  Season ${gs.year}  ·  ${gs.franchise}`, W / 2, 44, 11, DIM, 'center');

    // Only stages that actually have matches (the finals use 2 stages, regular
// tournaments 3) — center the columns that exist
    const active = [];
    b.stages.forEach((matches, si) => {
      if (matches.length > 0) active.push({ matches, stage: si });
    });
    const colW = 186, gap = 8, rowH = 84;
    const x0 = active.length === 3 ? 108 : (W - (active.length * colW + (active.length - 1) * gap)) / 2;
    const y0 = 62;

    active.forEach((col, ci) => {
      col.matches.forEach((m, mi) => {
        const x = x0 + ci * (colW + gap);
        const y = y0 + mi * rowH;
        drawMatchCard(x, y, colW, rowH - 8, m, col.stage, b.stage);
      });
    });

    // ── Bottom banner: what happens next ──
    panel(0, H - 46, W, 46, PANEL);
    const pm = pendingPlayerMatch(gs);
    const lm = gs.lastMatch;

    if (lm && lmJustPlayed(gs)) {
      text(`${lm.tag}: ${gs.franchise} ${lm.myScore} - ${lm.oppScore} ${lm.opp}`,
        W / 2, H - 28, 14, lm.won ? GREEN : RED, 'center', true);
      blinking(lm.won ? 'TAP TO CONTINUE' : 'TAP TO CONTINUE', W / 2, H - 10, 12);
    } else if (b.done) {
      blinking('TOURNAMENT COMPLETE — TAP FOR FINAL RESULTS', W / 2, H - 20, 13);
    } else if (pm) {
      text(`${pm.tag.toUpperCase()}:  ${gs.franchise} vs ${pm.opp}`, W / 2, H - 28, 14, GOLD, 'center', true);
      blinking('TAP TO PLAY', W / 2, H - 10, 13);
    } else if (b.type === 'finals' && !b.hasPlayer) {
      text('You did not qualify for the finals — spectating', W / 2, H - 28, 12, RED, 'center', true);
      blinking('TAP TO PLAY OUT THE ROUND', W / 2, H - 10, 12);
    } else {
      text('No franchise match this round — CPU matches pending', W / 2, H - 28, 12, DIM, 'center');
      blinking('TAP TO PLAY OUT THE ROUND', W / 2, H - 10, 12);
    }
  }

  function lmJustPlayed(gs) {
    // The result banner shows only until the next tap advances things
    return gs.lastMatch && gs.lastMatch._fresh;
  }

  function pendingPlayerMatch(gs) {
    if (!gs.bracket || gs.bracket.done) return null;
    for (const st of gs.bracket.stages) {
      for (const m of st) {
        if (!m.played && m.isPlayer) return { tag: m.tag, opp: m.a === gs.franchise ? m.b : m.a };
      }
    }
    return null;
  }

  function drawMatchCard(x, y, w, h, m, stageIdx, curStage) {
    const isCurrent = !m.played && stageIdx === curStage;
    const isPlayer = m.isPlayer;
    panel(x, y, w, h, isPlayer ? PANEL_HI : PANEL);
    if (isPlayer) {
      ctx.strokeStyle = 'rgba(255,221,68,0.7)';
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    }
    text(m.tag, x + 8, y + 16, 9, isPlayer ? GOLD : DIM, 'left', isPlayer);

    // Team rows
    const rows = [
      { short: m.shortA, name: m.a, score: m.scoreA },
      { short: m.shortB, name: m.b, score: m.scoreB },
    ];
    rows.forEach((r, i) => {
      const ry = y + 36 + i * 22;
      const win = m.played && i === (m.scoreA > m.scoreB ? 0 : 1);
      text(r.short, x + 10, ry, 13, win ? GOLD : INK, 'left', win);
      text(String(r.score), x + w - 10, ry, 13, win ? GOLD : DIM, 'right', win);
      if (!m.played && isCurrent && isPlayer) {
        text('·', x + w - 22, ry, 13, GOLD);
      }
    });
  }

  // ── Summary screen ──
  function drawSummary(gs) {
    drawBackground();
    const s = gs.summary;
    if (!s) return;

    text(s.name.toUpperCase(), W / 2, 30, 20, GOLD, 'center', true);
    text('FINAL RESULTS', W / 2, 50, 12, DIM, 'center');

    panel(120, 66, 560, 280);
    s.placements.forEach((p, i) => {
      const y = 92 + i * 32;
      const me = p.team === gs.franchise;
      if (me) ctx.fillStyle = 'rgba(255,221,68,0.16)', ctx.fillRect(124, y - 14, 552, 28);
      text(`${String(p.place).padStart(2)}.`, 140, y, 13, INK, 'left');
      text(p.team, 170, y, 13, me ? GOLD : INK, 'left', me);
      text(`+${p.points} pts`, 664, y, 12, DIM, 'right');
      if (p.place === 1) text('CHAMPION', 664, y, 12, GOLD, 'right', true);
      else if (me) text(placeLabel(p.place), 664, y, 12, GOLD, 'right', true);
    });

    const myPlace = s.myPlace;
    const verdict = myPlace === 0
      ? 'The season ends here — you missed the finals.'
      : myPlace === 1
      ? 'CHAMPIONS! An unforgettable weekend.'
      : myPlace <= 3 ? 'A podium finish — strong showing.'
      : myPlace <= 6 ? 'Mid-table. Room to grow.'
      : 'A weekend to forget. Back to practice.';
    text(verdict, W / 2, 368, 13, myPlace === 1 ? GOLD : INK, 'center', true);
    if (myPlace > 0) {
      text(`Your place: ${placeLabel(myPlace)} (+${s.myPoints} pts)`, W / 2, 390, 12, INK, 'center');
    }

    blinking('TAP TO RETURN TO THE MANAGER', W / 2, 424, 12);
  }

  // ── Entry ──
  function render(gs) {
    ctx.clearRect(0, 0, W, H);
    if (gs.screen === 'HUB') drawHub(gs);
    else if (gs.screen === 'TOURNAMENT') drawBracket(gs);
    else if (gs.screen === 'SUMMARY') drawSummary(gs);
  }

  return { render };
}