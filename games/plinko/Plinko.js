import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// Positions in path alternate integer ↔ half-integer.
// ROWS=10 bounces → path has 11 elements (start + 10 landings).
// Final position is always an integer (bucket index 0..COLS-1).

export default class Plinko extends BaseGame {
  constructor(config) {
    super(config);
    this.state      = this._buildFullState();
    this._stepTimer = null;
  }

  _gameId() { return 'plinko'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    clearTimeout(this._stepTimer);
  }

  start(options = {}) {
    clearTimeout(this._stepTimer);
    this.state = {
      ...this._buildFullState(),
      status:      'playing',
      mode:        options.mode ?? 'basique',
      phase:       'choose',
      round:       1,
      totalRounds: this.config.gameplay.rounds,
      score:       0,
      path:        [],
      ballStep:    -1,
      lastPts:     0,
      lastBucket:  -1,
    };
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  restart() {
    clearTimeout(this._stepTimer);
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  drop(col) {
    const { state } = this;
    if (state.status !== 'playing' || state.phase !== 'choose') return;

    state.path     = this._computePath(col);
    state.ballStep = 0;
    state.phase    = 'falling';
    state.lastPts  = 0;
    state.lastBucket = -1;
    EventBus.emit('game:tick', { state, action: 'drop' });
    this._advanceStep();
  }

  _advanceStep() {
    this._stepTimer = setTimeout(() => {
      const { state } = this;
      if (state.status !== 'playing') return;
      state.ballStep++;
      if (state.ballStep < state.path.length) {
        EventBus.emit('game:tick', { state, action: 'fall-step' });
        this._advanceStep();
      } else {
        this._land();
      }
    }, this.config.gameplay.stepMs);
  }

  _land() {
    const { state } = this;
    const finalPos  = Math.round(state.path[state.path.length - 1]);
    const buckets   = this.config.scoring.buckets;
    const pts       = buckets[Math.max(0, Math.min(buckets.length - 1, finalPos))];
    state.score    += pts;
    state.lastPts   = pts;
    state.lastBucket = finalPos;
    state.phase     = 'landed';
    EventBus.emit('game:score-update', { score: state.score });
    EventBus.emit('game:tick', { state, action: 'land', pts, bucket: finalPos });

    this._stepTimer = setTimeout(() => {
      if (state.status !== 'playing') return;
      if (state.round >= state.totalRounds) {
        this._endGame();
      } else {
        state.round++;
        state.phase      = 'choose';
        state.path       = [];
        state.ballStep   = -1;
        state.lastPts    = 0;
        state.lastBucket = -1;
        EventBus.emit('game:tick', { state, action: 'next-round' });
      }
    }, 1200);
  }

  _endGame() {
    const { state } = this;
    clearTimeout(this._stepTimer);
    state.status = 'over';
    const { best } = ScoreService.submit(this._gameId(), state.score);
    EventBus.emit('game:over', {
      result: 'lose', icon: '🎯', title: 'PARTIE TERMINÉE !',
      score: state.score, best,
    });
  }

  // Returns array of ROWS+1 positions: path[0]=startCol (integer),
  // alternating half-integer / integer after each bounce.
  _computePath(startCol) {
    const { rows, cols } = this.config.gameplay;
    const path = [startCol];
    let pos = startCol;
    for (let row = 0; row < rows; row++) {
      const goRight = Math.random() < 0.5;
      if (pos % 1 === 0) {
        // integer → half-integer
        let next = pos + (goRight ? 0.5 : -0.5);
        next = Math.max(0.5, Math.min(cols - 1.5, next));
        pos = next;
      } else {
        // half-integer → integer
        pos = goRight ? pos + 0.5 : pos - 0.5;
      }
      path.push(pos);
    }
    return path;
  }

  _buildFullState() {
    return {
      status: 'idle', mode: 'basique', phase: 'choose',
      round: 1, totalRounds: this.config.gameplay.rounds,
      score: 0, path: [], ballStep: -1, lastPts: 0, lastBucket: -1,
    };
  }
}
