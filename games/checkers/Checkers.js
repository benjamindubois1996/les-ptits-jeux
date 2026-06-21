import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

/* Board values */
const EMPTY = 0, P1 = 1, AI = 2, P1K = 3, AIK = 4;

export default class Checkers extends BaseGame {

  constructor(config) {
    super(config);
    this.state      = this._buildFullState();
    this._aiTimeout = null;
  }

  _gameId() { return 'checkers'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    if (this._aiTimeout) clearTimeout(this._aiTimeout);
  }

  start(options = {}) {
    if (this._aiTimeout) { clearTimeout(this._aiTimeout); this._aiTimeout = null; }
    const mode  = options.mode ?? 'basique';
    this.state  = {
      ...this._buildFullState(),
      status: 'playing',
      mode,
    };
    this._computeMustJump();
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  restart() {
    if (this._aiTimeout) { clearTimeout(this._aiTimeout); this._aiTimeout = null; }
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  /* ---- Player interaction ---- */

  click(row, col) {
    const { state } = this;
    if (state.status !== 'playing' || state.turn !== 'player') return;
    if (state.inProgress) {
      /* Mid-multi-jump — can only move the in-progress piece */
      if (row === state.inProgress.row && col === state.inProgress.col) return;
      this._tryMove(state.inProgress.row, state.inProgress.col, row, col);
      return;
    }

    const val = state.board[row][col];

    /* Click an own piece — select it */
    if (val === P1 || val === P1K) {
      /* If mandatory jumps exist, can only select a piece that has jumps */
      if (state.mustJump.length && !state.mustJump.some(p => p.row === row && p.col === col)) return;
      state.selected = { row, col };
      state.validMoves = this._getMoves(row, col, state.board);
      EventBus.emit('game:tick', { state, action: 'select' });
      return;
    }

    /* Click a destination */
    if (state.selected) {
      this._tryMove(state.selected.row, state.selected.col, row, col);
    }
  }

  _tryMove(fromRow, fromCol, toRow, toCol) {
    const { state } = this;
    const move = state.validMoves.find(m =>
      m.to.row === toRow && m.to.col === toCol
    );
    if (!move) {
      /* Maybe re-selecting another piece */
      const val = state.board[toRow]?.[toCol];
      if ((val === P1 || val === P1K) && !state.inProgress) {
        if (state.mustJump.length && !state.mustJump.some(p => p.row === toRow && p.col === toCol)) return;
        state.selected   = { row: toRow, col: toCol };
        state.validMoves = this._getMoves(toRow, toCol, state.board);
        EventBus.emit('game:tick', { state, action: 'select' });
      }
      return;
    }
    this._executeMove(move, 'player');
  }

  _executeMove(move, side) {
    const { state } = this;
    const board     = state.board;
    const piece     = board[move.from.row][move.from.col];

    board[move.to.row][move.to.col] = piece;
    board[move.from.row][move.from.col] = EMPTY;

    /* Remove captured pieces */
    for (const cap of move.captures) {
      board[cap.row][cap.col] = EMPTY;
      if (side === 'player') {
        state.score += this.config.scoring?.pointPerCapture ?? 10;
        EventBus.emit('game:score-update', { score: state.score });
      }
    }

    /* King promotion */
    if (piece === P1  && move.to.row === 0) board[move.to.row][move.to.col] = P1K;
    if (piece === AI  && move.to.row === 7) board[move.to.row][move.to.col] = AIK;

    /* Multi-jump check */
    if (move.captures.length > 0) {
      const furtherJumps = this._getJumps(move.to.row, move.to.col, board, side);
      if (furtherJumps.length > 0) {
        state.inProgress = { row: move.to.row, col: move.to.col };
        state.selected   = { row: move.to.row, col: move.to.col };
        state.validMoves = furtherJumps;
        EventBus.emit('game:tick', { state, action: 'multi-jump' });
        return;
      }
    }

    /* End of move */
    state.selected   = null;
    state.validMoves = [];
    state.inProgress = null;

    /* Check winner */
    if (this._checkWinner(board)) return;

    /* Switch turn */
    if (side === 'player') {
      state.turn = 'ai';
      EventBus.emit('game:tick', { state, action: 'player-moved' });
      this._aiTimeout = setTimeout(() => this._aiMove(), this.config.gameplay.aiDelayMs);
    } else {
      state.turn = 'player';
      this._computeMustJump();
      EventBus.emit('game:tick', { state, action: 'ai-moved' });
    }
  }

  /* ---- AI ---- */

  _aiMove() {
    this._aiTimeout = null;
    const { state } = this;
    if (state.status !== 'playing' || state.turn !== 'ai') return;

    const allMoves = this._getAllMoves('ai', state.board);
    if (!allMoves.length) {
      /* AI has no moves — player wins */
      this._endGame('player');
      return;
    }

    /* Prefer captures; among captures pick most captures */
    const jumps    = allMoves.filter(m => m.captures.length > 0);
    const pool     = jumps.length ? jumps : allMoves;
    const best     = pool.reduce((a, b) => b.captures.length > a.captures.length ? b : a, pool[0]);

    this._executeMove(best, 'ai');
  }

  /* ---- Move computation ---- */

  _getAllMoves(side, board) {
    const pieces   = this._getPieces(side, board);
    const allJumps = pieces.flatMap(p => this._getJumps(p.row, p.col, board, side));
    if (allJumps.length) return allJumps;
    return pieces.flatMap(p => this._getSteps(p.row, p.col, board, side));
  }

  _getMoves(row, col, board) {
    const side  = this._sideOf(board[row][col]);
    const jumps = this._getJumps(row, col, board, side);
    /* If there are mandatory jumps for this piece's side, only return jumps */
    const hasMandatory = this._getPieces(side, board)
      .some(p => this._getJumps(p.row, p.col, board, side).length > 0);
    if (hasMandatory) return jumps;
    return jumps.length ? jumps : this._getSteps(row, col, board, side);
  }

  _getSteps(row, col, board, side) {
    const dirs  = this._dirs(board[row][col]);
    const moves = [];
    for (const [dr, dc] of dirs) {
      const r2 = row + dr, c2 = col + dc;
      if (this._inBounds(r2, c2) && board[r2][c2] === EMPTY) {
        moves.push({ from: { row, col }, to: { row: r2, col: c2 }, captures: [] });
      }
    }
    return moves;
  }

  _getJumps(row, col, board, side) {
    const dirs  = this._dirs(board[row][col]);
    const jumps = [];
    const opps  = side === 'player' ? [AI, AIK] : [P1, P1K];
    for (const [dr, dc] of dirs) {
      const r1 = row + dr, c1 = col + dc;
      const r2 = row + dr * 2, c2 = col + dc * 2;
      if (this._inBounds(r2, c2) && opps.includes(board[r1]?.[c1]) && board[r2][c2] === EMPTY) {
        jumps.push({
          from:     { row, col },
          to:       { row: r2, col: c2 },
          captures: [{ row: r1, col: c1 }],
        });
      }
    }
    return jumps;
  }

  _dirs(piece) {
    if (piece === P1K || piece === AIK) return [[-1,-1],[-1,1],[1,-1],[1,1]];
    if (piece === P1)  return [[-1,-1],[-1,1]];
    if (piece === AI)  return [[1,-1],[1,1]];
    return [];
  }

  _sideOf(piece) {
    return (piece === P1 || piece === P1K) ? 'player' : 'ai';
  }

  _getPieces(side, board) {
    const vals = side === 'player' ? [P1, P1K] : [AI, AIK];
    const res  = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (vals.includes(board[r][c])) res.push({ row: r, col: c });
      }
    }
    return res;
  }

  _computeMustJump() {
    const { state } = this;
    const pieces = this._getPieces('player', state.board);
    state.mustJump = pieces.filter(p =>
      this._getJumps(p.row, p.col, state.board, 'player').length > 0
    );
  }

  _inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

  /* ---- Win check ---- */

  _checkWinner(board) {
    const hasPl = this._getPieces('player', board).length > 0;
    const hasAi = this._getPieces('ai',     board).length > 0;
    if (!hasPl) { this._endGame('ai');     return true; }
    if (!hasAi) { this._endGame('player'); return true; }
    return false;
  }

  _endGame(winner) {
    const { state } = this;
    state.status = winner === 'player' ? 'won' : 'gameover';
    state.winner = winner;
    const id = this._gameId();

    if (winner === 'player') {
      state.score += this.config.scoring?.winBonus ?? 100;
      ScoreService.submit(id, state.score);
      EventBus.emit('game:score-update', { score: state.score });
      EventBus.emit('game:tick', { state, action: 'won' });
      EventBus.emit('game:won', {
        result: 'win',
        score:  state.score,
        best:   ScoreService.getBest(id),
      });
    } else {
      EventBus.emit('game:tick', { state, action: 'lost' });
      EventBus.emit('game:over', {
        result: 'lose',
        score:  state.score,
        best:   ScoreService.getBest(id),
      });
    }
  }

  /* ---- State ---- */

  _buildFullState() {
    return {
      status:     'loading',
      board:      this._initialBoard(),
      turn:       'player',
      selected:   null,
      validMoves: [],
      mustJump:   [],
      inProgress: null,
      winner:     null,
      score:      0,
      mode:       'basique',
    };
  }

  _initialBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(EMPTY));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 !== 1) continue;
        if (r <= 2) b[r][c] = AI;
        if (r >= 5) b[r][c] = P1;
      }
    }
    return b;
  }
}
