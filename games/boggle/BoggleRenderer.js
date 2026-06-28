import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID = 'boggle';

export default class BoggleRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._vp       = viewport;
    this._cfg      = config;
    this._wrapper  = null;
    this._overlay  = null;
    this._state    = null;
    this._path     = [];   // [{row, col, idx}]
    this._selecting = false;

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

  // ── Layout ───────────────────────────────────────────────────

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = `${ID}-wrapper`;

    this._headerEl = document.createElement('div');
    this._headerEl.className = `${ID}-header`;

    this._gridEl = document.createElement('div');
    this._gridEl.className = `${ID}-grid`;

    this._wordEl = document.createElement('div');
    this._wordEl.className = `${ID}-word`;

    const btnRow = document.createElement('div');
    btnRow.className = `${ID}-btn-row`;

    this._submitBtn = document.createElement('button');
    this._submitBtn.className = `${ID}-btn`;
    this._submitBtn.textContent = 'VALIDER';
    this._submitBtn.addEventListener('click', () => this._submit());

    this._clearBtn = document.createElement('button');
    this._clearBtn.className = `${ID}-btn ${ID}-btn--ghost`;
    this._clearBtn.textContent = 'EFFACER';
    this._clearBtn.addEventListener('click', () => this._clearPath());

    btnRow.append(this._submitBtn, this._clearBtn);

    this._foundEl = document.createElement('div');
    this._foundEl.className = `${ID}-found`;

    this._wrapper.append(this._headerEl, this._gridEl, this._wordEl, btnRow, this._foundEl);
    this._vp.appendChild(this._wrapper);
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this._game.start(sel); },
      {
        extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.9;margin-bottom:4px">
          Clique sur des lettres adjacentes pour former un mot<br>
          Les lettres doivent se toucher (y compris en diagonale)<br>
          3 minutes — trouve le maximum de mots français !
        </div>`,
      }
    );
  }

  // ── Grid rendering ───────────────────────────────────────────

  _buildGrid(s) {
    this._gridEl.innerHTML = '';
    this._gridEl.style.gridTemplateColumns = `repeat(${s.size}, 1fr)`;
    const inPath = new Set(this._path.map(p => p.idx));

    s.grid.forEach((letter, idx) => {
      const btn = document.createElement('button');
      btn.className = `${ID}-cell`;
      btn.textContent = letter;
      btn.dataset.idx = idx;
      if (inPath.has(idx)) btn.classList.add(`${ID}-cell--sel`);
      btn.addEventListener('click', () => this._onCellClick(Math.floor(idx / s.size), idx % s.size, idx));
      this._gridEl.appendChild(btn);
    });
  }

  _updateGrid() {
    const inPath = new Set(this._path.map(p => p.idx));
    this._gridEl.querySelectorAll(`.${ID}-cell`).forEach(btn => {
      const idx = Number(btn.dataset.idx);
      btn.classList.toggle(`${ID}-cell--sel`, inPath.has(idx));
    });
  }

  _onCellClick(r, c, idx) {
    const s = this.state;
    if (!s || s.status !== 'playing') return;

    if (this._path.length === 0) {
      this._path = [{ r, c, idx }];
    } else {
      const last = this._path[this._path.length - 1];
      const alreadyUsed = this._path.some(p => p.idx === idx);
      const adjacent = Math.abs(r - last.r) <= 1 && Math.abs(c - last.c) <= 1 && !(r === last.r && c === last.c);

      if (alreadyUsed) {
        // Allow clicking last cell to submit
        if (idx === last.idx && this._path.length >= 3) { this._submit(); return; }
        this._clearPath();
        return;
      }
      if (!adjacent) { this._clearPath(); this._path = [{ r, c, idx }]; }
      else           this._path.push({ r, c, idx });
    }

    this._wordEl.textContent = this._currentWord();
    this._updateGrid();
  }

  _currentWord() {
    const s = this.state;
    return this._path.map(p => s.grid[p.idx]).join('');
  }

  _clearPath() {
    this._path = [];
    this._wordEl.textContent = '';
    this._updateGrid();
  }

  _submit() {
    const word = this._currentWord().toLowerCase();
    const res  = this._game.submitWord(word);
    if (res.ok) {
      this._wordEl.textContent = `✓ ${word.toUpperCase()} +${res.pts}`;
      this._wordEl.className   = `${ID}-word ${ID}-word--ok`;
    } else {
      this._wordEl.textContent = `✗ ${word.toUpperCase()} — ${res.reason}`;
      this._wordEl.className   = `${ID}-word ${ID}-word--err`;
    }
    this._path = [];
    this._updateGrid();
    setTimeout(() => {
      if (this._wordEl) {
        this._wordEl.textContent = '';
        this._wordEl.className   = `${ID}-word`;
      }
    }, 1200);
  }

  _refreshHeader(s) {
    const m = Math.floor(s.timeLeft / 60);
    const sec = s.timeLeft % 60;
    const time = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    const urgency = s.timeLeft < 30 ? `style="color:#e53e3e"` : '';
    this._headerEl.innerHTML =
      `<span class="${ID}-score">${s.score} pts</span>` +
      `<span class="${ID}-time" ${urgency}>${time}</span>` +
      `<span class="${ID}-found-count">${s.found.size} mots</span>`;
  }

  _refreshFound(s) {
    const words = [...s.found].sort((a, b) => b.length - a.length || a.localeCompare(b));
    this._foundEl.innerHTML = words
      .map(w => `<span class="${ID}-found-word">${w.toUpperCase()}</span>`)
      .join('');
  }

  // ── Events ───────────────────────────────────────────────────

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);

    this._onKey = e => {
      if (e.key === 'p' || e.key === 'P') { EventBus.emit('game:pause-toggle'); return; }
      if (e.key === 'r' || e.key === 'R') { this._game.restart(); return; }
      if (e.key === 'Enter' || e.key === 'Return') { this._submit(); return; }
      if (e.key === 'Escape') this._clearPath();
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
    this.state = state;
    if (state.status !== 'playing') return;
    if (action === 'play') { this._path = []; this._buildGrid(state); }
    if (action === 'word') this._refreshFound(state);
    this._refreshHeader(state);
  }

  _onOver(data) {
    this._overlay.showGameOver(
      data,
      () => { this._overlay.hide(); this._game.start({ mode: this.state?.mode }); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._path = []; this._showStart(); }

  // ── Styles ───────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;
    const s = document.createElement('style');
    s.id = `${ID}-styles`;
    s.textContent = `
      .${ID}-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; gap: 6px; padding: 8px 12px;
        box-sizing: border-box; font-family: Orbitron, monospace;
        background: #05080f; overflow: hidden;
      }
      .${ID}-header {
        display: flex; gap: 16px; align-items: center;
        font-size: 0.72rem; letter-spacing: 1px;
        width: 100%; justify-content: center; flex-wrap: wrap;
      }
      .${ID}-score { color: #ffe033; }
      .${ID}-time  { color: #88ffcc; }
      .${ID}-found-count { color: #88aaff; }
      .${ID}-grid {
        display: grid; gap: 6px;
        width: 100%; max-width: 300px;
      }
      .${ID}-cell {
        aspect-ratio: 1; width: 100%; min-height: 0;
        background: #0d1a30; border: 1.5px solid #1e3a6a;
        color: #cce4ff; font-size: clamp(0.9rem, 4vw, 1.4rem);
        font-family: Orbitron, monospace; font-weight: 700;
        border-radius: 8px; cursor: pointer; transition: all .12s;
        display: flex; align-items: center; justify-content: center;
      }
      .${ID}-cell:hover { background: #1a2a50; border-color: #4488ff; }
      .${ID}-cell--sel {
        background: #1a3a80; border-color: #5599ff;
        color: #ffffff; box-shadow: 0 0 10px rgba(85,153,255,.4);
        transform: scale(1.06);
      }
      .${ID}-word {
        min-height: 28px; color: #88aaff; font-size: 0.9rem;
        letter-spacing: 2px; text-align: center;
      }
      .${ID}-word--ok  { color: #48bb78; }
      .${ID}-word--err { color: #e53e3e; }
      .${ID}-btn-row { display: flex; gap: 8px; }
      .${ID}-btn {
        padding: 7px 20px; background: #0d2040; border: 1px solid #1e4080;
        color: #5599dd; font-family: Orbitron, monospace; font-size: 0.68rem;
        border-radius: 6px; cursor: pointer; letter-spacing: 1px;
        transition: background .2s, border-color .2s;
      }
      .${ID}-btn:hover { background: #1a3060; border-color: #3a70c0; }
      .${ID}-btn--ghost { color: #445566; border-color: #1a2a3a; }
      .${ID}-btn--ghost:hover { background: #0d1a30; color: #667788; }
      .${ID}-found {
        display: flex; flex-wrap: wrap; gap: 5px; justify-content: center;
        overflow-y: auto; max-height: 110px; width: 100%;
      }
      .${ID}-found-word {
        background: #0d1a30; border: 1px solid #1e3a6a; border-radius: 4px;
        color: #7aadff; font-size: 0.62rem; padding: 2px 7px; letter-spacing: 1px;
      }
    `;
    document.head.appendChild(s);
  }
}
