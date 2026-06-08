import EventBus     from '../../js/core/EventBus.js';
import ScoreService  from '../../js/services/ScoreService.js';
import BaseGame      from '../../js/core/BaseGame.js';
import { shuffle }   from '../../js/utils/Random.js';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const VALUE = { A:11, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, J:10, Q:10, K:10 };
const RED   = new Set(['♥', '♦']);

export default class Blackjack extends BaseGame {

  constructor(config) {
    super(config);
    this.deck  = [];
    this.state = this._buildState();
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  _gameId() { return 'blackjack'; }

  init() {
    this._rebuildDeck();
    this._bindControls();
    this._setupEventBusBindings();
    EventBus.emit('game:ready',        { gameId: 'blackjack' });
    EventBus.emit('game:score-update', { score: this.state.chips });
    EventBus.emit('game:tick',         { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    this._unbindControls();
  }

  /* ============================================================
     MISES
     ============================================================ */

  addChip(amount) {
    if (this.state.status !== 'betting') return;
    const newBet = this.state.bet + amount;
    if (newBet > this.state.chips)              return;
    if (newBet > this.config.gameplay.maxBet)   return;
    this.state.bet = newBet;
    EventBus.emit('game:tick', { state: this.state, action: 'bet-changed' });
  }

  clearBet() {
    if (this.state.status !== 'betting') return;
    this.state.bet = 0;
    EventBus.emit('game:tick', { state: this.state, action: 'bet-changed' });
  }

  /* ============================================================
     DISTRIBUTION
     ============================================================ */

  deal() {
    if (this.state.status !== 'betting') return;
    if (this.state.bet < this.config.gameplay.minBet) return;

    if (this.deck.length < 52) this._rebuildDeck();

    this.state.chips -= this.state.bet;
    this.state.playerHand = [this._draw(), this._draw()];
    this.state.dealerHand = [this._draw(), this._draw()];
    this.state.status     = 'player-turn';
    this.state.canDouble  = this.state.chips >= this.state.bet;

    EventBus.emit('game:score-update', { score: this.state.chips });
    EventBus.emit('game:tick',         { state: this.state, action: 'deal' });

    if (this._isBlackjack(this.state.playerHand)) {
      this._resolveRound('blackjack');
    }
  }

  /* ============================================================
     ACTIONS JOUEUR
     ============================================================ */

  hit() {
    if (this.state.status !== 'player-turn') return;
    this.state.playerHand.push(this._draw());
    this.state.canDouble = false;
    EventBus.emit('game:tick', { state: this.state, action: 'hit' });

    if (this._handValue(this.state.playerHand) > 21) {
      this._resolveRound('bust');
    }
  }

  stand() {
    if (this.state.status !== 'player-turn') return;
    this.state.status = 'dealer-turn';
    EventBus.emit('game:tick', { state: this.state, action: 'stand' });
    this._dealerPlay();
  }

  double() {
    if (this.state.status !== 'player-turn' || !this.state.canDouble) return;
    this.state.chips -= this.state.bet;
    this.state.bet   *= 2;
    this.state.playerHand.push(this._draw());
    this.state.canDouble = false;

    EventBus.emit('game:score-update', { score: this.state.chips });
    EventBus.emit('game:tick',         { state: this.state, action: 'double' });

    if (this._handValue(this.state.playerHand) > 21) {
      this._resolveRound('bust');
    } else {
      this.stand();
    }
  }

  nextRound() {
    if (this.state.status !== 'round-over') return;
    const chips   = this.state.chips;
    const prevBet = Math.min(this.state.bet, chips);
    this.state = { ...this._buildState(), chips, bet: prevBet };
    EventBus.emit('game:score-update', { score: chips });
    EventBus.emit('game:tick',         { state: this.state, action: 'next-round' });
  }

  restart() {
    this.state = this._buildState();
    this._rebuildDeck();
    EventBus.emit('game:score-update', { score: this.state.chips });
    EventBus.emit('game:tick',         { state: this.state, action: 'restart' });
  }

  /* ============================================================
     CROUPIER
     ============================================================ */

  _dealerPlay() {
    while (this._handValue(this.state.dealerHand) < 17) {
      this.state.dealerHand.push(this._draw());
    }
    const dealer = this._handValue(this.state.dealerHand);
    const player = this._handValue(this.state.playerHand);

    if (dealer > 21)          this._resolveRound('dealer-bust');
    else if (player > dealer) this._resolveRound('win');
    else if (player < dealer) this._resolveRound('lose');
    else                      this._resolveRound('push');
  }

  /* ============================================================
     RÉSOLUTION
     ============================================================ */

  _resolveRound(outcome) {
    const payout = this.config.gameplay.blackjackPayout;
    let winnings = 0;
    let label    = '';

    switch (outcome) {
      case 'blackjack':   winnings = Math.floor(this.state.bet * (1 + payout)); label = 'BLACKJACK !';       break;
      case 'win':         winnings = this.state.bet * 2;                         label = 'Vous gagnez !';     break;
      case 'dealer-bust': winnings = this.state.bet * 2;                         label = 'Croupier bust !';   break;
      case 'push':        winnings = this.state.bet;                             label = 'Égalité';            break;
      case 'bust':        winnings = 0;                                           label = 'Bust !';             break;
      case 'lose':        winnings = 0;                                           label = 'Croupier gagne.';   break;
    }

    const net             = winnings - this.state.bet;
    this.state.chips     += winnings;
    this.state.lastResult = { outcome, label, winnings, net };
    this.state.status     = 'round-over';

    ScoreService.submit('blackjack', this.state.chips);
    EventBus.emit('game:score-update', { score: this.state.chips });
    EventBus.emit('game:tick',         { state: this.state, action: 'round-over' });

    if (this.state.chips <= 0) {
      setTimeout(() => EventBus.emit('game:over', { score: 0 }), 1500);
    }
  }

  /* ============================================================
     DECK
     ============================================================ */

  _rebuildDeck() {
    const { decks } = this.config.gameplay;
    this.deck = [];
    for (let d = 0; d < decks; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this.deck.push({ suit, rank, red: RED.has(suit) });
        }
      }
    }
    shuffle(this.deck);
  }

  _draw() {
    return this.deck.pop();
  }

  _handValue(hand) {
    let total = 0;
    let aces  = 0;
    for (const card of hand) {
      total += VALUE[card.rank];
      if (card.rank === 'A') aces++;
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return total;
  }

  _isBlackjack(hand) {
    return hand.length === 2 && this._handValue(hand) === 21;
  }

  /* ============================================================
     CONTRÔLES
     ============================================================ */

  _bindControls() {
    const keys = this.config.controls?.keyboard || {};

    this._onKeyDown = (e) => {
      const s = this.state.status;

      if (keys.restart?.includes(e.code)) {
        e.preventDefault();
        this.restart();
        return;
      }

      if (s === 'betting' && keys.deal?.includes(e.code)) {
        e.preventDefault();
        this.deal();
        return;
      }

      if (s === 'player-turn') {
        if (keys.hit?.includes(e.code))    { e.preventDefault(); this.hit();    return; }
        if (keys.stand?.includes(e.code))  { e.preventDefault(); this.stand();  return; }
        if (keys.double?.includes(e.code)) { e.preventDefault(); this.double(); return; }
      }

      if (s === 'round-over' && keys.deal?.includes(e.code)) {
        e.preventDefault();
        this.nextRound();
        return;
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
    // EventBus (boutons GameShell) — gérés par BaseGame._setupEventBusBindings()
  }

  _unbindControls() {
    window.removeEventListener('keydown', this._onKeyDown);
  }

  /* ============================================================
     ÉTAT
     ============================================================ */

  _buildState() {
    return {
      status:     'betting',
      chips:      this.config.gameplay.startingChips,
      bet:        0,
      playerHand: [],
      dealerHand: [],
      canDouble:  false,
      lastResult: null,
    };
  }
}
