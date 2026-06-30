import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

const SIZE = 9;
const EMPTY = 0, BLUE = 1, RED = 2; // BLUE = player (left→right), RED = AI (top→bottom)

// Hex neighbors in parallelogram grid (row-offset layout)
function hexNeighbors(r, c) {
  return [
    [r - 1, c], [r - 1, c + 1],
    [r,     c - 1], [r,     c + 1],
    [r + 1, c - 1], [r + 1, c],
  ].filter(([nr, nc]) => nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE);
}

export default class Hex extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
  }

  _gameId() { return 'hex'; }

  _buildFullState() {
    return {
      status: 'idle',
      board: Array.from({ length: SIZE }, () => new Array(SIZE).fill(EMPTY)),
      currentPlayer: BLUE,
      winner: null,
      lastMove: null,
      score: 0,
      message: '',
    };
  }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  start() {
    const s = this.state;
    s.status = 'playing';
    s.currentPlayer = BLUE;
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  placeStone(r, c) {
    const s = this.state;
    if (s.status !== 'playing') return;
    if (s.currentPlayer !== BLUE) return;
    if (s.board[r][c] !== EMPTY) return;

    s.board[r][c] = BLUE;
    s.lastMove = { r, c };
    EventBus.emit('game:tick', { state: s });

    if (this._checkWin(BLUE, s.board)) {
      this._endGame('blue');
      return;
    }

    s.currentPlayer = RED;
    EventBus.emit('game:tick', { state: s });
    setTimeout(() => this._aiMove(), 350);
  }

  _checkWin(color, board) {
    const visited = new Set();
    const queue = [];

    if (color === BLUE) {
      // Blue connects left (col 0) to right (col SIZE-1)
      for (let r = 0; r < SIZE; r++) {
        if (board[r][0] === BLUE) {
          const key = `${r},0`;
          if (!visited.has(key)) { visited.add(key); queue.push([r, 0]); }
        }
      }
      while (queue.length > 0) {
        const [r, c] = queue.shift();
        if (c === SIZE - 1) return true;
        for (const [nr, nc] of hexNeighbors(r, c)) {
          const key = `${nr},${nc}`;
          if (!visited.has(key) && board[nr][nc] === BLUE) {
            visited.add(key); queue.push([nr, nc]);
          }
        }
      }
    } else {
      // Red connects top (row 0) to bottom (row SIZE-1)
      for (let c = 0; c < SIZE; c++) {
        if (board[0][c] === RED) {
          const key = `0,${c}`;
          if (!visited.has(key)) { visited.add(key); queue.push([0, c]); }
        }
      }
      while (queue.length > 0) {
        const [r, c] = queue.shift();
        if (r === SIZE - 1) return true;
        for (const [nr, nc] of hexNeighbors(r, c)) {
          const key = `${nr},${nc}`;
          if (!visited.has(key) && board[nr][nc] === RED) {
            visited.add(key); queue.push([nr, nc]);
          }
        }
      }
    }
    return false;
  }

  _aiMove() {
    const s = this.state;
    if (s.status !== 'playing' || s.currentPlayer !== RED) return;

    const [r, c] = this._bestMove();
    if (r === null) return;

    s.board[r][c] = RED;
    s.lastMove = { r, c };

    if (this._checkWin(RED, s.board)) {
      this._endGame('red');
      return;
    }

    s.currentPlayer = BLUE;
    EventBus.emit('game:tick', { state: s });
  }

  _bestMove() {
    const s = this.state;
    const board = s.board;

    // 1. Immediate win for AI
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] !== EMPTY) continue;
        board[r][c] = RED;
        const wins = this._checkWin(RED, board);
        board[r][c] = EMPTY;
        if (wins) return [r, c];
      }
    }

    // 2. Block player's immediate win
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] !== EMPTY) continue;
        board[r][c] = BLUE;
        const wins = this._checkWin(BLUE, board);
        board[r][c] = EMPTY;
        if (wins) return [r, c];
      }
    }

    // 3. Heuristic: Dijkstra-based two-path score
    const distTop    = this._dijkstra('top', board);
    const distBottom = this._dijkstra('bottom', board);

    let best = null, bestScore = Infinity;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] !== EMPTY) continue;
        const score = (distTop[r][c] ?? Infinity) + (distBottom[r][c] ?? Infinity);
        if (score < bestScore) { bestScore = score; best = [r, c]; }
      }
    }

    return best || [null, null];
  }

  // Dijkstra for RED: cost 0 for RED cells, 1 for EMPTY, Infinity for BLUE
  _dijkstra(side, board) {
    const dist = Array.from({ length: SIZE }, () => new Array(SIZE).fill(Infinity));
    // Min-heap emulated as sorted array (small board, OK for performance)
    const pq = [];

    if (side === 'top') {
      for (let c = 0; c < SIZE; c++) {
        if (board[0][c] === BLUE) continue;
        const cost = board[0][c] === RED ? 0 : 1;
        if (cost < dist[0][c]) { dist[0][c] = cost; pq.push([cost, 0, c]); }
      }
    } else {
      for (let c = 0; c < SIZE; c++) {
        if (board[SIZE - 1][c] === BLUE) continue;
        const cost = board[SIZE - 1][c] === RED ? 0 : 1;
        if (cost < dist[SIZE - 1][c]) { dist[SIZE - 1][c] = cost; pq.push([cost, SIZE - 1, c]); }
      }
    }

    pq.sort((a, b) => a[0] - b[0]);

    while (pq.length > 0) {
      const [cost, r, c] = pq.shift();
      if (cost > dist[r][c]) continue;
      for (const [nr, nc] of hexNeighbors(r, c)) {
        if (board[nr][nc] === BLUE) continue;
        const newCost = cost + (board[nr][nc] === RED ? 0 : 1);
        if (newCost < dist[nr][nc]) {
          dist[nr][nc] = newCost;
          pq.push([newCost, nr, nc]);
          pq.sort((a, b) => a[0] - b[0]);
        }
      }
    }

    return dist;
  }

  _endGame(winner) {
    const s = this.state;
    s.status = winner === 'blue' ? 'won' : 'over';
    s.winner = winner;
    // Score based on number of empty cells remaining (faster win = better)
    const empty = s.board.flat().filter(v => v === EMPTY).length;
    s.score = winner === 'blue' ? 100 + empty * 10 : 0;
    ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:tick', { state: s });
    EventBus.emit(winner === 'blue' ? 'game:won' : 'game:over', { score: s.score });
  }

  restart() {
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    super.destroy();
  }
}
