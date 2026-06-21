import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export const CATEGORIES = [
  'ones','twos','threes','fours','fives','sixes',
  'threeOfKind','fourOfKind','fullHouse','smallStraight','largeStraight','yahtzee','chance',
];

export default class Yahtzee extends BaseGame {

  constructor(config) {
    super(config);
    this.state = this._buildFullState();
  }

  _gameId() { return 'yahtzee'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); }

  start(options = {}) {
    const mode  = options.mode ?? 'basique';
    this.state  = {
      ...this._buildFullState(),
      status: 'playing',
      mode,
      phase:  'start-of-turn',
    };
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  roll() {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (state.rollsLeft <= 0) return;

    for (let i = 0; i < 5; i++) {
      if (!state.held[i]) {
        state.dice[i] = Math.floor(Math.random() * 6) + 1;
      }
    }
    state.rollsLeft--;
    state.phase = state.rollsLeft === 0 ? 'must-score' : 'rolling';
    EventBus.emit('game:tick', { state, action: 'rolled' });
  }

  toggleHold(index) {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (state.phase === 'start-of-turn' || state.rollsLeft === 3) return;
    if (state.rollsLeft === 0) return;
    state.held[index] = !state.held[index];
    EventBus.emit('game:tick', { state, action: 'hold-toggle' });
  }

  score(category) {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (state.phase === 'start-of-turn') return;
    if (state.scorecard[category] !== null) return;

    const pts = this.calculateScore(category, state.dice);
    state.scorecard[category] = pts;
    state.totalTurns++;

    const finalScore = this._computeTotal(state);
    state.score      = finalScore;
    EventBus.emit('game:score-update', { score: finalScore });

    if (state.totalTurns >= this.config.gameplay.numTurns) {
      /* Game over */
      state.status = 'gameover';
      ScoreService.submit(this._gameId(), finalScore);
      EventBus.emit('game:tick', { state, action: 'scored' });
      EventBus.emit('game:won', {
        result: 'win',
        icon:   '🎲',
        title:  'PARTIE TERMINÉE',
        score:  finalScore,
        best:   ScoreService.getBest(this._gameId()),
      });
    } else {
      /* Next turn */
      state.dice    = [0,0,0,0,0];
      state.held    = Array(5).fill(false);
      state.rollsLeft = 3;
      state.phase   = 'start-of-turn';
      EventBus.emit('game:tick', { state, action: 'next-turn' });
    }
  }

  calculateScore(category, dice) {
    const counts = Array(7).fill(0);
    dice.forEach(d => counts[d]++);
    const sum    = dice.reduce((a, b) => a + b, 0);
    const cfg    = this.config.scoring;

    switch (category) {
      case 'ones':   return counts[1] * 1;
      case 'twos':   return counts[2] * 2;
      case 'threes': return counts[3] * 3;
      case 'fours':  return counts[4] * 4;
      case 'fives':  return counts[5] * 5;
      case 'sixes':  return counts[6] * 6;
      case 'chance': return sum;
      case 'threeOfKind': return counts.some(c => c >= 3) ? sum : 0;
      case 'fourOfKind':  return counts.some(c => c >= 4) ? sum : 0;
      case 'yahtzee':     return counts.some(c => c === 5) ? cfg.yahtzee : 0;
      case 'fullHouse': {
        const vals  = counts.map((c, v) => ({ c, v })).filter(x => x.c > 0 && x.v > 0);
        const has3  = vals.some(x => x.c === 3);
        const has2  = vals.some(x => x.c === 2);
        return (has3 && has2) ? cfg.fullHouse : 0;
      }
      case 'smallStraight': {
        const unique = [...new Set(dice)].sort((a, b) => a - b);
        const has4run = [[1,2,3,4],[2,3,4,5],[3,4,5,6]].some(
          run => run.every(n => unique.includes(n))
        );
        return has4run ? cfg.smallStraight : 0;
      }
      case 'largeStraight': {
        const u = [...new Set(dice)].sort((a, b) => a - b);
        const has5run = [[1,2,3,4,5],[2,3,4,5,6]].some(
          run => run.length === u.length && run.every((n, i) => n === u[i])
        );
        return has5run ? cfg.largeStraight : 0;
      }
      default: return 0;
    }
  }

  _computeTotal(state) {
    const { bonusThreshold, bonusValue } = this.config.gameplay;
    const sc  = state.scorecard;
    const upper = ['ones','twos','threes','fours','fives','sixes']
      .reduce((s, k) => s + (sc[k] ?? 0), 0);
    const bonus = upper >= bonusThreshold ? bonusValue : 0;
    const lower = ['threeOfKind','fourOfKind','fullHouse','smallStraight','largeStraight','yahtzee','chance']
      .reduce((s, k) => s + (sc[k] ?? 0), 0);
    return upper + bonus + lower;
  }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _buildFullState() {
    const scorecard = {};
    CATEGORIES.forEach(k => { scorecard[k] = null; });
    return {
      status:     'loading',
      phase:      'start-of-turn',
      dice:       [0, 0, 0, 0, 0],
      held:       Array(5).fill(false),
      rollsLeft:  3,
      scorecard,
      totalTurns: 0,
      score:      0,
      mode:       'basique',
    };
  }
}
