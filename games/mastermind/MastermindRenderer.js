import EventBus from '../../js/core/EventBus.js';

/* 8 couleurs disponibles (les N premières utilisées selon colorCount) */
const COLORS = [
  '#e63946', // 1 Rouge
  '#f4a261', // 2 Orange
  '#e9c46a', // 3 Jaune
  '#2dc653', // 4 Vert
  '#219ebc', // 5 Bleu
  '#9b5de5', // 6 Violet
  '#00f5d4', // 7 Cyan
  '#ff6fb8', // 8 Rose
];

export default class MastermindRenderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    this._wrapper    = null;
    this._boardEl    = null;
    this._paletteEl  = null;
    this._overlayEl  = null;
    this._scoreEl    = null;
    this._attemptEl  = null;

    this._sel = {
      mode:        'basique',
      codeLength:  config.gameplay.codeLength,
      colorCount:  config.gameplay.colorCount,
      maxAttempts: config.gameplay.maxAttempts,
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
    const s = document.getElementById('mm-styles');
    if (s) s.remove();
  }

  /* ============================================================
     STYLES
     ============================================================ */

  _injectStyles() {
    if (document.getElementById('mm-styles')) return;
    const el = document.createElement('style');
    el.id = 'mm-styles';
    el.textContent = `
      @keyframes mm-pop    { 0%{transform:scale(1)} 40%{transform:scale(1.25)} 100%{transform:scale(1)} }
      @keyframes mm-shake  { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
      @keyframes mm-fadein { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      @keyframes mm-pulse  { 0%,100%{box-shadow:0 0 0 2px rgba(0,255,225,0.15)} 50%{box-shadow:0 0 0 5px rgba(0,255,225,0.35)} }

      .mm-wrapper {
        position:absolute; inset:0;
        display:flex; flex-direction:column; align-items:center;
        padding:8px; box-sizing:border-box;
        gap:6px; font-family:Orbitron,monospace;
        overflow:hidden;
      }

      /* ---- Barre info ---- */
      .mm-info-bar {
        display:flex; align-items:center; justify-content:space-between;
        width:100%; max-width:440px; flex-shrink:0;
        font-size:9px; letter-spacing:0.15em; color:rgba(0,255,225,0.4);
      }
      .mm-info-bar span { color:rgba(0,255,225,0.75); font-weight:700; font-size:11px; }

      /* ---- Board ---- */
      .mm-board {
        display:flex; flex-direction:column; gap:3px;
        width:100%; max-width:440px; flex:1; overflow-y:auto;
        padding:2px 0;
      }
      .mm-board::-webkit-scrollbar { width:3px; }
      .mm-board::-webkit-scrollbar-thumb { background:rgba(0,255,225,0.15); border-radius:2px; }

      /* ---- Ligne ---- */
      .mm-row {
        display:flex; align-items:center; justify-content:center;
        gap:8px; padding:5px 10px; border-radius:6px;
        border:1px solid rgba(0,255,225,0.05);
        min-height:46px; box-sizing:border-box;
        transition:border-color 0.2s, background 0.2s;
      }
      .mm-row--active {
        border-color:rgba(0,255,225,0.3);
        background:rgba(0,255,225,0.03);
      }
      .mm-row--past   { background:rgba(0,0,0,0.12); opacity:0.9; }
      .mm-row--future { opacity:0.3; }
      .mm-row--shake  { animation:mm-shake 0.35s ease; }

      .mm-row-num {
        font-size:8px; letter-spacing:0.08em;
        color:rgba(0,255,225,0.25); width:12px; text-align:right; flex-shrink:0;
      }

      /* ---- Pegs ---- */
      .mm-pegs { display:flex; gap:5px; }
      .mm-peg {
        width:clamp(28px,6vw,36px); height:clamp(28px,6vw,36px);
        border-radius:50%;
        border:2px solid rgba(0,255,225,0.15);
        background:#091320;
        cursor:pointer; transition:border-color 0.12s, box-shadow 0.12s;
        flex-shrink:0;
      }
      .mm-peg--filled  { border-color:rgba(255,255,255,0.2); }
      .mm-peg--selected {
        border-color:rgba(0,255,225,0.7) !important;
        animation:mm-pulse 1.4s ease-in-out infinite;
      }
      .mm-peg--empty-past {
        background:rgba(255,255,255,0.04);
        border-color:rgba(255,255,255,0.06);
        cursor:default;
      }

      /* ---- Feedback ---- */
      .mm-feedback {
        display:grid; gap:3px; flex-shrink:0; align-self:center;
      }
      .mm-dot {
        width:10px; height:10px; border-radius:50%;
        background:rgba(255,255,255,0.06);
        border:1px solid rgba(255,255,255,0.1);
      }
      .mm-dot--black {
        background:#f0f0f0; border-color:#f0f0f0;
        box-shadow:0 0 4px rgba(255,255,255,0.5);
      }
      .mm-dot--white {
        background:#555; border-color:#777;
        box-shadow:0 0 3px rgba(150,150,150,0.3);
      }

      /* ---- Bouton valider ---- */
      .mm-submit {
        font-family:Orbitron,monospace; font-size:8px; font-weight:700;
        letter-spacing:0.18em; padding:6px 10px; border-radius:5px;
        border:1px solid rgba(0,255,225,0.2); background:rgba(0,255,225,0.04);
        color:rgba(0,255,225,0.5); cursor:pointer; transition:all 0.14s;
        flex-shrink:0; white-space:nowrap;
      }
      .mm-submit:hover:not([disabled]) {
        background:rgba(0,255,225,0.1); border-color:rgba(0,255,225,0.55);
        color:rgba(0,255,225,0.95);
      }
      .mm-submit--ready {
        border-color:rgba(0,255,225,0.5); background:rgba(0,255,225,0.08);
        color:rgba(0,255,225,0.9); box-shadow:0 0 8px rgba(0,255,225,0.12);
      }
      .mm-submit:disabled { opacity:0.25; cursor:default; }

      /* ---- Palette de couleurs ---- */
      .mm-palette {
        display:flex; gap:7px; justify-content:center; flex-wrap:wrap;
        padding:4px 0; flex-shrink:0;
      }
      .mm-color-btn {
        width:clamp(32px,6.5vw,42px); height:clamp(32px,6.5vw,42px);
        border-radius:50%; border:2px solid rgba(255,255,255,0.12);
        cursor:pointer; transition:all 0.12s;
        display:flex; align-items:center; justify-content:center;
        font-size:9px; font-family:Orbitron,monospace; font-weight:700;
        color:rgba(0,0,0,0.55); flex-shrink:0;
      }
      .mm-color-btn:hover  { transform:scale(1.1); border-color:rgba(255,255,255,0.45); }
      .mm-color-btn--on    { transform:scale(1.18); border-color:#fff; box-shadow:0 0 12px rgba(255,255,255,0.45); }

      /* ---- Overlay ---- */
      .mm-overlay {
        position:absolute; inset:0;
        background:rgba(5,8,15,0.94); backdrop-filter:blur(5px);
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap:8px; z-index:20; border-radius:inherit;
        animation:mm-fadein 0.2s ease;
      }
      .mm-overlay.mm-overlay--hidden { display:none; }

      .mm-ov-title {
        font-size:clamp(22px,5vw,36px); font-weight:900;
        letter-spacing:0.22em; color:rgba(0,255,225,0.95);
        text-shadow:0 0 22px rgba(0,255,225,0.4);
      }
      .mm-ov-sub {
        font-size:clamp(15px,3.5vw,22px); font-weight:900; letter-spacing:0.15em;
      }
      .mm-ov-code { display:flex; gap:8px; margin:2px 0; }
      .mm-ov-peg  {
        width:20px; height:20px; border-radius:50%;
        border:2px solid rgba(255,255,255,0.25);
      }
      .mm-ov-info {
        font-size:10px; letter-spacing:0.12em; color:rgba(0,255,225,0.45);
      }
      .mm-ov-actions { display:flex; gap:12px; margin-top:6px; }

      .mm-opt-group { display:flex; flex-direction:column; align-items:center; gap:6px; }
      .mm-opt-label { font-size:8px; letter-spacing:0.22em; color:rgba(0,255,225,0.4); }
      .mm-chips     { display:flex; gap:5px; flex-wrap:wrap; justify-content:center; }
      .mm-chip {
        font-family:Orbitron,monospace; font-size:10px; font-weight:700;
        letter-spacing:0.07em; padding:5px 11px; border-radius:4px;
        border:1px solid rgba(0,255,225,0.22); background:#0a1520;
        color:rgba(0,255,225,0.55); cursor:pointer; transition:all 0.14s;
      }
      .mm-chip:hover { border-color:rgba(0,255,225,0.5); color:rgba(0,255,225,0.85); }
      .mm-chip--on {
        background:rgba(0,255,225,0.11); border-color:rgba(0,255,225,0.6);
        color:rgba(0,255,225,1); box-shadow:0 0 8px rgba(0,255,225,0.18);
      }

      .mm-play-btn {
        font-family:Orbitron,monospace; font-size:13px; font-weight:900;
        letter-spacing:0.22em; padding:11px 38px; border-radius:6px;
        border:2px solid rgba(0,255,225,0.55); background:rgba(0,255,225,0.07);
        color:rgba(0,255,225,0.95); cursor:pointer; transition:all 0.2s; margin-top:4px;
      }
      .mm-play-btn:hover {
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
    this._wrapper.className = 'mm-wrapper';

    /* Barre info */
    const bar = document.createElement('div');
    bar.className = 'mm-info-bar';
    this._attemptEl = document.createElement('div');
    this._attemptEl.textContent = 'ESSAI — / —';
    this._scoreEl = document.createElement('div');
    this._scoreEl.innerHTML = 'SCORE <span>0</span>';
    bar.appendChild(this._attemptEl);
    bar.appendChild(this._scoreEl);
    this._wrapper.appendChild(bar);

    /* Board */
    this._boardEl = document.createElement('div');
    this._boardEl.className = 'mm-board';
    this._wrapper.appendChild(this._boardEl);

    /* Palette */
    this._paletteEl = document.createElement('div');
    this._paletteEl.className = 'mm-palette';
    this._wrapper.appendChild(this._paletteEl);

    /* Overlay */
    this._overlayEl = document.createElement('div');
    this._overlayEl.className = 'mm-overlay';
    this._showStartScreen();
    this._wrapper.appendChild(this._overlayEl);

    this.viewport.appendChild(this._wrapper);
  }

  /* ============================================================
     ÉCRANS OVERLAY
     ============================================================ */

  _showStartScreen() {
    const { codeLengthOptions, colorCountOptions, maxAttemptsOptions } = this.config.gameplay;

    this._overlayEl.innerHTML = `
      <div class="mm-ov-title">MASTERMIND</div>

      <div class="mm-opt-group">
        <div class="mm-opt-label">MODE</div>
        <div class="mm-chips" data-opt="mode">
          <button class="mm-chip mm-chip--on" data-val="basique">BASIQUE</button>
        </div>
      </div>

      <div class="mm-opt-group">
        <div class="mm-opt-label">LONGUEUR DU CODE</div>
        <div class="mm-chips" data-opt="codeLength">
          ${codeLengthOptions.map(n => `<button class="mm-chip${n === this._sel.codeLength ? ' mm-chip--on' : ''}" data-val="${n}">${n} PEGS</button>`).join('')}
        </div>
      </div>

      <div class="mm-opt-group">
        <div class="mm-opt-label">NOMBRE DE COULEURS</div>
        <div class="mm-chips" data-opt="colorCount">
          ${colorCountOptions.map(n => `<button class="mm-chip${n === this._sel.colorCount ? ' mm-chip--on' : ''}" data-val="${n}">${n}</button>`).join('')}
        </div>
      </div>

      <div class="mm-opt-group">
        <div class="mm-opt-label">TENTATIVES MAX</div>
        <div class="mm-chips" data-opt="maxAttempts">
          ${maxAttemptsOptions.map(n => `<button class="mm-chip${n === this._sel.maxAttempts ? ' mm-chip--on' : ''}" data-val="${n}">${n}</button>`).join('')}
        </div>
      </div>

      <button class="mm-play-btn" id="mm-play-btn">JOUER</button>
    `;

    this._overlayEl.querySelectorAll('.mm-chips').forEach(group => {
      group.addEventListener('click', e => {
        const btn = e.target.closest('.mm-chip');
        if (!btn) return;
        const opt  = group.dataset.opt;
        const val  = opt === 'mode' ? btn.dataset.val : Number(btn.dataset.val);
        this._sel[opt] = val;
        group.querySelectorAll('.mm-chip').forEach(b => b.classList.remove('mm-chip--on'));
        btn.classList.add('mm-chip--on');
      });
    });

    this._overlayEl.querySelector('#mm-play-btn')
      ?.addEventListener('click', () => this.game.start(this._sel));
  }

  _showWinScreen({ code, score, attempts, best }) {
    const isRecord = score >= best && score > 0;
    this._overlayEl.innerHTML = `
      <div style="font-size:38px">🎉</div>
      <div class="mm-ov-sub" style="color:#00ff88">CODE TROUVÉ !</div>
      <div class="mm-ov-code">${code.map(c => `<div class="mm-ov-peg" style="background:${COLORS[c]}"></div>`).join('')}</div>
      <div class="mm-ov-info">Résolu en ${attempts} tentative${attempts !== 1 ? 's' : ''}</div>
      <div class="mm-ov-info">+${score} pts</div>
      ${isRecord ? '<div class="mm-ov-info" style="color:#ffe600">🏆 Nouveau record !</div>' : ''}
      <div class="mm-ov-actions">
        <button class="mm-play-btn" id="mm-ov-replay">REJOUER</button>
      </div>
      <div class="mm-ov-info" style="margin-top:2px;opacity:0.5">R pour rejouer</div>
    `;
    this._overlayEl.classList.remove('mm-overlay--hidden');
    document.getElementById('mm-ov-replay')
      ?.addEventListener('click', () => this._goToStartScreen());
  }

  _showLoseScreen({ code }) {
    this._overlayEl.innerHTML = `
      <div style="font-size:38px">💀</div>
      <div class="mm-ov-sub" style="color:#ff4455">PERDU !</div>
      <div class="mm-ov-info" style="letter-spacing:0.18em;color:rgba(0,255,225,0.55)">LE CODE ÉTAIT</div>
      <div class="mm-ov-code">${code.map(c => `<div class="mm-ov-peg" style="background:${COLORS[c]}"></div>`).join('')}</div>
      <div class="mm-ov-actions">
        <button class="mm-play-btn" id="mm-ov-replay">REJOUER</button>
      </div>
      <div class="mm-ov-info" style="margin-top:2px;opacity:0.5">R pour rejouer</div>
    `;
    this._overlayEl.classList.remove('mm-overlay--hidden');
    document.getElementById('mm-ov-replay')
      ?.addEventListener('click', () => this._goToStartScreen());
  }

  _goToStartScreen() {
    this._overlayEl.classList.remove('mm-overlay--hidden');
    this._showStartScreen();
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

  _onTick({ state, action }) {
    if (state.status === 'idle') {
      this._overlayEl.classList.remove('mm-overlay--hidden');
      return;
    }
    if (state.status === 'playing') {
      this._overlayEl.classList.add('mm-overlay--hidden');
      this._render(state, action);
    }
  }

  _onWon(data)  { this._render(this.game.state); this._showWinScreen(data); }
  _onOver(data) {
    this._render(this.game.state);
    this._showLoseScreen(data);
    const gs = document.getElementById('gs-overlay');
    if (gs) gs.classList.add('hidden');
  }

  _onPaused() {
    this._overlayEl.innerHTML = `
      <div style="font-size:34px">⏸</div>
      <div class="mm-ov-sub">PAUSE</div>
      <button class="mm-play-btn" id="mm-ov-resume">REPRENDRE</button>
    `;
    this._overlayEl.classList.remove('mm-overlay--hidden');
    document.getElementById('mm-ov-resume')
      ?.addEventListener('click', () => EventBus.emit('game:pause-toggle'));
    const gs = document.getElementById('gs-overlay');
    if (gs) gs.classList.add('hidden');
  }

  _onResumed() {
    this._overlayEl.classList.add('mm-overlay--hidden');
    const gs = document.getElementById('gs-overlay');
    if (gs) gs.classList.add('hidden');
  }

  _onRestart() {
    this._overlayEl.classList.remove('mm-overlay--hidden');
    this._showStartScreen();
    this._boardEl.innerHTML  = '';
    this._paletteEl.innerHTML = '';
    this._updateInfoBar(0, 0, this.config.gameplay.maxAttempts);
  }

  /* ============================================================
     RENDU
     ============================================================ */

  _render(state, action) {
    this._renderBoard(state, action);
    this._renderPalette(state);
    this._updateInfoBar(state.score, state.attemptNumber, state.maxAttempts);
  }

  _updateInfoBar(score, attemptNumber, maxAttempts) {
    if (this._attemptEl) {
      this._attemptEl.textContent = `ESSAI ${attemptNumber}/${maxAttempts}`;
    }
    if (this._scoreEl) {
      this._scoreEl.innerHTML = `SCORE <span>${score}</span>`;
    }
  }

  /* ---- Board ---- */
  _renderBoard(state, action) {
    const { history, currentGuess, selectedPeg, codeLength, maxAttempts, status } = state;
    this._boardEl.innerHTML = '';

    for (let i = 0; i < maxAttempts; i++) {
      const row = document.createElement('div');
      const numEl = document.createElement('div');
      numEl.className = 'mm-row-num';
      numEl.textContent = i + 1;

      if (i < history.length) {
        /* Ligne passée */
        row.className = 'mm-row mm-row--past';
        const entry = history[i];
        row.appendChild(numEl);
        row.appendChild(this._buildPegsDisplay(entry.guess, codeLength, false));
        row.appendChild(this._buildFeedback(entry.feedback, codeLength));

      } else if (i === history.length && status === 'playing') {
        /* Ligne active */
        row.className = 'mm-row mm-row--active';
        if (action === 'submit-invalid') row.classList.add('mm-row--shake');
        row.appendChild(numEl);
        const pegsEl = this._buildPegsInput(currentGuess, selectedPeg, codeLength);
        row.appendChild(pegsEl);
        row.appendChild(this._buildFeedback(null, codeLength));

        const submitBtn = document.createElement('button');
        submitBtn.className = 'mm-submit' + (currentGuess.includes(null) ? '' : ' mm-submit--ready');
        submitBtn.disabled  = currentGuess.includes(null);
        submitBtn.textContent = 'OK';
        submitBtn.addEventListener('click', () => this.game.submitGuess());
        row.appendChild(submitBtn);

      } else {
        /* Ligne future */
        row.className = 'mm-row mm-row--future';
        row.appendChild(numEl);
        row.appendChild(this._buildPegsEmpty(codeLength));
        row.appendChild(this._buildFeedback(null, codeLength));
      }

      this._boardEl.appendChild(row);
    }

    /* Scroll vers la ligne active */
    const activeRow = this._boardEl.querySelector('.mm-row--active');
    if (activeRow) activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* Pegs d'une ligne passée */
  _buildPegsDisplay(guess, codeLength, _active) {
    const pegs = document.createElement('div');
    pegs.className = 'mm-pegs';
    for (let i = 0; i < codeLength; i++) {
      const peg = document.createElement('div');
      peg.className = 'mm-peg mm-peg--filled';
      peg.style.background = COLORS[guess[i]] ?? '#091320';
      pegs.appendChild(peg);
    }
    return pegs;
  }

  /* Pegs de la ligne active (cliquables) */
  _buildPegsInput(currentGuess, selectedPeg, codeLength) {
    const pegs = document.createElement('div');
    pegs.className = 'mm-pegs';
    for (let i = 0; i < codeLength; i++) {
      const peg = document.createElement('div');
      const color = currentGuess[i];
      const isSel = i === selectedPeg;
      peg.className = 'mm-peg'
        + (color !== null ? ' mm-peg--filled' : '')
        + (isSel          ? ' mm-peg--selected' : '');
      if (color !== null) peg.style.background = COLORS[color];
      peg.addEventListener('click', () => this.game.selectPeg(i));
      pegs.appendChild(peg);
    }
    return pegs;
  }

  /* Pegs d'une ligne future (vides, pas cliquables) */
  _buildPegsEmpty(codeLength) {
    const pegs = document.createElement('div');
    pegs.className = 'mm-pegs';
    for (let i = 0; i < codeLength; i++) {
      const peg = document.createElement('div');
      peg.className = 'mm-peg mm-peg--empty-past';
      pegs.appendChild(peg);
    }
    return pegs;
  }

  /* Grille de feedback 2 colonnes */
  _buildFeedback(feedback, codeLength) {
    const cols = 2;
    const rows = Math.ceil(codeLength / cols);
    const grid = document.createElement('div');
    grid.className = 'mm-feedback';
    grid.style.gridTemplateColumns = `repeat(${cols}, 10px)`;
    grid.style.gridTemplateRows    = `repeat(${rows}, 10px)`;

    const total  = rows * cols;
    const blacks = feedback?.blacks ?? 0;
    const whites = feedback?.whites ?? 0;

    for (let i = 0; i < total; i++) {
      const dot = document.createElement('div');
      if (i < blacks)           dot.className = 'mm-dot mm-dot--black';
      else if (i < blacks + whites) dot.className = 'mm-dot mm-dot--white';
      else                      dot.className = 'mm-dot';
      grid.appendChild(dot);
    }
    return grid;
  }

  /* ---- Palette ---- */
  _renderPalette(state) {
    this._paletteEl.innerHTML = '';
    const { colorCount } = state;

    for (let i = 0; i < colorCount; i++) {
      const btn = document.createElement('button');
      btn.className = 'mm-color-btn';
      btn.style.background = COLORS[i];
      btn.title = `Couleur ${i + 1} (touche ${i + 1})`;
      btn.textContent = i + 1;
      btn.addEventListener('click', () => this.game.placeColor(i));
      this._paletteEl.appendChild(btn);
    }
  }
}
