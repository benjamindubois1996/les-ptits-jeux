import EventBus from '../../js/core/EventBus.js';

const KEYBOARD_ROWS = [
  ['A','Z','E','R','T','Y','U','I','O','P'],
  ['Q','S','D','F','G','H','J','K','L','M'],
  ['W','X','C','V','B','N'],
];

/* 10 pièces du pendu en ordre d'apparition.
   Chaque wrong guess révèle la pièce de même rang (1-indexed).
   maxLives = nombre de pièces visibles avant game over. */
const BODY_PARTS = [
  /* 1  head  */ `<circle data-part="1" cx="120" cy="50" r="18" fill="none" stroke-width="2.5" stroke-linecap="round"/>`,
  /* 2  body  */ `<line   data-part="2" x1="120" y1="68" x2="120" y2="130" stroke-width="2.5" stroke-linecap="round"/>`,
  /* 3  L arm */ `<line   data-part="3" x1="120" y1="85" x2="88"  y2="113" stroke-width="2.5" stroke-linecap="round"/>`,
  /* 4  R arm */ `<line   data-part="4" x1="120" y1="85" x2="152" y2="113" stroke-width="2.5" stroke-linecap="round"/>`,
  /* 5  L leg */ `<line   data-part="5" x1="120" y1="130" x2="93" y2="167" stroke-width="2.5" stroke-linecap="round"/>`,
  /* 6  R leg */ `<line   data-part="6" x1="120" y1="130" x2="147" y2="167" stroke-width="2.5" stroke-linecap="round"/>`,
  /* 7  L hand*/ `<circle data-part="7" cx="84"  cy="117" r="4"  fill="currentColor" stroke="none"/>`,
  /* 8  R hand*/ `<circle data-part="8" cx="156" cy="117" r="4"  fill="currentColor" stroke="none"/>`,
  /* 9  L foot*/ `<line   data-part="9"  x1="93"  y1="167" x2="72"  y2="177" stroke-width="2.5" stroke-linecap="round"/>`,
  /* 10 R foot*/ `<line   data-part="10" x1="147" y1="167" x2="168" y2="177" stroke-width="2.5" stroke-linecap="round"/>`,
];

export default class HangmanRenderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    this._wrapper   = null;
    this._svgEl     = null;
    this._wordEl    = null;
    this._wrongEl   = null;
    this._livesEl   = null;
    this._keyEls    = {};
    this._overlayEl = null;

    /* sélections de l'écran de démarrage */
    this._sel = {
      mode:       'basique',
      lives:      config.gameplay.lives,
      wordLength: config.gameplay.wordLength,
    };

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onOver    = this._onOver.bind(this);
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
    if (this._wrapper) this._wrapper.remove();
    const s = document.getElementById('hangman-styles');
    if (s) s.remove();
  }

  /* ============================================================
     STYLES
     ============================================================ */

  _injectStyles() {
    if (document.getElementById('hangman-styles')) return;
    const el = document.createElement('style');
    el.id = 'hangman-styles';
    el.textContent = `
      @keyframes hg-pop    { 0%{transform:scale(1)} 40%{transform:scale(1.15)} 100%{transform:scale(1)} }
      @keyframes hg-shake  { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
      @keyframes hg-fadein { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

      .hg-wrapper {
        display:flex; flex-direction:column; align-items:center;
        width:100%; height:100%; padding:10px 8px 8px; box-sizing:border-box;
        gap:10px; position:relative; font-family:Orbitron,monospace;
      }

      /* ---- Zone de jeu principale ---- */
      .hg-main {
        display:flex; align-items:center; justify-content:center;
        gap:clamp(16px,4vw,40px); flex-shrink:0; flex-wrap:wrap;
      }

      /* ---- Potence SVG ---- */
      .hg-svg {
        width:clamp(110px,20vw,170px); height:auto; flex-shrink:0;
      }

      /* ---- Zone droite : mot + erreurs + vies ---- */
      .hg-game-area {
        display:flex; flex-direction:column; align-items:center; gap:12px;
      }

      /* ---- Mot ---- */
      .hg-word {
        display:flex; gap:6px; flex-wrap:wrap; justify-content:center; max-width:480px;
      }
      .hg-letter {
        width:clamp(26px,5vw,42px); height:clamp(30px,5.5vw,46px);
        display:flex; align-items:flex-end; justify-content:center;
        font-size:clamp(14px,2.5vw,22px); font-weight:900; letter-spacing:0.04em;
        border-bottom:2px solid rgba(0,255,225,0.35); padding-bottom:4px;
        color:transparent; transition:color 0.25s;
      }
      .hg-letter--revealed { color:#00ff88; animation:hg-pop 0.3s ease; }

      /* ---- Vies ---- */
      .hg-lives { display:flex; gap:5px; justify-content:center; }
      .hg-life {
        width:9px; height:9px; border-radius:50%;
        background:#00ff88; box-shadow:0 0 5px rgba(0,255,136,0.6);
        transition:all 0.3s;
      }
      .hg-life--lost {
        background:rgba(255,68,85,0.35);
        box-shadow:0 0 3px rgba(255,68,85,0.3);
      }

      /* ---- Lettres ratées ---- */
      .hg-wrong-block { text-align:center; min-height:32px; }
      .hg-wrong-label {
        font-size:8px; letter-spacing:0.18em; color:rgba(0,255,225,0.35);
        margin-bottom:5px;
      }
      .hg-wrong-letters { display:flex; gap:5px; flex-wrap:wrap; justify-content:center; }
      .hg-wrong-letter {
        font-size:12px; font-weight:700; color:#ff4455;
        letter-spacing:0.05em; animation:hg-pop 0.2s ease;
      }

      /* ---- Clavier ---- */
      .hg-keyboard { display:flex; flex-direction:column; gap:5px; align-items:center; }
      .hg-kb-row   { display:flex; gap:4px; }
      .hg-key {
        width:clamp(25px,4.8vw,37px); height:clamp(28px,5.2vw,40px);
        font-size:clamp(7px,1.4vw,11px); font-weight:700;
        font-family:Orbitron,monospace; letter-spacing:0.04em;
        border-radius:4px; border:1px solid rgba(0,255,225,0.22);
        background:#0d1f35; color:rgba(0,255,225,0.82);
        cursor:pointer; transition:all 0.12s; padding:0;
      }
      .hg-key:hover:not([disabled]) { filter:brightness(1.3); }
      .hg-key--correct {
        background:#0a2b18; border-color:#00ff88; color:#00ff88; cursor:default;
      }
      .hg-key--wrong {
        background:#100608; border-color:rgba(255,68,85,0.2);
        color:rgba(255,68,85,0.35); cursor:default;
      }

      /* ---- Overlay start / win / lose ---- */
      .hg-overlay {
        position:absolute; inset:0;
        background:rgba(5,8,15,0.94); backdrop-filter:blur(5px);
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap:14px; z-index:20; border-radius:inherit;
        animation:hg-fadein 0.2s ease;
      }
      .hg-overlay.hg-overlay--hidden { display:none; }

      .hg-ov-title {
        font-size:clamp(24px,5vw,38px); font-weight:900;
        letter-spacing:0.2em; color:rgba(0,255,225,0.95);
        text-shadow:0 0 22px rgba(0,255,225,0.45);
      }
      .hg-ov-sub {
        font-size:clamp(18px,3.5vw,26px); font-weight:900;
        letter-spacing:0.15em;
      }
      .hg-ov-word {
        font-size:clamp(15px,2.8vw,20px); letter-spacing:0.18em;
        color:rgba(0,255,225,0.75);
      }
      .hg-ov-info {
        font-size:11px; letter-spacing:0.12em; color:rgba(0,255,225,0.45);
      }
      .hg-ov-actions { display:flex; gap:12px; margin-top:6px; }

      /* ---- Option groups (écran démarrage) ---- */
      .hg-opt-group  { display:flex; flex-direction:column; align-items:center; gap:6px; }
      .hg-opt-label  { font-size:8px; letter-spacing:0.22em; color:rgba(0,255,225,0.4); }
      .hg-chips      { display:flex; gap:5px; flex-wrap:wrap; justify-content:center; }
      .hg-chip {
        font-family:Orbitron,monospace; font-size:10px; font-weight:700;
        letter-spacing:0.07em; padding:5px 11px; border-radius:4px;
        border:1px solid rgba(0,255,225,0.22); background:#0a1520;
        color:rgba(0,255,225,0.55); cursor:pointer; transition:all 0.14s;
      }
      .hg-chip:hover { border-color:rgba(0,255,225,0.5); color:rgba(0,255,225,0.85); }
      .hg-chip--on {
        background:rgba(0,255,225,0.11); border-color:rgba(0,255,225,0.6);
        color:rgba(0,255,225,1); box-shadow:0 0 8px rgba(0,255,225,0.18);
      }

      .hg-play-btn {
        font-family:Orbitron,monospace; font-size:13px; font-weight:900;
        letter-spacing:0.22em; padding:11px 38px; border-radius:6px;
        border:2px solid rgba(0,255,225,0.55); background:rgba(0,255,225,0.07);
        color:rgba(0,255,225,0.95); cursor:pointer; transition:all 0.2s; margin-top:4px;
      }
      .hg-play-btn:hover {
        background:rgba(0,255,225,0.15); border-color:rgba(0,255,225,0.9);
        box-shadow:0 0 16px rgba(0,255,225,0.28);
      }
    `;
    document.head.appendChild(el);
  }

  /* ============================================================
     LAYOUT
     ============================================================ */

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'hg-wrapper';

    /* --- Zone principale : potence + zone de jeu --- */
    const main = document.createElement('div');
    main.className = 'hg-main';

    /* Potence SVG */
    this._svgEl = this._buildSVG();
    main.appendChild(this._svgEl);

    /* Zone droite */
    const gameArea = document.createElement('div');
    gameArea.className = 'hg-game-area';

    this._wordEl  = document.createElement('div');
    this._wordEl.className = 'hg-word';

    this._livesEl = document.createElement('div');
    this._livesEl.className = 'hg-lives';

    const wrongBlock = document.createElement('div');
    wrongBlock.className = 'hg-wrong-block';
    const wrongLabel = document.createElement('div');
    wrongLabel.className = 'hg-wrong-label';
    wrongLabel.textContent = 'LETTRES RATÉES';
    this._wrongEl = document.createElement('div');
    this._wrongEl.className = 'hg-wrong-letters';
    wrongBlock.appendChild(wrongLabel);
    wrongBlock.appendChild(this._wrongEl);

    gameArea.appendChild(this._wordEl);
    gameArea.appendChild(this._livesEl);
    gameArea.appendChild(wrongBlock);
    main.appendChild(gameArea);
    this._wrapper.appendChild(main);

    /* Clavier AZERTY */
    this._wrapper.appendChild(this._buildKeyboard());

    /* Overlay (start / win / lose) */
    this._overlayEl = document.createElement('div');
    this._overlayEl.className = 'hg-overlay';
    this._showStartScreen();
    this._wrapper.appendChild(this._overlayEl);

    this.viewport.appendChild(this._wrapper);
  }

  /* ---- SVG potence ---- */
  _buildSVG() {
    const ns  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 160 195');
    svg.setAttribute('class', 'hg-svg');

    const gallowsColor = 'rgba(0,255,225,0.32)';

    /* Potence fixe */
    svg.innerHTML = `
      <line x1="5"   y1="190" x2="70"  y2="190" stroke="${gallowsColor}" stroke-width="4" stroke-linecap="round"/>
      <line x1="30"  y1="190" x2="30"  y2="8"   stroke="${gallowsColor}" stroke-width="4" stroke-linecap="round"/>
      <line x1="30"  y1="8"   x2="120" y2="8"   stroke="${gallowsColor}" stroke-width="4" stroke-linecap="round"/>
      <line x1="120" y1="8"   x2="120" y2="30"  stroke="${gallowsColor}" stroke-width="3" stroke-linecap="round"/>
      ${BODY_PARTS.join('\n')}
    `;

    /* Masquer toutes les pièces au départ */
    svg.querySelectorAll('[data-part]').forEach(el => {
      el.style.display = 'none';
      el.setAttribute('stroke', 'rgba(0,255,225,0.9)');
    });

    return svg;
  }

  /* ---- Clavier ---- */
  _buildKeyboard() {
    this._keyEls = {};
    const kb = document.createElement('div');
    kb.className = 'hg-keyboard';

    KEYBOARD_ROWS.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = 'hg-kb-row';
      row.forEach(letter => {
        const btn = document.createElement('button');
        btn.className = 'hg-key';
        btn.textContent = letter;
        btn.dataset.letter = letter;
        btn.addEventListener('click', () => this.game.guessLetter(letter));
        this._keyEls[letter] = btn;
        rowEl.appendChild(btn);
      });
      kb.appendChild(rowEl);
    });
    return kb;
  }

  /* ============================================================
     ÉCRANS OVERLAY
     ============================================================ */

  _showStartScreen() {
    const { livesOptions, wordLengthOptions } = this.config.gameplay;

    this._overlayEl.innerHTML = `
      <div class="hg-ov-title">PENDU</div>

      <div class="hg-opt-group">
        <div class="hg-opt-label">MODE</div>
        <div class="hg-chips" data-opt="mode">
          <button class="hg-chip hg-chip--on" data-val="basique">BASIQUE</button>
        </div>
      </div>

      <div class="hg-opt-group">
        <div class="hg-opt-label">VIES</div>
        <div class="hg-chips" data-opt="lives">
          ${livesOptions.map(n => `
            <button class="hg-chip${n === this._sel.lives ? ' hg-chip--on' : ''}" data-val="${n}">${n}</button>
          `).join('')}
        </div>
      </div>

      <div class="hg-opt-group">
        <div class="hg-opt-label">TAILLE DES MOTS</div>
        <div class="hg-chips" data-opt="wordLength">
          ${wordLengthOptions.map(n => `
            <button class="hg-chip${n === this._sel.wordLength ? ' hg-chip--on' : ''}" data-val="${n}">${n}</button>
          `).join('')}
          <button class="hg-chip${this._sel.wordLength === 0 ? ' hg-chip--on' : ''}" data-val="0">🎲</button>
        </div>
      </div>

      <button class="hg-play-btn" id="hg-play-btn">JOUER</button>
    `;

    /* Chip click handlers */
    this._overlayEl.querySelectorAll('.hg-chips').forEach(group => {
      group.addEventListener('click', e => {
        const btn = e.target.closest('.hg-chip');
        if (!btn) return;
        const opt = group.dataset.opt;
        const val = opt === 'mode' ? btn.dataset.val : Number(btn.dataset.val);
        this._sel[opt] = val;
        group.querySelectorAll('.hg-chip').forEach(b => b.classList.remove('hg-chip--on'));
        btn.classList.add('hg-chip--on');
      });
    });

    this._overlayEl.querySelector('#hg-play-btn')
      ?.addEventListener('click', () => this.game.start(this._sel));
  }

  _showWinScreen({ word, score, gained, errors, best }) {
    const isRecord = score >= best;
    this._overlayEl.innerHTML = `
      <div style="font-size:40px">🎉</div>
      <div class="hg-ov-sub" style="color:#00ff88">GAGNÉ !</div>
      <div class="hg-ov-word">${word}</div>
      <div class="hg-ov-info">+${gained} pts • ${errors} erreur${errors !== 1 ? 's' : ''}</div>
      ${isRecord ? '<div class="hg-ov-info" style="color:#ffe600">🏆 Nouveau record !</div>' : ''}
      <div class="hg-ov-actions">
        <button class="hg-play-btn" id="hg-ov-replay">REJOUER</button>
      </div>
      <div class="hg-ov-info" style="margin-top:4px;opacity:0.5">R pour rejouer</div>
    `;
    this._overlayEl.classList.remove('hg-overlay--hidden');

    document.getElementById('hg-ov-replay')
      ?.addEventListener('click', () => {
        this._overlayEl.classList.add('hg-overlay--hidden');
        this._showStartScreen();
        this._overlayEl.classList.remove('hg-overlay--hidden');
      });
  }

  _showLoseScreen({ word, score }) {
    this._overlayEl.innerHTML = `
      <div style="font-size:40px">💀</div>
      <div class="hg-ov-sub" style="color:#ff4455">PERDU !</div>
      <div class="hg-ov-word">${word}</div>
      <div class="hg-ov-info">Score : ${score} pts</div>
      <div class="hg-ov-actions">
        <button class="hg-play-btn" id="hg-ov-replay">REJOUER</button>
      </div>
      <div class="hg-ov-info" style="margin-top:4px;opacity:0.5">R pour rejouer</div>
    `;
    this._overlayEl.classList.remove('hg-overlay--hidden');

    document.getElementById('hg-ov-replay')
      ?.addEventListener('click', () => {
        this._overlayEl.classList.add('hg-overlay--hidden');
        this._showStartScreen();
        this._overlayEl.classList.remove('hg-overlay--hidden');
      });
  }

  /* ============================================================
     ÉVÉNEMENTS
     ============================================================ */

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
  }

  _onTick({ state }) {
    if (state.status === 'idle') {
      this._overlayEl.classList.remove('hg-overlay--hidden');
      this._resetGameView();
      return;
    }
    if (state.status === 'playing') {
      this._overlayEl.classList.add('hg-overlay--hidden');
      this._render(state);
    }
  }

  _onWon(data)  { this._render(this.game.state); this._showWinScreen(data); }
  _onOver(data) {
    this._render(this.game.state);
    this._showLoseScreen(data);
    const gs = document.getElementById('gs-overlay');
    if (gs) gs.classList.add('hidden');
  }

  _onPaused({ state }) {
    this._overlayEl.innerHTML = `
      <div style="font-size:36px">⏸</div>
      <div class="hg-ov-sub">PAUSE</div>
      <button class="hg-play-btn" id="hg-ov-resume">REPRENDRE</button>
    `;
    this._overlayEl.classList.remove('hg-overlay--hidden');
    document.getElementById('hg-ov-resume')
      ?.addEventListener('click', () => EventBus.emit('game:pause-toggle'));
    /* Empêche le shell d'afficher son propre overlay */
    const gsOverlay = document.getElementById('gs-overlay');
    if (gsOverlay) gsOverlay.classList.add('hidden');
  }

  _onResumed() {
    this._overlayEl.classList.add('hg-overlay--hidden');
    const gsOverlay = document.getElementById('gs-overlay');
    if (gsOverlay) gsOverlay.classList.add('hidden');
  }

  _onRestart() {
    this._overlayEl.classList.remove('hg-overlay--hidden');
    this._showStartScreen();
    this._resetGameView();
  }

  /* ============================================================
     RENDU
     ============================================================ */

  _render(state) {
    this._renderSVG(state);
    this._renderWord(state);
    this._renderLives(state);
    this._renderWrongLetters(state);
    this._renderKeyboard(state);
  }

  _resetGameView() {
    this._renderSVG({ wrongLetters: [], maxLives: this._sel.lives, status: 'idle' });
    this._wordEl.innerHTML  = '';
    this._livesEl.innerHTML = '';
    this._wrongEl.innerHTML = '';
    Object.values(this._keyEls).forEach(btn => {
      btn.className = 'hg-key';
      btn.disabled  = false;
    });
  }

  /* ---- Potence ---- */
  _renderSVG({ wrongLetters, maxLives, status }) {
    const count     = wrongLetters.length;
    const isDead    = status === 'gameover';
    const bodyColor = isDead ? '#ff4455' : 'rgba(0,255,225,0.9)';

    this._svgEl.querySelectorAll('[data-part]').forEach(el => {
      const idx = Number(el.dataset.part);
      const visible = idx <= count;
      el.style.display = visible ? '' : 'none';
      if (visible) {
        el.setAttribute('stroke', bodyColor);
        if (el.tagName.toLowerCase() === 'circle' && el.getAttribute('fill') !== 'none') {
          el.setAttribute('fill', bodyColor);
        }
      }
    });
  }

  /* ---- Mot ---- */
  _renderWord({ wordDisplay, status }) {
    if (!wordDisplay.length) { this._wordEl.innerHTML = ''; return; }
    const revealAll = status === 'gameover';
    this._wordEl.innerHTML = '';
    wordDisplay.forEach(({ revealed }) => {
      const tile = document.createElement('div');
      tile.className = 'hg-letter' + (revealed || revealAll ? ' hg-letter--revealed' : '');
      if (revealAll) tile.style.color = '#ff4455';
      this._wordEl.appendChild(tile);
    });
    wordDisplay.forEach(({ letter, revealed }, i) => {
      const tile = this._wordEl.children[i];
      tile.textContent = revealed || revealAll ? letter : '_';
    });
  }

  /* ---- Vies ---- */
  _renderLives({ lives, maxLives }) {
    this._livesEl.innerHTML = '';
    for (let i = 0; i < maxLives; i++) {
      const dot = document.createElement('div');
      dot.className = 'hg-life' + (i >= lives ? ' hg-life--lost' : '');
      this._livesEl.appendChild(dot);
    }
  }

  /* ---- Lettres ratées ---- */
  _renderWrongLetters({ wrongLetters }) {
    this._wrongEl.innerHTML = '';
    wrongLetters.forEach(l => {
      const span = document.createElement('span');
      span.className = 'hg-wrong-letter';
      span.textContent = l;
      this._wrongEl.appendChild(span);
    });
  }

  /* ---- Clavier ---- */
  _renderKeyboard({ guessedLetters, wrongLetters, status }) {
    const disabled = status !== 'playing';
    Object.entries(this._keyEls).forEach(([letter, btn]) => {
      const isWrong   = wrongLetters.includes(letter);
      const isCorrect = guessedLetters.includes(letter) && !isWrong;
      btn.className = 'hg-key'
        + (isCorrect ? ' hg-key--correct' : '')
        + (isWrong   ? ' hg-key--wrong'   : '');
      btn.disabled = disabled || guessedLetters.includes(letter);
    });
  }
}
