import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID = 'kakuro';

export default class KakuroRenderer {
  constructor(game, viewport, config) {
    this._game    = game;
    this._vp      = viewport;
    this._cfg     = config;
    this._wrapper = null;
    this._overlay = null;
    this._state   = null;
    this._tableEl = null;

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
    this._titleEl.className = `${ID}-title`;

    this._tableEl = document.createElement('div');
    this._tableEl.className = `${ID}-grid`;

    this._hintEl = document.createElement('div');
    this._hintEl.className = `${ID}-hint`;
    this._hintEl.textContent = 'Clique une cellule, tape 1-9 pour remplir, 0 ou Delete pour effacer';

    this._wrapper.append(this._titleEl, this._tableEl, this._hintEl);
    this._vp.appendChild(this._wrapper);
  }

  _showStart() {
    const options = this._game.PUZZLES.map((p, i) => ({
      value: i, label: p.title.toUpperCase()
    }));
    this._overlay.showStart(
      [
        { key: 'mode',   label: 'MODE',   default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] },
        { key: 'puzzle', label: 'PUZZLE', default: 0, options },
      ],
      sel => { this._overlay.hide(); this._game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.9;margin-bottom:4px">
          Remplis chaque cellule avec 1-9<br>
          La somme de chaque suite = le chiffre affiché<br>
          Pas de répétition dans une même suite
        </div>` }
    );
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  _buildTable(state) {
    this._tableEl.innerHTML = '';
    this._titleEl.textContent = state.title;
    const { grid, rows, cols } = state;
    this._tableEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        const el   = document.createElement('div');

        if (cell === null) {
          el.className = `${ID}-cell ${ID}-cell--wall`;
        } else if (typeof cell === 'object') {
          el.className = `${ID}-cell ${ID}-cell--clue`;
          const diagonal = document.createElement('div');
          diagonal.className = `${ID}-clue-inner`;
          const top = document.createElement('span');
          top.className = `${ID}-clue-top`;
          top.textContent = cell.a > 0 ? cell.a : '';
          const bot = document.createElement('span');
          bot.className = `${ID}-clue-bot`;
          bot.textContent = cell.d > 0 ? cell.d : '';
          diagonal.append(bot, top);
          el.appendChild(diagonal);
        } else {
          el.className = `${ID}-cell ${ID}-cell--white`;
          el.dataset.r = r;
          el.dataset.c = c;
          el.textContent = cell > 0 ? cell : '';
          el.addEventListener('click', () => this._game.selectCell(r, c));
        }
        this._tableEl.appendChild(el);
      }
    }
  }

  _refreshTable(state) {
    const { grid, rows, cols, errors, selectedCell } = state;
    const cells = this._tableEl.querySelectorAll(`.${ID}-cell--white`);
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (cell === null || typeof cell === 'object') continue;
        const el = cells[idx++];
        if (!el) continue;
        el.textContent = cell > 0 ? cell : '';
        el.className = `${ID}-cell ${ID}-cell--white`;
        if (errors.has(`${r},${c}`))  el.classList.add(`${ID}-cell--error`);
        if (selectedCell?.[0]===r && selectedCell?.[1]===c) el.classList.add(`${ID}-cell--selected`);
      }
    }
  }

  // ── Events ────────────────────────────────────────────────────────────────

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    this._onKey = e => {
      const s = this._state;
      if (e.key === 'p' || e.key === 'P') { EventBus.emit('game:pause-toggle'); return; }
      if (e.key === 'r' || e.key === 'R') { this._game.restart(); return; }
      if (!s?.selectedCell) return;
      const [r, c] = s.selectedCell;
      if (e.key >= '1' && e.key <= '9') { this._game.setCellValue(r, c, +e.key); return; }
      if (e.key === '0' || e.key === 'Delete' || e.key === 'Backspace') {
        this._game.setCellValue(r, c, 0);
      }
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
    if (action === 'play') this._buildTable(state);
    else this._refreshTable(state);
  }

  _onWon({ result, icon, title, score, best, isRecord, extraInfo }) {
    this._overlay.showGameOver(
      { result, icon, title, score, best, isRecord, extraInfo },
      () => { this._overlay.hide(); this._showStart(); this._game.restart(); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); if (this._state) this._refreshTable(this._state); }
  _onRestart() { this._tableEl.innerHTML = ''; this._showStart(); }

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
      .${ID}-title { color: #6688aa; font-size: 0.75rem; letter-spacing: 2px; }
      .${ID}-hint  { color: #334455; font-size: 0.6rem; letter-spacing: .5px; text-align: center; }
      .${ID}-grid {
        display: grid; gap: 2px; background: #1a2540;
        border: 2px solid #1a2540; max-width: min(90vw, 420px);
      }
      .${ID}-cell {
        width: min(48px, calc((min(90vw,420px) - 2px * 7) / 7));
        aspect-ratio: 1; position: relative; overflow: hidden;
      }
      .${ID}-cell--wall    { background: #080c18; }
      .${ID}-cell--clue    { background: #0e1828; }
      .${ID}-cell--white   {
        background: #d8e8f8; display: flex; align-items: center; justify-content: center;
        font-size: 1rem; font-weight: bold; color: #112233; cursor: pointer;
        transition: background .1s;
        font-family: Orbitron, monospace;
      }
      .${ID}-cell--white:hover { background: #c0d8f0; }
      .${ID}-cell--selected    { background: #aaccee !important; outline: 2px solid #3399ff; outline-offset: -2px; }
      .${ID}-cell--error       { background: #f0b0b0 !important; color: #880000; }
      .${ID}-clue-inner {
        position: absolute; inset: 0;
        display: flex; flex-direction: column; justify-content: space-between;
      }
      .${ID}-clue-inner::before {
        content: '';
        position: absolute; inset: 0;
        background: linear-gradient(to bottom right, transparent calc(50% - 1px), #2a3a5a 50%, transparent calc(50% + 1px));
      }
      .${ID}-clue-top, .${ID}-clue-bot {
        font-size: 0.55rem; font-weight: bold;
        color: #aabbcc; line-height: 1; padding: 2px 3px;
        font-family: sans-serif;
      }
      .${ID}-clue-top { align-self: flex-end; text-align: right; }
      .${ID}-clue-bot { align-self: flex-start; text-align: left; }
    `;
    document.head.appendChild(s);
  }
}
