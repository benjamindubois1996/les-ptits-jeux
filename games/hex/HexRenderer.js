import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const SIZE = 9;
const EMPTY = 0, BLUE = 1, RED = 2;

// Hex neighbors (parallelogram layout)
function hexNeighbors(r, c) {
  return [
    [r - 1, c], [r - 1, c + 1],
    [r,     c - 1], [r,     c + 1],
    [r + 1, c - 1], [r + 1, c],
  ].filter(([nr, nc]) => nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE);
}

export default class HexRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._wrapper  = null;
    this._canvas   = null;
    this._ctx      = null;
    this._overlay  = null;
    this._state    = null;
    this._hover    = null;
    this._cellSize = 36;

    this._onTick      = this._onTick.bind(this);
    this._onOver      = this._onOver.bind(this);
    this._onWon       = this._onWon.bind(this);
    this._onPaused    = this._onPaused.bind(this);
    this._onResumed   = this._onResumed.bind(this);
    this._onRestart   = this._onRestart.bind(this);
    this._onClick     = this._onClick.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);
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
      { extraHtml: '<div style="color:#888;font-size:9px;text-align:center">🔵 vous connectez gauche→droite · 🔴 IA connecte haut→bas</div>' }
    );
  }

  _injectStyles() {
    if (document.getElementById('hex-styles')) return;
    const s = document.createElement('style');
    s.id = 'hex-styles';
    s.textContent = `
      .hex-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 6px;
        box-sizing: border-box; gap: 4px;
        font-family: Orbitron, monospace;
        background: #0a0d14; overflow: hidden;
      }
      .hex-legend {
        display: flex; gap: 18px; align-items: center;
        font-size: 10px; color: #aaa; flex-shrink: 0;
      }
      .hex-legend-dot {
        display: inline-block; width: 10px; height: 10px;
        border-radius: 50%; margin-right: 4px; vertical-align: middle;
      }
      .hex-canvas-wrap {
        flex: 1; width: 100%;
        display: flex; align-items: center; justify-content: center;
        overflow: hidden;
      }
      #hex-canvas { display: block; cursor: pointer; }
      .hex-turn {
        font-size: 11px; color: #a0c4ff; min-height: 16px; text-align: center; flex-shrink: 0;
      }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'hex-wrapper';
    this._wrapper.innerHTML = `
      <div class="hex-legend">
        <span><span class="hex-legend-dot" style="background:#4488ff"></span>Vous (←→)</span>
        <span><span class="hex-legend-dot" style="background:#ff4444"></span>IA (↑↓)</span>
      </div>
      <div class="hex-canvas-wrap">
        <canvas id="hex-canvas"></canvas>
      </div>
      <div class="hex-turn" id="hex-turn"></div>
    `;
    this._viewport.appendChild(this._wrapper);

    this._canvas = document.getElementById('hex-canvas');
    this._ctx    = this._canvas.getContext('2d');
    this._computeLayout();
    this._canvas.width  = this._canvasW;
    this._canvas.height = this._canvasH;
  }

  _computeLayout() {
    const vw = this._viewport.clientWidth  - 20;
    const vh = this._viewport.clientHeight - 80;
    // Hex cell radius
    const R = Math.min(Math.floor(Math.min(vw, vh) / (SIZE * 1.8)), 38);
    this._R    = R;
    this._hexW = R * 2;
    this._hexH = R * Math.sqrt(3);
    // Parallelogram layout: each row is offset right by R
    const colW  = this._hexW * 0.75;
    const rowH  = this._hexH;
    this._colW  = colW;
    this._rowH  = rowH;
    this._padX  = R * 2;
    this._padY  = R;
    this._canvasW = Math.ceil(this._padX * 2 + (SIZE - 1) * colW + (SIZE - 1) * R + R * 2);
    this._canvasH = Math.ceil(this._padY * 2 + (SIZE - 1) * rowH + R * 2);
  }

  // Center of hex cell (r, c) in canvas coordinates
  _cellCenter(r, c) {
    const x = this._padX + c * this._colW + r * this._colW / 2 + this._R;
    const y = this._padY + r * this._rowH + this._R;
    return { x, y };
  }

  // Convert canvas (px, py) → nearest (r, c) or null
  _canvasToCell(px, py) {
    let best = null, bestDist = Infinity;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const { x, y } = this._cellCenter(r, c);
        const d = Math.hypot(px - x, py - y);
        if (d < bestDist) { bestDist = d; best = [r, c]; }
      }
    }
    return bestDist < this._R ? best : null;
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);

    this._canvas.addEventListener('click',     this._onClick);
    this._canvas.addEventListener('mousemove', this._onMouseMove);
    this._canvas.addEventListener('mouseleave', this._onMouseLeave);
    window.addEventListener('keydown', this._onKey);
  }

  _onKey(e) {
    if (e.code === 'KeyP') EventBus.emit('game:pause-toggle');
    if (e.code === 'KeyR') EventBus.emit('game:restart');
  }

  _onClick(e) {
    if (!this._state || this._state.status !== 'playing' || this._state.currentPlayer !== BLUE) return;
    const rect = this._canvas.getBoundingClientRect();
    const cell = this._canvasToCell(e.clientX - rect.left, e.clientY - rect.top);
    if (cell) this._game.placeStone(cell[0], cell[1]);
  }

  _onMouseMove(e) {
    const rect = this._canvas.getBoundingClientRect();
    this._hover = this._canvasToCell(e.clientX - rect.left, e.clientY - rect.top);
    this._draw();
  }

  _onMouseLeave() {
    this._hover = null;
    this._draw();
  }

  _onTick({ state }) {
    this._state = state;
    this._updateTurnLabel(state);
    this._draw();
    EventBus.emit('game:score-update', { score: state.score });
  }

  _onOver({ score }) {
    this._overlay.showGameOver(
      { result: 'lose', score, title: "L'IA a gagné !" },
      () => { this._overlay.hide(); this._game.restart(); }
    );
  }

  _onWon({ score }) {
    this._overlay.showGameOver(
      { result: 'win', score, title: 'CONNEXION ÉTABLIE !' },
      () => { this._overlay.hide(); this._game.restart(); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStart(); }

  _updateTurnLabel(state) {
    const el = document.getElementById('hex-turn');
    if (!el) return;
    if (state.status === 'idle') { el.textContent = ''; return; }
    if (state.currentPlayer === BLUE) el.textContent = '🔵 Votre tour — cliquez pour placer';
    else el.textContent = '🔴 IA réfléchit…';
  }

  _draw() {
    const ctx = this._ctx;
    if (!ctx) return;
    const s = this._state;
    const W = this._canvasW, H = this._canvasH;

    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, W, H);

    // Draw border edges with player colors
    this._drawEdges(ctx);

    // Draw cells
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const { x, y } = this._cellCenter(r, c);
        const val = s?.board[r][c] ?? EMPTY;
        const isHover = this._hover && this._hover[0] === r && this._hover[1] === c;
        const isLast = s?.lastMove && s.lastMove.r === r && s.lastMove.c === c;
        this._drawHex(ctx, x, y, val, isHover, isLast);
      }
    }
  }

  _drawEdges(ctx) {
    const R = this._R;
    // Top and bottom edges: RED (AI, top→bottom)
    // Left and right edges: BLUE (player, left→right)

    // Highlight border rows/columns with player colors
    for (let i = 0; i < SIZE; i++) {
      // Top edge (row 0): red
      const top = this._cellCenter(0, i);
      ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 3;
      this._hexPath(ctx, top.x, top.y - R * 0.55); // small marker above
      ctx.beginPath();
      ctx.arc(top.x, top.y - R * 0.85, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4444'; ctx.fill();

      // Bottom edge (row SIZE-1): red
      const bot = this._cellCenter(SIZE - 1, i);
      ctx.beginPath(); ctx.arc(bot.x, bot.y + R * 0.85, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4444'; ctx.fill();

      // Left edge (col 0): blue
      const left = this._cellCenter(i, 0);
      ctx.beginPath(); ctx.arc(left.x - R * 0.85, left.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#4488ff'; ctx.fill();

      // Right edge (col SIZE-1): blue
      const right = this._cellCenter(i, SIZE - 1);
      ctx.beginPath(); ctx.arc(right.x + R * 0.85, right.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#4488ff'; ctx.fill();
    }
  }

  _drawHex(ctx, cx, cy, val, isHover, isLast) {
    const R = this._R - 2;

    ctx.save();
    ctx.beginPath();
    this._hexPath(ctx, cx, cy, R);

    // Fill
    if (val === BLUE) {
      ctx.fillStyle = '#2255cc';
    } else if (val === RED) {
      ctx.fillStyle = '#cc2222';
    } else if (isHover && this._state?.currentPlayer === BLUE && this._state?.status === 'playing') {
      ctx.fillStyle = 'rgba(68,136,255,0.3)';
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
    }
    ctx.fill();

    // Border
    ctx.strokeStyle = val === BLUE ? '#4488ff' : val === RED ? '#ff4444' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = isLast ? 2.5 : 1;
    ctx.stroke();

    // Stone circle
    if (val !== EMPTY) {
      const stoneR = R * 0.55;
      const grad = ctx.createRadialGradient(cx - stoneR * 0.3, cy - stoneR * 0.3, 0, cx, cy, stoneR);
      if (val === BLUE) {
        grad.addColorStop(0, '#88aaff'); grad.addColorStop(1, '#2244bb');
      } else {
        grad.addColorStop(0, '#ff8888'); grad.addColorStop(1, '#aa1111');
      }
      ctx.beginPath(); ctx.arc(cx, cy, stoneR, 0, Math.PI * 2);
      ctx.fillStyle = grad; ctx.fill();

      if (isLast) {
        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
      }
    }

    ctx.restore();
  }

  _hexPath(ctx, cx, cy, R) {
    const sides = 6;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const x = cx + R * Math.cos(angle);
      const y = cy + R * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  destroy() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    this._canvas?.removeEventListener('click',      this._onClick);
    this._canvas?.removeEventListener('mousemove',  this._onMouseMove);
    this._canvas?.removeEventListener('mouseleave', this._onMouseLeave);
    window.removeEventListener('keydown', this._onKey);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('hex-styles')?.remove();
  }
}
