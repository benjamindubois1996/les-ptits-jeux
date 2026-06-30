import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop      from '../../js/core/GameLoop.js';
import { randInt }   from '../../js/utils/Random.js';

const TOTAL_ROUNDS   = 5;
const TICK_MS         = 50;
const MIN_WAIT_MS     = 1200;
const MAX_WAIT_MS     = 3500;
const GO_TIMEOUT_MS   = 2000;
const RESULT_PAUSE_MS = 900;

export default class Reaction extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
    this._loop = new GameLoop(() => this._onLoopTick());
    this._timerElapsed  = 0;
    this._timerTarget    = 0;
    this._timerCallback  = null;
    this._goAt = 0;
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  _gameId() { return 'reaction'; }

  _buildFullState() {
    return {
      status: 'idle',
      phase: 'ready',
      roundIndex: 0,
      totalRounds: TOTAL_ROUNDS,
      results: [],
      score: 0,
    };
  }

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  start() {
    this.state = { ...this._buildFullState(), status: 'playing' };
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
    this._startRound();
  }

  _startRound() {
    const s = this.state;
    s.phase = 'waiting';
    EventBus.emit('game:tick', { state: s, action: 'round-start' });
    this._startTimer(randInt(MAX_WAIT_MS - MIN_WAIT_MS) + MIN_WAIT_MS, () => {
      if (this.state.status !== 'playing') return;
      this.state.phase = 'go';
      this._goAt = performance.now();
      EventBus.emit('game:tick', { state: this.state, action: 'go' });
      this._startTimer(GO_TIMEOUT_MS, () => {
        if (this.state.phase !== 'go') return;
        this.state.phase = 'timeout';
        this.state.results.push({ ms: null });
        EventBus.emit('game:tick', { state: this.state, action: 'timeout' });
        this._startTimer(RESULT_PAUSE_MS, () => this._advanceRound());
      });
    });
  }

  react() {
    const s = this.state;
    if (s.status !== 'playing') return;

    if (s.phase === 'waiting') {
      this._loop.stop();
      s.phase = 'too-soon';
      s.results.push({ ms: null });
      EventBus.emit('game:tick', { state: s, action: 'too-soon' });
      this._startTimer(RESULT_PAUSE_MS, () => this._advanceRound());
      return;
    }

    if (s.phase === 'go') {
      this._loop.stop();
      const ms = Math.round(performance.now() - this._goAt);
      s.phase = 'result';
      s.results.push({ ms });
      s.score += Math.max(0, 500 - ms);
      EventBus.emit('game:tick', { state: s, action: 'result' });
      this._startTimer(RESULT_PAUSE_MS, () => this._advanceRound());
    }
  }

  _advanceRound() {
    const s = this.state;
    s.roundIndex++;
    if (s.roundIndex >= s.totalRounds) { this._finish(); return; }
    this._startRound();
  }

  _finish() {
    const s = this.state;
    s.status = 'over';
    s.phase  = 'finished';
    const valid = s.results.filter(r => r.ms !== null).map(r => r.ms);
    const avgMs = valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
    const bestMs = valid.length ? Math.min(...valid) : null;
    const { isRecord, best } = ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:over', { score: s.score, isRecord, best, avgMs, bestMs });
  }

  _startTimer(ms, cb) {
    this._timerElapsed  = 0;
    this._timerTarget    = ms;
    this._timerCallback  = cb;
    this._loop.start(TICK_MS);
  }

  _onLoopTick() {
    this._timerElapsed += TICK_MS;
    if (this._timerElapsed >= this._timerTarget) {
      this._loop.stop();
      const cb = this._timerCallback;
      this._timerCallback = null;
      if (cb) cb();
    }
  }

  _bindControls() {
    document.addEventListener('keydown', this._onKeyDown);
  }

  _unbindControls() {
    document.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    if (e.key === 'p' || e.key === 'P') { EventBus.emit('game:pause-toggle'); return; }
    if (e.key === 'r' || e.key === 'R') { EventBus.emit('game:restart'); return; }
    if (e.code === 'Space') { e.preventDefault(); this.react(); }
  }

  _onPause()  { this._loop.stop(); }
  _onResume() { if (this._timerCallback) this._loop.start(TICK_MS); }

  restart() {
    this._loop.stop();
    this._timerCallback = null;
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    this._loop.destroy();
    this._unbindControls();
    super.destroy();
  }
}
