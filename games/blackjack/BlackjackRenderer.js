import EventBus from '../../js/core/EventBus.js';

export default class BlackjackRenderer {

  constructor(game, container, config) {
    this.game      = game;
    this.container = container;
    this.config    = config;
    this._els      = {};
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init() {
    this._injectStyles();
    this._buildDOM();
    this._bindEvents();
    this._boundOnTick = ({ state, action }) => this._render(state, action);
    EventBus.on('game:tick', this._boundOnTick);
  }

  destroy() {
    EventBus.off('game:tick', this._boundOnTick);
    document.getElementById('bj-styles')?.remove();
  }

  /* ============================================================
     DOM
     ============================================================ */

  _buildDOM() {
    this.container.innerHTML = `
      <div class="bj-table">

        <!-- Zone croupier -->
        <div class="bj-zone">
          <div class="bj-zone-label">Croupier</div>
          <div class="bj-cards" id="bj-dealer-cards"></div>
          <div class="bj-total" id="bj-dealer-total"></div>
        </div>

        <!-- Message résultat -->
        <div class="bj-result hidden" id="bj-result">
          <span id="bj-result-label"></span>
        </div>

        <!-- Zone joueur -->
        <div class="bj-zone">
          <div class="bj-zone-label">Vous</div>
          <div class="bj-cards" id="bj-player-cards"></div>
          <div class="bj-total" id="bj-player-total"></div>
        </div>

        <!-- Contrôles bas -->
        <div class="bj-bottom">

          <!-- Info mise / jetons -->
          <div class="bj-bet-info">
            <span class="bj-info-label">Mise</span>
            <span class="bj-bet-value"  id="bj-bet">0</span>
            <span class="bj-info-sep">|</span>
            <span class="bj-info-label">Jetons</span>
            <span class="bj-chips-value" id="bj-chips">${this.config.gameplay.startingChips}</span>
          </div>

          <!-- Jetons cliquables (affichés en phase de mise) -->
          <div class="bj-chip-row" id="bj-chip-row">
            ${this.config.chips.map(v => `
              <button class="bj-chip bj-chip--${v}" data-value="${v}">${v}</button>
            `).join('')}
            <button class="btn btn-ghost btn-sm" id="bj-clear-btn">Effacer</button>
          </div>

          <!-- Boutons d'action -->
          <div class="bj-action-row">
            <button class="btn btn-primary"  id="bj-deal-btn">Distribuer  <kbd>↵</kbd></button>
            <button class="btn btn-primary"  id="bj-hit-btn">Tirer  <kbd>H</kbd></button>
            <button class="btn btn-outline"  id="bj-stand-btn">Rester  <kbd>S</kbd></button>
            <button class="btn btn-ghost"    id="bj-double-btn">Doubler ×2  <kbd>D</kbd></button>
            <button class="btn btn-primary"  id="bj-next-btn">Main suivante  <kbd>↵</kbd></button>
          </div>

        </div>
      </div>
    `;

    this._els = {
      dealerCards:  document.getElementById('bj-dealer-cards'),
      dealerTotal:  document.getElementById('bj-dealer-total'),
      playerCards:  document.getElementById('bj-player-cards'),
      playerTotal:  document.getElementById('bj-player-total'),
      bet:          document.getElementById('bj-bet'),
      chips:        document.getElementById('bj-chips'),
      result:       document.getElementById('bj-result'),
      resultLabel:  document.getElementById('bj-result-label'),
      chipRow:      document.getElementById('bj-chip-row'),
      dealBtn:      document.getElementById('bj-deal-btn'),
      hitBtn:       document.getElementById('bj-hit-btn'),
      standBtn:     document.getElementById('bj-stand-btn'),
      doubleBtn:    document.getElementById('bj-double-btn'),
      nextBtn:      document.getElementById('bj-next-btn'),
    };
  }

  _bindEvents() {
    // Jetons
    this.container.querySelectorAll('.bj-chip').forEach(btn => {
      btn.addEventListener('click', () => this.game.addChip(+btn.dataset.value));
    });
    document.getElementById('bj-clear-btn')
      ?.addEventListener('click', () => this.game.clearBet());

    // Actions
    this._els.dealBtn.addEventListener('click',   () => this.game.deal());
    this._els.hitBtn.addEventListener('click',    () => this.game.hit());
    this._els.standBtn.addEventListener('click',  () => this.game.stand());
    this._els.doubleBtn.addEventListener('click', () => this.game.double());
    this._els.nextBtn.addEventListener('click',   () => this.game.nextRound());
  }

  /* ============================================================
     RENDU
     ============================================================ */

  _render(state, action) {
    this._renderCards(state);
    this._renderTotals(state);
    this._renderBetInfo(state);
    this._renderButtons(state);
    this._renderResult(state);
  }

  _renderCards(state) {
    const hideSecond = state.status === 'player-turn';

    this._els.dealerCards.innerHTML = state.dealerHand
      .map((c, i) => (i === 1 && hideSecond) ? this._cardBack() : this._cardHTML(c))
      .join('');

    this._els.playerCards.innerHTML = state.playerHand
      .map(c => this._cardHTML(c))
      .join('');
  }

  _renderTotals(state) {
    const pVal = state.playerHand.length
      ? this.game._handValue(state.playerHand) : '';

    let dVal = '';
    if (state.dealerHand.length) {
      dVal = (state.status === 'player-turn')
        ? this.game._handValue([state.dealerHand[0]])
        : this.game._handValue(state.dealerHand);
    }

    this._els.playerTotal.textContent = pVal;
    this._els.playerTotal.className   = 'bj-total' +
      (pVal > 21 ? ' bj-total--bust' : pVal === 21 ? ' bj-total--21' : '');

    this._els.dealerTotal.textContent = dVal;
    this._els.dealerTotal.className   = 'bj-total' +
      (dVal > 21 ? ' bj-total--bust' : dVal === 21 ? ' bj-total--21' : '');
  }

  _renderBetInfo(state) {
    this._els.bet.textContent   = state.bet;
    this._els.chips.textContent = state.chips;
  }

  _renderButtons(state) {
    const s = state.status;
    this._toggle(this._els.chipRow,   s === 'betting');
    this._toggle(this._els.dealBtn,   s === 'betting');
    this._toggle(this._els.hitBtn,    s === 'player-turn');
    this._toggle(this._els.standBtn,  s === 'player-turn');
    this._toggle(this._els.doubleBtn, s === 'player-turn' && state.canDouble);
    this._toggle(this._els.nextBtn,   s === 'round-over');
  }

  _renderResult(state) {
    if (state.status !== 'round-over' || !state.lastResult) {
      this._els.result.classList.add('hidden');
      return;
    }
    const { label, outcome, net } = state.lastResult;
    const sign = net > 0 ? '+' : '';
    this._els.resultLabel.textContent = `${label}  ${sign}${net} jetons`;
    this._els.result.className = `bj-result bj-result--${outcome}`;
  }

  /* ============================================================
     HELPERS
     ============================================================ */

  _cardHTML(card) {
    const cls = card.red ? 'bj-card--red' : 'bj-card--dark';
    return `
      <div class="bj-card ${cls}">
        <div class="bj-card-corner bj-card-tl">
          <div>${card.rank}</div><div>${card.suit}</div>
        </div>
        <div class="bj-card-center">${card.suit}</div>
        <div class="bj-card-corner bj-card-br">
          <div>${card.suit}</div><div>${card.rank}</div>
        </div>
      </div>`;
  }

  _cardBack() {
    return `<div class="bj-card bj-card--back"><div class="bj-card-back-inner"></div></div>`;
  }

  _toggle(el, visible) {
    if (!el) return;
    el.classList.toggle('hidden', !visible);
  }

  /* ============================================================
     STYLES
     ============================================================ */

  _injectStyles() {
    if (document.getElementById('bj-styles')) return;
    const s = document.createElement('style');
    s.id = 'bj-styles';
    s.textContent = `
      /* ── Table ── */
      .bj-table {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 1rem 1.25rem;
        gap: 0.6rem;
        box-sizing: border-box;
      }

      /* ── Zones dealer / player ── */
      .bj-zone {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
      }
      .bj-zone-label {
        font-family: var(--font-display, monospace);
        font-size: 0.7rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--text-muted, #666);
      }
      .bj-cards {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        justify-content: center;
        min-height: 96px;
        align-items: center;
      }

      /* ── Carte ── */
      .bj-card {
        position: relative;
        width: 62px;
        height: 90px;
        border-radius: 8px;
        background: #fff;
        border: 1.5px solid rgba(0,0,0,0.15);
        box-shadow: 0 3px 10px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        user-select: none;
        flex-shrink: 0;
        animation: bj-card-in 0.18s ease;
      }
      @keyframes bj-card-in {
        from { transform: scale(0.7) translateY(-8px); opacity: 0; }
        to   { transform: scale(1)   translateY(0);    opacity: 1; }
      }
      .bj-card--red  { color: #c62828; }
      .bj-card--dark { color: #1a1a2e; }

      .bj-card--back {
        background: linear-gradient(135deg, #1565c0, #0d47a1);
        border: 1.5px solid rgba(255,255,255,0.15);
        color: transparent;
        overflow: hidden;
      }
      .bj-card-back-inner {
        width: 46px; height: 74px;
        border: 2px solid rgba(255,255,255,0.2);
        border-radius: 4px;
        background: repeating-linear-gradient(
          45deg,
          rgba(255,255,255,0.04) 0px,
          rgba(255,255,255,0.04) 4px,
          transparent 4px,
          transparent 8px
        );
      }

      .bj-card-corner {
        position: absolute;
        display: flex;
        flex-direction: column;
        align-items: center;
        font-size: 0.72rem;
        line-height: 1.1;
      }
      .bj-card-tl { top: 4px; left: 5px; }
      .bj-card-br { bottom: 4px; right: 5px; transform: rotate(180deg); }
      .bj-card-center { font-size: 1.3rem; }

      /* ── Total ── */
      .bj-total {
        font-family: var(--font-display, monospace);
        font-size: 1rem;
        font-weight: bold;
        color: var(--text-primary, #fff);
        min-height: 1.4rem;
      }
      .bj-total--bust { color: #ef5350; }
      .bj-total--21   { color: #66bb6a; }

      /* ── Résultat ── */
      .bj-result {
        text-align: center;
        padding: 0.45rem 1.5rem;
        border-radius: 8px;
        font-family: var(--font-display, monospace);
        font-size: 1.05rem;
        font-weight: bold;
        animation: bj-result-in 0.25s ease;
      }
      @keyframes bj-result-in {
        from { transform: scale(0.8); opacity: 0; }
        to   { transform: scale(1);   opacity: 1; }
      }
      .bj-result--blackjack { background: rgba(255,214,0,0.12); color: #ffd600; border: 1px solid rgba(255,214,0,0.3); }
      .bj-result--win,
      .bj-result--dealer-bust { background: rgba(102,187,106,0.12); color: #66bb6a; border: 1px solid rgba(102,187,106,0.3); }
      .bj-result--lose,
      .bj-result--bust        { background: rgba(239,83,80,0.12);  color: #ef5350; border: 1px solid rgba(239,83,80,0.3); }
      .bj-result--push        { background: rgba(255,255,255,0.06); color: #9e9e9e; border: 1px solid rgba(255,255,255,0.15); }

      /* ── Bottom ── */
      .bj-bottom {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        margin-top: auto;
      }
      .bj-bet-info {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        font-family: var(--font-display, monospace);
      }
      .bj-info-label {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--text-muted, #666);
      }
      .bj-info-sep { color: var(--text-muted, #444); margin: 0 0.25rem; }
      .bj-bet-value   { font-size: 1.15rem; font-weight: bold; color: #ffd600; min-width: 3ch; text-align: center; }
      .bj-chips-value { font-size: 1.15rem; font-weight: bold; color: var(--neon-cyan, #00e5ff); min-width: 4ch; text-align: center; }

      /* ── Jetons ── */
      .bj-chip-row, .bj-action-row {
        display: flex;
        gap: 0.5rem;
        justify-content: center;
        flex-wrap: wrap;
      }
      .bj-chip {
        width: 50px; height: 50px;
        border-radius: 50%;
        border: 3px solid;
        font-weight: 700;
        font-size: 0.8rem;
        cursor: pointer;
        background: transparent;
        transition: transform 0.1s, box-shadow 0.15s;
      }
      .bj-chip:hover  { transform: scale(1.12); box-shadow: 0 0 14px currentColor; }
      .bj-chip:active { transform: scale(0.93); }
      .bj-chip--10  { border-color: #9e9e9e; color: #9e9e9e; }
      .bj-chip--25  { border-color: #66bb6a; color: #66bb6a; }
      .bj-chip--50  { border-color: #42a5f5; color: #42a5f5; }
      .bj-chip--100 { border-color: #ef5350; color: #ef5350; }

      /* ── Touches affichées dans les boutons ── */
      .bj-action-row kbd {
        display: inline-block;
        font-size: 0.65rem;
        padding: 1px 4px;
        border: 1px solid rgba(255,255,255,0.25);
        border-radius: 3px;
        margin-left: 4px;
        opacity: 0.7;
      }

      .hidden { display: none !important; }
    `;
    document.head.appendChild(s);
  }
}
