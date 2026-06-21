import EventBus    from '../../js/core/EventBus.js';
import GameOverlay  from '../../js/ui/components/GameOverlay.js';

export default class MemoryRenderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    this._wrapper   = null;
    this._infoBar   = null;
    this._gridArea  = null;
    this._gridEl    = null;
    this._cardEls   = [];

    this._movesEl = null;
    this._pairsEl = null;
    this._scoreEl = null;

    this._sel = { mode: 'basique', gridSize: '4×4' };

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init() {
    this._injectStyles();
    this._buildLayout();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    if (this._wrapper) this._wrapper.remove();
    document.getElementById('mem-styles')?.remove();
  }

  /* ============================================================
     STYLES
     ============================================================ */

  _injectStyles() {
    if (document.getElementById('mem-styles')) return;
    const el = document.createElement('style');
    el.id = 'mem-styles';
    el.textContent = `
      @keyframes mem-pop {
        0%   { transform: rotateY(180deg) scale(1); }
        40%  { transform: rotateY(180deg) scale(1.13); }
        100% { transform: rotateY(180deg) scale(1); }
      }
      @keyframes mem-shake {
        0%,100% { transform: rotateY(180deg) translateX(0); }
        20%     { transform: rotateY(180deg) translateX(-5px); }
        40%     { transform: rotateY(180deg) translateX(5px); }
        60%     { transform: rotateY(180deg) translateX(-3px); }
        80%     { transform: rotateY(180deg) translateX(3px); }
      }
      /* ---- Wrapper ---- */
      .mem-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column; align-items: center;
        padding: 8px; box-sizing: border-box;
        gap: 6px; font-family: Orbitron, monospace;
        overflow: hidden;
      }

      /* ---- Info bar ---- */
      .mem-info-bar {
        display: flex; align-items: center; justify-content: space-around;
        width: 100%; max-width: 480px; flex-shrink: 0;
        font-size: 8px; letter-spacing: 0.18em; color: rgba(0,255,225,0.4);
      }
      .mem-info-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
      .mem-info-stat span { color: rgba(0,255,225,0.85); font-weight: 700; font-size: 13px; }

      /* ---- Grid area ---- */
      .mem-grid-area {
        flex: 1; width: 100%;
        display: flex; align-items: center; justify-content: center;
        overflow: hidden;
      }

      /* ---- Grid ---- */
      .mem-grid { display: grid; gap: 6px; }

      /* ---- Card ---- */
      .mem-card {
        position: relative;
        cursor: pointer;
        perspective: 800px;
        border-radius: 8px;
        user-select: none;
      }
      .mem-card--done { cursor: default; }

      .mem-card-inner {
        width: 100%; height: 100%;
        position: relative;
        transform-style: preserve-3d;
        transition: transform 0.35s ease;
        border-radius: 8px;
      }
      .mem-card--flipped .mem-card-inner { transform: rotateY(180deg); }
      .mem-card--matched .mem-card-inner {
        transform: rotateY(180deg);
        animation: mem-pop 0.4s ease 0.05s;
      }
      .mem-card--shake .mem-card-inner { animation: mem-shake 0.4s ease; }

      /* Card cover (face cachée) */
      .mem-card-cover,
      .mem-card-face {
        position: absolute; inset: 0;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
      }
      .mem-card-cover {
        background: linear-gradient(135deg, #0c1e35 0%, #0f2845 50%, #0a1828 100%);
        border: 1px solid rgba(0,255,225,0.18);
        box-shadow: inset 0 0 18px rgba(0,0,0,0.5);
        overflow: hidden;
      }
      .mem-card-cover::before {
        content: '';
        position: absolute; inset: 5px;
        border: 1px solid rgba(0,255,225,0.1);
        border-radius: 4px;
      }
      .mem-card-cover::after {
        content: '✦';
        font-size: 14px;
        color: rgba(0,255,225,0.1);
      }

      /* Card face (symbole) */
      .mem-card-face {
        transform: rotateY(180deg);
        background: #091320;
        border: 1px solid rgba(0,255,225,0.12);
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .mem-card--matched .mem-card-face {
        border-color: rgba(0,255,100,0.45);
        background: rgba(0,28,14,0.9);
        box-shadow: 0 0 14px rgba(0,255,100,0.2);
      }
      .mem-card-symbol { line-height: 1; }

      /* Écrans démarrage / pause / fin de partie : entièrement gérés par
         GameOverlay (js/ui/components/GameOverlay.js), monté sur .mem-wrapper.
         Voir .ov-* dans index.html pour le CSS associé. */
    `;
    document.head.appendChild(el);
  }

  /* ============================================================
     LAYOUT
     ============================================================ */

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'mem-wrapper';

    /* Info bar */
    this._infoBar = document.createElement('div');
    this._infoBar.className = 'mem-info-bar';
    this._infoBar.innerHTML = `
      <div class="mem-info-stat">COUPS<span id="mem-moves">0</span></div>
      <div class="mem-info-stat">PAIRES<span id="mem-pairs">0/0</span></div>
      <div class="mem-info-stat">SCORE<span id="mem-score">0</span></div>
    `;
    this._wrapper.appendChild(this._infoBar);

    /* Grid area */
    this._gridArea = document.createElement('div');
    this._gridArea.className = 'mem-grid-area';
    this._gridEl = document.createElement('div');
    this._gridEl.className = 'mem-grid';
    this._gridArea.appendChild(this._gridEl);
    this._wrapper.appendChild(this._gridArea);

    /* Overlay — module partagé */
    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this.viewport.appendChild(this._wrapper);

    this._movesEl = document.getElementById('mem-moves');
    this._pairsEl = document.getElementById('mem-pairs');
    this._scoreEl = document.getElementById('mem-score');
  }

  /* ============================================================
     OVERLAYS
     ============================================================ */

  _optionGroups() {
    const { gridOptions } = this.config.gameplay;
    return [
      { key: 'mode',     label: 'MODE',   default: 'basique',       options: [{ value: 'basique', label: 'BASIQUE' }] },
      { key: 'gridSize', label: 'GRILLE', default: this._sel.gridSize, options: gridOptions.map(g => ({ value: g, label: g })) },
    ];
  }

  _showStartScreen() {
    this._overlay.showStart(this._optionGroups(), (selections) => {
      this._sel = selections;
      this.game.start(this._sel);
    });
  }

  _showWinScreen({ score, moves, best }) {
    const isRecord = score >= best && score > 0;
    this._overlay.showGameOver({
      result: 'win',
      title:  'TOUTES LES PAIRES !',
      score,
      isRecord,
      extraInfo: `<div class="overlay-score">${moves} coup${moves !== 1 ? 's' : ''}</div>`,
    }, () => this._goToStartScreen());
  }

  _goToStartScreen() {
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

  _onTick({ state, action, indices }) {
    if (state.status === 'idle') {
      this._overlay.show();
      return;
    }
    if (state.status === 'playing') {
      this._overlay.hide();
      this._render(state, action, indices);
    }
  }

  _onWon(data)  { this._showWinScreen(data); }
  _onPaused()   { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed()  { this._overlay.hide(); }
  _onRestart()  {
    this._goToStartScreen();
    this._gridEl.innerHTML = '';
    this._cardEls = [];
    this._updateInfoBar(0, 0, 0);
  }

  /* ============================================================
     RENDU
     ============================================================ */

  _render(state, action, indices) {
    if (action === 'new-game') {
      this._buildGrid(state);
    } else {
      this._updateGrid(state, action, indices);
    }
    this._updateInfoBar(state.moves, state.matches, state.totalPairs);
  }

  _buildGrid(state) {
    this._gridEl.innerHTML = '';
    this._cardEls = [];

    const cardSize = this._computeCardSize(state.cols, state.rows);
    const fontSize = Math.max(16, Math.min(Math.floor(cardSize * 0.48), 42));

    this._gridEl.style.gridTemplateColumns = `repeat(${state.cols}, ${cardSize}px)`;
    this._gridEl.style.gridTemplateRows    = `repeat(${state.rows}, ${cardSize}px)`;

    state.cards.forEach((card, index) => {
      const el = document.createElement('div');
      el.className = 'mem-card';
      el.innerHTML = `
        <div class="mem-card-inner">
          <div class="mem-card-cover"></div>
          <div class="mem-card-face">
            <span class="mem-card-symbol" style="font-size:${fontSize}px">${card.symbol}</span>
          </div>
        </div>
      `;
      el.addEventListener('click', () => this.game.flipCard(index));
      this._gridEl.appendChild(el);
      this._cardEls.push(el);
    });
  }

  _updateGrid(state, action, indices) {
    state.cards.forEach((card, i) => {
      const el = this._cardEls[i];
      if (!el) return;

      el.classList.remove('mem-card--shake');
      el.classList.toggle('mem-card--flipped', card.flipped && !card.matched);
      el.classList.toggle('mem-card--matched',  card.matched);
      el.classList.toggle('mem-card--done',     card.matched);
    });

    if (action === 'no-match' && indices) {
      indices.forEach(i => {
        const el = this._cardEls[i];
        if (!el) return;
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('mem-card--shake')));
      });
    }
  }

  _computeCardSize(cols, rows) {
    const vpW   = this.viewport.clientWidth  || 400;
    const vpH   = this.viewport.clientHeight || 500;
    const pad   = 16;
    const infoH = 44;
    const gap   = 6;

    const availW = vpW - pad;
    const availH = vpH - pad - infoH;

    const fromW = Math.floor((availW - gap * (cols - 1)) / cols);
    const fromH = Math.floor((availH - gap * (rows - 1)) / rows);

    return Math.min(fromW, fromH, 100);
  }

  _updateInfoBar(moves, matches, totalPairs) {
    if (this._movesEl) this._movesEl.textContent = moves;
    if (this._pairsEl) this._pairsEl.textContent = `${matches}/${totalPairs}`;
    if (this._scoreEl) this._scoreEl.textContent = this.game.state?.score ?? 0;
  }
}
