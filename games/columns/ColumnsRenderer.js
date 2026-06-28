import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID   = 'columns';
const CELL = 36;
const PAD  = 4;

const GEM_COLORS = ['#e53e3e','#48bb78','#4299e1','#ecc94b','#9f7aea','#ed8936','#f687b3'];
const GEM_DARK   = ['#7b1a1a','#1a5c30','#1a3a6b','#7a620a','#4a1a7b','#7a3a0a','#7a1a4a'];

export default class ColumnsRenderer {
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
          Colonne de 3 gemmes : ← → déplacer · ↑ faire tourner<br>
          Aligne 3+ gemmes identiques (toutes directions) pour les effacer<br>
          Le jeu accélère à chaque niveau !
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
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 0.5;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath(); ctx.moveTo(PAD, PAD + r * CELL); ctx.lineTo(PAD + cols * CELL, PAD + r * CELL); ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath(); ctx.moveTo(PAD + c * CELL, PAD); ctx.lineTo(PAD + c * CELL, PAD + rows * CELL); ctx.stroke();
    }

    // Board gems
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const gem = s.board[r][c];
        if (gem !== null) this._drawGem(ctx, PAD + c * CELL, PAD + r * CELL, gem);
      }
    }

    // Falling piece: gems[0]=top at (r-2,c), gems[1]=mid at (r-1,c), gems[2]=bot at (r,c)
    if (s.piece) {
      const { r, c, gems } = s.piece;
      for (let i = 0; i < 3; i++) {
        const gr = r - (2 - i);
        if (gr >= 0 && gr < rows) this._drawGem(ctx, PAD + c * CELL, PAD + gr * CELL, gems[i]);
      }
    }
  }

  _drawGem(ctx, x, y, colorIdx) {
    const color  = GEM_COLORS[colorIdx];
    const dark   = GEM_DARK[colorIdx];
    const cx     = x + CELL / 2, cy = y + CELL / 2;
    const half   = CELL / 2 - 3;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.moveTo(cx + 1, cy - half + 1); ctx.lineTo(cx + half + 1, cy + 1);
    ctx.lineTo(cx + 1, cy + half + 1); ctx.lineTo(cx - half + 1, cy + 1);
    ctx.closePath(); ctx.fill();

    // Base diamond
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(cx, cy - half); ctx.lineTo(cx + half, cy);
    ctx.lineTo(cx, cy + half); ctx.lineTo(cx - half, cy);
    ctx.closePath(); ctx.fill();

    // Main facet
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - half + 2); ctx.lineTo(cx + half - 2, cy);
    ctx.lineTo(cx, cy + half - 2); ctx.lineTo(cx - half + 2, cy);
    ctx.closePath(); ctx.fill();

    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - half + 2); ctx.lineTo(cx + (half - 2) * 0.4, cy - (half - 2) * 0.4);
    ctx.lineTo(cx, cy); ctx.lineTo(cx - (half - 2) * 0.4, cy - (half - 2) * 0.4);
    ctx.closePath(); ctx.fill();
  }

  _refreshInfo(s) {
    this._infoEl.innerHTML =
      `<span class="${ID}-level">Niv.${s.level}</span>` +
      `<span class="${ID}-score-val">Score : ${s.score}</span>` +
      (s.chain > 0 ? `<span class="${ID}-chain">Chaîne ×${s.chain}</span>` : '');
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
      .${ID}-info { display: flex; gap: 14px; align-items: center; font-size: 0.72rem; letter-spacing: 1px; }
      .${ID}-level { color: #88aaff; }
      .${ID}-score-val { color: #ffe033; }
      .${ID}-chain { color: #ff6644; font-weight: bold; }
    `;
    document.head.appendChild(s);
  }
}
