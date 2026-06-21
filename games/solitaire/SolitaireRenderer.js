import EventBus    from '../../js/core/EventBus.js';
import GameOverlay  from '../../js/ui/components/GameOverlay.js';

const CARD_H      = 110;
const OFFSET_DOWN = 16;
const OFFSET_UP   = 28;

export default class SolitaireRenderer {

  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._config   = config;

    this._wrapper      = null;
    this._stockEl      = null;
    this._wasteEl      = null;
    this._foundEls     = [];
    this._colEls       = [];
    this._overlay      = null;
    this._scoreEl      = null;
    this._movesEl      = null;
    this._stockCountEl = null;
    this._timerEl      = null;

    this._drag          = null;   // état drag en cours
    this._dropHighlight = null;
    this._timerInterval = null;
    this._elapsed       = 0;
    this._prevScore     = 0;

    this._sel = { mode: 'basique' };

    this._onTick    = this._onTick.bind(this);
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
    this._stopTimer();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('sol-styles')?.remove();
  }

  /* ============================================================
     STYLES
     ============================================================ */

  _injectStyles() {
    if (document.getElementById('sol-styles')) return;
    const s = document.createElement('style');
    s.id = 'sol-styles';
    s.textContent = `
      /* === WRAPPER === */
      .sol-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        padding: 8px; gap: 6px;
        box-sizing: border-box;
        font-family: Orbitron, monospace;
        overflow: hidden;
      }

      /* === HEADER === */
      .sol-header {
        display: flex; justify-content: center; gap: 20px;
        flex-shrink: 0;
        color: rgba(255,255,255,0.55);
        font-size: 11px; letter-spacing: .08em;
      }
      .sol-hdr-item  { display:flex; flex-direction:column; align-items:center; gap:2px; }
      .sol-hdr-label { font-size: 9px; opacity: .55; letter-spacing: .1em; }
      .sol-hdr-val   {
        color: #7fffbf; font-size: 14px; font-weight: 700;
        transition: color .2s;
        position: relative;
      }
      .sol-hdr-val--bump { animation: sol-bump .4s ease; }
      @keyframes sol-bump {
        0%   { transform: scale(1); }
        40%  { transform: scale(1.35); color: #ffd700; }
        100% { transform: scale(1); }
      }
      .sol-score-delta {
        position: absolute; top: -18px; left: 50%;
        transform: translateX(-50%);
        font-size: 11px; font-weight: 700;
        pointer-events: none; white-space: nowrap;
        animation: sol-float 0.9s ease forwards;
      }
      .sol-score-delta--pos { color: #7fffbf; }
      .sol-score-delta--neg { color: #ff5555; }
      @keyframes sol-float {
        0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
      }

      /* === GRILLE (top-row et tableau ont les mêmes 7 colonnes) === */
      .sol-top-row {
        display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px;
        flex-shrink: 0;
      }
      .sol-tableau {
        display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px;
        flex: 1; min-height: 0; overflow-y: auto; align-items: start;
        padding-bottom: 8px;
      }
      .sol-tableau::-webkit-scrollbar { width: 4px; }
      .sol-tableau::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

      /* === EMPLACEMENTS VIDES === */
      .sol-slot {
        height: ${CARD_H}px; border-radius: 8px;
        border: 1px dashed rgba(255,255,255,0.18);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; box-sizing: border-box;
        transition: border-color .15s, background .15s;
      }
      .sol-slot__hint { font-size: 24px; opacity: .2; user-select: none; }

      /* === TALON === */
      .sol-stock {
        height: ${CARD_H}px; border-radius: 8px; cursor: pointer;
        box-sizing: border-box;
        display: flex; align-items: center; justify-content: center;
        transition: opacity .15s;
      }
      .sol-stock:hover { opacity: .85; }
      .sol-stock--empty {
        border: 1px dashed rgba(255,255,255,0.2);
        font-size: 26px; color: rgba(255,255,255,0.35);
        user-select: none;
      }
      .sol-stock--filled {
        background: linear-gradient(145deg, #1e4a8a, #112d5e);
        border: 1px solid rgba(255,255,255,0.18);
        background-image:
          linear-gradient(145deg, #1e4a8a 0%, #112d5e 100%),
          repeating-linear-gradient(
            45deg,
            rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 1px,
            transparent 1px, transparent 7px
          );
        background-blend-mode: normal;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.4);
      }

      /* === DÉFAUSSE === */
      .sol-waste {
        height: ${CARD_H}px; border-radius: 8px;
        box-sizing: border-box; position: relative;
      }
      .sol-waste--empty { border: 1px dashed rgba(255,255,255,0.1); }

      /* === COLONNES TABLEAU === */
      .sol-col {
        position: relative; min-height: ${CARD_H}px;
        box-sizing: border-box;
      }
      .sol-col--empty { border: 1px dashed rgba(255,255,255,0.12); border-radius: 8px; }

      /* === CARTES — base === */
      .sol-card {
        position: absolute; left: 0; width: 100%; height: ${CARD_H}px;
        border-radius: 8px; box-sizing: border-box;
        cursor: grab; user-select: none;
        transition: box-shadow .1s;
        will-change: transform;
      }
      .sol-card:active { cursor: grabbing; }

      /* Carte face cachée */
      .sol-card--down {
        background: linear-gradient(145deg, #1e4a8a 0%, #112d5e 100%);
        border: 1px solid rgba(255,255,255,0.15);
        cursor: default;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 4px rgba(0,0,0,0.35);
      }
      .sol-card--down::after {
        content: '';
        position: absolute; inset: 5px;
        border-radius: 4px;
        border: 1px solid rgba(255,255,255,0.08);
        background: repeating-linear-gradient(
          45deg,
          rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px,
          transparent 1px, transparent 7px
        );
      }

      /* Carte face visible */
      .sol-card--up {
        background: #faf6ee;
        border: 1px solid rgba(0,0,0,0.18);
        overflow: hidden;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.8);
      }
      .sol-card--red   { color: #c0242b; }
      .sol-card--black { color: #1a1a2e; }

      /* Coins — positionnés en absolu dans la carte */
      .sol-card__corner {
        position: absolute;
        display: flex; flex-direction: column; align-items: flex-start;
        line-height: 1.1; font-family: Georgia, serif;
      }
      .sol-card__corner--tl { top: 4px; left: 5px; }
      .sol-card__corner--br { bottom: 4px; right: 5px; transform: rotate(180deg); }
      .sol-card__corner-val  { font-size: 15px; font-weight: 700; letter-spacing: -.02em; }
      .sol-card__corner-suit { font-size: 11px; }

      /* Grand symbole central */
      .sol-card__center {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        font-size: 36px; font-family: Georgia, serif;
        opacity: .12; pointer-events: none;
      }

      /* Surbrillance drag-over */
      .sol-card--up:hover  { box-shadow: 0 3px 10px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.8); }
      .sol-drop-target {
        outline: 2px solid rgba(127,255,191,0.7);
        outline-offset: 2px;
        border-radius: 8px;
      }

      /* Carte fondation */
      .sol-found-card {
        width: 100%; height: ${CARD_H}px;
        border-radius: 8px; border: 1px solid rgba(0,0,0,0.18);
        box-sizing: border-box; cursor: pointer; user-select: none;
        background: #faf6ee; position: relative;
        overflow: hidden;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.8);
        transition: box-shadow .1s;
      }
      /* Sélection carte (clic) */
      .sol-card--selected {
        box-shadow: 0 0 0 2px #ffd700, 0 4px 14px rgba(255,215,0,.45) !important;
        z-index: 15;
      }

      /* Spacer colonne 3 */
      .sol-spacer {}

      /* Écrans démarrage / pause / fin de partie : entièrement gérés par
         GameOverlay (js/ui/components/GameOverlay.js), monté sur .sol-wrapper.
         Voir .ov-* dans index.html pour le CSS associé. */

      .sol-undo-btn {
        margin-left: auto;
        background: transparent;
        border: 1px solid rgba(255,255,255,0.22);
        border-radius: 6px;
        color: rgba(255,255,255,0.5);
        font-family: Orbitron, monospace;
        font-size: 10px; letter-spacing: .06em;
        padding: 4px 10px; cursor: pointer;
        transition: all .15s; align-self: center;
      }
      .sol-undo-btn:hover:not(:disabled) { border-color: #7fffbf; color: #7fffbf; }
      .sol-undo-btn:disabled { opacity: .25; cursor: default; }
    `;
    document.head.appendChild(s);
  }

  /* ============================================================
     LAYOUT
     ============================================================ */

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'sol-wrapper';
    this._viewport.appendChild(this._wrapper);

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'sol-header';
    hdr.innerHTML = `
      <div class="sol-hdr-item">
        <span class="sol-hdr-label">SCORE</span>
        <span class="sol-hdr-val" id="sol-score">0</span>
      </div>
      <div class="sol-hdr-item">
        <span class="sol-hdr-label">TEMPS</span>
        <span class="sol-hdr-val" id="sol-timer">0:00</span>
      </div>
      <div class="sol-hdr-item">
        <span class="sol-hdr-label">COUPS</span>
        <span class="sol-hdr-val" id="sol-moves">0</span>
      </div>
      <div class="sol-hdr-item">
        <span class="sol-hdr-label">TALON</span>
        <span class="sol-hdr-val" id="sol-stock-count">0</span>
      </div>
      <button class="sol-undo-btn" id="sol-undo-btn" data-action="undo" disabled>↩ ANNULER</button>
    `;
    this._wrapper.appendChild(hdr);
    this._scoreEl      = hdr.querySelector('#sol-score');
    this._timerEl      = hdr.querySelector('#sol-timer');
    this._movesEl      = hdr.querySelector('#sol-moves');
    this._stockCountEl = hdr.querySelector('#sol-stock-count');

    // Top row
    const topRow = document.createElement('div');
    topRow.className = 'sol-top-row';

    this._stockEl = document.createElement('div');
    this._stockEl.className  = 'sol-stock sol-stock--empty';
    this._stockEl.textContent = '↺';
    this._stockEl.setAttribute('data-action', 'stock');

    this._wasteEl = document.createElement('div');
    this._wasteEl.className = 'sol-waste sol-waste--empty';

    topRow.appendChild(this._stockEl);
    topRow.appendChild(this._wasteEl);
    topRow.appendChild(document.createElement('div')); // spacer

    this._foundEls = this._config.gameplay.suits.map((suit, i) => {
      const el = document.createElement('div');
      el.className = 'sol-slot';
      el.setAttribute('data-action', 'pile');
      el.setAttribute('data-source', 'foundation');
      el.setAttribute('data-pile-index', String(i));
      el.innerHTML = `<span class="sol-slot__hint">${suit}</span>`;
      topRow.appendChild(el);
      return el;
    });
    this._wrapper.appendChild(topRow);

    // Tableau
    const tableau = document.createElement('div');
    tableau.className = 'sol-tableau';
    this._colEls = Array.from({ length: 7 }, (_, i) => {
      const col = document.createElement('div');
      col.className = 'sol-col';
      col.setAttribute('data-action', 'pile');
      col.setAttribute('data-source', 'tableau');
      col.setAttribute('data-pile-index', String(i));
      tableau.appendChild(col);
      return col;
    });
    this._wrapper.appendChild(tableau);

    // Overlay — module partagé
    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();
  }

  _optionGroups() {
    return [
      { key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] },
    ];
  }

  _showStartScreen() {
    this._overlay.showStart(this._optionGroups(), (selections) => {
      this._sel = selections;
      this._game.start({ mode: this._sel.mode });
    });
  }

  /* ============================================================
     ÉVÉNEMENTS
     ============================================================ */

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);

    this._onPointerDown = e => this._handlePointerDown(e);
    this._onDblClick    = e => this._handleDblClick(e);
    this._onClick       = e => this._handleClick(e);

    this._wrapper.addEventListener('pointerdown', this._onPointerDown);
    this._wrapper.addEventListener('dblclick',    this._onDblClick);
    this._wrapper.addEventListener('click',       this._onClick);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    this._wrapper?.removeEventListener('pointerdown', this._onPointerDown);
    this._wrapper?.removeEventListener('dblclick',    this._onDblClick);
    this._wrapper?.removeEventListener('click',       this._onClick);
    if (this._drag) this._endDrag(false);
  }

  /* ============================================================
     DRAG AND DROP
     ============================================================ */

  _handlePointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('#sol-panel-start, #sol-panel-win, #sol-panel-gameover, #sol-panel-pause')) return;
    if (this._game.state.status !== 'playing') return;

    const cardEl = e.target.closest('.sol-card, .sol-found-card');
    if (!cardEl || cardEl.classList.contains('sol-card--down')) return;

    // Pas de preventDefault ici → click et dblclick peuvent se déclencher normalement
    const rect = cardEl.getBoundingClientRect();
    this._pendingDrag = {
      source:    cardEl.dataset.source,
      pileIndex: +cardEl.dataset.pileIndex,
      cardIndex: +cardEl.dataset.cardIndex,
      startX: e.clientX, startY: e.clientY,
      rect,
    };

    this._onDocMoveThresh = ev => {
      const pd = this._pendingDrag;
      if (!pd) return;
      if (Math.abs(ev.clientX - pd.startX) > 5 || Math.abs(ev.clientY - pd.startY) > 5) {
        document.removeEventListener('pointermove', this._onDocMoveThresh);
        document.removeEventListener('pointerup',   this._onDocUpThresh);
        this._pendingDrag = null;
        this._beginDrag(pd, ev);
      }
    };
    this._onDocUpThresh = () => {
      document.removeEventListener('pointermove', this._onDocMoveThresh);
      document.removeEventListener('pointerup',   this._onDocUpThresh);
      this._pendingDrag = null;
    };

    document.addEventListener('pointermove', this._onDocMoveThresh);
    document.addEventListener('pointerup',   this._onDocUpThresh);
  }

  _beginDrag(pd, ev) {
    if (!this._game.startDrag(pd.source, pd.pileIndex, pd.cardIndex)) return;

    const offsetX = pd.startX - pd.rect.left;
    const offsetY = pd.startY - pd.rect.top;

    const ghost = this._createGhost(pd.rect.width);
    if (!ghost) { this._game.cancelDrag(); return; }

    ghost.style.left = (ev.clientX - offsetX) + 'px';
    ghost.style.top  = (ev.clientY - offsetY) + 'px';
    document.body.appendChild(ghost);
    document.body.style.userSelect = 'none';

    this._drag = { ghost, offsetX, offsetY };

    this._onDocMove = mv => {
      ghost.style.left = (mv.clientX - offsetX) + 'px';
      ghost.style.top  = (mv.clientY - offsetY) + 'px';
      this._updateDropHighlight(mv.clientX, mv.clientY);
    };
    this._onDocUp = up => this._handlePointerUp(up);

    document.addEventListener('pointermove', this._onDocMove);
    document.addEventListener('pointerup',   this._onDocUp);
  }

  _handlePointerUp(e) {
    if (!this._drag) return;

    const ghost = this._drag.ghost;
    ghost.style.display = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    ghost.style.display = '';
    this._endDrag(true);

    if (!el) { this._game.cancelDrag(); return; }

    const card = el.closest('.sol-card, .sol-found-card');
    const pile = el.closest('[data-action="pile"]');

    const src  = (card || pile)?.dataset?.source;
    const pidx = +((card || pile)?.dataset?.pileIndex ?? -1);

    if ((src === 'foundation' || src === 'tableau') && pidx >= 0) {
      this._game.endDrag(src, pidx);
    } else {
      this._game.cancelDrag();
    }
  }

  _endDrag(removeListeners) {
    if (!this._drag) return;
    if (removeListeners) {
      document.removeEventListener('pointermove', this._onDocMove);
      document.removeEventListener('pointerup',   this._onDocUp);
    }
    this._drag.ghost.remove();
    this._drag = null;
    document.body.style.userSelect = '';
    this._clearDropHighlight();
  }

  _updateDropHighlight(x, y) {
    this._clearDropHighlight();
    if (!this._drag) return;
    this._drag.ghost.style.display = 'none';
    const el = document.elementFromPoint(x, y);
    this._drag.ghost.style.display = '';
    if (!el) return;
    const target = el.closest('.sol-col, .sol-slot');
    if (target) {
      target.classList.add('sol-drop-target');
      this._dropHighlight = target;
    }
  }

  _clearDropHighlight() {
    if (this._dropHighlight) {
      this._dropHighlight.classList.remove('sol-drop-target');
      this._dropHighlight = null;
    }
  }

  _createGhost(width) {
    const sel = this._game.state.selected;
    if (!sel?.cards.length) return null;

    const count  = Math.min(sel.cards.length, 6);
    const totalH = (count - 1) * OFFSET_UP + CARD_H;

    const wrap = document.createElement('div');
    wrap.style.cssText = `position:fixed;width:${width}px;height:${totalH}px;pointer-events:none;z-index:999;`;

    sel.cards.slice(0, count).forEach((card, i) => {
      const el = this._makeCard(card, sel.source, sel.pileIndex, sel.cardIndex + i, false);
      el.style.top     = (i * OFFSET_UP) + 'px';
      el.style.opacity = '0.88';
      el.style.boxShadow = '0 8px 20px rgba(0,0,0,0.5)';
      wrap.appendChild(el);
    });

    return wrap;
  }

  /* ============================================================
     AUTRES INTERACTIONS
     ============================================================ */

  _handleClick(e) {
    // Si un vrai drag vient de se terminer, ignorer ce click synthétique
    if (this._drag) return;

    // Clic sur une carte (sélection / déplacement)
    const cardEl = e.target.closest('.sol-card, .sol-found-card');
    if (cardEl && !cardEl.classList.contains('sol-card--down') &&
        this._game.state.status === 'playing') {
      if (e.detail >= 2) return; // 2e click d'un double-clic → laisser dblclick gérer
      this._game.handleCardClick(
        cardEl.dataset.source,
        +cardEl.dataset.pileIndex,
        +cardEl.dataset.cardIndex
      );
      return;
    }

    // Clic sur colonne/fondation vide (dépose la sélection)
    const pileEl = e.target.closest('[data-action="pile"]');
    if (pileEl && !cardEl && this._game.state.status === 'playing') {
      this._game.clickPile(pileEl.dataset.source, +pileEl.dataset.pileIndex);
      return;
    }

    // Boutons et autres actions
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    switch (actionEl.dataset.action) {
      case 'stock': this._game.clickStock(); break;
      case 'undo':  this._game.undo();       break;
    }
  }

  _handleDblClick(e) {
    if (this._game.state.status !== 'playing') return;
    const cardEl = e.target.closest('.sol-card, .sol-found-card');
    if (!cardEl) return;
    const src = cardEl.dataset.source;
    if (src !== 'waste' && src !== 'tableau') return;
    this._game.autoMoveToFoundation(src, +cardEl.dataset.pileIndex, +cardEl.dataset.cardIndex);
  }

  /* ============================================================
     TICK
     ============================================================ */

  _onTick({ state, action }) {
    if (action === 'start' || action === 'restart') {
      this._stopTimer();
      this._elapsed = 0;
      this._showStartScreen();
      return;
    }
    if (action === 'new-game') {
      this._overlay.hide();
      this._elapsed = 0;
      this._startTimer();
      this._prevScore = 0;
      this._renderBoard(state);
      return;
    }
    if (action === 'win') {
      this._stopTimer();
      this._renderBoard(state);
      this._showWinScreen(state);
      return;
    }
    if (action === 'gameover') {
      this._stopTimer();
      this._renderBoard(state);
      this._showBlockedScreen(state);
      return;
    }
    this._renderBoard(state);
  }

  _onPaused()  { this._pauseTimer(); this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._resumeTimer(); this._overlay.hide(); }
  _onRestart() {}

  /* ============================================================
     TIMER
     ============================================================ */

  _startTimer() {
    this._stopTimer();
    this._timerInterval = setInterval(() => {
      this._elapsed++;
      this._game.state.elapsedSeconds = this._elapsed;
      if (this._timerEl) this._timerEl.textContent = this._formatTime(this._elapsed);
    }, 1000);
  }
  _stopTimer()   { clearInterval(this._timerInterval); this._timerInterval = null; }
  _pauseTimer()  { this._stopTimer(); }
  _resumeTimer() { this._startTimer(); }
  _formatTime(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  /* Score bonus basé sur le temps */
  _timeBonus() {
    return Math.max(0, Math.floor(700 - this._elapsed * 2));
  }

  /* ============================================================
     OVERLAY
     ============================================================ */

  _showWinScreen(state) {
    const bonus = this._timeBonus();
    const total = state.score + bonus;
    this._overlay.showGameOver({
      result: 'win',
      score:  total,
      extraInfo: `<div class="overlay-score">Score ${state.score} + bonus temps ${bonus}</div>
                  <div class="overlay-score">${this._formatTime(this._elapsed)} • ${state.moves} coups</div>`,
    }, () => this._game.restart());
  }

  _showBlockedScreen(state) {
    this._overlay.showGameOver({
      result: 'lose',
      title:  'BLOQUÉ !',
      score:  state.score,
      extraInfo: `<div class="overlay-score">Aucun coup possible — ${state.moves} coups</div>`,
    }, () => this._game.restart());
  }

  /* ============================================================
     RENDU DU PLATEAU
     ============================================================ */

  _renderBoard(state) {
    // Score avec animation
    if (state.score !== this._prevScore) {
      const delta = state.score - this._prevScore;
      this._animateScore(delta);
      this._prevScore = state.score;
    }
    this._scoreEl.textContent      = state.score;
    this._movesEl.textContent      = state.moves;
    this._stockCountEl.textContent = state.stock.length;

    const undoBtn = this._wrapper?.querySelector('#sol-undo-btn');
    if (undoBtn) undoBtn.disabled = !(this._game._history?.length > 0);

    this._renderStock(state);
    this._renderWaste(state);
    state.foundations.forEach((pile, i) => this._renderFoundation(pile, i, state));
    state.tableau.forEach((pile, i) => this._renderCol(pile, i, state));
  }

  _animateScore(delta) {
    if (delta === 0) return;

    // Bump animation sur le score
    this._scoreEl.classList.remove('sol-hdr-val--bump');
    requestAnimationFrame(() => {
      this._scoreEl.classList.add('sol-hdr-val--bump');
    });
    this._scoreEl.addEventListener('animationend',
      () => this._scoreEl.classList.remove('sol-hdr-val--bump'), { once: true });

    // Floating +N / -N
    const floatEl = document.createElement('span');
    floatEl.className = `sol-score-delta sol-score-delta--${delta >= 0 ? 'pos' : 'neg'}`;
    floatEl.textContent = delta >= 0 ? `+${delta}` : `${delta}`;
    this._scoreEl.appendChild(floatEl);
    floatEl.addEventListener('animationend', () => floatEl.remove(), { once: true });
  }

  _renderStock(state) {
    const el = this._stockEl;
    if (state.stock.length === 0) {
      el.className   = 'sol-stock sol-stock--empty';
      el.textContent = '↺';
    } else {
      el.className   = 'sol-stock sol-stock--filled';
      el.textContent = '';
    }
  }

  _renderWaste(state) {
    const el = this._wasteEl;
    el.innerHTML = '';
    if (!state.waste.length) { el.className = 'sol-waste sol-waste--empty'; return; }
    el.className = 'sol-waste';
    const card   = state.waste[state.waste.length - 1];
    const isSel  = state.selected?.source === 'waste';
    const cardEl = this._makeCard(card, 'waste', 0, state.waste.length - 1, isSel);
    cardEl.style.position = 'relative';
    el.appendChild(cardEl);
  }

  _renderFoundation(pile, idx, state) {
    const el = this._foundEls[idx];
    el.innerHTML = '';
    if (!pile.length) {
      el.innerHTML = `<span class="sol-slot__hint">${this._config.gameplay.suits[idx]}</span>`;
      return;
    }
    const card  = pile[pile.length - 1];
    const isRed = this._config.gameplay.redSuits.includes(card.suit);
    const val   = this._label(card.value);
    const isSel = state.selected?.source === 'foundation' && state.selected?.pileIndex === idx;
    const cardEl = document.createElement('div');
    cardEl.className = `sol-found-card sol-card--${isRed ? 'red' : 'black'}${isSel ? ' sol-card--selected' : ''}`;
    cardEl.dataset.source    = 'foundation';
    cardEl.dataset.pileIndex = idx;
    cardEl.dataset.cardIndex = pile.length - 1;
    cardEl.innerHTML = this._cardFaceHTML(val, card.suit);
    el.appendChild(cardEl);
  }

  _renderCol(pile, colIdx, state) {
    const col = this._colEls[colIdx];
    col.innerHTML = '';

    if (!pile.length) {
      col.classList.add('sol-col--empty');
      col.style.height = CARD_H + 'px';
      return;
    }

    col.classList.remove('sol-col--empty');
    let totalH = 0;
    for (let i = 0; i < pile.length - 1; i++) totalH += pile[i].faceUp ? OFFSET_UP : OFFSET_DOWN;
    totalH += CARD_H;
    col.style.height = totalH + 'px';

    let top = 0;
    pile.forEach((card, ci) => {
      const isSel = state.selected?.source === 'tableau' &&
                    state.selected?.pileIndex === colIdx &&
                    state.selected?.cardIndex !== undefined &&
                    ci >= state.selected.cardIndex;
      const cardEl = this._makeCard(card, 'tableau', colIdx, ci, isSel);
      cardEl.style.top = top + 'px';
      col.appendChild(cardEl);
      if (ci < pile.length - 1) top += card.faceUp ? OFFSET_UP : OFFSET_DOWN;
    });
  }

  /* ============================================================
     CRÉATION D'UNE CARTE
     ============================================================ */

  _makeCard(card, source, pileIndex, cardIndex, isSelected) {
    const el = document.createElement('div');
    if (!card.faceUp) {
      el.className = 'sol-card sol-card--down';
    } else {
      const isRed = this._config.gameplay.redSuits.includes(card.suit);
      el.className = `sol-card sol-card--up sol-card--${isRed ? 'red' : 'black'}`;
      el.innerHTML = this._cardFaceHTML(this._label(card.value), card.suit);
    }
    if (isSelected) el.classList.add('sol-card--selected');
    el.dataset.source    = source;
    el.dataset.pileIndex = pileIndex;
    el.dataset.cardIndex = cardIndex;
    return el;
  }

  _cardFaceHTML(val, suit) {
    // 6 et 9 portent un soulignement pour rester lisibles retournés à 180°
    const v = (val === '6' || val === '9')
      ? `<span style="text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1.5px">${val}</span>`
      : val;
    return `
      <div class="sol-card__corner sol-card__corner--tl">
        <div class="sol-card__corner-val">${v}</div>
        <div class="sol-card__corner-suit">${suit}</div>
      </div>
      <div class="sol-card__center">${suit}</div>
      <div class="sol-card__corner sol-card__corner--br">
        <div class="sol-card__corner-val">${v}</div>
        <div class="sol-card__corner-suit">${suit}</div>
      </div>
    `;
  }

  _label(v) { return ['','A','2','3','4','5','6','7','8','9','10','J','Q','K'][v]; }
}
