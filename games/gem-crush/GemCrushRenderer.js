import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const GEM_COLORS = ['#ff4d8b','#00ffe1','#7b61ff','#ffe030','#ff6b35','#00d4ff'];
const GEM_EMOJI  = ['💎','🔷','💜','⭐','🔶','🔵'];
const CELL = 56;

export default class GemCrushRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._overlay = null;
    this._canvas  = null;
    this._ctx     = null;
    this._shake   = { r: -1, c: -1, timer: 0 };

    this._onTick    = this._onTick.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onClick   = this._onClick.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('gc-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('gc-styles')) return;
    const s = document.createElement('style');
    s.id = 'gc-styles';
    s.textContent = `
      .gc-wrapper {
        position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
        background:#050810; font-family:Orbitron,monospace; color:#fff; overflow:hidden;
      }
      .gc-info { font-size:11px; color:rgba(255,255,255,0.4); letter-spacing:.1em; margin-bottom:10px; display:flex; gap:20px; }
      .gc-info span { color:#fff; }
      .gc-canvas { display:block; cursor:pointer; border-radius:8px; box-shadow:0 0 30px rgba(123,97,255,0.15); }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'gc-wrapper';

    this._infoEl = document.createElement('div');
    this._infoEl.className = 'gc-info';
    this._infoEl.innerHTML = `NIVEAU <span id="gc-level">1</span>`;

    const { rows, cols } = this.config.gameplay;
    this._canvas = document.createElement('canvas');
    this._canvas.className = 'gc-canvas';
    this._canvas.width  = cols * CELL;
    this._canvas.height = rows * CELL;
    this._ctx = this._canvas.getContext('2d');

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this._wrapper.appendChild(this._infoEl);
    this._wrapper.appendChild(this._canvas);
    this.viewport.appendChild(this._wrapper);
  }

  _showStartScreen() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this.game.start(sel); },
    );
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
    this._canvas.addEventListener('click',     this._onClick);
    this._canvas.addEventListener('mousemove', this._onMouseMove);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
    this._canvas.removeEventListener('click',     this._onClick);
    this._canvas.removeEventListener('mousemove', this._onMouseMove);
  }

  _onKeyDown(e) {
    const k = this.config.controls?.keyboard ?? {};
    if ((k.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if ((k.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
  }

  _cellAt(e) {
    const rect = this._canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left) / CELL);
    const r = Math.floor((e.clientY - rect.top)  / CELL);
    const { rows, cols } = this.config.gameplay;
    if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
    return { r, c };
  }

  _onClick(e) {
    const cell = this._cellAt(e);
    if (cell) this.game.select(cell.r, cell.c);
  }

  _onMouseMove(e) { this._hover = this._cellAt(e); }

  _onTick({ state, action }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    if (action === 'invalid-swap') { this._triggerShake(); }
    document.getElementById('gc-level') && (document.getElementById('gc-level').textContent = state.level);
    this._draw(state);
  }

  _triggerShake() {
    this._canvas.style.animation = 'none';
    void this._canvas.offsetWidth;
    this._canvas.style.animation = 'gc-shake .3s ease';
    if (!document.getElementById('gc-shake-style')) {
      const s = document.createElement('style');
      s.id = 'gc-shake-style';
      s.textContent = `@keyframes gc-shake { 0%,100%{transform:none} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }`;
      document.head.appendChild(s);
    }
  }

  _draw(state) {
    const ctx  = this._ctx;
    const { rows, cols } = state;
    const W = cols * CELL, H = rows * CELL;

    ctx.fillStyle = '#0a0f20';
    ctx.fillRect(0, 0, W, H);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val  = state.grid[r]?.[c];
        const x    = c * CELL, y = r * CELL;
        const sel  = state.selected?.r === r && state.selected?.c === c;
        const hov  = this._hover?.r === r && this._hover?.c === c;

        // Cell bg
        ctx.fillStyle = sel ? 'rgba(255,255,255,0.12)' : hov ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)';
        this._drawRRect(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 8);
        ctx.fill();

        if (val === null) continue;

        const color = GEM_COLORS[val % GEM_COLORS.length];

        // Gem glow
        if (sel) {
          ctx.shadowColor = color;
          ctx.shadowBlur  = 14;
        }

        // Gem body
        const cx = x + CELL/2, cy = y + CELL/2, rad = CELL * 0.33;
        ctx.fillStyle = color + 'cc';
        ctx.strokeStyle = color;
        ctx.lineWidth = sel ? 3 : 1.5;
        this._drawGem(ctx, cx, cy, rad);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.ellipse(cx - rad * 0.2, cy - rad * 0.25, rad * 0.25, rad * 0.15, -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawGem(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.7, cy - r * 0.3);
    ctx.lineTo(cx + r * 0.7, cy + r * 0.3);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.7, cy + r * 0.3);
    ctx.lineTo(cx - r * 0.7, cy - r * 0.3);
    ctx.closePath();
  }

  _drawRRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : (ctx.rect(x, y, w, h));
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStartScreen(); }
}
