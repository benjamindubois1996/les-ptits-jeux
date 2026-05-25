/**
 * WordleRenderer.js — Rendu DOM du Wordle v2
 *
 * Nouveautés v2 :
 *  - Sélecteur de longueur de mot
 *  - Barre de stats : vies + progression série + timer
 *  - Légende des couleurs
 *  - Animations plus rapides
 *  - Gestion série / infini / next-word
 *  - Reset clavier entre les mots
 */

import EventBus from '../../js/core/EventBus.js';

/* ============================================================
   CONSTANTES
   ============================================================ */
const FLIP_DELAY    = 200;   // ms entre tuiles (#2 plus rapide)
const FLIP_DURATION = 350;   // ms durée flip

const KEYBOARD_ROWS = [
  ['A','Z','E','R','T','Y','U','I','O','P'],
  ['Q','S','D','F','G','H','J','K','L','M'],
  ['ENTER','W','X','C','V','B','N','⌫']
];

const COLORS = {
  correct: { bg:'#0a2b18', border:'#00ff88', text:'#00ff88', glow:'rgba(0,255,136,0.45)' },
  present: { bg:'#2b2100', border:'#ffe600', text:'#ffe600', glow:'rgba(255,230,0,0.4)'  },
  absent:  { bg:'#0a0f1a', border:'rgba(255,255,255,0.07)', text:'#3a4a5a', glow:'none'  },
  empty:   { bg:'#0a1222', border:'rgba(0,255,225,0.12)', text:'transparent', glow:'none'},
  active:  { bg:'#0a1222', border:'rgba(0,255,225,0.45)', text:'transparent', glow:'none'},
  filled:  { bg:'#0d1a2e', border:'rgba(0,255,225,0.7)',  text:'#e0eeff',   glow:'none' }
};
const KEY_COLORS = {
  correct: { bg:'#0a2b18', border:'#00ff88', text:'#00ff88' },
  present: { bg:'#2b2100', border:'#ffe600', text:'#ffe600' },
  absent:  { bg:'#060a12', border:'rgba(255,255,255,0.05)', text:'#1e2a36' },
  default: { bg:'#0d1f35', border:'rgba(0,255,225,0.2)',   text:'rgba(0,255,225,0.85)' }
};
const FONT = 'Orbitron, monospace';

export default class WordleRenderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    this._wrapper     = null;
    this._gridEl      = null;
    this._tileEls     = [];
    this._rowEls      = [];
    this._keyEls      = {};
    this._messageEl   = null;
    this._overlayEl   = null;
    this._timerEl     = null;
    this._livesEl     = null;
    this._seriesEl    = null;
    this._msgTimeout  = null;

    this._animatedRows = new Set();
    this._pendingFlip  = new Set();

    this._onTick        = this._onTick.bind(this);
    this._onTimer       = this._onTimer.bind(this);
    this._onInvalid     = this._onInvalid.bind(this);
    this._onWon         = this._onWon.bind(this);
    this._onOver        = this._onOver.bind(this);
    this._onWordFailed  = this._onWordFailed.bind(this);
    this._onPaused      = this._onPaused.bind(this);
    this._onResumed     = this._onResumed.bind(this);
    this._onRestart     = this._onRestart.bind(this);
    this._onLenChanged  = this._onLenChanged.bind(this);
    this._suppressShell = () => {
      const o = document.getElementById('gs-overlay');
      if (o) o.classList.add('hidden');
    };
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init() {
    this._injectStyles();
    this._buildLayout();
    this._bindEvents();
    this._render(this.game.state);
  }

  destroy() {
    this._unbindEvents();
    if (this._wrapper) this._wrapper.remove();
    const s = document.getElementById('wordle-styles');
    if (s) s.remove();
  }

  /* ============================================================
     STYLES
     ============================================================ */

  _injectStyles() {
    if (document.getElementById('wordle-styles')) return;
    const el = document.createElement('style');
    el.id = 'wordle-styles';
    el.textContent = `
      @keyframes wrd-pop      { 0%{transform:scale(1)} 40%{transform:scale(1.12)} 100%{transform:scale(1)} }
      @keyframes wrd-flip-out { from{transform:scaleY(1)} to{transform:scaleY(0)} }
      @keyframes wrd-flip-in  { from{transform:scaleY(0)} to{transform:scaleY(1)} }
      @keyframes wrd-shake    { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-7px)} 30%{transform:translateX(7px)} 45%{transform:translateX(-7px)} 60%{transform:translateX(7px)} 75%{transform:translateX(-4px)} 90%{transform:translateX(4px)} }
      @keyframes wrd-bounce   { 0%,100%{transform:translateY(0)} 30%{transform:translateY(-16px)} 55%{transform:translateY(-9px)} 75%{transform:translateY(-4px)} }
      @keyframes wrd-fadein   { from{opacity:0;transform:translateX(-50%) translateY(-6px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
      .wrd-tile {
        display:flex; align-items:center; justify-content:center;
        font-family:${FONT}; font-weight:900; letter-spacing:0.04em;
        font-size:clamp(13px,3.2vw,26px);
        border-radius:4px; border:2px solid; box-sizing:border-box;
        user-select:none; -webkit-user-select:none;
        width:clamp(40px,8.5vw,60px); height:clamp(40px,8.5vw,60px);
      }
      .wrd-key {
        font-family:${FONT}; font-size:clamp(7px,1.6vw,11px); font-weight:700;
        letter-spacing:0.04em; border-radius:4px; border:1px solid; cursor:pointer;
        user-select:none; -webkit-user-select:none; transition:filter 0.1s; padding:0;
        height:clamp(36px,7.5vw,50px);
      }
      .wrd-key:hover  { filter:brightness(1.3); }
      .wrd-key:active { filter:brightness(0.8); }
      .wrd-btn-len {
        font-family:${FONT}; font-size:10px; letter-spacing:0.08em;
        padding:4px 12px; border-radius:4px; border:1px solid; cursor:pointer;
        transition:all 0.15s;
      }
    `;
    document.head.appendChild(el);
  }

  /* ============================================================
     LAYOUT PRINCIPAL
     ============================================================ */

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.style.cssText = `
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      width:100%; height:100%; padding:10px 8px; box-sizing:border-box; gap:8px; position:relative;
    `;

    // --- Message flash ---
    this._messageEl = document.createElement('div');
    this._messageEl.style.cssText = `
      position:absolute; top:8px; left:50%; transform:translateX(-50%);
      background:rgba(5,8,15,0.95); border:1px solid rgba(0,255,225,0.3);
      color:#e0eeff; font-family:${FONT}; font-size:10px; font-weight:700;
      letter-spacing:0.12em; padding:6px 16px; border-radius:20px;
      pointer-events:none; opacity:0; white-space:nowrap; z-index:30;
    `;
    this._wrapper.appendChild(this._messageEl);

    // --- Sélecteur de longueur (#1) ---
    const lenBar = this._buildLenSelector();
    this._wrapper.appendChild(lenBar);

    // --- Barre de stats (vies + série + timer) ---
    const statsBar = this._buildStatsBar();
    this._wrapper.appendChild(statsBar);

    // --- Légende couleurs (#3) ---
    const legend = this._buildLegend();
    this._wrapper.appendChild(legend);

    // --- Grille ---
    this._gridEl = document.createElement('div');
    this._gridEl.style.cssText = 'display:flex; flex-direction:column; gap:4px; flex-shrink:0;';
    this._buildGrid();
    this._wrapper.appendChild(this._gridEl);

    // --- Clavier ---
    const kb = this._buildKeyboard();
    this._wrapper.appendChild(kb);

    // --- Overlay ---
    this._overlayEl = document.createElement('div');
    this._overlayEl.style.cssText = `
      position:absolute; inset:0; background:rgba(5,8,15,0.92); backdrop-filter:blur(5px);
      display:none; flex-direction:column; align-items:center; justify-content:center;
      gap:14px; z-index:20; border-radius:inherit;
    `;
    this._wrapper.appendChild(this._overlayEl);

    this.viewport.appendChild(this._wrapper);
  }

  /* ---- Sélecteur longueur ---- */
  _buildLenSelector() {
    const { wordLength, wordLengthOptions } = this.config.gameplay;
    this._lenBtns = {};
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex; gap:4px; flex-shrink:0; flex-wrap:wrap; justify-content:center;';

    wordLengthOptions.forEach(n => {
      const btn = document.createElement('button');
      btn.className = 'wrd-btn-len';
      btn.textContent = n;
      btn.title = `${n} lettres`;
      this._styleLenBtn(btn, n === wordLength);
      btn.addEventListener('click', () => this.game.setWordLength(n));
      this._lenBtns[n] = btn;
      bar.appendChild(btn);
    });

    // Bouton aléatoire 🎲
    this._rndBtn = document.createElement('button');
    this._rndBtn.className = 'wrd-btn-len';
    this._rndBtn.textContent = '🎲';
    this._rndBtn.title = 'Longueur aléatoire à chaque mot';
    this._styleRndBtn(false);
    this._rndBtn.addEventListener('click', () => this.game.setRandomLength());
    bar.appendChild(this._rndBtn);

    return bar;
  }

  _styleLenBtn(btn, active) {
    btn.style.background   = active ? 'rgba(0,255,225,0.12)' : 'transparent';
    btn.style.borderColor  = active ? 'rgba(0,255,225,0.7)'  : 'rgba(0,255,225,0.18)';
    btn.style.color        = active ? '#00ffe1'               : 'rgba(0,255,225,0.4)';
    btn.style.textShadow   = active ? '0 0 8px rgba(0,255,225,0.5)' : 'none';
  }

  _styleRndBtn(active) {
    this._rndBtn.style.background  = active ? 'rgba(255,230,0,0.15)' : 'transparent';
    this._rndBtn.style.borderColor = active ? 'rgba(255,230,0,0.8)'  : 'rgba(255,230,0,0.3)';
    this._rndBtn.style.color       = active ? '#ffe600'               : 'rgba(255,230,0,0.5)';
    this._rndBtn.style.textShadow  = active ? '0 0 8px rgba(255,230,0,0.6)' : 'none';
  }

  /* ---- Barre de stats ---- */
  _buildStatsBar() {
    const bar = document.createElement('div');
    bar.style.cssText = `
      display:flex; align-items:center; justify-content:space-between;
      width:100%; max-width:480px; flex-shrink:0; gap:8px;
    `;

    // Vies
    this._livesEl = document.createElement('div');
    this._livesEl.style.cssText = `font-family:${FONT}; font-size:13px; min-width:60px;`;

    // Série
    this._seriesEl = document.createElement('div');
    this._seriesEl.style.cssText = `
      font-family:${FONT}; font-size:10px; letter-spacing:0.1em;
      color:rgba(0,255,225,0.5); text-align:center; flex:1;
    `;

    // Compteur de mots disponibles
    this._wordCountEl = document.createElement('div');
    this._wordCountEl.style.cssText = `
      font-family:${FONT}; font-size:8px; letter-spacing:0.08em;
      color:rgba(0,255,225,0.25); text-align:center; flex:1;
    `;

    // Timer
    this._timerEl = document.createElement('div');
    this._timerEl.style.cssText = `
      font-family:${FONT}; font-size:12px; font-weight:700;
      color:rgba(0,255,225,0.7); min-width:50px; text-align:right;
      display:${this.config.gameplay.timer.enabled ? 'block' : 'none'};
    `;

    bar.appendChild(this._livesEl);
    bar.appendChild(this._seriesEl);
    bar.appendChild(this._wordCountEl);
    bar.appendChild(this._timerEl);
    return bar;
  }

  /* ---- Légende couleurs (#3) ---- */
  _buildLegend() {
    const el = document.createElement('div');
    el.style.cssText = `
      display:flex; gap:12px; align-items:center;
      font-family:${FONT}; font-size:8px; letter-spacing:0.08em;
      color:rgba(0,255,225,0.35); flex-shrink:0; flex-wrap:wrap; justify-content:center;
    `;
    el.innerHTML = `
      <span><span style="color:#00ff88">■</span> BONNE PLACE</span>
      <span><span style="color:#ffe600">■</span> DANS LE MOT</span>
      <span><span style="color:#3a4a5a">■</span> ABSENT</span>
    `;
    return el;
  }

  /* ---- Grille ---- */
  _buildGrid() {
    const { wordLength, maxAttempts } = this.config.gameplay;
    this._tileEls = [];
    this._rowEls  = [];
    this._gridEl.innerHTML = '';
    this._animatedRows.clear();
    this._pendingFlip.clear();

    for (let r = 0; r < maxAttempts; r++) {
      const rowEl = document.createElement('div');
      rowEl.style.cssText = 'display:flex; gap:4px;';
      this._rowEls.push(rowEl);

      const rowTiles = [];
      for (let c = 0; c < wordLength; c++) {
        const tile = document.createElement('div');
        tile.className = 'wrd-tile';
        this._applyTileStyle(tile, 'empty');
        rowTiles.push(tile);
        rowEl.appendChild(tile);
      }
      this._tileEls.push(rowTiles);
      this._gridEl.appendChild(rowEl);
    }
  }

  /* ---- Clavier ---- */
  _buildKeyboard() {
    this._keyEls = {};
    const kb = document.createElement('div');
    kb.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:5px; flex-shrink:0;';

    KEYBOARD_ROWS.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.style.cssText = 'display:flex; gap:4px; justify-content:center;';
      row.forEach(key => {
        const btn = document.createElement('button');
        btn.className = 'wrd-key';
        btn.textContent = key;
        const wide = key === 'ENTER' || key === '⌫';
        btn.style.width = wide ? 'clamp(40px,8.5vw,62px)' : 'clamp(22px,5vw,36px)';
        this._applyKeyStyle(btn, 'default');
        btn.addEventListener('click', () => {
          if (key === 'ENTER') this.game.submitGuess();
          else if (key === '⌫') this.game.deleteLetter();
          else this.game.addLetter(key);
        });
        this._keyEls[key] = btn;
        rowEl.appendChild(btn);
      });
      kb.appendChild(rowEl);
    });
    return kb;
  }

  /* ============================================================
     STYLES TUILES / TOUCHES
     ============================================================ */

  _applyTileStyle(tile, colorKey) {
    const c = COLORS[colorKey] || COLORS.empty;
    tile.style.background  = c.bg;
    tile.style.borderColor = c.border;
    tile.style.color       = c.text;
    tile.style.boxShadow   = c.glow !== 'none' ? `0 0 10px ${c.glow}` : 'none';
  }

  _applyKeyStyle(btn, stateKey) {
    const c = KEY_COLORS[stateKey] || KEY_COLORS.default;
    btn.style.background  = c.bg;
    btn.style.borderColor = c.border;
    btn.style.color       = c.text;
  }

  /* ============================================================
     RENDU PRINCIPAL
     ============================================================ */

  _render(state) {
    if (state.status === 'loading') return;
    const { wordLength, maxAttempts } = this.config.gameplay;

    for (let r = 0; r < maxAttempts; r++) {
      if (this._pendingFlip.has(r)) continue; // en cours d'animation

      const isCurrentRow = (r === state.currentRow && state.status === 'playing');

      for (let c = 0; c < wordLength; c++) {
        const cell = state.grid[r][c];
        const tile = this._tileEls[r]?.[c];
        if (!tile) continue;

        if (cell.state && cell.state !== 'empty') {
          tile.textContent = cell.letter;
          this._applyTileStyle(tile, cell.state);
        } else if (cell.letter) {
          tile.textContent = cell.letter;
          this._applyTileStyle(tile, 'filled');
        } else {
          tile.textContent = '';
          this._applyTileStyle(tile, isCurrentRow ? 'active' : 'empty');
        }
      }
    }

    this._updateStats(state);
  }

  /* ============================================================
     STATS BAR
     ============================================================ */

  _updateStats(state) {
    // Vies (mode infini)
    if (this._livesEl) {
      if (state.seriesTarget === 0 && state.maxLives > 0) {
        let hearts = '';
        for (let i = 0; i < state.maxLives; i++) {
          hearts += i < state.lives
            ? '<span style="color:#ff2d78;text-shadow:0 0 8px rgba(255,45,120,0.6)">♥</span>'
            : '<span style="color:#1a0a0f">♥</span>';
        }
        this._livesEl.innerHTML = hearts;
      } else {
        this._livesEl.innerHTML = '';
      }
    }

    // Progression série
    if (this._seriesEl) {
      if (state.seriesTarget > 0) {
        this._seriesEl.textContent = `MOT ${state.wordIndex + 1} / ${state.seriesTarget}  ·  ${state.totalScore} pts`;
      } else if (state.wordsCompleted > 0) {
        this._seriesEl.textContent = `🔥 ${state.wordsCompleted} mot${state.wordsCompleted > 1 ? 's' : ''}  ·  ${state.totalScore} pts`;
      } else {
        this._seriesEl.textContent = '';
      }
    }

    // Compteur de mots
    if (this._wordCountEl && state.wordCount > 0) {
      this._wordCountEl.textContent = `${state.wordCount} mots`;
    }

    // Timer
    if (this._timerEl && this.config.gameplay.timer.enabled) {
      this._timerEl.textContent = state.time > 0 ? `⏱ ${state.time}s` : '⏱';
    }
  }

  /* ============================================================
     ANIMATIONS
     ============================================================ */

  _flipRow(rowIndex, state) {
    if (this._animatedRows.has(rowIndex)) return;
    this._animatedRows.add(rowIndex);
    this._pendingFlip.add(rowIndex);

    const tiles = this._tileEls[rowIndex];
    if (!tiles) return;

    tiles.forEach((tile, i) => {
      const cell  = state.grid[rowIndex][i];
      const delay = i * FLIP_DELAY;

      setTimeout(() => {
        tile.style.animation = `wrd-flip-out ${FLIP_DURATION / 2}ms ease-in forwards`;
        setTimeout(() => {
          this._applyTileStyle(tile, cell.state);
          tile.style.animation = `wrd-flip-in ${FLIP_DURATION / 2}ms ease-out forwards`;
        }, FLIP_DURATION / 2);
      }, delay);
    });

    const total = (tiles.length - 1) * FLIP_DELAY + FLIP_DURATION;
    setTimeout(() => {
      this._pendingFlip.delete(rowIndex);
      this._updateKeyboard(state);
    }, total);
  }

  _shakeRow(rowIndex) {
    const row = this._rowEls[rowIndex];
    if (!row) return;
    row.style.animation = 'none';
    void row.offsetHeight;
    row.style.animation = 'wrd-shake 450ms ease';
    setTimeout(() => { row.style.animation = ''; }, 460);
  }

  _popTile(rowIndex, colIndex) {
    const tile = this._tileEls[rowIndex]?.[colIndex];
    if (!tile) return;
    tile.style.animation = 'none';
    void tile.offsetHeight;
    tile.style.animation = 'wrd-pop 90ms ease';
    setTimeout(() => { tile.style.animation = ''; }, 100);
  }

  _bounceRow(rowIndex) {
    const tiles = this._tileEls[rowIndex];
    if (!tiles) return;
    tiles.forEach((tile, i) => {
      setTimeout(() => {
        tile.style.animation = 'none';
        void tile.offsetHeight;
        tile.style.animation = 'wrd-bounce 550ms ease';
        setTimeout(() => { tile.style.animation = ''; }, 560);
      }, i * 70);
    });
  }

  _updateKeyboard(state) {
    Object.entries(state.letterStates).forEach(([letter, s]) => {
      const btn = this._keyEls[letter];
      if (btn) this._applyKeyStyle(btn, s);
    });
  }

  _resetKeyboard() {
    Object.values(this._keyEls).forEach(btn => this._applyKeyStyle(btn, 'default'));
  }

  /* ============================================================
     MESSAGES FLASH
     ============================================================ */

  _showMessage(text, duration = 1800) {
    clearTimeout(this._msgTimeout);
    this._messageEl.textContent = text;
    this._messageEl.style.animation = 'wrd-fadein 180ms ease forwards';
    this._messageEl.style.opacity = '1';
    this._msgTimeout = setTimeout(() => {
      this._messageEl.style.opacity = '0';
      this._messageEl.style.animation = '';
    }, duration);
  }

  /* ============================================================
     OVERLAYS
     ============================================================ */

  _showOverlay(html) {
    this._overlayEl.innerHTML = html;
    this._overlayEl.style.display = 'flex';
  }

  _hideOverlay() {
    this._overlayEl.style.display = 'none';
  }

  _btnStyle(color) {
    return `font-family:${FONT};font-size:10px;letter-spacing:0.1em;padding:10px 22px;border-radius:6px;border:1px solid ${color};background:${color}22;color:${color};cursor:pointer;`;
  }

  _showPauseOverlay() {
    this._showOverlay(`
      <div style="font-family:${FONT};font-size:clamp(22px,5vw,38px);font-weight:900;color:#ffe600;text-shadow:0 0 20px rgba(255,230,0,0.6);letter-spacing:0.15em;">PAUSE</div>
      <button id="wrd-resume" style="${this._btnStyle('rgba(0,255,225,0.8)')}">REPRENDRE</button>
    `);
    document.getElementById('wrd-resume')?.addEventListener('click', () => EventBus.emit('game:pause-toggle'));
  }

  _showWinOverlay(data) {
    const msgs = ['INCROYABLE !','BRILLANT !','EXCELLENT !','BIEN JOUÉ !','PAS MAL !','OUF, DE JUSTESSE !'];
    const msg  = msgs[Math.min((data.attempts ?? 1) - 1, msgs.length - 1)];
    const seedLine = data.seed > 0 && data.seriesTarget > 0
      ? `<div style="font-family:${FONT};font-size:9px;color:rgba(0,255,225,0.3);letter-spacing:0.12em;">SEED : ${data.seed}</div>` : '';

    this._showOverlay(`
      <div style="font-family:${FONT};font-size:clamp(20px,4.5vw,34px);font-weight:900;color:#00ff88;text-shadow:0 0 22px rgba(0,255,136,0.7);letter-spacing:0.12em;">
        ${data.isSeriesComplete ? 'SÉRIE COMPLÈTE !' : 'VICTOIRE !'}
      </div>
      <div style="font-family:${FONT};font-size:11px;color:rgba(0,255,225,0.6);letter-spacing:0.1em;">${msg}</div>
      <div style="font-family:${FONT};font-size:clamp(18px,4vw,28px);font-weight:900;color:#00ffe1;text-shadow:0 0 14px rgba(0,255,225,0.5);">${data.totalScore} pts</div>
      <div style="font-family:${FONT};font-size:10px;color:rgba(0,255,225,0.4);letter-spacing:0.08em;">
        ${data.wordsCompleted} mot${data.wordsCompleted > 1 ? 's' : ''} réussi${data.wordsCompleted > 1 ? 's' : ''}
        ${data.seriesTarget > 0 ? ` · ${data.seriesTarget} dans la série` : ''}
      </div>
      ${seedLine}
      <div style="display:flex;gap:10px;margin-top:4px;">
        <button id="wrd-restart" style="${this._btnStyle('#00ff88')}">REJOUER</button>
        <button id="wrd-home"    style="${this._btnStyle('rgba(0,255,225,0.5)')}">ACCUEIL</button>
      </div>
    `);
    document.getElementById('wrd-restart')?.addEventListener('click', () => { this._hideOverlay(); EventBus.emit('game:restart'); });
    document.getElementById('wrd-home')?.addEventListener('click', () => { window.location.hash = '#home'; });
  }

  _showLoseOverlay(data) {
    const seedLine = data.seed > 0 && data.seriesTarget > 0
      ? `<div style="font-family:${FONT};font-size:9px;color:rgba(0,255,225,0.3);letter-spacing:0.12em;">SEED : ${data.seed}</div>` : '';

    this._showOverlay(`
      <div style="font-family:${FONT};font-size:clamp(20px,4.5vw,34px);font-weight:900;color:#ff2d78;text-shadow:0 0 22px rgba(255,45,120,0.7);letter-spacing:0.12em;">GAME OVER</div>
      <div style="font-family:${FONT};font-size:10px;color:rgba(0,255,225,0.4);letter-spacing:0.12em;">LE MOT ÉTAIT</div>
      <div style="font-family:${FONT};font-size:clamp(20px,4.5vw,32px);font-weight:900;color:#00ffe1;text-shadow:0 0 16px rgba(0,255,225,0.6);letter-spacing:0.3em;">${data.solution}</div>
      <div style="font-family:${FONT};font-size:clamp(16px,3.5vw,24px);font-weight:900;color:#ff2d78;">${data.totalScore} pts</div>
      <div style="font-family:${FONT};font-size:10px;color:rgba(0,255,225,0.4);">
        ${data.wordsCompleted} mot${data.wordsCompleted > 1 ? 's' : ''} trouvé${data.wordsCompleted > 1 ? 's' : ''}
        · ${data.wordsFailed} raté${data.wordsFailed > 1 ? 's' : ''}
      </div>
      ${seedLine}
      <div style="display:flex;gap:10px;margin-top:4px;">
        <button id="wrd-restart" style="${this._btnStyle('#ff2d78')}">REJOUER</button>
        <button id="wrd-home"    style="${this._btnStyle('rgba(0,255,225,0.5)')}">ACCUEIL</button>
      </div>
    `);
    document.getElementById('wrd-restart')?.addEventListener('click', () => { this._hideOverlay(); EventBus.emit('game:restart'); });
    document.getElementById('wrd-home')?.addEventListener('click', () => { window.location.hash = '#home'; });
  }

  /* ============================================================
     EVENTS
     ============================================================ */

  _bindEvents() {
    EventBus.on('game:tick',          this._onTick);
    EventBus.on('game:timer',         this._onTimer);
    EventBus.on('game:invalid-guess', this._onInvalid);
    EventBus.on('game:won',           this._onWon);
    EventBus.on('game:over',          this._onOver);
    EventBus.on('game:word-failed',   this._onWordFailed);
    EventBus.on('game:paused',        this._onPaused);
    EventBus.on('game:resumed',       this._onResumed);
    EventBus.on('game:restart',       this._onRestart);
    EventBus.on('game:word-length-changed', this._onLenChanged);
    EventBus.on('game:over',   this._suppressShell);
    EventBus.on('game:won',    this._suppressShell);
    EventBus.on('game:paused', this._suppressShell);
  }

  _unbindEvents() {
    EventBus.off('game:tick',          this._onTick);
    EventBus.off('game:timer',         this._onTimer);
    EventBus.off('game:invalid-guess', this._onInvalid);
    EventBus.off('game:won',           this._onWon);
    EventBus.off('game:over',          this._onOver);
    EventBus.off('game:word-failed',   this._onWordFailed);
    EventBus.off('game:paused',        this._onPaused);
    EventBus.off('game:resumed',       this._onResumed);
    EventBus.off('game:restart',       this._onRestart);
    EventBus.off('game:word-length-changed', this._onLenChanged);
    EventBus.off('game:over',   this._suppressShell);
    EventBus.off('game:won',    this._suppressShell);
    EventBus.off('game:paused', this._suppressShell);
  }

  _onTick({ state, action, row }) {
    if (action === 'submit' && row !== undefined && !this._animatedRows.has(row)) {
      this._flipRow(row, state);
    }
    if (action === 'add' && state.currentCol > 0) {
      this._popTile(state.currentRow, state.currentCol - 1);
    }
    if (action === 'restart' || action === 'next-word') {
      this._animatedRows.clear();
      this._pendingFlip.clear();
      this._resetKeyboard();           // #7 reset clavier
      this._hideOverlay();
    }
    this._render(state);
  }

  _onTimer({ time }) {
    if (this._timerEl) this._timerEl.textContent = `⏱ ${time}s`;
  }

  _onInvalid({ reason }) {
    this._showMessage(reason === 'too-short' ? 'MOT TROP COURT' : 'MOT INCONNU');
    this._shakeRow(this.game.state.currentRow);
  }

  _onWon(data) {
    this._bounceRow((data.attempts ?? 1) - 1);
    if (data.hasNext) {
      // Série continue : juste un message flash, pas d'overlay
      const bonus = data.wordScore - (500 - (((data.attempts ?? 1) - 1) * 80));
      this._showMessage(`✓ ${data.solution}  +${data.wordScore} pts`, 1900);
    } else {
      // Fin de série ou mode standalone
      setTimeout(() => this._showWinOverlay(data), 700);
    }
  }

  _onWordFailed(data) {
    // Mot raté mais parties restantes (mode infini, vies > 0)
    this._showMessage(`✗ ${data.solution}  ♥ ×${data.lives}`, 1900);
  }

  _onOver(data) {
    setTimeout(() => this._showLoseOverlay(data), 400);
  }

  _onPaused()  { this._showPauseOverlay(); }
  _onResumed() { this._hideOverlay(); }
  _onRestart() { this._hideOverlay(); }

  _onLenChanged({ wordLength, randomLength, wordCount }) {
    const { wordLengthOptions } = this.config.gameplay;

    // Mettre à jour les boutons numérotés
    // En mode aléatoire : le bouton de la longueur courante est légèrement actif
    wordLengthOptions.forEach(n => {
      if (this._lenBtns[n]) this._styleLenBtn(this._lenBtns[n], !randomLength && n === wordLength);
    });

    // Bouton 🎲 actif/inactif
    if (this._rndBtn) this._styleRndBtn(!!randomLength);

    // Compteur de mots dispo
    if (this._wordCountEl && wordCount != null) {
      this._wordCountEl.textContent = `${wordCount} mots`;
    }

    // Reconstruire la grille avec la nouvelle taille
    this._buildGrid();
  }
}
