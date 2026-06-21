import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

const EMPTY  = 0;
const BLACK  = 1;  // player
const WHITE  = 2;  // AI

const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

export { EMPTY, BLACK, WHITE };

export default class Reversi extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
  }

  _gameId() { return 'reversi'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick', { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); }

  start(options = {}) {
    const mode = options.mode ?? 'basique';
    const size = this.config.gameplay.size;
    const grid = Array.from({ length: size }, () => Array(size).fill(EMPTY));

    const m = size / 2;
    grid[m-1][m-1] = WHITE;
    grid[m-1][m]   = BLACK;
    grid[m][m-1]   = BLACK;
    grid[m][m]     = WHITE;

    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode, size, grid,
      turn:   BLACK,
      score:  0,
    };
    this._updateValidMoves();
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  placeAt(r, c) {
    const { state } = this;
    if (state.status !== 'playing' || state.turn !== BLACK) return;
    if (!state.validMoves.some(m => m.r === r && m.c === c)) return;

    this._applyMove(r, c, BLACK);
    state.turn = WHITE;
    this._updateValidMoves();
    EventBus.emit('game:tick', { state, action: 'placed' });

    if (state.validMoves.length === 0) {
      // White has no moves — check if black can play
      state.turn = BLACK;
      this._updateValidMoves();
      if (state.validMoves.length === 0) {
        this._endGame();
        return;
      }
      EventBus.emit('game:tick', { state, action: 'skip-white' });
      return;
    }

    // AI plays after a short delay
    setTimeout(() => this._aiMove(), this.config.gameplay.aiThinkMs);
  }

  _aiMove() {
    const { state } = this;
    if (state.status !== 'playing' || state.turn !== WHITE) return;

    // Greedy AI: pick move that flips most pieces
    let best = null, bestCount = -1;
    for (const { r, c } of state.validMoves) {
      const flips = this._getFlips(r, c, WHITE);
      if (flips.length > bestCount) { bestCount = flips.length; best = { r, c }; }
    }

    if (best) {
      this._applyMove(best.r, best.c, WHITE);
    }

    state.turn = BLACK;
    this._updateValidMoves();

    if (state.validMoves.length === 0) {
      // Black has no moves — check if white can play
      state.turn = WHITE;
      this._updateValidMoves();
      if (state.validMoves.length === 0) {
        this._endGame();
        return;
      }
      // White plays again
      setTimeout(() => this._aiMove(), this.config.gameplay.aiThinkMs);
      return;
    }

    EventBus.emit('game:tick', { state, action: 'ai-placed' });
  }

  _applyMove(r, c, color) {
    const { state } = this;
    const flips = this._getFlips(r, c, color);
    state.grid[r][c] = color;
    for (const f of flips) state.grid[f.r][f.c] = color;

    const score = this._countColor(BLACK) * this.config.scoring.pointsPerPiece;
    state.score = score;
    EventBus.emit('game:score-update', { score });
  }

  _getFlips(r, c, color) {
    const { grid, size } = this.state;
    const opp   = color === BLACK ? WHITE : BLACK;
    const flips = [];
    for (const [dr, dc] of DIRS) {
      const line = [];
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === opp) {
        line.push({ r: nr, c: nc });
        nr += dr; nc += dc;
      }
      if (line.length > 0 && nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === color) {
        flips.push(...line);
      }
    }
    return flips;
  }

  _updateValidMoves() {
    const { state } = this;
    state.validMoves = [];
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        if (state.grid[r][c] === EMPTY && this._getFlips(r, c, state.turn).length > 0) {
          state.validMoves.push({ r, c });
        }
      }
    }
  }

  _countColor(color) {
    let n = 0;
    this.state.grid.forEach(row => row.forEach(cell => { if (cell === color) n++; }));
    return n;
  }

  _endGame() {
    const { state } = this;
    state.status = 'gameover';
    const black = this._countColor(BLACK);
    const white = this._countColor(WHITE);
    const score = black * this.config.scoring.pointsPerPiece;
    state.score = score;
    const win   = black > white;

    ScoreService.submit(this._gameId(), score);
    const evt = win ? 'game:won' : 'game:over';
    EventBus.emit(evt, {
      result:    win ? 'win' : 'lose',
      icon:      win ? '⚫' : '⚪',
      title:     win ? 'VICTOIRE !' : black === white ? 'ÉGALITÉ !' : 'DÉFAITE',
      score,
      best:      ScoreService.getBest(this._gameId()),
      extraInfo: `<div class="overlay-score">Noir ${black} — Blanc ${white}</div>`,
    });
  }

  _buildFullState() {
    return {
      status:     'loading',
      mode:       'basique',
      size:       8,
      grid:       [],
      turn:       BLACK,
      validMoves: [],
      score:      0,
    };
  }
}
