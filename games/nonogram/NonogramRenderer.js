import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';
import { EMPTY, FILLED, CROSSED } from './Nonogram.js';

export default class NonogramRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._sel     = { mode: 'basique', difficulty: 'normal' };
    this._hover   = null;

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onMouseMove  = this._onMouseMove.bind(this);
    this._onMouseDown  = this._onMouseDown.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
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
    document.getElementById('nng-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('nng-styles')) return;
    const el = document.createElement('style');
    el.id = 'nng-styles';
    el.textContent = `
      .nng-wrapper {
        position:absolute; inset:0;
        display:flex; flex-direction:column;
        background:#050810; font-family:Orbitron,monospace;
        overflow:hidden; color:#fff; align-items:center;
      }
      .nng-info {
        flex:0 0 auto; padding:6px 16px; width:100%; box-sizing:border-box;
        display:flex; justify-content:space-between; align-items:center;
        border-bottom:1px solid rgba(0,255,225,0.12); font-size:11px;
        color:rgba(255,255,255,0.45);
      }
      .nng-canvas-area {
        flex:1; overflow:auto; display:flex;
        align-items:center; justify-content:center; padding:8px; box-sizing:border-box;
      }
      .nng-canvas { display:block; cursor:crosshair; }
      .nng-hint {
        flex:0 0 auto; padding:5px; font-size:9px;
        color:rgba(255,255,255,0.2); letter-spacing:0.08em; text-align:center;
      }
    `;
    document.head.appendChild(el);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'nng-wrapper';

    this._infoEl = document.createElement('div');
    this._infoEl.className = 'nng-info';
    this._infoEl.innerHTML = `<span id="nng-diff">Nonogram</span><span id="nng-errors">Erreurs : 0</span>`;

    const area = document.createElement('div');
    area.className = 'nng-canvas-area';

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'nng-canvas';
    this._ctx = this._canvas.getContext('2d');
    area.appendChild(this._canvas);

    const hint = document.createElement('div');
    hint.className = 'nng-hint';
    hint.textContent = 'Clic gauche : remplir · Clic droit : croix';

    this._wrapper.appendChild(this._infoEl);
    this._wrapper.appendChild(area);
    this._wrapper.appendChild(hint);

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();
    this.viewport.appendChild(this._wrapper);
  }

  _optionGroups() {
    const diffs = this.config.gameplay.difficulties;
    return [
      { key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] },
      {
        key: 'difficulty', label: 'TAILLE', default: 'normal',
        options: Object.entries(diffs).map(([k, v]) => ({ value: k, label: v.label })),
      },
    ];
  }

  _showStartScreen() {
    this._overlay.showStart(
      this._optionGroups(),
      sel => { this._sel = sel; this._overlay.hide(); this.game.start(sel); },
    );
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
    this._canvas.addEventListener('mousemove',   this._onMouseMove);
    this._canvas.addEventListener('mousedown',   this._onMouseDown);
    this._canvas.addEventListener('contextmenu', this._onContextMenu);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
    this._canvas.removeEventListener('mousemove',   this._onMouseMove);
    this._canvas.removeEventListener('mousedown',   this._onMouseDown);
    this._canvas.removeEventListener('contextmenu', this._onContextMenu);
  }

  _onKeyDown(e) {
    const keys = this.config.controls?.keyboard ?? {};
    if ((keys.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if ((keys.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
  }

  _onMouseMove(e) {
    const cell = this._canvasToCell(e);
    this._hover = cell;
    if (this.game.state.status === 'playing') this._drawFrame();
  }

  _onMouseDown(e) {
    if (e.button === 2) return;
    const cell = this._canvasToCell(e);
    if (cell) this.game.toggleCell(cell.r, cell.c, false);
  }

  _onContextMenu(e) {
    e.preventDefault();
    const cell = this._canvasToCell(e);
    if (cell) this.game.toggleCell(cell.r, cell.c, true);
  }

  _canvasToCell(e) {
    const state = this.game.state;
    if (!state.size) return null;
    const rect = this._canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const headerH = this._clueHeaderSize(state);
    const headerW = this._clueHeaderSize(state);
    const cellSize = this._cellSize(state);
    const c = Math.floor((px - headerW) / cellSize);
    const r = Math.floor((py - headerH) / cellSize);
    if (r < 0 || c < 0 || r >= state.size || c >= state.size) return null;
    return { r, c };
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    this._drawFrame();
  }

  _onWon(data) {
    const best = data.best ?? 0;
    this._overlay.showGameOver(
      { result: 'win', icon: '🖼️', title: 'RÉSOLU !', score: data.score,
        isRecord: data.score >= best,
        extraInfo: `<div class="overlay-score">Meilleur : ${best}</div>` },
      () => this._showStartScreen(),
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStartScreen(); }

  _cellSize(state) {
    const maxSize = Math.min(this._canvas.parentElement?.clientWidth ?? 600,
                             this._canvas.parentElement?.clientHeight ?? 600) - 16;
    const headerFrac = 0.25;
    const gridFrac   = 1 - headerFrac;
    return Math.max(12, Math.floor(maxSize * gridFrac / state.size));
  }

  _clueHeaderSize(state) {
    return this._cellSize(state) * Math.ceil(state.size / 2);
  }

  _drawFrame() {
    const state = this.game.state;
    if (!state.size) return;

    const cellSize = this._cellSize(state);
    const hdr      = this._clueHeaderSize(state);
    const total    = hdr + state.size * cellSize;

    this._canvas.width  = total;
    this._canvas.height = total;
    const ctx = this._ctx;

    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, total, total);

    // Draw grid cells
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        const x = hdr + c * cellSize;
        const y = hdr + r * cellSize;
        const cell = state.grid[r]?.[c] ?? EMPTY;
        const isHover = this._hover?.r === r && this._hover?.c === c;

        ctx.fillStyle = isHover ? 'rgba(0,255,225,0.08)' : '#0a1428';
        ctx.fillRect(x, y, cellSize, cellSize);

        if (cell === FILLED) {
          ctx.fillStyle = '#00ffe1';
          ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        } else if (cell === CROSSED) {
          ctx.strokeStyle = 'rgba(255,80,80,0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + cellSize - 4, y + cellSize - 4);
          ctx.moveTo(x + cellSize - 4, y + 4); ctx.lineTo(x + 4, y + cellSize - 4);
          ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(0,255,225,0.12)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cellSize, cellSize);

        // Thicker lines every 5
        if (c % 5 === 0) {
          ctx.strokeStyle = 'rgba(0,255,225,0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, hdr); ctx.lineTo(x, total); ctx.stroke();
        }
        if (r % 5 === 0) {
          ctx.strokeStyle = 'rgba(0,255,225,0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(hdr, y); ctx.lineTo(total, y); ctx.stroke();
        }
      }
    }

    // Row clues
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const fontSize = Math.max(8, Math.floor(cellSize * 0.45));
    ctx.font = `bold ${fontSize}px Orbitron,monospace`;
    for (let r = 0; r < state.size; r++) {
      const clue = state.rowClues[r] ?? [];
      const y = hdr + r * cellSize + cellSize / 2;
      ctx.fillText(clue.join(' '), hdr - 4, y);
    }

    // Col clues
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (let c = 0; c < state.size; c++) {
      const clue = state.colClues[c] ?? [];
      const x = hdr + c * cellSize + cellSize / 2;
      ctx.fillText(clue.join('\n'), x, hdr - 2);
    }

    // Update info
    const diffEl = document.getElementById('nng-diff');
    const errEl  = document.getElementById('nng-errors');
    if (diffEl) diffEl.textContent = `${state.size}×${state.size}`;
    if (errEl)  errEl.textContent  = `Erreurs : ${state.errors}`;
  }
}
