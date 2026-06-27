import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID = 'lights-out';

export default class LightsOutRenderer {
  constructor(game, viewport, config) {
    this._game    = game;
    this._vp      = viewport;
    this._cfg     = config;
    this._wrapper = null;
    this._gridEl  = null;
    this._movesEl = null;
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

    this._movesEl = document.createElement('div');
    this._movesEl.className = `${ID}-moves`;
    this._movesEl.textContent = 'Coups : 0';

    this._gridEl = document.createElement('div');
    this._gridEl.className = `${ID}-grid`;

    this._wrapper.appendChild(this._movesEl);
    this._wrapper.appendChild(this._gridEl);
    this._vp.appendChild(this._wrapper);
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique',
         options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this._game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.8;margin-bottom:4px">
          Grille 5×5 de lumières allumées<br>
          Cliquer une case bascule elle ET ses 4 voisines<br>
          Objectif : tout éteindre en un minimum de coups
        </div>` }
    );
  }

  _buildGrid(state) {
    const n = state.size;
    this._gridEl.innerHTML = '';
    this._gridEl.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const cell = document.createElement('button');
        cell.className = `${ID}-cell${state.grid[r][c] ? ` ${ID}-cell--on` : ''}`;
        cell.dataset.r = r; cell.dataset.c = c;
        cell.addEventListener('click', () => this._game.clickCell(+cell.dataset.r, +cell.dataset.c));
        this._gridEl.appendChild(cell);
      }
    }
  }

  _refreshGrid(state) {
    const cells = this._gridEl.querySelectorAll(`.${ID}-cell`);
    let i = 0;
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        cells[i].classList.toggle(`${ID}-cell--on`, !!state.grid[r][c]);
        i++;
      }
    }
    this._movesEl.textContent = `Coups : ${state.moves}`;
  }

  // ── Events ────────────────────────────────────────────────────────────────

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    this._onKey = e => {
      if (e.key === 'p' || e.key === 'P') EventBus.emit('game:pause-toggle');
      if (e.key === 'r' || e.key === 'R') this._game.restart();
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
    if (state.status === 'playing') {
      if (action === 'play') this._buildGrid(state);
      else this._refreshGrid(state);
    }
  }

  _onWon({ result, icon, title, score, best, isRecord, extraInfo }) {
    const mode = this._game.state?.mode;
    this._overlay.showGameOver(
      { result, icon, title, score, best, isRecord, extraInfo },
      () => { this._overlay.hide(); this._game.start({ mode }); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); if (this._state) this._refreshGrid(this._state); }
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
        background: #05080f; gap: 16px; padding: 16px; box-sizing: border-box;
        font-family: Orbitron, monospace; overflow: hidden;
      }
      .${ID}-moves { color: #8899bb; font-size: 0.85rem; letter-spacing: 1px; }
      .${ID}-grid {
        display: grid; gap: 6px;
        width: min(320px, 80vmin); height: min(320px, 80vmin);
      }
      .${ID}-cell {
        background: #0d1220; border: 2px solid #1a2540;
        border-radius: 6px; cursor: pointer; aspect-ratio: 1;
        transition: background 0.1s, box-shadow 0.1s;
      }
      .${ID}-cell--on {
        background: #ffe033;
        box-shadow: 0 0 14px #ffe03399, 0 0 4px #fff8;
        border-color: #ffe033;
      }
      .${ID}-cell:hover { filter: brightness(1.25); }
    `;
    document.head.appendChild(s);
  }
}
