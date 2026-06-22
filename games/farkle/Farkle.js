import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import { randInt }  from '../../js/utils/Random.js';

export default class Farkle extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
  }

  _gameId() { return 'farkle'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); }

  start(options = {}) {
    this.state = {
      ...this._buildFullState(),
      status:    'playing',
      mode:      options.mode ?? 'basique',
      dice:      Array(6).fill({ value: 1, kept: false, scored: false }),
      turnScore: 0,
      totalScore:0,
      rollsLeft: 3,
      round:     1,
      phase:     'roll',   // 'roll' | 'keep' | 'farkle' | 'done'
      lastScoreInfo: '',
    };
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  roll() {
    const { state } = this;
    if (state.status !== 'playing' || state.phase !== 'roll') return;
    if (state.rollsLeft <= 0) return;

    // Roll non-kept dice
    const free = state.dice.filter(d => !d.kept && !d.scored);
    if (free.length === 0) {
      // All dice are kept → reset scored dice (hot dice)
      state.dice = state.dice.map(d => ({ ...d, kept: false, scored: false }));
    }

    state.dice = state.dice.map(d => d.kept || d.scored ? d : { ...d, value: randInt(1, 6), kept: false });
    state.rollsLeft--;
    state.phase = 'keep';

    // Check farkle (no scoring dice available)
    const freeDice = state.dice.filter(d => !d.kept && !d.scored);
    if (!this._hasScoringDie(freeDice)) {
      state.phase     = 'farkle';
      state.turnScore = 0;
      state.lastScoreInfo = 'FARKLE ! Score du tour perdu !';
      EventBus.emit('game:tick', { state, action: 'farkle' });
      return;
    }

    state.lastScoreInfo = '';
    EventBus.emit('game:tick', { state, action: 'rolled' });
  }

  toggleKeep(idx) {
    const { state } = this;
    if (state.status !== 'playing' || state.phase !== 'keep') return;
    const die = state.dice[idx];
    if (die.scored) return;
    state.dice = state.dice.map((d, i) => i === idx ? { ...d, kept: !d.kept } : d);
    EventBus.emit('game:tick', { state, action: 'toggle' });
  }

  bank() {
    const { state } = this;
    if (state.status !== 'playing' || state.phase !== 'keep') return;
    const kept = state.dice.filter(d => d.kept);
    if (!kept.length) return;
    const { score, info } = this._scoreKept(state.dice);
    if (score === 0) { state.lastScoreInfo = 'Sélectionne des dés qui scorent !'; EventBus.emit('game:tick', { state, action: 'info' }); return; }

    state.turnScore       += score;
    state.lastScoreInfo   = info;
    state.dice = state.dice.map(d => d.kept ? { ...d, kept: false, scored: true } : d);
    state.phase = 'roll';
    EventBus.emit('game:tick', { state, action: 'banked' });
  }

  endTurn() {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (state.phase === 'farkle') {
      state.turnScore = 0;
      this._nextRound(state);
      return;
    }
    if (state.phase === 'keep' || state.phase === 'roll') {
      const kept = state.dice.filter(d => d.kept);
      if (kept.length > 0) this.bank();
    }
    state.totalScore += state.turnScore;
    EventBus.emit('game:score-update', { score: state.totalScore });
    this._nextRound(state);
  }

  _nextRound(state) {
    if (state.round >= this.config.gameplay.maxRounds) {
      state.status = 'over';
      const { best } = ScoreService.submit(this._gameId(), state.totalScore);
      EventBus.emit('game:won', {
        result: 'win', icon: '🎲', title: 'FIN DE PARTIE !',
        score: state.totalScore, best,
        extraInfo: `<div class="overlay-score">${state.round} rounds joués</div>`,
      });
      return;
    }
    state.round++;
    state.turnScore = 0;
    state.rollsLeft = 3;
    state.phase     = 'roll';
    state.dice      = Array(6).fill(null).map(() => ({ value: 1, kept: false, scored: false }));
    state.lastScoreInfo = '';
    EventBus.emit('game:tick', { state, action: 'next-round' });
  }

  _scoreKept(dice) {
    const vals = dice.filter(d => d.kept).map(d => d.value).sort();
    if (!vals.length) return { score: 0, info: '' };

    const counts = Array(7).fill(0);
    vals.forEach(v => counts[v]++);

    // Straight
    if (vals.length === 6 && vals.every((v, i) => v === i + 1)) return { score: this.config.scoring.straight, info: '🎰 Suite 1-6 !' };
    // Three pairs
    const pairs = [1,2,3,4,5,6].filter(v => counts[v] === 2);
    if (pairs.length === 3) return { score: this.config.scoring.threePairs, info: '🎰 3 Paires !' };

    let score = 0;
    const infoParts = [];
    for (let v = 1; v <= 6; v++) {
      const n = counts[v];
      if (n >= 3) {
        const base = v === 1 ? this.config.scoring.threeOnesBonus : v * this.config.scoring.threeOfAKindMultiplier;
        const mult = n - 3;
        const pts  = base * (2 ** mult);
        score += pts;
        infoParts.push(`${n}×${v} (${pts}pts)`);
        counts[v] = 0;
      }
    }
    const onesLeft  = counts[1];
    const fivesLeft = counts[5];
    score += onesLeft  * this.config.scoring.one;
    score += fivesLeft * this.config.scoring.five;
    if (onesLeft)  infoParts.push(`${onesLeft}×1`);
    if (fivesLeft) infoParts.push(`${fivesLeft}×5`);

    return { score, info: infoParts.join(', ') || '' };
  }

  _hasScoringDie(freeDice) {
    if (!freeDice.length) return false;
    const vals = freeDice.map(d => d.value);
    if (vals.includes(1) || vals.includes(5)) return true;
    const counts = Array(7).fill(0);
    vals.forEach(v => counts[v]++);
    return counts.some(n => n >= 3);
  }

  _buildFullState() {
    return { status:'idle', mode:'basique', dice:[], turnScore:0, totalScore:0, rollsLeft:3, round:1, phase:'roll', lastScoreInfo:'' };
  }
}
