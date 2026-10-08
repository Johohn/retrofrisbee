// manager_renderer.js — Draws the manager screens (HUB, week, summary)
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

  function divAbbr(name) {
    return name === 'RFA' ? 'RFA' : name.slice(0, 3).toUpperCase();
  }

  // ── Background ──
  function drawBackground() {
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
    text(gs.rfaName.toUpperCase(), W / 2, 28, 22, GOLD, 'center', true);
    text(`Season ${gs.year}  ·  ${gs.weekLabel}  ·  ${gs.franchise}  ·  ${gs.franchiseDivision}`,
      W / 2, 48, 12, DIM, 'center');

    // ── Division standings, 4 across; the dashed line is the playoff cut ──
    const pw = 183, gap = 12, x0 = 16, y0 = 62, ph = 232;
    gs.standings.forEach((d, di) => {
      const x = x0 + di * (pw + gap);
      panel(x, y0, pw, ph);
      text(d.name.toUpperCase(), x + 10, y0 + 20, 11, GOLD, 'left', true);
      d.rows.forEach((r, ri) => {
        const y = y0 + 42 + ri * 24;
        const me = r.name === gs.franchise;
        if (me) {
          ctx.fillStyle = 'rgba(255,221,68,0.14)';
          ctx.fillRect(x + 3, y - 12, pw - 6, 21);
        }
        text(`${ri + 1}. ${r.short}`, x + 10, y, 12, me ? GOLD : INK, 'left', me);
        text(`${r.diff > 0 ? '+' : ''}${r.diff}`, x + pw - 52, y, 10, DIM, 'right');
        text(`${r.w}-${r.l}`, x + pw - 10, y, 12, me ? GOLD : INK, 'right', me);
      });
      // playoff cut: top 3 make the postseason
      const ly = y0 + 42 + 3 * 24 - 8;
      ctx.strokeStyle = 'rgba(255,221,68,0.55)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x + 6, ly);
      ctx.lineTo(x + pw - 6, ly);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // ── This week / next up ──
    panel(16, 306, 380, 128, PANEL_HI);
    text(gs.weekLabel.toUpperCase(), 28, 326, 12, GOLD, 'left', true);
    const pm = gs.playerMatch;
    if (gs.seasonOver) {
      text(`RFA CHAMPIONS: ${gs.champion}`, 28, 354, 13, GOLD, 'left', true);
      blinking('TAP FOR SEASON SUMMARY', 28, 382, 12);
    } else if (pm) {
      text(`${gs.franchiseShort}  vs  ${pm.oppShort}`, 28, 354, 14, INK, 'left', true);
      text(pm.tag, 28, 374, 11, DIM);
      blinking('TAP TO CONTINUE', 28, 404, 12);
    } else {
      text('You are not in this round — spectating', 28, 354, 11, DIM);
      blinking('TAP TO CONTINUE', 28, 382, 12);
    }

    // ── Recent seasons ──
    panel(416, 306, 368, 128);
    text('RECENT SEASONS', 428, 326, 12, GOLD, 'left', true);
    if (gs.history.length === 0) {
      text('First season — no history yet.', 428, 350, 11, DIM);
    }
    gs.history.slice().reverse().slice(0, 5).forEach((r, i) => {
      const y = 348 + i * 17;
      const col = r.note.startsWith('RFA CHAMPIONS') ? GOLD
        : r.note.startsWith('Missed') ? RED : GREEN;
      text(`S${r.year}  ${r.w}-${r.l}`, 428, y, 11, INK);
      text(r.note, 772, y, 10, col, 'right', r.note.startsWith('RFA CHAMPIONS'));
    });

    text('Dashed line = division playoff cut (top 3 make the postseason)',
      W / 2, H - 8, 10, DIM, 'center');
  }

  // ── WEEK screen ──
  function drawWeek(gs) {
    drawBackground();
    const wv = gs.weekView;
    text(wv.label.toUpperCase(), W / 2, 26, 18, GOLD, 'center', true);
    text(`Season ${gs.year}  ·  ${gs.franchise}  ·  Record ${gs.franchiseRecord.w}-${gs.franchiseRecord.l}`,
      W / 2, 44, 11, DIM, 'center');

    if (wv.games.length > 6) drawSlate(gs);
    else drawPlayoffs(gs);

    drawBanner(gs);
  }

  // Regular season: this week's full slate + a peek at next week
  function drawSlate(gs) {
    const wv = gs.weekView;
    panel(16, 56, 424, 336);
    text('THIS WEEK', 28, 76, 11, GOLD, 'left', true);
    wv.games.forEach((m, i) => {
      const y = 96 + i * 27;
      const me = m.isPlayer;
      if (me) {
        ctx.fillStyle = 'rgba(255,221,68,0.14)';
        ctx.fillRect(20, y - 13, 416, 24);
      }
      const col = me ? GOLD : INK;
      text(divAbbr(m.div), 28, y, 10, DIM);
      text(`${m.shortA} v ${m.shortB}`, 64, y, 12, col, 'left', me);
      if (m.played) {
        text(`${m.scoreA}-${m.scoreB}`, 428, y, 12, me ? GOLD : DIM, 'right', me);
      }
    });

    if (wv.next) {
      panel(452, 56, 332, 336);
      text((wv.next.label + ' — FIXTURES').toUpperCase(), 464, 76, 11, DIM, 'left', true);
      wv.next.games.forEach((m, i) => {
        const y = 96 + i * 27;
        const me = m.shortA === gs.franchiseShort || m.shortB === gs.franchiseShort;
        text(divAbbr(m.div), 464, y, 10, DIM);
        text(`${m.shortA} v ${m.shortB}`, 500, y, 12, me ? GOLD : DIM, 'left', me);
      });
    }
  }

  // Postseason: division playoffs / championship weekend as cards
  function drawPlayoffs(gs) {
    const games = gs.weekView.games;
    const cw = 372;
    if (games.length >= 4) {
      const pos = [[16, 90], [412, 90], [16, 238], [412, 238]];
      games.forEach((m, i) => drawGameCard(pos[i][0], pos[i][1], cw, 130, m));
    } else if (games.length === 3) {
      drawGameCard(16, 70, cw, 112, games[0]);
      drawGameCard(412, 70, cw, 112, games[1]);
      drawGameCard(214, 198, cw, 150, games[2]);
    } else {
      games.forEach((m, i) => drawGameCard(16 + i * 396, 120, cw, 150, m));
    }
  }

  function drawGameCard(x, y, w, h, m) {
    panel(x, y, w, h, m.isPlayer ? PANEL_HI : PANEL);
    if (m.isPlayer && !m.played) {
      ctx.strokeStyle = 'rgba(255,221,68,0.7)';
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    }
    text(m.tag, x + 10, y + 18, 10, m.isPlayer ? GOLD : DIM, 'left', m.isPlayer);
    text(divAbbr(m.div), x + w - 10, y + 18, 10, DIM, 'right');
    const rows = [
      { short: m.shortA, name: m.a, score: m.scoreA },
      { short: m.shortB, name: m.b, score: m.scoreB },
    ];
    rows.forEach((r, i) => {
      const ry = y + 46 + i * 30;
      const win = m.played && i === (m.scoreA > m.scoreB ? 0 : 1);
      text(r.short, x + 12, ry, 14, win ? GOLD : INK, 'left', win);
      text(r.name, x + 50, ry, 12, win ? GOLD : INK, 'left', win);
      text(m.played ? String(r.score) : '–', x + w - 12, ry, 14, win ? GOLD : DIM, 'right', win);
    });
  }

  function drawBanner(gs) {
    panel(0, H - 46, W, 46, PANEL);
    const wv = gs.weekView;
    const lm = gs.lastMatch;
    const y1 = H - 27, y2 = H - 10;
    if (lm && lm._fresh) {
      text(`${lm.tag}: ${gs.franchiseShort} ${lm.myScore} - ${lm.oppScore} ${lm.oppShort}`,
        W / 2, y1, 14, lm.won ? GREEN : RED, 'center', true);
      blinking('TAP TO CONTINUE', W / 2, y2, 12);
    } else if (gs.seasonOver) {
      text(`RFA CHAMPIONS: ${gs.champion}`, W / 2, y1, 15, GOLD, 'center', true);
      blinking('TAP FOR SEASON SUMMARY', W / 2, y2, 12);
    } else if (wv.complete) {
      text(wv.label.toUpperCase() + ' COMPLETE', W / 2, y1, 13, INK, 'center', true);
      blinking('TAP TO CONTINUE', W / 2, y2, 13);
    } else if (gs.playerMatch) {
      text(`${gs.playerMatch.tag.toUpperCase()}:  ${gs.franchise} vs ${gs.playerMatch.opp}`,
        W / 2, y1, 14, GOLD, 'center', true);
      blinking('TAP TO PLAY', W / 2, y2, 13);
    } else {
      text('No franchise match this round — spectating', W / 2, y1, 12, DIM, 'center');
      blinking('TAP TO PLAY OUT THE ROUND', W / 2, y2, 12);
    }
  }

  // ── Summary screen ──
  function drawSummary(gs) {
    drawBackground();
    const s = gs.summary;
    if (!s) return;

    text(`SEASON ${s.year} — ${gs.rfaName.toUpperCase()}`, W / 2, 30, 14, DIM, 'center', true);
    text(s.champion.toUpperCase(), W / 2, 80, 34, GOLD, 'center', true);
    text('RFA CHAMPIONS', W / 2, 104, 14, GOLD, 'center', true);
    text(`${s.finalScore.aShort} ${s.finalScore.scoreA}  -  ${s.finalScore.scoreB} ${s.finalScore.bShort}`,
      W / 2, 126, 13, INK, 'center');

    // Division champions
    panel(160, 146, 480, 128);
    text('DIVISION CHAMPIONS', 172, 166, 11, GOLD, 'left', true);
    s.divWinners.forEach((d, i) => {
      const y = 190 + i * 20;
      text(d.div, 172, y, 12, DIM);
      text(d.team, 250, y, 12, d.team === gs.franchise ? GOLD : INK, 'left', d.team === gs.franchise);
    });

    // Franchise verdict
    const champ = s.note.startsWith('RFA CHAMPIONS');
    text(s.note, W / 2, 312, 14, champ ? GOLD : INK, 'center', true);
    text(`Regular season: ${s.record.w}-${s.record.l}`, W / 2, 334, 12, DIM, 'center');

    blinking(`TAP TO START SEASON ${s.year + 1}`, W / 2, 396, 13);
  }

  // ── Entry ──
  function render(gs) {
    ctx.clearRect(0, 0, W, H);
    if (gs.screen === 'HUB') drawHub(gs);
    else if (gs.screen === 'WEEK') drawWeek(gs);
    else if (gs.screen === 'SUMMARY') drawSummary(gs);
  }

  return { render };
}
