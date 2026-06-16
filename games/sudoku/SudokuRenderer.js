import EventBus from '../../js/core/EventBus.js';

export default class SudokuRenderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    this._wrapper    = null;
    this._infoBar    = null;
    this._gridEl     = null;
    this._numpadEl   = null;
    this._overlayEl  = null;
    this._cellEls    = []; // flat array [row*9+col]

    this._timerEl    = null;
    this._casesEl    = null;

    this._sel = { mode: 'basique', difficulty: 'moyen' };

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init()    { this._injectStyles(); this._buildLayout(); this._bindEvents(); }
  destroy() {
    this._unbindEvents();
    if (this._wrapper) this._wrapper.remove();
    document.getElementById('sdk-styles')?.remove();
  }

  /* ============================================================
     STYLES
     ============================================================ */

  _injectStyles() {
    if (document.getElementById('sdk-styles')) return;
    const el = document.createElement('style');
    el.id = 'sdk-styles';
    el.textContent = `
      @keyframes sdk-fadein {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes sdk-pop {
        0%   { transform: scale(1); }
        40%  { transform: scale(1.08); }
        100% { transform: scale(1); }
      }
      @keyframes sdk-win-cell {
        0%,100% { background: rgba(0,255,100,0.08); }
        50%     { background: rgba(0,255,100,0.22); }
      }

      /* ---- Wrapper ---- */
      .sdk-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column; align-items: center;
        padding: 8px; box-sizing: border-box;
        gap: 6px; font-family: Orbitron, monospace;
        overflow: hidden;
      }

      /* ---- Info bar ---- */
      .sdk-info-bar {
        display: flex; align-items: center; justify-content: space-around;
        width: 100%; flex-shrink: 0;
        font-size: 8px; letter-spacing: 0.18em; color: rgba(0,255,225,0.4);
      }
      .sdk-info-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
      .sdk-info-stat span { color: rgba(0,255,225,0.85); font-weight: 700; font-size: 13px; }

      /* ---- Board area ---- */
      .sdk-board-area {
        flex: 1; width: 100%;
        display: flex; align-items: center; justify-content: center;
        overflow: hidden;
      }

      /* ---- Grid ---- */
      .sdk-grid {
        display: grid;
        grid-template-columns: repeat(9, 1fr);
        border: 2px solid rgba(0,255,225,0.6);
        border-radius: 4px;
        overflow: hidden;
        flex-shrink: 0;
      }

      /* ---- Cell ---- */
      .sdk-cell {
        display: flex; align-items: center; justify-content: center;
        border-right: 1px solid rgba(0,255,225,0.15);
        border-bottom: 1px solid rgba(0,255,225,0.15);
        cursor: pointer;
        user-select: none;
        box-sizing: border-box;
        font-weight: 700;
        transition: background 0.08s;
        position: relative;
      }
      .sdk-cell:nth-child(9n)      { border-right: none; }
      .sdk-cell:nth-last-child(-n+9) { border-bottom: none; }

      /* Box boundaries */
      .sdk-cell--box-right  { border-right: 2px solid rgba(0,255,225,0.55) !important; }
      .sdk-cell--box-bottom { border-bottom: 2px solid rgba(0,255,225,0.55) !important; }

      /* States */
      .sdk-cell--zone      { background: rgba(0,255,225,0.05); }
      .sdk-cell--same-val  { background: rgba(0,255,225,0.12); }
      .sdk-cell--selected  { background: rgba(0,255,225,0.22) !important; }
      .sdk-cell--conflict  { background: rgba(255,60,60,0.18) !important; }
      .sdk-cell--win       { animation: sdk-win-cell 1s ease infinite; }

      /* Number styling */
      .sdk-cell-num         { line-height: 1; }
      .sdk-cell-num--given  { color: rgba(0,255,225,0.6); }
      .sdk-cell-num--user   { color: rgba(255,255,255,0.92); }
      .sdk-cell-num--conflict { color: rgba(255,100,100,0.95) !important; }

      /* ---- Numpad ---- */
      .sdk-numpad {
        display: flex; gap: 4px; flex-shrink: 0;
        justify-content: center; align-items: center;
      }
      .sdk-num-btn {
        font-family: Orbitron, monospace; font-weight: 700;
        border: 1px solid rgba(0,255,225,0.22); background: #0a1520;
        color: rgba(0,255,225,0.7); cursor: pointer;
        border-radius: 4px; transition: all 0.12s;
        display: flex; align-items: center; justify-content: center;
      }
      .sdk-num-btn:hover  { border-color: rgba(0,255,225,0.55); color: rgba(0,255,225,1); background: rgba(0,255,225,0.08); }
      .sdk-num-btn:active { transform: scale(0.92); }
      .sdk-num-btn--clear { color: rgba(255,100,100,0.7); border-color: rgba(255,100,100,0.22); }
      .sdk-num-btn--clear:hover { color: rgba(255,100,100,1); border-color: rgba(255,100,100,0.55); background: rgba(255,60,60,0.08); }

      /* ---- Overlay ---- */
      .sdk-overlay {
        position: absolute; inset: 0;
        background: rgba(5,8,15,0.94); backdrop-filter: blur(5px);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 8px; z-index: 20; border-radius: inherit;
        animation: sdk-fadein 0.2s ease;
      }
      .sdk-overlay.sdk-overlay--hidden { display: none; }

      .sdk-ov-title {
        font-size: clamp(22px, 5vw, 32px); font-weight: 900;
        letter-spacing: 0.2em; color: rgba(0,255,225,0.95);
        text-shadow: 0 0 20px rgba(0,255,225,0.4);
      }
      .sdk-ov-sub {
        font-size: clamp(14px, 3.2vw, 20px); font-weight: 900; letter-spacing: 0.12em;
      }
      .sdk-ov-info { font-size: 10px; letter-spacing: 0.12em; color: rgba(0,255,225,0.45); }

      .sdk-opt-group { display: flex; flex-direction: column; align-items: center; gap: 5px; }
      .sdk-opt-label { font-size: 8px; letter-spacing: 0.22em; color: rgba(0,255,225,0.4); }
      .sdk-chips     { display: flex; gap: 5px; flex-wrap: wrap; justify-content: center; }
      .sdk-chip {
        font-family: Orbitron, monospace; font-size: 10px; font-weight: 700;
        letter-spacing: 0.06em; padding: 5px 11px; border-radius: 4px;
        border: 1px solid rgba(0,255,225,0.22); background: #0a1520;
        color: rgba(0,255,225,0.55); cursor: pointer; transition: all 0.14s;
      }
      .sdk-chip:hover { border-color: rgba(0,255,225,0.5); color: rgba(0,255,225,0.85); }
      .sdk-chip--on {
        background: rgba(0,255,225,0.11); border-color: rgba(0,255,225,0.6);
        color: rgba(0,255,225,1); box-shadow: 0 0 8px rgba(0,255,225,0.18);
      }

      .sdk-play-btn {
        font-family: Orbitron, monospace; font-size: 13px; font-weight: 900;
        letter-spacing: 0.2em; padding: 11px 36px; border-radius: 6px;
        border: 2px solid rgba(0,255,225,0.55); background: rgba(0,255,225,0.07);
        color: rgba(0,255,225,0.95); cursor: pointer; transition: all 0.2s; margin-top: 4px;
      }
      .sdk-play-btn:hover {
        background: rgba(0,255,225,0.15); border-color: rgba(0,255,225,0.9);
        box-shadow: 0 0 16px rgba(0,255,225,0.28);
      }
    `;
    document.head.appendChild(el);
  }

  /* ============================================================
     LAYOUT
     ============================================================ */

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'sdk-wrapper';

    /* Info bar */
    this._infoBar = document.createElement('div');
    this._infoBar.className = 'sdk-info-bar';
    this._infoBar.innerHTML = `
      <div class="sdk-info-stat">TEMPS<span id="sdk-timer">00:00</span></div>
      <div class="sdk-info-stat">DIFFICULTÉ<span id="sdk-diff">-</span></div>
      <div class="sdk-info-stat">ERREURS<span id="sdk-errors">0</span></div>
    `;
    this._wrapper.appendChild(this._infoBar);

    /* Board area */
    const boardArea = document.createElement('div');
    boardArea.className = 'sdk-board-area';
    this._gridEl = document.createElement('div');
    this._gridEl.className = 'sdk-grid';
    boardArea.appendChild(this._gridEl);
    this._wrapper.appendChild(boardArea);

    /* Numpad */
    this._numpadEl = document.createElement('div');
    this._numpadEl.className = 'sdk-numpad';
    for (let n = 1; n <= 9; n++) {
      const btn = document.createElement('button');
      btn.className  = 'sdk-num-btn';
      btn.dataset.n  = n;
      btn.textContent = n;
      btn.addEventListener('click', () => this.game.inputNumber(n));
      this._numpadEl.appendChild(btn);
    }
    const clrBtn = document.createElement('button');
    clrBtn.className  = 'sdk-num-btn sdk-num-btn--clear';
    clrBtn.textContent = '✕';
    clrBtn.addEventListener('click', () => this.game.clearCell());
    this._numpadEl.appendChild(clrBtn);
    this._wrapper.appendChild(this._numpadEl);

    /* Overlay */
    this._overlayEl = document.createElement('div');
    this._overlayEl.className = 'sdk-overlay';
    this._showStartScreen();
    this._wrapper.appendChild(this._overlayEl);

    this.viewport.appendChild(this._wrapper);
    this._timerEl  = document.getElementById('sdk-timer');
    this._errorsEl = document.getElementById('sdk-errors');
    this._diffEl   = document.getElementById('sdk-diff');

    this._sizeNumpad();
  }

  /* ============================================================
     OVERLAYS
     ============================================================ */

  _showStartScreen() {
    const { difficulties } = this.config.gameplay;
    this._overlayEl.innerHTML = `
      <div class="sdk-ov-title">SUDOKU</div>

      <div class="sdk-opt-group">
        <div class="sdk-opt-label">MODE</div>
        <div class="sdk-chips" data-opt="mode">
          <button class="sdk-chip sdk-chip--on" data-val="basique">BASIQUE</button>
        </div>
      </div>

      <div class="sdk-opt-group">
        <div class="sdk-opt-label">DIFFICULTÉ</div>
        <div class="sdk-chips" data-opt="difficulty">
          ${difficulties.map(d => `<button class="sdk-chip${d === this._sel.difficulty ? ' sdk-chip--on' : ''}" data-val="${d}">${d.toUpperCase()}</button>`).join('')}
        </div>
      </div>

      <button class="sdk-play-btn" id="sdk-play-btn">JOUER</button>
      <div class="sdk-ov-info">↑↓←→ naviguer · 1–9 remplir · Suppr effacer</div>
    `;

    this._overlayEl.querySelectorAll('.sdk-chips').forEach(group => {
      group.addEventListener('click', e => {
        const btn = e.target.closest('.sdk-chip');
        if (!btn) return;
        const opt = group.dataset.opt;
        this._sel[opt] = btn.dataset.val;
        group.querySelectorAll('.sdk-chip').forEach(b => b.classList.remove('sdk-chip--on'));
        btn.classList.add('sdk-chip--on');
      });
    });

    this._overlayEl.querySelector('#sdk-play-btn')
      ?.addEventListener('click', () => this.game.start(this._sel));
  }

  _showWinScreen({ score, timer, best }) {
    const isRecord = score >= best && score > 0;
    this._overlayEl.innerHTML = `
      <div style="font-size:36px">🎉</div>
      <div class="sdk-ov-sub" style="color:#00ff88">SUDOKU RÉSOLU !</div>
      <div class="sdk-ov-info">Temps : ${this._formatTime(timer)}</div>
      <div class="sdk-ov-info">+${score} pts</div>
      ${isRecord ? '<div class="sdk-ov-info" style="color:#ffe600">🏆 Nouveau record !</div>' : ''}
      <button class="sdk-play-btn" id="sdk-ov-replay">REJOUER</button>
      <div class="sdk-ov-info" style="margin-top:2px;opacity:0.5">R pour rejouer</div>
    `;
    this._overlayEl.classList.remove('sdk-overlay--hidden');
    document.getElementById('sdk-ov-replay')
      ?.addEventListener('click', () => this._goToStartScreen());
  }

  _showPauseScreen() {
    this._overlayEl.innerHTML = `
      <div style="font-size:34px">⏸</div>
      <div class="sdk-ov-sub">PAUSE</div>
      <button class="sdk-play-btn" id="sdk-ov-resume">REPRENDRE</button>
    `;
    this._overlayEl.classList.remove('sdk-overlay--hidden');
    document.getElementById('sdk-ov-resume')
      ?.addEventListener('click', () => EventBus.emit('game:pause-toggle'));
    const gs = document.getElementById('gs-overlay');
    if (gs) gs.classList.add('hidden');
  }

  _goToStartScreen() {
    this._overlayEl.classList.remove('sdk-overlay--hidden');
    this._showStartScreen();
  }

  /* ============================================================
     ÉVÉNEMENTS
     ============================================================ */

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
    if (state.status === 'idle') {
      this._overlayEl.classList.remove('sdk-overlay--hidden');
      return;
    }
    if (state.status === 'playing') {
      this._overlayEl.classList.add('sdk-overlay--hidden');
      if (action === 'new-game') {
        this._buildGrid(state);
      } else if (action === 'timer') {
        this._updateTimer(state.timer);
      } else {
        this._renderCells(state);
        if (action === 'input') this._updateNumpad(state.grid);
      }
      this._updateInfoBar(state);
    }
  }

  _onWon(data)  { this._showWinScreen(data); }
  _onPaused()   { this._showPauseScreen(); }
  _onResumed()  {
    this._overlayEl.classList.add('sdk-overlay--hidden');
    const gs = document.getElementById('gs-overlay');
    if (gs) gs.classList.add('hidden');
  }
  _onRestart()  {
    this._goToStartScreen();
    this._gridEl.innerHTML = '';
    this._cellEls = [];
    if (this._timerEl)  this._timerEl.textContent  = '00:00';
    if (this._errorsEl) this._errorsEl.textContent = '0';
    if (this._diffEl)   this._diffEl.textContent   = '-';
    this._resetNumpad();
  }

  /* ============================================================
     RENDU
     ============================================================ */

  _buildGrid(state) {
    this._gridEl.innerHTML = '';
    this._cellEls = [];

    const size = this._computeCellSize();
    const fontSize = Math.max(12, Math.floor(size * 0.46));

    this._gridEl.style.width  = `${size * 9 + 2}px`;
    this._gridEl.style.height = `${size * 9 + 2}px`;
    this._sizeNumpad(size);

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const idx = r * 9 + c;
        const el  = document.createElement('div');
        el.className = 'sdk-cell';
        el.style.width    = `${size}px`;
        el.style.height   = `${size}px`;
        el.style.fontSize = `${fontSize}px`;

        if (c === 2 || c === 5) el.classList.add('sdk-cell--box-right');
        if (r === 2 || r === 5) el.classList.add('sdk-cell--box-bottom');

        const numEl = document.createElement('span');
        numEl.className = 'sdk-cell-num';
        const v = state.grid[r][c];
        if (v !== 0) {
          numEl.textContent = v;
          numEl.classList.add(state.given[r][c] ? 'sdk-cell-num--given' : 'sdk-cell-num--user');
        }
        el.appendChild(numEl);
        el.addEventListener('click', () => this.game.selectCell(r, c));

        this._gridEl.appendChild(el);
        this._cellEls.push(el);
      }
    }

    this._renderCells(state);
    this._updateInfoBar(state);
    this._updateNumpad(state.grid);
  }

  _renderCells(state) {
    const { grid, given, selected, conflicts } = state;
    const conflictSet = new Set(conflicts);

    const selVal  = selected ? grid[selected.row][selected.col] : 0;
    const selRow  = selected ? selected.row : -1;
    const selCol  = selected ? selected.col : -1;
    const selBoxR = selRow >= 0 ? Math.floor(selRow / 3) * 3 : -1;
    const selBoxC = selCol >= 0 ? Math.floor(selCol / 3) * 3 : -1;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const idx     = r * 9 + c;
        const el      = this._cellEls[idx];
        const numEl   = el.querySelector('.sdk-cell-num');
        const key     = `${r},${c}`;
        const v       = grid[r][c];
        const isConfl = conflictSet.has(key);
        const isSel   = selected && r === selRow && c === selCol;
        const inZone  = selected && !isSel && (
          r === selRow || c === selCol ||
          (Math.floor(r/3)*3 === selBoxR && Math.floor(c/3)*3 === selBoxC)
        );
        const sameVal = selected && !isSel && selVal !== 0 && v === selVal;

        el.classList.toggle('sdk-cell--selected',  isSel);
        el.classList.toggle('sdk-cell--same-val',  sameVal);
        el.classList.toggle('sdk-cell--zone',      inZone && !sameVal);
        el.classList.toggle('sdk-cell--conflict',  isConfl);

        numEl.textContent = v !== 0 ? v : '';
        numEl.className   = 'sdk-cell-num';
        if (v !== 0) {
          if (isConfl)       numEl.classList.add('sdk-cell-num--conflict');
          else if (given[r][c]) numEl.classList.add('sdk-cell-num--given');
          else               numEl.classList.add('sdk-cell-num--user');
        }
      }
    }
  }

  /* ============================================================
     INFO BAR
     ============================================================ */

  _updateInfoBar(state) {
    this._updateTimer(state.timer);
    if (this._diffEl)   this._diffEl.textContent   = state.difficulty?.toUpperCase() ?? '-';
    if (this._errorsEl) this._errorsEl.textContent = state.errors ?? 0;
  }

  _updateNumpad(grid) {
    const flat = grid.flat();
    this._numpadEl.querySelectorAll('.sdk-num-btn[data-n]').forEach(btn => {
      const n     = parseInt(btn.dataset.n);
      const count = flat.filter(v => v === n).length;
      const done  = count >= 9;
      btn.disabled = done;
      btn.style.opacity      = done ? '0.2' : '';
      btn.style.pointerEvents = done ? 'none' : '';
    });
  }

  _resetNumpad() {
    this._numpadEl.querySelectorAll('.sdk-num-btn[data-n]').forEach(btn => {
      btn.disabled = false;
      btn.style.opacity      = '';
      btn.style.pointerEvents = '';
    });
  }

  _updateTimer(secs) {
    if (this._timerEl) this._timerEl.textContent = this._formatTime(secs);
  }

  /* ============================================================
     CALCUL DES TAILLES
     ============================================================ */

  _computeCellSize() {
    const vpW   = this.viewport.clientWidth  || 420;
    const vpH   = this.viewport.clientHeight || 500;
    const pad   = 16;
    const infoH = 38;
    const numH  = 38;
    const gaps  = 12;

    const aw = vpW - pad;
    const ah = vpH - pad - infoH - numH - gaps;
    const fromW = Math.floor((aw - 2) / 9);
    const fromH = Math.floor((ah - 2) / 9);
    return Math.max(28, Math.min(fromW, fromH, 58));
  }

  _sizeNumpad(cellSize) {
    const size = cellSize ?? this._computeCellSize();
    const btnSize = Math.max(24, Math.min(size, 38));
    this._numpadEl.querySelectorAll('.sdk-num-btn').forEach(btn => {
      btn.style.width    = `${btnSize}px`;
      btn.style.height   = `${btnSize}px`;
      btn.style.fontSize = `${Math.floor(btnSize * 0.44)}px`;
    });
  }

  /* ============================================================
     UTILITAIRES
     ============================================================ */

  _formatTime(secs) {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  }
}
