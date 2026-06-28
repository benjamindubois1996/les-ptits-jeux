import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID   = 'puyo-puyo';
const CELL = 34;
const PAD  = 4;

const PUYO_COLORS = ['#e53e3e', '#48bb78', '#4299e1', '#ecc94b', '#9f7aea'];
const PUYO_DARK   = ['#7b1a1a', '#1a5c30', '#1a3a6b', '#7a620a', '#4a1a7b'];

const SAT_OFF = { up: [-1, 0], right: [0, 1], down: [1, 0], left: [0, -1] };

export default class PuyoPuyoRenderer {
  constructor(game, viewport, config) {
    this._game    = game;
    this._vp      = viewport;
    this._cfg     = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._state   = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._overlay = new GameOverlay(this._vp);
    this._showStart();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById(`${ID}-styles`)?.remove();
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = `${ID}-wrapper`;

    this._infoEl = document.createElement('div');
    this._infoEl.className = `${ID}-info`;

    this._canvas = document.createElement('canvas');
    this._canvas.className = `${ID}-canvas`;
    this._ctx = this._canvas.getContext('2d');

    this._wrapper.append(this._infoEl, this._canvas);
    this._vp.appendChild(this._wrapper);
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this._game.start(sel); },
      {
        extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.9;margin-bottom:4px">
          Paire de puyos tombe : ← → déplacer<br>
          ↑ / Espace : pivoter · ↓ : chute rapide<br>
          Regroupe 4+ puyos de même couleur pour les effacer !
        </div>`,
      }
    );
  }

  _setupCanvas(s) {
    const W = s.cols * CELL + PAD * 2;
    const H = s.rows * CELL + PAD * 2;
    this._canvas.width  = W;
    this._canvas.height = H;
    const vw = this._vp.clientWidth  - 20;
    const vh = this._vp.clientHeight - 52;
    const sc = Math.min(vw / W, vh / H, 2);
    this._canvas.style.width  = `${W * sc}px`;
    this._canvas.style.height = `${H * sc}px`;
  }

  _draw(s) {
    const { rows, cols } = s;
    const W   = cols * CELL + PAD * 2;
    const H   = rows * CELL + PAD * 2;
    const ctx = this._ctx;

    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 0.5;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath(); ctx.moveTo(PAD, PAD + r * CELL); ctx.lineTo(PAD + cols * CELL, PAD + r * CELL); ctx.stroke();
    }

    // Board puyos
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const color = s.board[r][c];
        if (color === null) continue;
        this._drawPuyo(ctx, PAD + c * CELL, PAD + r * CELL, color, s.board, r, c, rows, cols);
      }
    }

    // Falling pair
    if (s.pair) {
      const { mainR, mainC, orient, mainColor, satColor } = s.pair;
      const [dr, dc] = SAT_OFF[orient];
      if (mainR >= 0) this._drawPuyo(ctx, PAD + mainC * CELL, PAD + mainR * CELL, mainColor, null, -1, -1, rows, cols);
      const satR = mainR + dr, satC = mainC + dc;
      if (satR >= 0 && satR < rows) this._drawPuyo(ctx, PAD + satC * CELL, PAD + satR * CELL, satColor, null, -1, -1, rows, cols);
    }
  }

  _drawPuyo(ctx, x, y, colorIdx, board, r, c, rows, cols) {
    const color = PUYO_COLORS[colorIdx];
    const dark  = PUYO_DARK[colorIdx];
    const m     = 3;
    const sz    = CELL - m * 2;
    const cx    = x + CELL / 2, cy = y + CELL / 2;
    const rad   = sz / 2;

    // Base circle
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, rad - 2, 0, Math.PI * 2); ctx.fill();

    // Connection blobs to neighbors (same color)
    if (board) {
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (board[nr][nc] !== colorIdx) continue;
        // Draw a rect bridge toward neighbor
        ctx.fillStyle = color;
        if (dr === 0) {
          const bx = dc > 0 ? cx : cx - CELL / 2;
          ctx.fillRect(bx, cy - rad * 0.55, CELL / 2, rad * 1.1);
        } else {
          const by = dr > 0 ? cy : cy - CELL / 2;
          ctx.fillRect(cx - rad * 0.55, by, rad * 1.1, CELL / 2);
        }
      }
    }

    // Eyes
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(cx - 4, cy - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 4, cy - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(cx - 4, cy - 3, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 4, cy - 3, 1.5, 0, Math.PI * 2); ctx.fill();
  }

  _refreshInfo(s) {
    this._infoEl.innerHTML =
      `<span class="${ID}-score">Score : ${s.score}</span>` +
      (s.chain > 1 ? `<span class="${ID}-chain">Combo ×${s.chain - 1}</span>` : '');
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    this._onKey = e => {
      if (e.key === 'p' || e.key === 'P') { EventBus.emit('game:pause-toggle'); return; }
      if (e.key === 'r' || e.key === 'R') this._game.restart();
    };
    window.addEventListener('keydown', this._onKey);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKey);
  }

  _onTick({ state, action }) {
    this._state = state;
    if (state.status !== 'playing') return;
    if (action === 'play') this._setupCanvas(state);
    this._draw(state);
    this._refreshInfo(state);
  }

  _onOver(data) {
    this._overlay.showGameOver(
      data,
      () => { this._overlay.hide(); this._game.start({ mode: this._state?.mode }); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); if (this._state) this._draw(this._state); }
  _onRestart() { this._showStart(); }

  _injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;
    const s = document.createElement('style');
    s.id = `${ID}-styles`;
    s.textContent = `
      .${ID}-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        background: #05080f; gap: 6px; padding: 8px;
        box-sizing: border-box; font-family: Orbitron, monospace; overflow: hidden;
      }
      .${ID}-canvas { display: block; }
      .${ID}-info { display: flex; gap: 16px; align-items: center; font-size: 0.72rem; letter-spacing: 1px; }
      .${ID}-score { color: #ffe033; }
      .${ID}-chain { color: #ff6644; font-weight: bold; }
    `;
    document.head.appendChild(s);
  }
}
