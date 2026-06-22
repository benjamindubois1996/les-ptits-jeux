import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';

const DIR = { UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT' };
const DELTA = { UP:[-1,0], DOWN:[1,0], LEFT:[0,-1], RIGHT:[0,1] };
const OPP   = { UP:'DOWN', DOWN:'UP', LEFT:'RIGHT', RIGHT:'LEFT' };

export default class Tron extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
    this._loop = new GameLoop(() => this._tick());
    this._nextDir = DIR.RIGHT;
    this._lives = 0;
  }

  _gameId() { return 'tron'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    this._loop.stop();
  }

  start(options = {}) {
    this._loop.stop();
    this._lives = this.config.lives?.initial ?? 3;
    const { rows, cols } = this.config.gameplay;
    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode:   options.mode ?? 'basique',
      rows, cols,
      grid:   Array.from({ length: rows }, () => Array(cols).fill(0)),
      player: { r: Math.floor(rows/2), c: Math.floor(cols*0.25), dir: DIR.RIGHT, alive: true, color: 1 },
      ai:     { r: Math.floor(rows/2), c: Math.floor(cols*0.75), dir: DIR.LEFT,  alive: true, color: 2 },
      score:  0,
      tick:   0,
    };
    const { player: p, ai, grid } = this.state;
    grid[p.r][p.c] = 1;
    grid[ai.r][ai.c] = 2;
    this._nextDir = DIR.RIGHT;
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
    this._loop.start(this.config.gameplay.tickRate);
  }

  restart() {
    this._loop.stop();
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  setDir(dir) {
    const { player } = this.state;
    if (!player?.alive) return;
    if (OPP[dir] === player.dir) return;
    this._nextDir = dir;
  }

  _tick() {
    const { state } = this;
    if (state.status !== 'playing') return;

    state.tick++;
    state.player.dir = this._nextDir;

    // AI logic — simple: avoid walls and trails
    if (state.ai.alive) {
      state.ai.dir = this._aiChooseDir(state);
    }

    // Move both
    for (const agent of [state.player, state.ai]) {
      if (!agent.alive) continue;
      const [dr, dc] = DELTA[agent.dir];
      const nr = agent.r + dr, nc = agent.c + dc;
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols || state.grid[nr][nc] !== 0) {
        agent.alive = false;
      } else {
        agent.r = nr; agent.c = nc;
        state.grid[nr][nc] = agent.color;
      }
    }

    state.score = state.tick;
    EventBus.emit('game:score-update', { score: state.score });

    if (!state.player.alive || !state.ai.alive) {
      this._endRound(state);
      return;
    }

    EventBus.emit('game:tick', { state, action: 'tick' });
  }

  _aiChooseDir(state) {
    const { ai, grid, rows, cols } = state;
    const dirs = [ai.dir, ...Object.keys(DELTA).filter(d => d !== ai.dir && OPP[d] !== ai.dir)];
    for (const d of dirs) {
      const [dr, dc] = DELTA[d];
      const nr = ai.r + dr, nc = ai.c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === 0) return d;
    }
    return ai.dir;
  }

  _endRound(state) {
    this._loop.stop();
    const playerWon = !state.ai.alive && state.player.alive;

    if (!playerWon) {
      this._lives--;
      EventBus.emit('game:lives-update', { lives: this._lives });
    }

    if (playerWon) {
      const { best } = ScoreService.submit(this._gameId(), state.score + this.config.scoring.winBonus);
      state.status = 'won';
      EventBus.emit('game:won', {
        result: 'win', icon: '🏍️', title: 'VICTOIRE !',
        score: state.score + this.config.scoring.winBonus, best,
        extraInfo: `<div class="overlay-score">${state.tick} ticks de survie</div>`,
      });
    } else if (this._lives <= 0) {
      const { best } = ScoreService.submit(this._gameId(), state.score);
      state.status = 'over';
      EventBus.emit('game:over', {
        result: 'lose', icon: '💥', title: 'CRASH !',
        score: state.score, best,
      });
    } else {
      // Restart the round with same score accumulated
      state.status = 'over';
      EventBus.emit('game:over', {
        result: 'lose', icon: '💥', title: 'CRASH !',
        score: state.score, best: ScoreService.getBest(this._gameId()),
      });
    }
  }

  _buildFullState() {
    return { status:'idle', mode:'basique', rows:0, cols:0, grid:[], player:null, ai:null, score:0, tick:0 };
  }
}
