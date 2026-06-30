import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

// Board visual layout
// Top row:    points 13-24 (indices 12-23), left to right
// Bottom row: points 12-1  (indices 11-0),  left to right
// Bar in center, bear-off on right

const COL_W  = 36;
const TRI_H  = 130;
const BAR_W  = 28;
const BEAR_W = 40;
const PAD    = 8;
const STONE_R = 14;
const BOARD_W = PAD * 2 + COL_W * 12 + BAR_W + BEAR_W;
const BOARD_H = PAD * 2 + TRI_H * 2 + 20; // 20 = center gap

export default class BackgammonRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._wrapper  = null;
    this._canvas   = null;
    this._ctx      = null;
    this._overlay  = null;
    this._state    = null;
    this._scale    = 1;

    this._onTick      = this._onTick.bind(this);
    this._onOver      = this._onOver.bind(this);
    this._onWon       = this._onWon.bind(this);
    this._onPaused    = this._onPaused.bind(this);
    this._onResumed   = this._onResumed.bind(this);
    this._onRestart   = this._onRestart.bind(this);
    this._onClick     = this._onClick.bind(this);
    this._onKey       = this._onKey.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._overlay = new GameOverlay(this._viewport);
    this._showStart();
    this._bindEvents();
    this._draw();
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      () => { this._overlay.hide(); this._game.start(); },
      { extraHtml: '<div style="color:#888;font-size:9px;text-align:center">⬜ Vous (blanc) → · ⬛ IA (noir) ←</div>' }
    );
  }

  _injectStyles() {
    if (document.getElementById('bg-styles')) return;
    const s = document.createElement('style');
    s.id = 'bg-styles';
    s.textContent = `
      .bg-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 4px;
        box-sizing: border-box; gap: 4px;
        font-family: Orbitron, monospace;
        background: #0a0d14; overflow: hidden;
      }
      .bg-hud {
        width: 100%; display: flex; gap: 8px;
        align-items: center; justify-content: center;
        font-size: 10px; color: #aaa; flex-shrink: 0; flex-wrap: wrap;
      }
      .bg-hud-pill {
        background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 4px;
      }
      .bg-canvas-wrap {
        flex: 1; width: 100%;
        display: flex; align-items: center; justify-content: center;
        overflow: hidden;
      }
      #bg-canvas { display: block; cursor: pointer; }
      .bg-actions { display: flex; gap: 8px; flex-shrink: 0; }
      .bg-roll-btn {
        background: linear-gradient(135deg, #cc8800, #884400);
        border: none; color: #fff; font-family: Orbitron, monospace;
        font-size: 11px; padding: 6px 20px; border-radius: 6px; cursor: pointer;
      }
      .bg-roll-btn:disabled { opacity: 0.4; cursor: default; }
      .bg-msg {
        font-size: 10px; color: #ffd700; min-height: 14px; text-align: center; flex-shrink: 0;
      }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'bg-wrapper';
    this._wrapper.innerHTML = `
      <div class="bg-hud">
        <div class="bg-hud-pill">⬜ Borne : <span id="bg-borne-w">0</span>/15</div>
        <div class="bg-hud-pill">⬛ Borne : <span id="bg-borne-b">0</span>/15</div>
        <div class="bg-hud-pill">Dés : <span id="bg-dice">—</span></div>
      </div>
      <div class="bg-canvas-wrap">
        <canvas id="bg-canvas"></canvas>
      </div>
      <div class="bg-actions">
        <button class="bg-roll-btn" id="bg-roll">🎲 Lancer les dés</button>
      </div>
      <div class="bg-msg" id="bg-msg"></div>
    `;
    this._viewport.appendChild(this._wrapper);

    this._canvas = document.getElementById('bg-canvas');
    this._ctx    = this._canvas.getContext('2d');
    this._computeScale();
    this._canvas.width  = Math.round(BOARD_W * this._scale);
    this._canvas.height = Math.round(BOARD_H * this._scale);

    document.getElementById('bg-roll')?.addEventListener('click', () => this._game.rollDice());
  }

  _computeScale() {
    const vw = this._viewport.clientWidth  - 16;
    const vh = this._viewport.clientHeight - 110;
    this._scale = Math.min(vw / BOARD_W, vh / BOARD_H, 1.2);
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    this._canvas.addEventListener('click', this._onClick);
    window.addEventListener('keydown', this._onKey);
  }

  _onKey(e) {
    if (e.code === 'KeyP') EventBus.emit('game:pause-toggle');
    if (e.code === 'KeyR') EventBus.emit('game:restart');
  }

  _onClick(e) {
    const s = this._state;
    if (!s || s.status !== 'playing' || s.currentPlayer !== 'white' || s.phase !== 'moving') return;

    const rect  = this._canvas.getBoundingClientRect();
    const sx    = (e.clientX - rect.left) / this._scale;
    const sy    = (e.clientY - rect.top)  / this._scale;
    const hit   = this._hitTest(sx, sy);

    if (hit === null) return;

    if (hit === 'bar') {
      this._game.selectBar();
    } else if (hit === 'bearoff') {
      this._game.moveTo(-1); // bearing off
    } else {
      // If there are valid moves and this is a valid destination
      if (s.selected !== null && s.validMoves.some(m => m.to === hit)) {
        this._game.moveTo(hit);
      } else {
        this._game.selectPoint(hit);
      }
    }
  }

  _hitTest(x, y) {
    const sc = this._scale;
    // Bar region
    const barX = PAD + COL_W * 6;
    if (x >= barX && x <= barX + BAR_W) return 'bar';

    // Bear-off region (rightmost area)
    const bearX = PAD + COL_W * 12 + BAR_W;
    if (x >= bearX) return 'bearoff';

    // Points
    for (let i = 0; i < 24; i++) {
      const { cx, isTop } = this._pointCenter(i);
      const cy = isTop
        ? PAD + TRI_H / 2
        : PAD + TRI_H + 20 + TRI_H / 2;
      if (Math.abs(x - cx) < COL_W / 2 + 4 && Math.abs(y - cy) < TRI_H / 2 + 4) return i;
    }
    return null;
  }

  // Returns { cx, isTop } for point index 0-23
  _pointCenter(idx) {
    // Top row (isTop=true): indices 12-23 (points 13-24), displayed left→right
    // Bottom row (isTop=false): indices 11-0 (points 12-1), displayed left→right
    if (idx >= 12) {
      // Top row, left to right: idx 12 at col 0, 23 at col 11 (but bar between cols 5 and 6)
      const col = idx - 12;
      const x   = PAD + (col < 6 ? col : col + 1) * COL_W + COL_W / 2; // skip bar column
      return { cx: x, isTop: true };
    } else {
      // Bottom row: idx 11 at col 0, 0 at col 11 (left-to-right = descending index)
      const col = 11 - idx;
      const x   = PAD + (col < 6 ? col : col + 1) * COL_W + COL_W / 2;
      return { cx: x, isTop: false };
    }
  }

  _onTick({ state }) {
    this._state = state;
    this._updateHUD(state);
    this._draw();
  }

  _onOver({ score }) {
    this._overlay.showGameOver(
      { result: 'lose', score, title: "L'IA a gagné !" },
      () => { this._overlay.hide(); this._game.restart(); }
    );
  }

  _onWon({ score }) {
    this._overlay.showGameOver(
      { result: 'win', score, title: 'VOUS AVEZ GAGNÉ !' },
      () => { this._overlay.hide(); this._game.restart(); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStart(); }

  _updateHUD(state) {
    const $ = id => document.getElementById(id);
    if ($('bg-borne-w')) $('bg-borne-w').textContent = state.borne.white;
    if ($('bg-borne-b')) $('bg-borne-b').textContent = state.borne.black;
    if ($('bg-dice'))    $('bg-dice').textContent    = state.movesLeft.length > 0 ? state.movesLeft.join(' · ') : '—';
    if ($('bg-msg'))     $('bg-msg').textContent     = state.message;

    const btn = $('bg-roll');
    if (btn) {
      btn.disabled = !(state.status === 'playing' && state.currentPlayer === 'white' && state.phase === 'rolling');
    }
    EventBus.emit('game:score-update', { score: state.score });
  }

  _draw() {
    const ctx = this._ctx;
    if (!ctx) return;
    const s  = this._state;
    const sc = this._scale;
    const W  = this._canvas.width, H = this._canvas.height;

    ctx.save();
    ctx.scale(sc, sc);

    // Board background
    ctx.fillStyle = '#1a0a00';
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);

    ctx.strokeStyle = '#8B4513'; ctx.lineWidth = 2;
    ctx.strokeRect(PAD / 2, PAD / 2, BOARD_W - PAD, BOARD_H - PAD);

    // Draw 24 triangles
    for (let i = 0; i < 24; i++) {
      this._drawTriangle(ctx, i, s);
    }

    // Bar
    const barX = PAD + COL_W * 6;
    ctx.fillStyle = '#2a1200';
    ctx.fillRect(barX, PAD, BAR_W, BOARD_H - PAD * 2);
    ctx.strokeStyle = '#8B4513'; ctx.lineWidth = 1;
    ctx.strokeRect(barX, PAD, BAR_W, BOARD_H - PAD * 2);

    // Bar label
    ctx.fillStyle = '#aaa'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
    ctx.fillText('BAR', barX + BAR_W / 2, BOARD_H / 2);

    // Bar checkers
    if (s?.bar?.white > 0) {
      for (let i = 0; i < s.bar.white; i++) {
        this._drawChecker(ctx, barX + BAR_W / 2, BOARD_H / 2 + 30 + i * (STONE_R * 2 + 2), 'white', false);
      }
    }
    if (s?.bar?.black > 0) {
      for (let i = 0; i < s.bar.black; i++) {
        this._drawChecker(ctx, barX + BAR_W / 2, BOARD_H / 2 - 30 - i * (STONE_R * 2 + 2), 'black', false);
      }
    }

    // Bear-off area
    const bearX = PAD + COL_W * 12 + BAR_W;
    ctx.fillStyle = '#111';
    ctx.fillRect(bearX, PAD, BEAR_W, BOARD_H - PAD * 2);
    ctx.fillStyle = '#aaa'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('SORTIE', bearX + BEAR_W / 2, BOARD_H / 2);

    // Bear-off stacks
    const bw = s?.borne?.white ?? 0;
    const bb = s?.borne?.black ?? 0;
    for (let i = 0; i < bw; i++) this._drawChecker(ctx, bearX + BEAR_W / 2, PAD + 20 + i * 8, 'white', false);
    for (let i = 0; i < bb; i++) this._drawChecker(ctx, bearX + BEAR_W / 2, PAD + 20 + i * 8 + 100, 'black', false);

    // Valid move highlights
    if (s?.validMoves?.length > 0) {
      s.validMoves.forEach(m => {
        if (m.to >= 0 && m.to <= 23) {
          const { cx, isTop } = this._pointCenter(m.to);
          const cy = isTop ? PAD + 10 : PAD + TRI_H + 10;
          ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.arc(cx, isTop ? cy + TRI_H - 15 : cy + 5, STONE_R + 4, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        } else if (m.to === -1 || m.to === 24) {
          // Bear-off highlight
          ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(bearX + 2, PAD + 2, BEAR_W - 4, BOARD_H - PAD * 2 - 4);
          ctx.setLineDash([]);
        }
      });
    }

    // Bar selection highlight
    if (s?.selected === 'bar') {
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(barX + 2, PAD + 2, BAR_W - 4, BOARD_H - PAD * 2 - 4);
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  _drawTriangle(ctx, idx, state) {
    const { cx, isTop } = this._pointCenter(idx);
    const py = isTop ? PAD : PAD + TRI_H + 20;
    const tip = isTop ? PAD + TRI_H : PAD + 20;

    const colors = ['#880000', '#006600'];
    const ci = idx % 2;
    ctx.fillStyle = (idx < 12) ? colors[ci] : colors[1 - ci];

    ctx.beginPath();
    ctx.moveTo(cx - COL_W / 2 + 1, py);
    ctx.lineTo(cx + COL_W / 2 - 1, py);
    ctx.lineTo(cx, tip);
    ctx.closePath(); ctx.fill();

    // Point number (1-24)
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
    ctx.fillText(idx + 1, cx, isTop ? PAD - 2 : BOARD_H - 4);

    // Checkers on this point
    const pt = state?.points[idx];
    if (!pt || pt.count === 0) return;

    const stackDir = isTop ? 1 : -1;
    const startY   = isTop ? py + STONE_R + 2 : py - STONE_R - 2;

    const isSelected = state?.selected === idx;
    const maxVisible = Math.floor(TRI_H / (STONE_R * 2 + 2));

    for (let i = 0; i < Math.min(pt.count, maxVisible); i++) {
      const cy = startY + i * (STONE_R * 2 + 2) * stackDir;
      this._drawChecker(ctx, cx, cy, pt.color, isSelected && i === pt.count - 1);
    }

    // Count label if more than visible
    if (pt.count > maxVisible) {
      const cy = startY + (maxVisible - 1) * (STONE_R * 2 + 2) * stackDir;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`×${pt.count}`, cx, cy + 4);
    }
  }

  _drawChecker(ctx, cx, cy, color, selected) {
    const R = STONE_R;
    const grad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R);
    if (color === 'white') {
      grad.addColorStop(0, '#fff'); grad.addColorStop(1, '#bbb');
    } else {
      grad.addColorStop(0, '#555'); grad.addColorStop(1, '#111');
    }
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = selected ? '#ffd700' : (color === 'white' ? '#999' : '#333');
    ctx.lineWidth = selected ? 2.5 : 1;
    ctx.stroke();
  }

  destroy() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    this._canvas?.removeEventListener('click', this._onClick);
    window.removeEventListener('keydown', this._onKey);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('bg-styles')?.remove();
  }
}
