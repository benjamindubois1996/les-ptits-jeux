import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import { randInt }  from '../../js/utils/Random.js';

export default class FloodIt extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
  }

  _gameId() { return 'flood-it'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); }

  start(options = {}) {
    const { size, colors, maxMoves } = this.config.gameplay;
    const grid = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => randInt(0, colors - 1))
    );
    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode:   options.mode ?? 'basique',
      size, colors, maxMoves,
      grid,
      moves:  0,
      score:  0,
    };
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  flood(color) {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (color === state.grid[0][0]) return;

    const oldColor = state.grid[0][0];
    this._floodFill(state.grid, 0, 0, oldColor, color, state.size);
    state.moves++;

    const score = Math.max(0, this.config.scoring.baseBonus - state.moves * this.config.scoring.movePenalty);
    state.score = score;
    EventBus.emit('game:score-update', { score });
    EventBus.emit('game:tick', { state, action: 'flood' });

    if (this._isAllSame(state.grid, state.size)) {
      state.status = 'won';
      const { best } = ScoreService.submit(this._gameId(), score);
      EventBus.emit('game:won', {
        result: 'win', icon: '🌊', title: 'INONDÉ !',
        score, best,
        extraInfo: `<div class="overlay-score">En ${state.moves} coups</div>`,
      });
    } else if (state.moves >= state.maxMoves) {
      state.status = 'over';
      const { best } = ScoreService.submit(this._gameId(), score);
      EventBus.emit('game:over', {
        result: 'lose', icon: '💧', title: 'PLUS DE COUPS !',
        score, best,
        extraInfo: `<div class="overlay-score">Grille non complète</div>`,
      });
    }
  }

  _floodFill(grid, r, c, oldColor, newColor, size) {
    const stack = [[r, c]];
    const visited = new Set();
    while (stack.length) {
      const [cr, cc] = stack.pop();
      const key = `${cr},${cc}`;
      if (visited.has(key)) continue;
      if (cr < 0 || cr >= size || cc < 0 || cc >= size) continue;
      if (grid[cr][cc] !== oldColor) continue;
      visited.add(key);
      grid[cr][cc] = newColor;
      stack.push([cr-1,cc],[cr+1,cc],[cr,cc-1],[cr,cc+1]);
    }
  }

  _isAllSame(grid, size) {
    const first = grid[0][0];
    return grid.every(row => row.every(v => v === first));
  }

  _buildFullState() {
    return { status:'idle', mode:'basique', size:0, colors:0, maxMoves:0, grid:[], moves:0, score:0 };
  }
}
