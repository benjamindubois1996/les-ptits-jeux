import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop      from '../../js/core/GameLoop.js';
import { randInt }   from '../../js/utils/Random.js';

const TICK_MS           = 50;
const FLASH_ON_MS       = 420;
const FLASH_GAP_MS      = 220;
const NOTE_COUNT        = 6;
const POINTS_PER_ROUND  = 10;
const MISTAKE_PAUSE_MS  = 900;
const ROUND_PAUSE_MS    = 700;

export default class MemoryMusic extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
    this._loop = new GameLoop(() => this._onLoopTick());
    this._timerElapsed  = 0;
    this._timerTarget    = 0;
    this._timerCallback  = null;
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  _gameId() { return 'memory-music'; }

  _buildFullState() {
    return {
      status: 'idle',
      phase: 'idle',
      sequence: [],
      inputIndex: 0,
      round: 0,
      score: 0,
      lives: this.lives.count,
      activeNote: null,
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
    this.lives.reset();
    this.state = { ...this._buildFullState(), status: 'playing', lives: this.lives.count };
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
    this._nextRound();
  }

  _nextRound() {
    const s = this.state;
    s.sequence.push(randInt(NOTE_COUNT));
    s.round       = s.sequence.length;
    s.inputIndex  = 0;
    s.phase       = 'showing';
    EventBus.emit('game:tick', { state: s, action: 'round-start' });
    this._startTimer(500, () => this._playSequence(0));
  }

  _playSequence(index) {
    const s = this.state;
    if (s.status !== 'playing') return;

    if (index >= s.sequence.length) {
      s.phase = 'waiting';
      s.activeNote = null;
      EventBus.emit('game:tick', { state: s, action: 'player-turn' });
      return;
    }

    s.activeNote = s.sequence[index];
    EventBus.emit('game:tick', { state: s, action: 'flash-on', note: s.activeNote });
    this._startTimer(FLASH_ON_MS, () => {
      s.activeNote = null;
      EventBus.emit('game:tick', { state: s, action: 'flash-off' });
      this._startTimer(FLASH_GAP_MS, () => this._playSequence(index + 1));
    });
  }

  press(noteId) {
    const s = this.state;
    if (s.status !== 'playing' || s.phase !== 'waiting') return;

    const expected = s.sequence[s.inputIndex];
    EventBus.emit('game:tick', { state: s, action: 'press', note: noteId, correct: noteId === expected });

    if (noteId !== expected) {
      this._loseLife();
      return;
    }

    s.inputIndex++;
    if (s.inputIndex < s.sequence.length) return;

    s.score += s.round * POINTS_PER_ROUND;
    ScoreService.submit(this._gameId(), s.score);
    s.phase = 'round-complete';
    EventBus.emit('game:tick', { state: s, action: 'round-complete' });
    this._startTimer(ROUND_PAUSE_MS, () => this._nextRound());
  }

  _loseLife() {
    const s = this.state;
    const remaining = this.lives.lose();
    s.lives = remaining;

    if (remaining <= 0) {
      s.status = 'over';
      s.phase  = 'gameover';
      const { isRecord, best } = ScoreService.submit(this._gameId(), s.score);
      EventBus.emit('game:over', { score: s.score, isRecord, best, round: s.round });
      return;
    }

    s.phase = 'mistake';
    EventBus.emit('game:tick', { state: s, action: 'mistake' });
    this._startTimer(MISTAKE_PAUSE_MS, () => {
      s.inputIndex = 0;
      s.phase = 'showing';
      EventBus.emit('game:tick', { state: s, action: 'retry' });
      this._playSequence(0);
    });
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
    const idx = ['1', '2', '3', '4', '5', '6'].indexOf(e.key);
    if (idx !== -1) this.press(idx);
  }

  _onPause()  { this._loop.stop(); }
  _onResume() { if (this._timerCallback) this._loop.start(TICK_MS); }

  restart() {
    this._loop.stop();
    this._timerCallback = null;
    this.lives.reset();
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    this._loop.destroy();
    this._unbindControls();
    super.destroy();
  }
}
