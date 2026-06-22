import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import { randInt }  from '../../js/utils/Random.js';

export default class GemCrush extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
  }

  _gameId() { return 'gem-crush'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); }

  start(options = {}) {
    const { rows, cols, colors } = this.config.gameplay;
    const grid = this._makeGrid(rows, cols, colors);
    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode:   options.mode ?? 'basique',
      grid, rows, cols, colors,
      selected: null,
      animating: false,
      score: 0,
      level: 1,
      levelScore: 0,
    };
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  select(r, c) {
    const { state } = this;
    if (state.status !== 'playing' || state.animating) return;
    if (!state.selected) {
      state.selected = { r, c };
      EventBus.emit('game:tick', { state, action: 'select' });
      return;
    }
    const { r: sr, c: sc } = state.selected;
    if (sr === r && sc === c) { state.selected = null; EventBus.emit('game:tick', { state, action: 'deselect' }); return; }
    const adjacent = Math.abs(r - sr) + Math.abs(c - sc) === 1;
    if (!adjacent) { state.selected = { r, c }; EventBus.emit('game:tick', { state, action: 'select' }); return; }

    // Swap and check
    this._swap(state, sr, sc, r, c);
    const matches = this._findMatches(state);
    if (!matches.length) {
      // Swap back
      this._swap(state, r, c, sr, sc);
      state.selected = null;
      EventBus.emit('game:tick', { state, action: 'invalid-swap' });
      return;
    }
    state.selected  = null;
    state.animating = true;
    EventBus.emit('game:tick', { state, action: 'swap' });
    this._resolveMatches(state);
  }

  _swap(state, r1, c1, r2, c2) {
    const tmp = state.grid[r1][c1];
    state.grid[r1][c1] = state.grid[r2][c2];
    state.grid[r2][c2] = tmp;
  }

  _resolveMatches(state, combo = 1) {
    const matches = this._findMatches(state);
    if (!matches.length) {
      state.animating = false;
      EventBus.emit('game:tick', { state, action: 'idle' });
      return;
    }

    const matchSet = new Set(matches.map(([r, c]) => `${r},${c}`));
    const pts = matchSet.size * this.config.scoring.perGem * Math.pow(this.config.scoring.comboMultiplier, combo - 1);
    state.score      += Math.round(pts);
    state.levelScore += Math.round(pts);
    EventBus.emit('game:score-update', { score: state.score });

    matchSet.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      state.grid[r][c] = null;
    });

    // Gravity
    this._applyGravity(state);

    // Check level up
    if (state.levelScore >= this.config.gameplay.levelThreshold * state.level) {
      state.level++;
      state.levelScore = 0;
      EventBus.emit('game:tick', { state, action: 'level-up' });
    }

    setTimeout(() => {
      if (state.status !== 'playing') return;
      EventBus.emit('game:tick', { state, action: 'fall' });
      setTimeout(() => {
        if (state.status !== 'playing') return;
        this._resolveMatches(state, combo + 1);
      }, 200);
    }, 250);
  }

  _applyGravity(state) {
    const { rows, cols, colors } = state;
    for (let c = 0; c < cols; c++) {
      let writeRow = rows - 1;
      for (let r = rows - 1; r >= 0; r--) {
        if (state.grid[r][c] !== null) { state.grid[writeRow][c] = state.grid[r][c]; if (writeRow !== r) state.grid[r][c] = null; writeRow--; }
      }
      for (let r = writeRow; r >= 0; r--) state.grid[r][c] = randInt(colors);
    }
  }

  _findMatches(state) {
    const { rows, cols } = state;
    const matched = new Set();
    const dirs = [[0,1],[1,0]];
    for (const [dr, dc] of dirs) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const v = state.grid[r][c];
          if (v === null) continue;
          const run = [[r, c]];
          let nr = r + dr, nc = c + dc;
          while (nr < rows && nc < cols && state.grid[nr][nc] === v) { run.push([nr, nc]); nr += dr; nc += dc; }
          if (run.length >= this.config.gameplay.minMatch) run.forEach(p => matched.add(p));
        }
      }
    }
    return [...matched];
  }

  _makeGrid(rows, cols, colors) {
    const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        let v;
        do { v = randInt(colors); }
        while (
          (c >= 2 && grid[r][c-1] === v && grid[r][c-2] === v) ||
          (r >= 2 && grid[r-1][c] === v && grid[r-2][c] === v)
        );
        grid[r][c] = v;
      }
    return grid;
  }

  _buildFullState() {
    return { status:'idle', mode:'basique', grid:[], rows:0, cols:0, colors:0, selected:null, animating:false, score:0, level:1, levelScore:0 };
  }
}
