import EventBus     from '../../js/core/EventBus.js';
import ScoreService  from '../../js/services/ScoreService.js';
import BaseGame      from '../../js/core/BaseGame.js';
import { randChoice } from '../../js/utils/Random.js';

// cells[i] : null | 'mole' | 'fake'
export default class WhackAMole extends BaseGame {
  constructor(config) {
    super(config);
    this.state       = this._buildFullState();
    this._gameTimer  = null;
    this._moleTimer  = null;
    this._hidTimers  = [];
  }

  _gameId() { return 'whack-a-mole'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    this._clearAll();
  }

  start(options = {}) {
    this._clearAll();
    const total = this.config.gameplay.gridSize ** 2;
    this.state = {
      ...this._buildFullState(),
      status:   'playing',
      mode:     options.mode ?? 'basique',
      cells:    Array(total).fill(null),
      score:    0,
      timeLeft: this.config.gameplay.gameDuration,
    };
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
    this._startCountdown();
    this._scheduleMole();
  }

  restart() {
    this._clearAll();
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  whack(idx) {
    const { state } = this;
    if (state.status !== 'playing' || !state.cells[idx]) return;

    const isFake = state.cells[idx] === 'fake';
    state.cells[idx] = null;

    if (isFake) {
      state.score = Math.max(0, state.score + this.config.scoring.fakePenalty);
    } else {
      state.score += this.config.scoring.hit;
    }

    EventBus.emit('game:score-update', { score: state.score });
    EventBus.emit('game:tick', { state, action: isFake ? 'fake-hit' : 'whack', cellIdx: idx });
  }

  _startCountdown() {
    this._gameTimer = setInterval(() => {
      if (this.state.status !== 'playing') return;
      this.state.timeLeft--;
      EventBus.emit('game:tick', { state: this.state, action: 'tick' });
      if (this.state.timeLeft <= 0) this._endGame();
    }, 1000);
  }

  _scheduleMole() {
    if (this.state.status !== 'playing') return;
    const elapsed  = this.config.gameplay.gameDuration - this.state.timeLeft;
    const progress = Math.min(elapsed / this.config.gameplay.gameDuration, 1);
    const base = this.config.gameplay.baseInterval;
    const min  = this.config.gameplay.minInterval;
    const interval = Math.max(min, base - progress * (base - min));

    this._moleTimer = setTimeout(() => {
      if (this.state.status !== 'playing') return;
      this._popMole();
      this._scheduleMole();
    }, interval);
  }

  _popMole() {
    const cells = this.state.cells;
    const free  = cells.reduce((acc, v, i) => { if (v === null) acc.push(i); return acc; }, []);
    if (!free.length) return;

    const idx  = randChoice(free);
    const type = Math.random() < this.config.scoring.fakeProbability ? 'fake' : 'mole';
    cells[idx] = type;
    EventBus.emit('game:tick', { state: this.state, action: 'pop', cellIdx: idx });

    const showTime = this.config.gameplay.moleShowTime;
    const t = setTimeout(() => {
      if (cells[idx] === type) {
        cells[idx] = null;
        EventBus.emit('game:tick', { state: this.state, action: 'hide', cellIdx: idx });
      }
    }, showTime);
    this._hidTimers.push(t);
  }

  _endGame() {
    this._clearAll();
    this.state.status = 'over';
    const { best } = ScoreService.submit(this._gameId(), this.state.score);
    EventBus.emit('game:over', {
      result: 'lose', icon: '⏱️', title: 'TEMPS ÉCOULÉ !',
      score: this.state.score, best,
    });
  }

  _clearAll() {
    clearInterval(this._gameTimer);
    clearTimeout(this._moleTimer);
    this._hidTimers.forEach(t => clearTimeout(t));
    this._hidTimers  = [];
    this._gameTimer  = null;
    this._moleTimer  = null;
  }

  _buildFullState() {
    return { status: 'idle', mode: 'basique', cells: [], score: 0, timeLeft: this.config.gameplay.gameDuration };
  }
}
