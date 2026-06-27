import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID = 'rush-hour';

const CAR_COLORS = {
  red:'#ff3333', a:'#4488ff', b:'#44cc88', c:'#ff8800',
  d:'#cc44ff',   e:'#ffdd00', f:'#00ccff', g:'#ff66aa',
  h:'#88ff44',   i:'#ff9944',
};

export default class RushHourRenderer {
  constructor(game, viewport, config) {
    this._game    = game;
    this._vp      = viewport;
    this._cfg     = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._state   = null;
    this._dragging    = null;
    this._dragStartCell = null;
    this._notifEl = null;
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

    this._notifEl = document.createElement('div');
    this._notifEl.className = `${ID}-notif ${ID}-notif--hidden`;
    this._notifEl.textContent = '✓ Résolu !';

    this._wrapper.appendChild(this._info);
    this._wrapper.appendChild(this._canvas);
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
          Libérez la voiture ROUGE → jusqu'à la sortie<br>
          Glissez les voitures dans leur axe pour dégager la route<br>
          5 niveaux de difficulté croissante
        </div>` }
    );
  }

  _bindCanvasEvents() {
    const cvs = this._canvas;

    const cellFrom = (cx, cy) => {
      const rect  = cvs.getBoundingClientRect();
      const cellPx = rect.width / this._cfg.gameplay.size;
      return {
        col: Math.floor((cx - rect.left) / cellPx),
        row: Math.floor((cy - rect.top)  / cellPx)
      };
    };

    cvs.addEventListener('mousedown', e => {
      if (!this._state || this._state.status !== 'playing') return;
      const { col, row } = cellFrom(e.clientX, e.clientY);
      const id = this._state.grid[row]?.[col];
      if (id) { this._dragging = id; this._dragStartCell = { col, row }; this._game.selectCar(id); }
    });

    cvs.addEventListener('mousemove', e => {
      if (!this._dragging || !this._state) return;
      const { col, row } = cellFrom(e.clientX, e.clientY);
      const car = this._state.cars.find(c => c.id === this._dragging);
      if (!car) return;
      if (car.horiz) {
        const dc = col - this._dragStartCell.col;
        if (dc !== 0) { this._game.moveCar(this._dragging, dc > 0 ? 1 : -1); this._dragStartCell.col = col; }
      } else {
        const dr = row - this._dragStartCell.row;
        if (dr !== 0) { this._game.moveCar(this._dragging, dr > 0 ? 1 : -1); this._dragStartCell.row = row; }
      }
    });

    cvs.addEventListener('mouseup',    () => { this._dragging = null; });
    cvs.addEventListener('mouseleave', () => { this._dragging = null; });

    cvs.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0];
      const { col, row } = cellFrom(t.clientX, t.clientY);
      const id = this._state?.grid[row]?.[col];
      if (id) { this._dragging = id; this._dragStartCell = { col, row }; this._game.selectCar(id); }
    }, { passive: false });

    cvs.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!this._dragging || !this._state) return;
      const t = e.touches[0];
      const { col, row } = cellFrom(t.clientX, t.clientY);
      const car = this._state.cars.find(c => c.id === this._dragging);
      if (!car) return;
      if (car.horiz) {
        const dc = col - this._dragStartCell.col;
        if (dc !== 0) { this._game.moveCar(this._dragging, dc > 0 ? 1 : -1); this._dragStartCell.col = col; }
      } else {
        const dr = row - this._dragStartCell.row;
        if (dr !== 0) { this._game.moveCar(this._dragging, dr > 0 ? 1 : -1); this._dragStartCell.row = row; }
      }
    }, { passive: false });

    cvs.addEventListener('touchend', () => { this._dragging = null; });
  }

  // ── Draw ─────────────────────────────────────────────────────────────────

  _draw(state) {
    const n   = this._cfg.gameplay.size;
    const ctx = this._ctx;
    const sz  = this._canvas.width;
    const cell = sz / n;
    const pad  = cell * 0.07;

    ctx.clearRect(0, 0, sz, sz);
    ctx.fillStyle = '#0d1525';
    ctx.fillRect(0, 0, sz, sz);

    // Grille
    ctx.strokeStyle = '#1a2540'; ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i*cell, 0); ctx.lineTo(i*cell, sz); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i*cell); ctx.lineTo(sz, i*cell); ctx.stroke();
    }

    // Sortie
    const exitRow = this._cfg.gameplay.exitRow;
    const exitCol = this._cfg.gameplay.exitCol;
    ctx.fillStyle = '#ff333333';
    ctx.fillRect((exitCol + 0.75)*cell, exitRow*cell + pad, cell*0.25, cell - pad*2);
    ctx.fillStyle = '#ff3333';
    ctx.font = `${cell*0.45}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('→', (exitCol + 0.87)*cell, (exitRow + 0.5)*cell);

    // Voitures
    for (const car of state.cars) {
      const isSelected = state.selected === car.id;
      const x = car.col * cell + pad;
      const y = car.row * cell + pad;
      const w = car.horiz ? car.len * cell - pad*2 : cell - pad*2;
      const h = car.horiz ? cell - pad*2 : car.len * cell - pad*2;
      const color = CAR_COLORS[car.id] ?? '#888';

      ctx.fillStyle = color + (isSelected ? 'ff' : 'cc');
      this._roundRect(ctx, x, y, w, h, 8);
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        this._roundRect(ctx, x, y, w, h, 8); ctx.stroke();
      }

      // Flèche sur la rouge
      if (car.id === 'red') {
        ctx.fillStyle = '#fff9';
        ctx.font = `bold ${cell*0.4}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('→', x + w/2, y + h/2);
      }
    }
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y); ctx.closePath();
  }

  _showNotif(text) {
    if (this._notifTimer) clearTimeout(this._notifTimer);
    this._notifEl.textContent = text;
    this._notifEl.classList.remove(`${ID}-notif--hidden`);
    this._notifTimer = setTimeout(() => {
      this._notifEl.classList.add(`${ID}-notif--hidden`);
    }, 1200);
  }

  _resize() {
    const size = Math.min(this._vp.clientWidth - 32, this._vp.clientHeight - 72, 400);
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
    if (action === 'next-puzzle') this._showNotif(`✓ Niveau ${state.puzzleNum - 1} résolu !`);
    this._info.textContent = `Niveau ${state.puzzleNum} / ${5} — Déplacements : ${state.moves}`;
    this._resize();
    this._draw(state);
  }

  _onWon({ result, icon, title, score, best, isRecord, extraInfo }) {
    const mode = this._game.state?.mode;
    this._overlay.showGameOver(
      { result, icon, title, score, best, isRecord, extraInfo },
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
        background: #05080f; gap: 8px; padding: 12px; box-sizing: border-box;
        font-family: Orbitron, monospace;
      }
      .${ID}-info   { color: #8899bb; font-size: 0.75rem; letter-spacing: 1px; }
      .${ID}-canvas { display: block; cursor: grab; border: 2px solid #1a2540; }
      .${ID}-canvas:active { cursor: grabbing; }
      .${ID}-notif {
        font-size: 0.8rem; color: #00e87a; letter-spacing: 2px;
        transition: opacity 0.3s; opacity: 1;
      }
      .${ID}-notif--hidden { opacity: 0; }
    `;
    document.head.appendChild(s);
  }
}
