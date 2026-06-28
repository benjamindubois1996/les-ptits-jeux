import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID   = 'dots-and-boxes';
const CELL = 78;
const PAD  = 32;
const DOT  = 5;

export default class DotsAndBoxesRenderer {
  constructor(game, viewport, config) {
    this._game    = game;
    this._vp      = viewport;
    this._cfg     = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._state   = null;
    this._hover   = null; // { type, r, c } | null

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
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

  // Layout

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = `${ID}-wrapper`;

    this._scoreEl = document.createElement('div');
    this._scoreEl.className = `${ID}-score`;

    this._canvas = document.createElement('canvas');
    this._canvas.className = `${ID}-canvas`;
    this._ctx = this._canvas.getContext('2d');

    this._hintEl = document.createElement('div');
    this._hintEl.className = `${ID}-hint`;
    this._hintEl.textContent = 'Clique entre deux points pour tracer un trait';

    this._wrapper.append(this._scoreEl, this._canvas, this._hintEl);
    this._vp.appendChild(this._wrapper);

    this._canvas.addEventListener('mousemove', e => this._onMouseMove(e));
    this._canvas.addEventListener('mouseleave', () => { this._hover = null; if (this._state) this._draw(this._state); });
    this._canvas.addEventListener('click',     e => this._onCanvasClick(e));
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this._game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.9;margin-bottom:4px">
          Trace des traits entre les points<br>
          Ferme un carre pour le gagner et rejouer<br>
          Plus de carres que l'IA = victoire !
        </div>` }
    );
  }

  // Canvas

  _canvasSize(n) {
    const side = (n + 1) * CELL + 2 * PAD;
    return side;
  }

  _dotXY(r, c) {
    return [PAD + c * CELL, PAD + r * CELL];
  }

  _draw(s) {
    const n   = s.n;
    const sz  = this._canvasSize(n);
    const ctx = this._ctx;
    ctx.clearRect(0, 0, sz, sz);

    // Background
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, sz, sz);

    // Claimed boxes
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (s.boxes[r][c] === -1) continue;
        const [x, y] = this._dotXY(r, c);
        ctx.fillStyle = s.boxes[r][c] === 0 ? 'rgba(30,80,200,0.35)' : 'rgba(200,30,50,0.35)';
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      }
    }

    // Hover preview (undrawn line)
    if (this._hover && s.turn === 'player') {
      const { type, r, c } = this._hover;
      const [x1, y1] = this._dotXY(r, c);
      const [x2, y2] = type === 'h' ? this._dotXY(r, c + 1) : this._dotXY(r + 1, c);
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'rgba(100,180,255,0.5)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Drawn lines
    for (let r = 0; r <= n; r++) {
      for (let c = 0; c < n; c++) {
        if (!s.hLines[r][c]) continue;
        const [x1, y1] = this._dotXY(r, c);
        const [x2, y2] = this._dotXY(r, c + 1);
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
    for (let r = 0; r < n; r++) {
      for (let c = 0; c <= n; c++) {
        if (!s.vLines[r][c]) continue;
        const [x1, y1] = this._dotXY(r, c);
        const [x2, y2] = this._dotXY(r + 1, c);
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    // Dots
    for (let r = 0; r <= n; r++) {
      for (let c = 0; c <= n; c++) {
        const [x, y] = this._dotXY(r, c);
        ctx.beginPath();
        ctx.arc(x, y, DOT, 0, Math.PI * 2);
        ctx.fillStyle = '#cce0ff';
        ctx.fill();
      }
    }
  }

  _refreshScore(s) {
    this._scoreEl.innerHTML =
      `<span class="${ID}-score-player">&#9632; Toi&nbsp;:&nbsp;<strong>${s.scores[0]}</strong></span>` +
      `<span class="${ID}-score-sep">|</span>` +
      `<span class="${ID}-score-ai">&#9632; IA&nbsp;:&nbsp;<strong>${s.scores[1]}</strong></span>` +
      `<span class="${ID}-score-turn">${s.turn === 'player' ? 'A ton tour' : 'IA reflechit...'}</span>`;
  }

  // Interaction

  _eventPos(e) {
    const rect   = this._canvas.getBoundingClientRect();
    const scaleX = this._canvas.width  / rect.width;
    const scaleY = this._canvas.height / rect.height;
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY];
  }

  _nearestLine(px, py, s) {
    const n = s.n;
    let best = null, bestDist = CELL * 0.38;

    // Horizontal lines
    for (let r = 0; r <= n; r++) {
      for (let c = 0; c < n; c++) {
        const mx = PAD + (c + 0.5) * CELL;
        const my = PAD + r * CELL;
        const d  = Math.hypot(px - mx, py - my);
        if (d < bestDist) { bestDist = d; best = { type: 'h', r, c }; }
      }
    }

    // Vertical lines
    for (let r = 0; r < n; r++) {
      for (let c = 0; c <= n; c++) {
        const mx = PAD + c * CELL;
        const my = PAD + (r + 0.5) * CELL;
        const d  = Math.hypot(px - mx, py - my);
        if (d < bestDist) { bestDist = d; best = { type: 'v', r, c }; }
      }
    }
    return best;
  }

  _onMouseMove(e) {
    const s = this._state;
    if (!s || s.status !== 'playing' || s.turn !== 'player') return;
    const [px, py] = this._eventPos(e);
    const line = this._nearestLine(px, py, s);
    if (line && !this._game._canDraw(s, line.type, line.r, line.c)) {
      this._hover = null;
    } else {
      this._hover = line;
    }
    this._draw(s);
  }

  _onCanvasClick(e) {
    const s = this._state;
    if (!s || s.status !== 'playing' || s.turn !== 'player') return;
    const [px, py] = this._eventPos(e);
    const line = this._nearestLine(px, py, s);
    if (line) this._game.drawLine(line.type, line.r, line.c);
  }

  // Events

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);

    this._onKey = e => {
      if (e.key === 'p' || e.key === 'P') { EventBus.emit('game:pause-toggle'); return; }
      if (e.key === 'r' || e.key === 'R') { this._game.restart(); }
    };
    window.addEventListener('keydown', this._onKey);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
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
    this._refreshScore(state);
  }

  _setupCanvas(s) {
    const sz = this._canvasSize(s.n);
    this._canvas.width  = sz;
    this._canvas.height = sz;
    const vw    = this._vp.clientWidth  - 24;
    const vh    = this._vp.clientHeight - 80;
    const scale = Math.min(vw / sz, vh / sz, 1);
    this._canvas.style.width  = `${sz * scale}px`;
    this._canvas.style.height = `${sz * scale}px`;
  }

  _onWon(data)  { this._showEnd(data); }
  _onOver(data) { this._showEnd(data); }

  _showEnd({ result, icon, title, score, best, isRecord, extraInfo }) {
    this._overlay.showGameOver(
      { result, icon, title, score, best, isRecord, extraInfo },
      () => { this._overlay.hide(); this._game.start({ mode: this._state?.mode }); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); if (this._state) this._draw(this._state); }
  _onRestart() { this._canvas.width = 0; this._canvas.height = 0; this._showStart(); }

  // Styles

  _injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;
    const s = document.createElement('style');
    s.id = `${ID}-styles`;
    s.textContent = `
      .${ID}-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        background: #05080f; gap: 8px; padding: 12px; box-sizing: border-box;
        font-family: Orbitron, monospace; overflow: hidden;
      }
      .${ID}-canvas { display: block; cursor: crosshair; image-rendering: crisp-edges; }
      .${ID}-score {
        display: flex; gap: 16px; align-items: center;
        font-size: 0.72rem; letter-spacing: 1px; flex-wrap: wrap; justify-content: center;
      }
      .${ID}-score-player { color: #5588ff; }
      .${ID}-score-ai     { color: #ff4455; }
      .${ID}-score-sep    { color: #334455; }
      .${ID}-score-turn   { color: #667788; font-size: 0.6rem; }
      .${ID}-hint { color: #2a3a4a; font-size: 0.6rem; letter-spacing: .5px; }
    `;
    document.head.appendChild(s);
  }
}
