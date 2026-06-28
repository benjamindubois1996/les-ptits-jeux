import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID = 'hashi';
const CELL = 60; // px per grid cell

export default class HashiRenderer {
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
    this._onWon     = this._onWon.bind(this);
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

  // ── Layout ────────────────────────────────────────────────────────────────

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = `${ID}-wrapper`;

    this._titleEl = document.createElement('div');
    this._titleEl.className = `${ID}-title-bar`;

    this._canvas = document.createElement('canvas');
    this._canvas.className = `${ID}-canvas`;
    this._ctx = this._canvas.getContext('2d');

    this._wrapper.append(this._titleEl, this._canvas);
    this._vp.appendChild(this._wrapper);

    this._canvas.addEventListener('click', e => this._onCanvasClick(e));
  }

  _showStart() {
    const options = this._game.PUZZLES.map((p, i) => ({ value: i, label: p.title.toUpperCase() }));
    this._overlay.showStart(
      [
        { key: 'mode',   label: 'MODE',   default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] },
        { key: 'puzzle', label: 'PUZZLE', default: 0, options },
      ],
      sel => { this._overlay.hide(); this._game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.9;margin-bottom:4px">
          Relie les îles par des ponts (1 ou 2)<br>
          Le nombre sur chaque île = ponts à construire<br>
          Toutes les îles doivent être connectées
        </div>` }
    );
  }

  // ── Dessin canvas ─────────────────────────────────────────────────────────

  _resize(state) {
    const W = state.gridCols * CELL;
    const H = state.gridRows * CELL;
    this._canvas.width  = W;
    this._canvas.height = H;
    // CSS scaling to fit viewport
    const vw = this._vp.clientWidth  - 24;
    const vh = this._vp.clientHeight - 60;
    const scale = Math.min(vw / W, vh / H, 1);
    this._canvas.style.width  = `${W * scale}px`;
    this._canvas.style.height = `${H * scale}px`;
  }

  _draw(state) {
    const ctx = this._ctx;
    const W   = this._canvas.width;
    const H   = this._canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, W, H);

    // Grid dots
    ctx.fillStyle = '#1a2540';
    for (let r = 0; r < state.gridRows; r++) {
      for (let c = 0; c < state.gridCols; c++) {
        ctx.beginPath();
        ctx.arc(c * CELL + CELL/2, r * CELL + CELL/2, 2, 0, Math.PI*2);
        ctx.fill();
      }
    }

    // Bridges
    for (const [key, count] of state.bridges) {
      if (count === 0) continue;
      const [i1, i2] = key.split('-').map(Number);
      const a = state.islands[i1], b = state.islands[i2];
      this._drawBridge(ctx, a, b, count);
    }

    // Islands (saturation based on fill)
    for (let i = 0; i < state.islands.length; i++) {
      const isle   = state.islands[i];
      const count  = this._game._islandBridgeCount(state, i);
      const done   = count === isle.n;
      const over   = count >  isle.n;
      const x = isle.c * CELL + CELL/2;
      const y = isle.r * CELL + CELL/2;
      const R = CELL * 0.35;

      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI*2);
      ctx.fillStyle   = over ? '#331010' : done ? '#102030' : '#0d1828';
      ctx.fill();
      ctx.strokeStyle = over ? '#ff4444' : done ? '#22ccff' : '#3366aa';
      ctx.lineWidth   = 2;
      ctx.stroke();

      ctx.fillStyle  = over ? '#ff6666' : done ? '#66ddff' : '#aabbcc';
      ctx.font       = `bold ${CELL * 0.28}px Orbitron, monospace`;
      ctx.textAlign  = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isle.n, x, y);
    }

    // Count display
    this._titleEl.textContent = state.title;
  }

  _drawBridge(ctx, a, b, count) {
    const x1 = a.c * CELL + CELL/2;
    const y1 = a.r * CELL + CELL/2;
    const x2 = b.c * CELL + CELL/2;
    const y2 = b.r * CELL + CELL/2;
    const horiz = a.r === b.r;
    const offset = count === 2 ? 4 : 0;

    ctx.strokeStyle = '#3399cc';
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';

    if (count === 1) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    } else {
      // Double bridge: offset perpendicular
      const [ox, oy] = horiz ? [0, offset] : [offset, 0];
      ctx.beginPath(); ctx.moveTo(x1+ox, y1+oy); ctx.lineTo(x2+ox, y2+oy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1-ox, y1-oy); ctx.lineTo(x2-ox, y2-oy); ctx.stroke();
    }
  }

  // ── Click ─────────────────────────────────────────────────────────────────

  _onCanvasClick(e) {
    const s = this._state;
    if (!s || s.status !== 'playing') return;

    const rect   = this._canvas.getBoundingClientRect();
    const scaleX = this._canvas.width  / rect.width;
    const scaleY = this._canvas.height / rect.height;
    const px     = (e.clientX - rect.left)  * scaleX;
    const py     = (e.clientY - rect.top)   * scaleY;

    // Find the closest valid bridge segment midpoint
    let bestDist = Infinity, bestA = -1, bestB = -1;

    for (let i = 0; i < s.islands.length; i++) {
      for (let j = i+1; j < s.islands.length; j++) {
        if (!this._game.canConnect(i, j) && !this._existsBridge(s, i, j)) continue;
        // Also allow clicking to toggle existing bridge down to 0
        const exists = (s.bridges.get(this._game._bridgeKey(i, j)) ?? 0) > 0;
        if (!exists && !this._game.canConnect(i, j)) continue;

        const a = s.islands[i], b = s.islands[j];
        const mx = (a.c + b.c) / 2 * CELL + CELL/2;
        const my = (a.r + b.r) / 2 * CELL + CELL/2;
        const dist = Math.hypot(px - mx, py - my);
        if (dist < bestDist && dist < CELL * 0.65) {
          bestDist = dist; bestA = i; bestB = j;
        }
      }
    }
    if (bestA >= 0) this._game.toggleBridge(bestA, bestB);
  }

  _existsBridge(s, i, j) {
    return (s.bridges.get(this._game._bridgeKey(i, j)) ?? 0) > 0;
  }

  // ── EventBus ──────────────────────────────────────────────────────────────

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    this._onKey = e => {
      if (e.key==='p'||e.key==='P') EventBus.emit('game:pause-toggle');
      if (e.key==='r'||e.key==='R') this._game.restart();
    };
    window.addEventListener('keydown', this._onKey);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKey);
  }

  _onTick({ state, action }) {
    this._state = state;
    if (state.status !== 'playing') return;
    if (action === 'play') this._resize(state);
    this._draw(state);
  }

  _onWon({ result, icon, title, score, best, isRecord, extraInfo }) {
    this._overlay.showGameOver(
      { result, icon, title, score, best, isRecord, extraInfo },
      () => { this._overlay.hide(); this._showStart(); this._game.restart(); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); if (this._state) this._draw(this._state); }
  _onRestart() { this._canvas.width=0; this._canvas.height=0; this._showStart(); }

  // ── Styles ────────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;
    const s = document.createElement('style');
    s.id = `${ID}-styles`;
    s.textContent = `
      .${ID}-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        background: #05080f; gap: 10px; padding: 12px; box-sizing: border-box;
        font-family: Orbitron, monospace; overflow: hidden;
      }
      .${ID}-title-bar { color: #5577aa; font-size: 0.75rem; letter-spacing: 2px; }
      .${ID}-canvas    { display: block; cursor: pointer; image-rendering: crisp-edges; }
    `;
    document.head.appendChild(s);
  }
}
