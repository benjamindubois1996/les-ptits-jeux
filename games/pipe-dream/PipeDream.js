import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import { randInt }  from '../../js/utils/Random.js';

// Pipe types: each has a set of open directions (N, E, S, W)
// 0=straight-H, 1=straight-V, 2=bend-NE, 3=bend-SE, 4=bend-SW, 5=bend-NW, 6=cross
const PIPE_DIRS = [
  { opens: ['W','E'] },       // 0: horizontal
  { opens: ['N','S'] },       // 1: vertical
  { opens: ['N','E'] },       // 2: bend NE
  { opens: ['S','E'] },       // 3: bend SE
  { opens: ['S','W'] },       // 4: bend SW
  { opens: ['N','W'] },       // 5: bend NW
];

const OPP = { N:'S', S:'N', E:'W', W:'E' };
const DELTA = { N:[-1,0], S:[1,0], E:[0,1], W:[0,-1] };

export default class PipeDream extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
    this._flowTimer = null;
    this._countdownTimer = null;
  }

  _gameId() { return 'pipe-dream'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    this._clearTimers();
  }

  start(options = {}) {
    this._clearTimers();
    const { rows, cols } = this.config.gameplay;
    const { grid, source, sink } = this._makeGrid(rows, cols);
    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode:   options.mode ?? 'basique',
      rows, cols, grid, source, sink,
      flowed:   [],   // cells reached by flow
      flowing:  false,
      countdown: Math.ceil(this.config.gameplay.flowDelay / 1000),
      score:    0,
      level:    1,
    };
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
    this._startCountdown();
  }

  restart() {
    this._clearTimers();
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  rotatePipe(r, c) {
    const { state } = this;
    if (state.status !== 'playing' || state.flowing) return;
    const cell = state.grid[r][c];
    if (!cell || cell.isSource || cell.isSink) return;
    cell.type = (cell.type + 1) % PIPE_DIRS.length;
    EventBus.emit('game:tick', { state, action: 'rotate' });
  }

  _startCountdown() {
    this._countdownTimer = setInterval(() => {
      if (this.state.status !== 'playing') return;
      this.state.countdown--;
      EventBus.emit('game:tick', { state: this.state, action: 'countdown' });
      if (this.state.countdown <= 0) {
        clearInterval(this._countdownTimer);
        this._startFlow();
      }
    }, 1000);
  }

  _startFlow() {
    const { state } = this;
    state.flowing = true;
    const flowPath = this._computeFlowPath(state);
    let idx = 0;
    this._flowTimer = setInterval(() => {
      if (state.status !== 'playing') return;
      if (idx >= flowPath.length) {
        clearInterval(this._flowTimer);
        this._endLevel(state, flowPath.length);
        return;
      }
      state.flowed.push(flowPath[idx]);
      idx++;
      EventBus.emit('game:tick', { state, action: 'flow' });
    }, this.config.gameplay.flowInterval);
  }

  _computeFlowPath(state) {
    const { source, grid, rows, cols } = state;
    const path = [{ r: source.r, c: source.c }];
    let r = source.r, c = source.c;
    let fromDir = null;  // direction we came FROM (so we don't backtrack)

    // Source exits in a fixed direction
    let exitDir = grid[r][c].exitDir ?? 'E';
    fromDir = OPP[exitDir];

    for (let step = 0; step < rows * cols; step++) {
      const [dr, dc] = DELTA[exitDir];
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break;
      const nextCell = grid[nr][nc];
      if (!nextCell) break;
      const entryDir = OPP[exitDir];
      if (!PIPE_DIRS[nextCell.type]?.opens.includes(entryDir) && !nextCell.isSink) break;
      r = nr; c = nc;
      path.push({ r, c });
      if (nextCell.isSink) break;
      // Find the other opening
      const opens = PIPE_DIRS[nextCell.type]?.opens ?? [];
      const nextExit = opens.find(d => d !== entryDir);
      if (!nextExit) break;
      exitDir = nextExit;
    }
    return path;
  }

  _endLevel(state, reached) {
    const lastCell = state.flowed[state.flowed.length - 1];
    const win = lastCell && state.grid[lastCell.r]?.[lastCell.c]?.isSink;
    const pts = reached * this.config.scoring.perPipe * state.level;
    state.score += pts;
    EventBus.emit('game:score-update', { score: state.score });

    if (win) {
      state.level++;
      ScoreService.submit(this._gameId(), state.score);
      if (state.level > this.config.gameplay.levelThreshold) {
        state.status = 'won';
        const { best } = ScoreService.submit(this._gameId(), state.score);
        EventBus.emit('game:won', { result:'win', icon:'🔧', title:'TOUS LES NIVEAUX !', score: state.score, best });
      } else {
        EventBus.emit('game:tick', { state, action: 'level-won' });
        setTimeout(() => this._nextLevel(state), 1200);
      }
    } else {
      state.status = 'over';
      const { best } = ScoreService.submit(this._gameId(), state.score);
      EventBus.emit('game:over', { result:'lose', icon:'💧', title:'TUYAUX BRISÉS !', score: state.score, best,
        extraInfo: `<div class="overlay-score">${reached} tuyaux connectés</div>` });
    }
  }

  _nextLevel(state) {
    this._clearTimers();
    const { rows, cols } = this.config.gameplay;
    const { grid, source, sink } = this._makeGrid(rows, cols);
    state.flowed  = [];
    state.flowing = false;
    state.grid    = grid;
    state.source  = source;
    state.sink    = sink;
    state.countdown = Math.ceil(this.config.gameplay.flowDelay / 1000);
    EventBus.emit('game:tick', { state, action: 'new-level' });
    this._startCountdown();
  }

  _makeGrid(rows, cols) {
    const grid = Array.from({ length: rows }, () => Array(cols).fill(null).map(() => ({ type: randInt(0, 5) })));
    const sr = randInt(0, rows - 1), sc = 0;
    const er = randInt(0, rows - 1), ec = cols - 1;
    grid[sr][sc] = { isSource: true, type: 0, exitDir: 'E' };
    grid[er][ec] = { isSink: true, type: 1 };
    return { grid, source: { r: sr, c: sc }, sink: { r: er, c: ec } };
  }

  _clearTimers() {
    clearInterval(this._flowTimer);
    clearInterval(this._countdownTimer);
    this._flowTimer = null;
    this._countdownTimer = null;
  }

  _buildFullState() {
    return { status:'idle', mode:'basique', rows:0, cols:0, grid:[], source:null, sink:null, flowed:[], flowing:false, countdown:0, score:0, level:1 };
  }
}
