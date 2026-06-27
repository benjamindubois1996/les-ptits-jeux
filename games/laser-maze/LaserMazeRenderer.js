import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID = 'laser-maze';

export default class LaserMazeRenderer {
  constructor(game, viewport, config) {
    this._game    = game;
    this._vp      = viewport;
    this._cfg     = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._state   = null;
    this._notifEl  = null;
    this._notifTimer = null;

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

    this._info = document.createElement('div');
    this._info.className = `${ID}-info`;

    this._canvas = document.createElement('canvas');
    this._canvas.className = `${ID}-canvas`;
    this._ctx = this._canvas.getContext('2d');

    this._legend = document.createElement('div');
    this._legend.className = `${ID}-legend`;
    this._legend.innerHTML = '<span style="color:#4488ff">■ Miroir fixe</span> &nbsp; <span style="color:#ffaa00">■ Rotatif (cliquer)</span>';

    this._notifEl = document.createElement('div');
    this._notifEl.className = `${ID}-notif ${ID}-notif--hidden`;

    this._wrapper.appendChild(this._info);
    this._wrapper.appendChild(this._canvas);
    this._wrapper.appendChild(this._legend);
    this._wrapper.appendChild(this._notifEl);
    this._vp.appendChild(this._wrapper);
    this._bindCanvasEvents();
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique',
         options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this._game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.8;margin-bottom:4px">
          Un laser 🔴 entre dans la grille<br>
          Cliquez les miroirs <span style="color:#ffaa00">orange</span> pour les pivoter (/ ↔ \\)<br>
          Les miroirs <span style="color:#4488ff">bleus</span> sont fixes · Atteignez la cible <span style="color:#00ff88">verte</span>
        </div>` }
    );
  }

  _bindCanvasEvents() {
    const hit = (cx, cy) => {
      if (!this._state || this._state.status !== 'playing') return;
      const rect  = this._canvas.getBoundingClientRect();
      const cellPx = rect.width / this._cfg.gameplay.size;
      const c = Math.floor((cx - rect.left)  / cellPx);
      const r = Math.floor((cy - rect.top)   / cellPx);
      this._game.rotateMirror(r, c);
    };
    this._canvas.addEventListener('click', e => hit(e.clientX, e.clientY));
    this._canvas.addEventListener('touchend', e => {
      e.preventDefault();
      hit(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }, { passive: false });
  }

  // ── Draw ─────────────────────────────────────────────────────────────────

  _draw(s) {
    if (!s.laser) return;
    const n    = this._cfg.gameplay.size;
    const ctx  = this._ctx;
    const sz   = this._canvas.width;
    const cell = sz / n;

    ctx.clearRect(0, 0, sz, sz);
    ctx.fillStyle = '#050a12';
    ctx.fillRect(0, 0, sz, sz);

    // Grille
    ctx.strokeStyle = '#1a2540'; ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i*cell, 0); ctx.lineTo(i*cell, sz); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i*cell); ctx.lineTo(sz, i*cell); ctx.stroke();
    }

    // Beam
    if (s.beam.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#ff3300'; ctx.lineWidth = 3;
      ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo((s.beam[0].c + 0.5)*cell, (s.beam[0].r + 0.5)*cell);
      for (let i = 1; i < s.beam.length; i++) ctx.lineTo((s.beam[i].c + 0.5)*cell, (s.beam[i].r + 0.5)*cell);
      ctx.stroke();
      ctx.restore();
    }

    // Murs
    ctx.fillStyle = '#3a4a60';
    for (const w of s.walls) ctx.fillRect(w.c*cell+2, w.r*cell+2, cell-4, cell-4);

    // Cibles
    for (const t of s.targets) {
      const x = (t.c+0.5)*cell, y = (t.r+0.5)*cell, r = cell*0.3;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fillStyle = t.hit ? '#00ff88' : '#0a3320';
      ctx.fill();
      ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2; ctx.stroke();
      if (t.hit) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${cell*0.35}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✓', x, y);
      }
    }

    // Miroirs
    for (const m of s.mirrors) {
      const mx = m.c*cell, my = m.r*cell, p = cell*0.18;
      if (!m.fixed) { ctx.fillStyle = '#ffaa0033'; ctx.fillRect(mx+2, my+2, cell-4, cell-4); }
      ctx.strokeStyle = m.fixed ? '#4488ff' : '#ffaa00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (m.type === 'mirror-fwd') { ctx.moveTo(mx+cell-p, my+p); ctx.lineTo(mx+p, my+cell-p); }
      else                          { ctx.moveTo(mx+p, my+p);      ctx.lineTo(mx+cell-p, my+cell-p); }
      ctx.stroke();
    }

    // Source laser
    const ls = s.laser;
    ctx.fillStyle = '#ff330099';
    ctx.beginPath(); ctx.arc((ls.c+0.5)*cell, (ls.r+0.5)*cell, cell*0.28, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `${cell*0.32}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText({ right:'→', left:'←', up:'↑', down:'↓' }[ls.dir], (ls.c+0.5)*cell, (ls.r+0.5)*cell);
  }

  _showNotif(text) {
    if (this._notifTimer) clearTimeout(this._notifTimer);
    this._notifEl.textContent = text;
    this._notifEl.classList.remove(`${ID}-notif--hidden`);
    this._notifTimer = setTimeout(() => this._notifEl.classList.add(`${ID}-notif--hidden`), 1200);
  }

  _resize() {
    const size = Math.min(this._vp.clientWidth - 32, this._vp.clientHeight - 100, 420);
    if (this._canvas.width !== size) { this._canvas.width = size; this._canvas.height = size; }
  }

  // ── Events ────────────────────────────────────────────────────────────────

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
  }

  _onTick({ state, action }) {
    this._state = state;
    if (state.status !== 'playing') return;
    if (action === 'next-puzzle') this._showNotif(`🎯 Niveau ${state.puzzleNum - 1} résolu !`);
    this._info.textContent = `Niveau ${state.puzzleNum} / 5 — Pivots : ${state.moves}`;
    this._resize();
    this._draw(state);
  }

  _onWon({ result, icon, title, score, best, isRecord }) {
    const mode = this._game.state?.mode;
    this._overlay.showGameOver(
      { result, icon, title, score, best, isRecord },
      () => { this._overlay.hide(); this._game.start({ mode }); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); if (this._state) this._draw(this._state); }
  _onRestart() { this._showStart(); }

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
        background: #05080f; gap: 6px; padding: 10px; box-sizing: border-box;
        font-family: Orbitron, monospace;
      }
      .${ID}-info   { color: #8899bb; font-size: 0.75rem; letter-spacing: 1px; }
      .${ID}-canvas { display: block; cursor: pointer; border: 2px solid #1a2540; }
      .${ID}-legend { font-size: 0.65rem; color: #556; }
      .${ID}-notif  { font-size: 0.8rem; color: #00e87a; letter-spacing: 2px; transition: opacity 0.3s; }
      .${ID}-notif--hidden { opacity: 0; }
    `;
    document.head.appendChild(s);
  }
}
