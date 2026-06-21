import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// Cell states
export const EMPTY   = 0;
export const FILLED  = 1;
export const CROSSED = 2;

export default class Nonogram extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
  }

  _gameId() { return 'nonogram'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick', { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); }

  start(options = {}) {
    const mode       = options.mode ?? 'basique';
    const difficulty = options.difficulty ?? this.config.gameplay.defaultDifficulty;
    const size       = this.config.gameplay.difficulties[difficulty]?.size ?? 10;

    const solution = this._generatePuzzle(size);
    const rowClues = this._computeClues(solution, 'row');
    const colClues = this._computeClues(solution, 'col');

    this.state = {
      ...this._buildFullState(),
      status:     'playing',
      mode, difficulty, size, solution, rowClues, colClues,
      grid:       Array.from({ length: size }, () => Array(size).fill(EMPTY)),
      errors:     0,
    };
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  toggleCell(r, c, rightClick = false) {
    const { grid, status } = this.state;
    if (status !== 'playing') return;

    if (rightClick) {
      grid[r][c] = grid[r][c] === CROSSED ? EMPTY : CROSSED;
    } else {
      grid[r][c] = grid[r][c] === FILLED ? EMPTY : FILLED;
    }

    if (!rightClick && grid[r][c] === FILLED) {
      if (this.state.solution[r][c] !== 1) {
        this.state.errors++;
        grid[r][c] = EMPTY;
      }
    }

    const score = Math.max(0,
      this.config.scoring.basePoints * this.state.size
      - this.state.errors * this.config.scoring.penaltyPerError
    );
    EventBus.emit('game:score-update', { score });
    EventBus.emit('game:tick', { state: this.state, action: 'toggle' });

    if (this._isComplete()) {
      this.state.status = 'won';
      this.state.score  = score;
      ScoreService.submit(this._gameId(), score);
      EventBus.emit('game:won', {
        result: 'win', icon: '🖼️', title: 'NONOGRAM RÉSOLU !',
        score, best: ScoreService.getBest(this._gameId()),
      });
    }
  }

  _isComplete() {
    const { grid, solution, size } = this.state;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (solution[r][c] === 1 && grid[r][c] !== FILLED) return false;
    return true;
  }

  _generatePuzzle(size) {
    // ~50% fill density for balanced puzzles
    return Array.from({ length: size }, () =>
      Array.from({ length: size }, () => Math.random() < 0.5 ? 1 : 0)
    );
  }

  _computeClues(solution, axis) {
    const size = solution.length;
    const clues = [];
    for (let i = 0; i < size; i++) {
      const line = axis === 'row'
        ? solution[i]
        : solution.map(row => row[i]);
      clues.push(this._lineClue(line));
    }
    return clues;
  }

  _lineClue(line) {
    const groups = [];
    let count = 0;
    for (const v of line) {
      if (v === 1) { count++; }
      else if (count > 0) { groups.push(count); count = 0; }
    }
    if (count > 0) groups.push(count);
    return groups.length ? groups : [0];
  }

  _buildFullState() {
    return {
      status:     'loading',
      mode:       'basique',
      difficulty: 'normal',
      size:       10,
      grid:       [],
      solution:   [],
      rowClues:   [],
      colClues:   [],
      errors:     0,
      score:      0,
    };
  }
}
