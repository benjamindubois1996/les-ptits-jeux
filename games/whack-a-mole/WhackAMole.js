import EventBus     from '../../js/core/EventBus.js';
import ScoreService  from '../../js/services/ScoreService.js';
import BaseGame      from '../../js/core/BaseGame.js';
import { randInt }   from '../../js/utils/Random.js';

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
      cells:    Array(total).fill(false),
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
    if (this.state.status !== 'playing' || !this.state.cells[idx]) return;
    this.state.cells[idx] = false;
    this.state.score     += this.config.scoring.hit;
    EventBus.emit('game:score-update', { score: this.state.score });
    EventBus.emit('game:tick', { state: this.state, action: 'whack', cellIdx: idx });
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
    const free  = cells.reduce((acc, v, i) => { if (!v) acc.push(i); return acc; }, []);
    if (!free.length) return;
    const idx = free[randInt(0, free.length - 1)];
    cells[idx] = true;
    EventBus.emit('game:tick', { state: this.state, action: 'pop', cellIdx: idx });

    const t = setTimeout(() => {
      if (cells[idx]) {
        cells[idx] = false;
        EventBus.emit('game:tick', { state: this.state, action: 'hide', cellIdx: idx });
      }
    }, this.config.gameplay.moleShowTime);
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
