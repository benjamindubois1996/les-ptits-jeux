import EventBus     from '../../js/core/EventBus.js';
import { shuffle }  from '../../js/utils/Random.js';

const COLOR_FR = {
  red: 'ROUGE', green: 'VERT', blue: 'BLEU', yellow: 'JAUNE',
  purple: 'VIOLET', orange: 'ORANGE', pink: 'ROSE',
  black: 'NOIR', white: 'BLANC',
  bronze: 'BRONZE', silver: 'ARGENT', gold: 'OR'
};

const COLOR_HEX = {
  red: '#e74c3c', green: '#2ecc71', blue: '#3498db', yellow: '#f1c40f',
  purple: '#9b59b6', orange: '#e67e22'
};

export default class SimonRenderer {

  constructor(game, container, config) {
    this.game       = game;
    this.container  = container;
    this.config     = config;
    this._handlers  = {};
    this._btnOrder  = [];   // ordre d'affichage courant (pour shuffle + drift)
    this._hidden    = new Set();  // couleurs masquées
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init() {
    this._injectStyles();
    this._build();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    document.getElementById('simon-styles')?.remove();
  }

  /* ============================================================
     BUILD
     ============================================================ */

  _build() {
    this.container.innerHTML = `<div class="simon-wrapper" id="simon-wrapper"></div>`;
    this._renderModeSelect();
  }

  /* ── Sélecteur de mode ── */
  _renderModeSelect() {
    const w = document.getElementById('simon-wrapper');
    if (!w) return;

    w.innerHTML = `
      <div class="simon-mode-select">
        <div class="simon-brand">
          <div class="simon-brand-dots">
            <span class="simon-dot simon-dot--red"></span>
            <span class="simon-dot simon-dot--green"></span>
            <span class="simon-dot simon-dot--yellow"></span>
            <span class="simon-dot simon-dot--blue"></span>
          </div>
          <div class="simon-brand-name">SIMON SAYS</div>
          <div class="simon-brand-sub">Les mécaniques évoluent au fil des tours</div>
        </div>

        <div class="simon-mode-list">
          ${Object.entries(this.config.modes).map(([key, m]) => `
            <button class="simon-mode-card simon-mode-card--${key}" data-mode="${key}">
              <span class="simon-mode-emoji">${m.emoji}</span>
              <div class="simon-mode-info">
                <span class="simon-mode-label">${m.label}</span>
                <span class="simon-mode-desc">${m.description}</span>
              </div>
            </button>
          `).join('')}
        </div>

        <div class="simon-phase-preview">
          ${this.config.phases.map(p => `
            <div class="simon-phase-chip">
              <span class="simon-phase-chip-round">Tour ${Math.round(p.fromRound)}</span>
              <span class="simon-phase-chip-label">${p.label}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    w.querySelectorAll('.simon-mode-card').forEach(btn => {
      btn.addEventListener('click', () => this.game.selectMode(btn.dataset.mode));
    });
  }

  /* ── Écran de jeu ── */
  _renderGame(modeConfig) {
    const w = document.getElementById('simon-wrapper');
    if (!w) return;

    this._hidden   = new Set();
    this._btnOrder = [...this.game.state.activeColors];

    w.innerHTML = `
      <div class="simon-game-header">
        <button class="simon-back-btn" id="simon-back">← MODE</button>
        <div class="simon-round-wrap">
          <div class="simon-round-lbl">TOUR</div>
          <div class="simon-round-val" id="simon-round">0</div>
        </div>
        <div class="simon-phase-tag" id="simon-phase-tag">Phase 1</div>
      </div>

      <div class="simon-board" id="simon-board"
           data-cols="${this._cols(this._btnOrder.length)}">
        ${this._buttonsHTML()}
      </div>

      <div class="simon-status" id="simon-status">APPUIE POUR COMMENCER</div>

      <div class="simon-phase-toast hidden" id="simon-phase-toast"></div>
    `;

    document.getElementById('simon-back')
      ?.addEventListener('click', () => EventBus.emit('game:restart'));

    this._bindBtnClicks();
  }

  /* ── HTML des boutons (ordre = this._btnOrder) ── */
  _buttonsHTML() {
    return this._btnOrder.map(c => `
      <button class="simon-btn simon-btn--${c} ${this._hidden.has(c) ? 'simon-btn--hidden' : ''}"
              data-color="${c}" aria-label="${COLOR_FR[c]}">
        <span class="simon-btn-lbl">${COLOR_FR[c]}</span>
      </button>
    `).join('');
  }

  /* ── Bind clics sur tous les boutons ── */
  _bindBtnClicks() {
    this.container.querySelectorAll('.simon-btn').forEach(btn => {
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
    });
    this.container.querySelectorAll('.simon-btn').forEach(btn => {
      btn.addEventListener('click', () => this._onBtnClick(btn.dataset.color));
    });
  }

  _onBtnClick(color) {
    const s = this.game.state.status;
    if (s === 'idle' || s === 'gameover') { this.game.start(); return; }
    if (s !== 'waiting') return;
    this._flashBtn(color, true);
    setTimeout(() => this._flashBtn(color, false), 190);
    this.game.handleInput(color);
  }

  /* ============================================================
     EVENTS
     ============================================================ */

  _bindEvents() {
    this._handlers.tick          = d => this._onTick(d.state, d.action);
    this._handlers.flash         = d => this._onFlash(d.color, d.on);
    this._handlers.inputWrong    = d => this._onInputWrong(d.color);
    this._handlers.roundDone     = d => this._onRoundComplete(d.round);
    this._handlers.gameOver      = d => this._onGameOver(d);
    this._handlers.modeSelected  = d => this._renderGame(d.modeConfig);
    this._handlers.colorsChanged = d => this._onColorsChanged(d);
    this._handlers.phaseUp       = d => this._onPhaseUp(d);
    this._handlers.supremeUnlock = d => this._onSupremeUnlock(d);
    this._handlers.shuffle       = d => this._onShuffle(d.colors);
    this._handlers.hide          = d => this._onHide(d.colors);
    this._handlers.restore       = () => this._onRestore();
    EventBus.on('game:tick',              this._handlers.tick);
    EventBus.on('game:flash',             this._handlers.flash);
    EventBus.on('game:input-wrong',       this._handlers.inputWrong);
    EventBus.on('game:round-complete',    this._handlers.roundDone);
    EventBus.on('game:over',             this._handlers.gameOver);
    EventBus.on('game:mode-selected',     this._handlers.modeSelected);
    EventBus.on('game:colors-changed',    this._handlers.colorsChanged);
    EventBus.on('game:phase-up',          this._handlers.phaseUp);
    EventBus.on('game:supreme-unlock',    this._handlers.supremeUnlock);
    EventBus.on('game:shuffle-positions', this._handlers.shuffle);
    EventBus.on('game:hide-buttons',      this._handlers.hide);
    EventBus.on('game:restore-buttons',   this._handlers.restore);
  }

  _unbindEvents() {
    EventBus.off('game:tick',              this._handlers.tick);
    EventBus.off('game:flash',             this._handlers.flash);
    EventBus.off('game:input-wrong',       this._handlers.inputWrong);
    EventBus.off('game:round-complete',    this._handlers.roundDone);
    EventBus.off('game:over',              this._handlers.gameOver);
    EventBus.off('game:mode-selected',     this._handlers.modeSelected);
    EventBus.off('game:colors-changed',    this._handlers.colorsChanged);
    EventBus.off('game:phase-up',          this._handlers.phaseUp);
    EventBus.off('game:supreme-unlock',    this._handlers.supremeUnlock);
    EventBus.off('game:shuffle-positions', this._handlers.shuffle);
    EventBus.off('game:hide-buttons',      this._handlers.hide);
    EventBus.off('game:restore-buttons',   this._handlers.restore);
  }

  /* ============================================================
     HANDLERS
     ============================================================ */

  _onTick(state, action) {
    if (state.status === 'mode-select') { this._renderModeSelect(); return; }
    if (action === 'mode-selected') return;

    this._setRound(state.round);
    const status = document.getElementById('simon-status');
    const board  = document.getElementById('simon-board');

    switch (state.status) {
      case 'idle':
        if (status) status.textContent = 'APPUIE SUR UNE COULEUR POUR COMMENCER';
        board?.classList.remove('simon-board--active', 'simon-board--gameover');
        this._setButtonsDisabled(false);
        break;
      case 'showing':
        if (status) status.textContent = 'REGARDE BIEN LA SÉQUENCE';
        board?.classList.add('simon-board--active');
        board?.classList.remove('simon-board--gameover');
        this._setButtonsDisabled(true);
        break;
      case 'waiting':
        if (status) status.textContent = 'À TON TOUR !';
        this._setButtonsDisabled(false);
        break;
      case 'paused':
        if (status) status.textContent = 'EN PAUSE';
        break;
    }
  }

  _onFlash(color, on) { this._flashBtn(color, on); }

  _onInputWrong(color) {
    this._flashBtn(color, true);
    const board = document.getElementById('simon-board');
    board?.classList.add('simon-board--shake');
    setTimeout(() => {
      board?.classList.remove('simon-board--shake');
      this._flashBtn(color, false);
    }, 500);
  }

  _onRoundComplete(round) {
    this._setRound(round);
    const status = document.getElementById('simon-status');
    if (status) status.textContent = `✓ BRAVO ! TOUR ${round} RÉUSSI`;
  }

  _onGameOver({ score, round }) {
    this._setButtonsDisabled(false);
    const status = document.getElementById('simon-status');
    const board  = document.getElementById('simon-board');
    if (status) status.textContent = `GAME OVER — ${round} tour${round > 1 ? 's' : ''} — ${score} pts · R pour rejouer`;
    board?.classList.add('simon-board--gameover');
    board?.classList.remove('simon-board--active');
    // Révéler les boutons masqués sur game over
    this._onRestore();
  }

  /* ── Nouvelle couleur débloquée ── */
  _onColorsChanged({ colors, added, prevCount }) {
    const board = document.getElementById('simon-board');
    if (!board) return;

    this._btnOrder = [...colors];
    board.dataset.cols = this._cols(colors.length);

    // Ajouter les nouveaux boutons avec animation
    added.forEach(c => {
      const btn = document.createElement('button');
      btn.className    = `simon-btn simon-btn--${c} simon-btn--unlock`;
      btn.dataset.color = c;
      btn.setAttribute('aria-label', COLOR_FR[c]);
      btn.innerHTML    = `<span class="simon-btn-lbl">${COLOR_FR[c]}</span>`;
      btn.addEventListener('click', () => this._onBtnClick(c));
      board.appendChild(btn);
      // Retirer la classe d'animation après qu'elle joue
      setTimeout(() => btn.classList.remove('simon-btn--unlock'), 700);
    });
  }

  /* ── Changement de phase ── */
  _onPhaseUp({ phaseId, label }) {
    const tag   = document.getElementById('simon-phase-tag');
    const toast = document.getElementById('simon-phase-toast');
    if (tag)   tag.textContent   = `Phase ${phaseId}`;
    if (toast) {
      toast.className   = 'simon-phase-toast';
      toast.textContent = `⚡ ${label.toUpperCase()}`;
      setTimeout(() => toast.classList.add('hidden'), 2200);
    }
  }

  /* ── Couleur suprême débloquée (bronze / argent / or) ── */
  _onSupremeUnlock({ color, label, colors }) {
    const board = document.getElementById('simon-board');
    const toast = document.getElementById('simon-phase-toast');
    if (!board) return;

    this._btnOrder = [...colors];
    board.dataset.cols = this._cols(colors.length);

    const btn = document.createElement('button');
    btn.className     = `simon-btn simon-btn--${color} simon-btn--supreme-unlock`;
    btn.dataset.color = color;
    btn.setAttribute('aria-label', COLOR_FR[color]);
    btn.innerHTML     = `<span class="simon-btn-lbl">${COLOR_FR[color]}</span>`;
    btn.addEventListener('click', () => this._onBtnClick(color));
    board.appendChild(btn);
    setTimeout(() => btn.classList.remove('simon-btn--supreme-unlock'), 1200);

    if (toast) {
      toast.className   = 'simon-phase-toast simon-phase-toast--supreme';
      toast.textContent = `★ ${label} DÉBLOQUÉ !`;
      setTimeout(() => toast.classList.add('hidden'), 3000);
    }
  }

  /* ── Mélange des positions (après séquence, avant tour joueur) ── */
  _onShuffle(colors) {
    const board = document.getElementById('simon-board');
    if (!board) return;

    this._btnOrder = shuffle([...this._btnOrder]);

    board.classList.add('simon-board--shuffling');
    setTimeout(() => {
      board.innerHTML = this._buttonsHTML();
      this._bindBtnClicks();
      void board.offsetHeight;
      board.classList.remove('simon-board--shuffling');
    }, 300);
  }

  /* ── Masquage de N boutons ── */
  _onHide(colors) {
    this._hidden = new Set(colors);
    colors.forEach(c => {
      this.container.querySelector(`[data-color="${c}"]`)
        ?.classList.add('simon-btn--hidden');
    });
  }

  /* ── Révélation de tous les boutons ── */
  _onRestore() {
    this._hidden = new Set();
    this.container.querySelectorAll('.simon-btn--hidden')
      .forEach(b => b.classList.remove('simon-btn--hidden'));
  }


  /* ============================================================
     HELPERS
     ============================================================ */

  _flashBtn(color, on) {
    this.container.querySelector(`[data-color="${color}"]`)
      ?.classList.toggle('simon-btn--lit', on);
  }

  _setRound(round) {
    const el = document.getElementById('simon-round');
    if (el) el.textContent = round;
  }

  _setButtonsDisabled(disabled) {
    this.container.querySelectorAll('.simon-btn')
      .forEach(b => { b.disabled = disabled; });
  }

  _cols(count) { return count <= 4 ? '2' : count <= 9 ? '3' : '4'; }

  /* ============================================================
     STYLES
     ============================================================ */

  _injectStyles() {
    if (document.getElementById('simon-styles')) return;
    const s = document.createElement('style');
    s.id = 'simon-styles';
    s.textContent = `

      /* ── Wrapper ── */
      .simon-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.25rem;
        padding: 1.5rem 1rem;
        width: 100%;
        user-select: none;
      }

      /* ══════════════════════════════════════
         SÉLECTEUR DE MODE
      ══════════════════════════════════════ */

      .simon-mode-select {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.75rem;
        width: 100%;
        max-width: 400px;
      }

      .simon-brand { text-align: center; }

      .simon-brand-dots {
        display: flex;
        justify-content: center;
        gap: 8px;
        margin-bottom: 0.75rem;
      }
      .simon-dot {
        display: inline-block;
        width: 22px; height: 22px;
        border-radius: 50%;
      }
      .simon-dot--red    { background: #e74c3c; box-shadow: 0 0 8px #e74c3c66; }
      .simon-dot--green  { background: #2ecc71; box-shadow: 0 0 8px #2ecc7166; }
      .simon-dot--yellow { background: #f1c40f; box-shadow: 0 0 8px #f1c40f66; }
      .simon-dot--blue   { background: #3498db; box-shadow: 0 0 8px #3498db66; }

      .simon-brand-name {
        font-family: var(--font-display);
        font-size: var(--text-2xl);
        font-weight: 900;
        letter-spacing: 0.15em;
        color: var(--text-primary);
      }
      .simon-brand-sub {
        font-family: var(--font-display);
        font-size: var(--text-xs);
        letter-spacing: 0.1em;
        color: var(--text-muted);
        margin-top: 4px;
      }

      .simon-mode-list {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        width: 100%;
      }

      .simon-mode-card {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.85rem 1.1rem;
        background: var(--color-bg-panel);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s, transform 0.1s;
        text-align: left;
      }
      .simon-mode-card:hover { transform: translateY(-2px); }
      .simon-mode-card--normal:hover { border-color: #2ecc71; background: rgba(46,204,113,0.05); }
      .simon-mode-card--hard:hover   { border-color: #f1c40f; background: rgba(241,196,15,0.05); }
      .simon-mode-card--chaos:hover  { border-color: #e74c3c; background: rgba(231,76,60,0.05); }

      .simon-mode-emoji { font-size: 1.5rem; flex-shrink: 0; }
      .simon-mode-info  { display: flex; flex-direction: column; gap: 2px; }
      .simon-mode-label {
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: 700;
        letter-spacing: 0.12em;
        color: var(--text-primary);
      }
      .simon-mode-desc {
        font-family: var(--font-display);
        font-size: var(--text-xs);
        letter-spacing: 0.07em;
        color: var(--text-muted);
      }

      .simon-phase-preview {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: center;
      }
      .simon-phase-chip {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
        padding: 4px 10px;
        background: var(--color-bg-panel);
        border: 1px solid var(--color-border);
        border-radius: 6px;
      }
      .simon-phase-chip-round {
        font-family: var(--font-display);
        font-size: 0.55rem;
        letter-spacing: 0.1em;
        color: var(--text-muted);
      }
      .simon-phase-chip-label {
        font-family: var(--font-display);
        font-size: 0.6rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: var(--neon-cyan);
      }

      /* ══════════════════════════════════════
         HEADER IN-GAME
      ══════════════════════════════════════ */

      .simon-game-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        max-width: 340px;
      }

      .simon-back-btn {
        font-family: var(--font-display);
        font-size: var(--text-xs);
        letter-spacing: 0.12em;
        color: var(--text-muted);
        background: none;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        padding: 4px 10px;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
      }
      .simon-back-btn:hover { color: var(--text-primary); border-color: var(--text-secondary); }

      .simon-round-wrap {
        display: flex; flex-direction: column; align-items: center;
      }
      .simon-round-lbl {
        font-family: var(--font-display);
        font-size: 0.55rem; letter-spacing: 0.2em; color: var(--text-muted);
      }
      .simon-round-val {
        font-family: var(--font-display);
        font-size: 2.4rem; font-weight: 900; line-height: 1;
        color: var(--neon-cyan); text-shadow: var(--glow-cyan);
      }

      .simon-phase-tag {
        font-family: var(--font-display);
        font-size: var(--text-xs);
        letter-spacing: 0.12em;
        color: var(--text-muted);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 3px 10px;
        transition: color 0.3s, border-color 0.3s;
      }

      /* ══════════════════════════════════════
         PLATEAU DE JEU
      ══════════════════════════════════════ */

      .simon-board {
        display: grid;
        gap: 10px;
        width: 310px;
        padding: 10px;
        background: var(--color-bg-panel);
        border: 1px solid var(--color-border);
        border-radius: 16px;
        transition: box-shadow 0.3s;
      }
      .simon-board[data-cols="2"] { grid-template-columns: repeat(2, 1fr); }
      .simon-board[data-cols="3"] { grid-template-columns: repeat(3, 1fr); }
      .simon-board[data-cols="4"] { grid-template-columns: repeat(4, 1fr); }

      .simon-board--active   { box-shadow: 0 0 30px rgba(0,255,225,0.1); }
      .simon-board--gameover { box-shadow: 0 0 30px rgba(255,0,128,0.15); }

      /* ── Bouton ── */
      .simon-btn {
        position: relative;
        aspect-ratio: 1;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.58;
        transition: opacity 0.07s, filter 0.07s, transform 0.07s;
      }
      .simon-btn:hover:not(:disabled) { opacity: 0.8; transform: scale(1.04); }
      .simon-btn:disabled { cursor: not-allowed; }

      .simon-btn--red    { background: #e74c3c; }
      .simon-btn--green  { background: #2ecc71; }
      .simon-btn--blue   { background: #3498db; }
      .simon-btn--yellow { background: #f1c40f; }
      .simon-btn--purple { background: #9b59b6; }
      .simon-btn--orange { background: #e67e22; }
      .simon-btn--pink   { background: #e91e8c; }
      .simon-btn--black  { background: #2c2c3a; border: 1px solid #555; }
      .simon-btn--white  { background: #e8e8e8; }
      .simon-btn--bronze { background: #cd7f32; box-shadow: 0 0 10px #cd7f3266; }
      .simon-btn--silver { background: #b0b8c8; box-shadow: 0 0 10px #b0b8c866; }
      .simon-btn--gold   { background: #ffd700; box-shadow: 0 0 14px #ffd70088; }

      .simon-btn-lbl {
        font-family: var(--font-display);
        font-size: 0.55rem;
        font-weight: 700;
        letter-spacing: 0.1em;
        color: rgba(0,0,0,0.5);
        pointer-events: none;
      }

      /* ── Flash ── */
      .simon-btn--lit {
        opacity: 1 !important;
        filter: brightness(1.7) saturate(1.2) !important;
        transform: scale(1.06) !important;
      }

      /* ── Masqué (phase 4+) — totalement méconnaissable ── */
      .simon-btn--hidden {
        opacity: 0.07 !important;
        filter: grayscale(1) brightness(0.4) !important;
        transition: opacity 0.4s, filter 0.4s;
      }
      .simon-btn--hidden .simon-btn-lbl { visibility: hidden; }
      /* Pas de hover reveal — reste opaque et gris */

      /* ── Unlock (nouvelle couleur) ── */
      @keyframes simon-unlock {
        0%   { opacity: 0; transform: scale(0.3); filter: brightness(2.5); }
        60%  { opacity: 0.8; transform: scale(1.12); }
        100% { opacity: 0.58; transform: scale(1); filter: brightness(1); }
      }
      .simon-btn--unlock { animation: simon-unlock 0.65s cubic-bezier(0.175,0.885,0.32,1.275) forwards; }

      /* ── Supreme unlock (bronze / argent / or) ── */
      @keyframes simon-supreme {
        0%   { opacity: 0; transform: scale(0.2) rotate(-15deg); filter: brightness(4) saturate(2); }
        40%  { opacity: 1; transform: scale(1.25) rotate(4deg);  filter: brightness(2.2); }
        70%  { transform: scale(0.95) rotate(-2deg); }
        100% { opacity: 0.58; transform: scale(1) rotate(0deg); filter: brightness(1); }
      }
      .simon-btn--supreme-unlock { animation: simon-supreme 1.1s cubic-bezier(0.175,0.885,0.32,1.275) forwards; }

      /* ── Toast supreme ── */
      .simon-phase-toast--supreme {
        color: #ffd700;
        text-shadow: 0 0 12px #ffd70099, 0 0 4px #ffd700;
        border-color: #ffd700;
        background: rgba(255,215,0,0.08);
      }

      /* ══════════════════════════════════════
         ANIMATIONS
      ══════════════════════════════════════ */

      @keyframes simon-shake {
        0%,100% { transform: translateX(0); }
        20% { transform: translateX(-8px); }
        40% { transform: translateX(8px); }
        60% { transform: translateX(-5px); }
        80% { transform: translateX(5px); }
      }
      .simon-board--shake { animation: simon-shake 0.42s ease; }

      /* Shuffle — fondu sortie puis rendu */
      @keyframes simon-fade-out {
        to { opacity: 0; transform: scale(0.92); }
      }
      .simon-board--shuffling .simon-btn {
        animation: simon-fade-out 0.28s ease forwards;
      }


      /* ══════════════════════════════════════
         STATUT & TOAST DE PHASE
      ══════════════════════════════════════ */

      .simon-status {
        font-family: var(--font-display);
        font-size: var(--text-xs);
        letter-spacing: 0.13em;
        color: var(--text-secondary);
        text-align: center;
        min-height: 1.4em;
        max-width: 340px;
      }

      .simon-phase-toast {
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: 700;
        letter-spacing: 0.15em;
        color: var(--neon-cyan);
        text-shadow: var(--glow-cyan);
        text-align: center;
        padding: 6px 18px;
        border: 1px solid var(--neon-cyan);
        border-radius: 8px;
        background: rgba(0,255,225,0.06);
      }
      .simon-phase-toast.hidden { display: none; }

      @keyframes simon-toast-in {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .simon-phase-toast:not(.hidden) { animation: simon-toast-in 0.3s ease; }

      /* ── Responsive ── */
      @media (max-width: 480px) {
        .simon-board { width: 270px; }
      }
    `;
    document.head.appendChild(s);
  }
}
