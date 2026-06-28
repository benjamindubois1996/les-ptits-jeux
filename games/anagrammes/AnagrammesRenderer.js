import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID = 'anagrammes';

export default class AnagrammesRenderer {
  constructor(game, viewport, config) {
    this._game    = game;
    this._vp      = viewport;
    this._cfg     = config;
    this._wrapper = null;
    this._overlay = null;
    this._state   = null;

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

    this._lettersEl = document.createElement('div');
    this._lettersEl.className = `${ID}-letters`;

    const inputRow = document.createElement('div');
    inputRow.className = `${ID}-input-row`;

    this._inputEl = document.createElement('input');
    this._inputEl.className = `${ID}-input`;
    this._inputEl.type        = 'text';
    this._inputEl.maxLength   = 8;
    this._inputEl.placeholder = 'Ton mot…';
    this._inputEl.autocomplete = 'off';
    this._inputEl.autocorrect  = 'off';
    this._inputEl.spellcheck   = false;

    this._submitBtn = document.createElement('button');
    this._submitBtn.className   = `${ID}-btn`;
    this._submitBtn.textContent = 'OK';
    this._submitBtn.addEventListener('click', () => this._submit());

    this._shuffleBtn = document.createElement('button');
    this._shuffleBtn.className   = `${ID}-btn ${ID}-btn--ghost`;
    this._shuffleBtn.textContent = '🔀';
    this._shuffleBtn.title = 'Mélanger les lettres';
    this._shuffleBtn.addEventListener('click', () => this._game.shuffle());

    inputRow.append(this._inputEl, this._submitBtn, this._shuffleBtn);

    this._feedbackEl = document.createElement('div');
    this._feedbackEl.className = `${ID}-feedback`;

    this._foundEl = document.createElement('div');
    this._foundEl.className = `${ID}-found`;

    this._nextBtn = document.createElement('button');
    this._nextBtn.className   = `${ID}-next-btn`;
    this._nextBtn.textContent = 'MANCHE SUIVANTE →';
    this._nextBtn.style.display = 'none';
    this._nextBtn.addEventListener('click', () => { this._nextBtn.style.display = 'none'; this._game.nextRound(); });

    this._wrapper.append(this._headerEl, this._lettersEl, inputRow, this._feedbackEl, this._foundEl, this._nextBtn);
    this._vp.appendChild(this._wrapper);
  }

  _showStart() {
    this._overlay.showStart(
      [
        { key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] },
        { key: 'letterCount', label: 'LETTRES', default: '7', options: [
            { value: '5', label: '5' },
            { value: '6', label: '6' },
            { value: '7', label: '7' },
          ]
        },
      ],
      sel => {
        this._overlay.hide();
        this._game.start({ ...sel, letterCount: sel.letterCount });
        this._inputEl?.focus();
      },
      {
        extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.9;margin-bottom:4px">
          Lettres tirées au sort — forme des mots français<br>
          5 manches · 3 minutes · Entre les mots avec le clavier<br>
          Utilise toutes les lettres pour un bonus !
        </div>`,
      }
    );
  }

  _renderLetters(letters) {
    this._lettersEl.innerHTML = '';
    for (const l of letters) {
      const span = document.createElement('span');
      span.className   = `${ID}-tile`;
      span.textContent = l;
      this._lettersEl.appendChild(span);
    }
  }

  _submit() {
    const word = (this._inputEl?.value ?? '').trim();
    if (!word) return;
    const res = this._game.submitWord(word);
    this._inputEl.value = '';
    this._inputEl.focus();

    if (res.ok) {
      this._showFeedback(`✓ ${word.toUpperCase()} +${res.pts}`, 'ok');
    } else {
      this._showFeedback(`✗ ${word.toUpperCase()} — ${res.reason}`, 'err');
    }
  }

  _showFeedback(text, type) {
    this._feedbackEl.textContent = text;
    this._feedbackEl.className   = `${ID}-feedback ${ID}-feedback--${type}`;
    clearTimeout(this._feedbackTimer);
    this._feedbackTimer = setTimeout(() => {
      if (this._feedbackEl) {
        this._feedbackEl.textContent = '';
        this._feedbackEl.className   = `${ID}-feedback`;
      }
    }, 1400);
  }

  _refreshHeader(s) {
    const m   = Math.floor(s.timeLeft / 60);
    const sec = s.timeLeft % 60;
    const time = `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    const urg  = s.timeLeft < 30 ? ' style="color:#e53e3e"' : '';
    this._headerEl.innerHTML =
      `<span class="${ID}-score">${s.score} pts</span>` +
      `<span class="${ID}-time"${urg}>${time}</span>` +
      `<span class="${ID}-round">Manche ${s.round}/${s.cfg.roundsTotal}</span>`;
  }

  _refreshFound(s) {
    const words = [...s.foundInRound].sort((a, b) => b.length - a.length || a.localeCompare(b));
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

    this._inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this._submit(); }
    });

    this._onKey = e => {
      // Don't catch P/R if input has focus (typing letters)
      if (document.activeElement === this._inputEl) return;
      if (e.key === 'p' || e.key === 'P') { EventBus.emit('game:pause-toggle'); return; }
      if (e.key === 'r' || e.key === 'R') this._game.restart();
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
    clearTimeout(this._feedbackTimer);
  }

  _onTick({ state, action }) {
    this._state = state;
    if (state.status !== 'playing') return;

    if (action === 'play' || action === 'round' || action === 'shuffle') {
      if (action !== 'shuffle') {
        this._nextBtn.style.display = 'none';
        this._foundEl.innerHTML = '';
      }
      this._renderLetters(state.letters);
    }
    if (action === 'word') {
      this._refreshFound(state);
      // Show "next round" button after scoring a word if rounds remain
      if (state.foundInRound.size >= 3 && state.round < state.cfg.roundsTotal) {
        this._nextBtn.style.display = 'block';
      }
    }
    this._refreshHeader(state);
  }

  _onOver(data) {
    this._overlay.showGameOver(
      data,
      () => { this._overlay.hide(); this._game.start({ mode: this._state?.mode }); this._inputEl?.focus(); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); this._inputEl?.focus(); }
  _onRestart() { this._showStart(); }

  // ── Styles ───────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;
    const s = document.createElement('style');
    s.id = `${ID}-styles`;
    s.textContent = `
      .${ID}-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; gap: 8px; padding: 10px 14px;
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
      .${ID}-round { color: #88aaff; }
      .${ID}-letters {
        display: flex; gap: 7px; flex-wrap: wrap; justify-content: center;
        margin: 8px 0;
      }
      .${ID}-tile {
        width: 46px; height: 52px; background: #0d1a30;
        border: 2px solid #1e3a6a; border-radius: 8px;
        color: #cce4ff; font-size: 1.35rem; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        box-shadow: inset 0 -3px 0 rgba(0,0,0,0.4);
        letter-spacing: 0; user-select: none;
      }
      .${ID}-input-row { display: flex; gap: 6px; align-items: center; width: 100%; max-width: 340px; }
      .${ID}-input {
        flex: 1; height: 38px; background: #0d1a30; border: 1.5px solid #1e3a6a;
        border-radius: 6px; color: #cce4ff; font-family: Orbitron, monospace;
        font-size: 0.85rem; font-weight: 600; letter-spacing: 2px;
        padding: 0 10px; text-transform: uppercase; outline: none;
        transition: border-color .2s;
      }
      .${ID}-input:focus { border-color: #4488ff; }
      .${ID}-btn {
        height: 38px; padding: 0 14px; background: #0d2040;
        border: 1.5px solid #1e4080; color: #5599dd;
        font-family: Orbitron, monospace; font-size: 0.7rem; font-weight: 700;
        border-radius: 6px; cursor: pointer; letter-spacing: 1px;
        transition: background .2s;
      }
      .${ID}-btn:hover { background: #1a3060; border-color: #3a70c0; }
      .${ID}-btn--ghost { color: #445566; border-color: #1a2a3a; font-size: 1rem; }
      .${ID}-btn--ghost:hover { background: #0d1a30; color: #8899aa; }
      .${ID}-feedback {
        min-height: 26px; font-size: 0.8rem; letter-spacing: 1.5px;
        color: #88aaff; text-align: center;
      }
      .${ID}-feedback--ok  { color: #48bb78; }
      .${ID}-feedback--err { color: #e53e3e; }
      .${ID}-found {
        display: flex; flex-wrap: wrap; gap: 5px; justify-content: center;
        overflow-y: auto; max-height: 100px; width: 100%;
      }
      .${ID}-found-word {
        background: #0d1a30; border: 1px solid #1e3a6a; border-radius: 4px;
        color: #7aadff; font-size: 0.62rem; padding: 3px 8px; letter-spacing: 1px;
      }
      .${ID}-next-btn {
        margin-top: auto; padding: 9px 22px; background: #0a2a10;
        border: 1.5px solid #1a6030; color: #44cc66;
        font-family: Orbitron, monospace; font-size: 0.68rem; font-weight: 700;
        border-radius: 6px; cursor: pointer; letter-spacing: 1px;
        transition: background .2s;
      }
      .${ID}-next-btn:hover { background: #143a18; border-color: #2a8040; }
    `;
    document.head.appendChild(s);
  }
}
