import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

function cVal(rank) {
  if (['J','Q','K'].includes(rank)) return 10;
  if (rank === 'A') return 1;
  return parseInt(rank, 10);
}

function cardHTML(card, selected = false, clickable = false, idx = -1) {
  const col  = card.isRed ? '#cc2222' : '#111';
  const cls  = ['cb-card', selected ? 'sel' : '', clickable ? 'click' : ''].filter(Boolean).join(' ');
  const attr = idx >= 0 ? `data-idx="${idx}"` : '';
  return `<div class="${cls}" style="color:${col}" ${attr}>${card.rank}${card.suit}</div>`;
}

function faceDown() {
  return `<div class="cb-card cb-back">🂠</div>`;
}

export default class CribbageRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._wrapper  = null;
    this._overlay  = null;
    this._state    = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._overlay = new GameOverlay(this._viewport);
    this._showStart();
    this._bindEvents();
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      () => { this._overlay.hide(); this._game.start(); }
    );
  }

  _injectStyles() {
    if (document.getElementById('cb-styles')) return;
    const s = document.createElement('style');
    s.id = 'cb-styles';
    s.textContent = `
      .cb-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        padding: 8px; box-sizing: border-box; gap: 5px;
        font-family: Orbitron, monospace; overflow: hidden;
      }
      .cb-scores {
        display: flex; justify-content: space-around;
        font-size: 11px; color: #a0c4ff;
      }
      .cb-scores span { color: #ffd700; font-weight: bold; }
      .cb-board { flex: 1; display: flex; flex-direction: column; gap: 5px; overflow-y: auto; }
      .cb-zone { display: flex; flex-direction: column; gap: 2px; }
      .cb-label { font-size: 9px; color: #777; }
      .cb-cards { display: flex; flex-wrap: wrap; gap: 4px; min-height: 42px; }
      .cb-card {
        width: 34px; height: 50px; border-radius: 5px;
        background: #f5f0e8;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: bold; user-select: none;
        border: 1px solid rgba(255,255,255,0.2);
        transition: transform 0.12s, box-shadow 0.12s;
      }
      .cb-card.cb-back { background: #2a3a55; color: #668; font-size: 18px; }
      .cb-card.click { cursor: pointer; }
      .cb-card.click:hover { transform: translateY(-4px); }
      .cb-card.sel { transform: translateY(-8px); box-shadow: 0 0 0 2px #ffd700; }
      .cb-peg-area { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .cb-peg-count { font-size: 24px; color: #ffd700; font-weight: bold; min-width: 40px; }
      .cb-msg { color: #a0c4ff; font-size: 10px; text-align: center; min-height: 14px; }
      .cb-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
      .cb-btn {
        padding: 5px 12px; border: 1px solid rgba(100,150,255,0.4);
        background: rgba(100,150,255,0.1); color: #a0c4ff;
        font-family: Orbitron, monospace; font-size: 10px;
        cursor: pointer; border-radius: 5px;
      }
      .cb-btn:hover { background: rgba(100,150,255,0.22); }
      .cb-btn:disabled { opacity: 0.4; cursor: default; }
      .cb-btn.primary { background: rgba(80,200,80,0.12); border-color: rgba(80,200,80,0.4); color: #88dd88; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'cb-wrapper';
    this._wrapper.innerHTML = `
      <div class="cb-scores">
        Vous : <span id="cb-you">0</span>/121 &nbsp;&nbsp; IA : <span id="cb-ai">0</span>/121
      </div>
      <div class="cb-board">
        <div class="cb-zone">
          <div class="cb-label">Main IA</div>
          <div class="cb-cards" id="cb-ai-hand"></div>
        </div>
        <div class="cb-zone">
          <div class="cb-label">Crib <span id="cb-crib-owner"></span></div>
          <div class="cb-cards" id="cb-crib"></div>
        </div>
        <div class="cb-zone">
          <div class="cb-label">Starter</div>
          <div class="cb-cards" id="cb-starter"></div>
        </div>
        <div class="cb-zone" id="cb-peg-zone" style="display:none">
          <div class="cb-label">Jeu — Total</div>
          <div class="cb-peg-area">
            <div class="cb-peg-count" id="cb-peg-count">0</div>
            <div class="cb-cards" id="cb-peg-pile"></div>
          </div>
        </div>
        <div class="cb-zone">
          <div class="cb-label" id="cb-hand-label">Votre main</div>
          <div class="cb-cards" id="cb-player-hand"></div>
        </div>
      </div>
      <div class="cb-msg" id="cb-msg"></div>
      <div class="cb-actions">
        <button class="cb-btn primary" id="cb-confirm" style="display:none">Confirmer défausse</button>
        <button class="cb-btn" id="cb-go" style="display:none">Go !</button>
      </div>
    `;
    this._viewport.appendChild(this._wrapper);
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);

    document.getElementById('cb-confirm')?.addEventListener('click', () => this._game.confirmDiscard());
    document.getElementById('cb-go')?.addEventListener('click',      () => this._game.pegGo());
  }

  _onTick({ state }) {
    this._state = state;
    this._render(state);
  }

  _onOver({ score }) {
    this._overlay.showGameOver(
      { result: 'lose', score, title: "L'IA A GAGNÉ" },
      () => { this._overlay.hide(); this._game.restart(); }
    );
  }

  _onWon({ score }) {
    this._overlay.showGameOver(
      { result: 'win', score },
      () => { this._overlay.hide(); this._game.restart(); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStart(); }

  _render(state) {
    const $ = (id) => document.getElementById(id);
    if ($('cb-you')) $('cb-you').textContent = state.scores[0];
    if ($('cb-ai'))  $('cb-ai').textContent  = state.scores[1];
    if ($('cb-msg')) $('cb-msg').textContent  = state.message;
    if ($('cb-crib-owner')) $('cb-crib-owner').textContent = state.dealer === 0 ? '(la vôtre)' : "(de l'IA)";

    // AI hand
    const aiHandEl = $('cb-ai-hand');
    if (aiHandEl) {
      const hand = state.hands[1] || [];
      if (state.phase === 'peg') {
        aiHandEl.innerHTML = hand.map(c => cardHTML(c)).join('');
      } else {
        aiHandEl.innerHTML = hand.map(() => faceDown()).join('');
      }
    }

    // Crib
    const cribEl = $('cb-crib');
    if (cribEl) cribEl.innerHTML = (state.crib || []).map(() => faceDown()).join('');

    // Starter
    const starterEl = $('cb-starter');
    if (starterEl) {
      starterEl.innerHTML = state.starter ? cardHTML(state.starter) : faceDown();
    }

    // Peg zone
    const pegZone = $('cb-peg-zone');
    if (pegZone) {
      const show = state.phase === 'peg';
      pegZone.style.display = show ? '' : 'none';
      if (show) {
        if ($('cb-peg-count')) $('cb-peg-count').textContent = state.pegCount;
        const pileEl = $('cb-peg-pile');
        if (pileEl) pileEl.innerHTML = (state.pegPile || []).map(({ card }) => cardHTML(card)).join('');
      }
    }

    // Player hand
    const handEl = $('cb-player-hand');
    const labelEl = $('cb-hand-label');
    if (handEl) {
      const hand     = state.hands[0] || [];
      const selected = state.selected || [];
      const isDiscard = state.phase === 'discard';
      const isPeg     = state.phase === 'peg' && state.currentPeg === 0;

      if (labelEl) {
        if (isDiscard) labelEl.textContent = 'Votre main — sélectionnez 2 cartes pour la crib';
        else if (isPeg) labelEl.textContent = 'Votre main — cliquez pour jouer';
        else labelEl.textContent = 'Votre main';
      }

      handEl.innerHTML = hand.map((c, i) => cardHTML(c, selected.includes(i), isDiscard || isPeg, i)).join('');

      handEl.querySelectorAll('.cb-card.click').forEach(card => {
        card.addEventListener('click', () => {
          const idx = parseInt(card.dataset.idx, 10);
          if (isDiscard) this._game.toggleSelect(idx);
          else if (isPeg) this._game.pegPlay(idx);
        });
      });
    }

    // Actions
    const confirmBtn = $('cb-confirm');
    const goBtn      = $('cb-go');
    if (confirmBtn) {
      const show = state.phase === 'discard' && (state.selected || []).length === 2;
      confirmBtn.style.display = show ? '' : 'none';
    }
    if (goBtn) {
      const isPeg    = state.phase === 'peg' && state.currentPeg === 0;
      const cannotPlay = isPeg && !(state.hands[0] || []).some(c => cVal(c.rank) + state.pegCount <= 31);
      goBtn.style.display = (isPeg && cannotPlay) ? '' : 'none';
    }
  }

  destroy() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('cb-styles')?.remove();
  }
}
