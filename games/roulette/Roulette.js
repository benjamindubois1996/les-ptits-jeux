import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// European roulette pockets 0-36
const RED_NUMBERS  = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const BLACK_NUMBERS= new Set([2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35]);

// Wheel order (European roulette)
const WHEEL_ORDER = [
  0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,
  5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26
];

function getColor(n) {
  if (n === 0)            return 'green';
  if (RED_NUMBERS.has(n)) return 'red';
  return 'black';
}

export default class Roulette extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._spinTid = null;
  }

  _gameId() { return 'roulette'; }

  _buildFullState() {
    return {
      status:      'idle',
      phase:       'betting', // betting | spinning | result
      chips:       100,
      bets:        { red: 0, black: 0, even: 0, odd: 0, number: -1, numberAmt: 0 },
      currentBet:  5,
      result:      null, // { number, color }
      lastResults: [],
      wheelAngle:  0,
      spinning:    false,
      message:     '',
      roundProfit: 0,
    };
  }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  start() {
    const s = this.state;
    s.status  = 'playing';
    s.message = 'Placez vos mises !';
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  setBetAmount(amt) {
    if (this.state.phase !== 'betting') return;
    this.state.currentBet = Math.max(1, Math.min(amt, this.state.chips));
    EventBus.emit('game:tick', { state: this.state });
  }

  placeBet(type, number = -1) {
    const s = this.state;
    if (s.phase !== 'betting' || s.spinning) return;
    const amt = Math.min(s.currentBet, s.chips);
    if (amt <= 0) return;

    if (type === 'number') {
      if (number < 0 || number > 36) return;
      s.bets.number    = number;
      s.bets.numberAmt = amt;
      s.chips -= amt;
      s.message = `Mise de ${amt} jetons sur le ${number}`;
    } else if (['red','black','even','odd'].includes(type)) {
      s.bets[type] += amt;
      s.chips      -= amt;
      s.message = `Mise de ${amt} jetons sur ${type}`;
    }

    EventBus.emit('game:tick', { state: s });
  }

  clearBets() {
    const s = this.state;
    if (s.phase !== 'betting') return;
    const returned = s.bets.red + s.bets.black + s.bets.even + s.bets.odd + s.bets.numberAmt;
    s.chips += returned;
    s.bets   = { red: 0, black: 0, even: 0, odd: 0, number: -1, numberAmt: 0 };
    s.message = 'Mises annulées';
    EventBus.emit('game:tick', { state: s });
  }

  spin() {
    const s = this.state;
    if (s.phase !== 'betting' || s.spinning) return;
    const totalBet = s.bets.red + s.bets.black + s.bets.even + s.bets.odd + s.bets.numberAmt;
    if (totalBet === 0) { s.message = 'Placez au moins une mise !'; EventBus.emit('game:tick', { state: s }); return; }

    s.phase   = 'spinning';
    s.spinning = true;
    s.message  = 'La roue tourne…';
    EventBus.emit('game:tick', { state: s });

    const landingNumber = Math.floor(Math.random() * 37);
    const landingIdx    = WHEEL_ORDER.indexOf(landingNumber);
    // Animate wheel — result after 3 seconds
    this._spinTid = setTimeout(() => this._resolve(landingNumber, landingIdx), 3000);
  }

  _resolve(number, wheelIdx) {
    const s = this.state;
    s.spinning = false;
    const color  = getColor(number);
    s.result = { number, color };
    s.lastResults.unshift({ number, color });
    if (s.lastResults.length > 10) s.lastResults.pop();

    // Calculate winnings
    let profit = 0;
    if (s.bets.red   > 0 && color === 'red')   profit += s.bets.red   * 2;
    if (s.bets.black > 0 && color === 'black')  profit += s.bets.black * 2;
    if (s.bets.even  > 0 && number !== 0 && number % 2 === 0) profit += s.bets.even * 2;
    if (s.bets.odd   > 0 && number !== 0 && number % 2 === 1) profit += s.bets.odd  * 2;
    if (s.bets.number === number && s.bets.numberAmt > 0) profit += s.bets.numberAmt * 36;

    s.chips       += profit;
    s.roundProfit  = profit - (s.bets.red + s.bets.black + s.bets.even + s.bets.odd + s.bets.numberAmt);
    ScoreService.submit(this._gameId(), Math.max(0, s.chips - 100));

    if (profit > 0) {
      s.message = `✨ ${number} ${color} — +${profit} jetons !`;
    } else {
      s.message = `${number} ${color} — Perdu ! ${s.chips} jetons restants.`;
    }

    s.phase = 'result';
    EventBus.emit('game:tick', { state: s });

    // Reset bets, back to betting
    s.bets = { red: 0, black: 0, even: 0, odd: 0, number: -1, numberAmt: 0 };

    if (s.chips <= 0) {
      this._spinTid = setTimeout(() => {
        s.status  = 'over';
        s.message = 'Plus de jetons ! Fin de la partie.';
        EventBus.emit('game:tick', { state: s });
        EventBus.emit('game:over', { score: 0 });
      }, 2000);
      return;
    }

    this._spinTid = setTimeout(() => {
      s.phase   = 'betting';
      s.result  = null;
      s.message = 'Placez vos mises !';
      EventBus.emit('game:tick', { state: s });
    }, 2000);
  }

  restart() {
    if (this._spinTid) { clearTimeout(this._spinTid); this._spinTid = null; }
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    if (this._spinTid) { clearTimeout(this._spinTid); this._spinTid = null; }
    super.destroy();
  }
}

