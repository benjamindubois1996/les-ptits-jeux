import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

const SIZE  = 9;
const EMPTY = 0, BLACK = 1, WHITE = 2; // BLACK = player, WHITE = AI
const KOMI  = 6.5; // points given to white for going second

function neighbors(r, c) {
  return [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]
    .filter(([nr, nc]) => nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE);
}

export default class Go extends BaseGame {
  constructor(config) {
    super(config);
    this.state    = this._buildFullState();
    this._aiTimer = null;
  }

  _gameId() { return 'go'; }

  _buildFullState() {
    return {
      status: 'idle',
      board: Array.from({ length: SIZE }, () => new Array(SIZE).fill(EMPTY)),
      captures: { black: 0, white: 0 },
      currentPlayer: BLACK,
      koPoint: null,
      consecutivePasses: 0,
      lastMove: null,
      score: 0,
      message: '',
      finalScore: null,
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
    s.message = 'Noir joue — cliquez pour poser une pierre.';
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  // Player places a stone
  placeStone(r, c) {
    const s = this.state;
    if (s.status !== 'playing') return;
    if (s.currentPlayer !== BLACK) return;
    if (!this._isValidMove(r, c, BLACK, s.board, s.koPoint)) return;

    this._doPlace(r, c, BLACK);
    if (s.status !== 'over' && s.status !== 'won') {
      s.currentPlayer = WHITE;
      s.message = 'IA réfléchit…';
      EventBus.emit('game:tick', { state: s });
      this._aiTimer = setTimeout(() => this._aiMove(), 500);
    }
  }

  pass() {
    const s = this.state;
    if (s.status !== 'playing') return;

    s.consecutivePasses++;
    s.koPoint = null;
    s.lastMove = 'pass';
    s.message = (s.currentPlayer === BLACK ? 'Vous passez.' : 'L\'IA passe.');

    if (s.consecutivePasses >= 2) {
      this._endGame();
      return;
    }

    const next = s.currentPlayer === BLACK ? WHITE : BLACK;
    s.currentPlayer = next;
    EventBus.emit('game:tick', { state: s });

    if (next === WHITE) {
      this._aiTimer = setTimeout(() => this._aiMove(), 600);
    }
  }

  resign() {
    const s = this.state;
    s.status  = 'over';
    s.score   = 0;
    s.message = 'Vous abandonnez.';
    ScoreService.submit(this._gameId(), 0);
    EventBus.emit('game:tick', { state: s });
    EventBus.emit('game:over', { score: 0 });
  }

  _isValidMove(r, c, color, board, koPoint) {
    if (board[r][c] !== EMPTY) return false;
    if (koPoint && koPoint.r === r && koPoint.c === c) return false;

    const test = board.map(row => [...row]);
    test[r][c] = color;
    const opp  = color === BLACK ? WHITE : BLACK;

    // Move is valid if it captures opponent OR own group has liberties after placement
    let captures = false;
    for (const [nr, nc] of neighbors(r, c)) {
      if (test[nr][nc] === opp) {
        if (this._groupLiberties(nr, nc, test) === 0) { captures = true; break; }
      }
    }
    if (captures) return true;
    return this._groupLiberties(r, c, test) > 0;
  }

  _groupLiberties(r, c, board) {
    const color = board[r][c];
    const visited = new Set([`${r},${c}`]);
    const queue   = [[r, c]];
    let libs = 0;

    while (queue.length > 0) {
      const [cr, cc] = queue.pop();
      for (const [nr, nc] of neighbors(cr, cc)) {
        const key = `${nr},${nc}`;
        if (board[nr][nc] === EMPTY) { libs++; }
        else if (board[nr][nc] === color && !visited.has(key)) {
          visited.add(key);
          queue.push([nr, nc]);
        }
      }
    }
    return libs;
  }

  _findGroup(r, c, board) {
    const color   = board[r][c];
    const stones  = new Set([`${r},${c}`]);
    const libs    = new Set();
    const queue   = [[r, c]];

    while (queue.length > 0) {
      const [cr, cc] = queue.pop();
      for (const [nr, nc] of neighbors(cr, cc)) {
        const key = `${nr},${nc}`;
        if (board[nr][nc] === EMPTY) libs.add(key);
        else if (board[nr][nc] === color && !stones.has(key)) {
          stones.add(key); queue.push([nr, nc]);
        }
      }
    }
    return { stones, libs };
  }

  _doPlace(r, c, color) {
    const s   = this.state;
    const opp = color === BLACK ? WHITE : BLACK;

    s.board[r][c] = color;
    s.consecutivePasses = 0;
    s.lastMove = { r, c };
    s.koPoint  = null;

    // Remove captured opponent groups
    let totalCaptured = 0;
    let capturedPoints = [];
    for (const [nr, nc] of neighbors(r, c)) {
      if (s.board[nr][nc] !== opp) continue;
      const { stones, libs } = this._findGroup(nr, nc, s.board);
      if (libs.size === 0) {
        totalCaptured += stones.size;
        for (const key of stones) {
          const [gr, gc] = key.split(',').map(Number);
          s.board[gr][gc] = EMPTY;
          capturedPoints.push({ r: gr, c: gc });
        }
      }
    }

    if (color === BLACK) s.captures.black += totalCaptured;
    else                 s.captures.white += totalCaptured;

    // Ko rule: 1 stone captured and that point would create same board position
    if (totalCaptured === 1) {
      s.koPoint = capturedPoints[0];
    }

    s.score   = s.captures.black;
    s.message = '';
    EventBus.emit('game:score-update', { score: s.score });
    EventBus.emit('game:tick', { state: s });
  }

  _aiMove() {
    const s = this.state;
    if (s.status !== 'playing' || s.currentPlayer !== WHITE) return;

    const move = this._bestAiMove();
    if (!move) { this.pass(); return; }

    this._doPlace(move.r, move.c, WHITE);
    if (s.status === 'playing') {
      s.currentPlayer = BLACK;
      s.message = 'Noir joue — cliquez pour poser une pierre.';
      EventBus.emit('game:tick', { state: s });
    }
  }

  _bestAiMove() {
    const s    = this.state;
    const cands = [];

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!this._isValidMove(r, c, WHITE, s.board, s.koPoint)) continue;

        let score = 0;

        // Captures
        const test = s.board.map(row => [...row]);
        test[r][c] = WHITE;
        for (const [nr, nc] of neighbors(r, c)) {
          if (test[nr][nc] === BLACK) {
            const { libs, stones } = this._findGroup(nr, nc, test);
            if (libs.size === 0) score += stones.size * 12; // capture
            else if (libs.size === 1) score += 4;            // atari
          }
        }

        // Save own group in atari
        for (const [nr, nc] of neighbors(r, c)) {
          if (test[nr][nc] === WHITE) {
            const { libs } = this._findGroup(nr, nc, test);
            if (libs.size >= 2) score += 3;
          }
        }

        // Prefer center
        const dr = r - 4, dc = c - 4;
        score -= Math.sqrt(dr*dr + dc*dc) * 0.6;

        // Prefer adjacency to own stones
        for (const [nr, nc] of neighbors(r, c)) {
          if (s.board[nr][nc] === WHITE) score += 0.5;
        }

        // Small randomness to avoid determinism
        score += Math.random() * 0.4;

        cands.push({ r, c, score });
      }
    }

    if (cands.length === 0) return null;
    cands.sort((a, b) => b.score - a.score);
    return cands[0];
  }

  _endGame() {
    const s = this.state;
    const territory = this._calcTerritory();
    const blackFinal = territory.black + s.captures.black;
    const whiteFinal = territory.white + s.captures.white + KOMI;

    s.status = blackFinal > whiteFinal ? 'won' : 'over';
    s.score  = Math.round(blackFinal);
    s.finalScore = {
      black: blackFinal,
      white: whiteFinal,
      territory,
    };
    s.message = `Noir: ${blackFinal.toFixed(1)} — Blanc: ${whiteFinal.toFixed(1)} (komi ${KOMI})`;
    ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:tick', { state: s });
    EventBus.emit(s.status === 'won' ? 'game:won' : 'game:over', { score: s.score });
  }

  _calcTerritory() {
    const s = this.state;
    const territory = { black: 0, white: 0 };
    const visited = Array.from({ length: SIZE }, () => new Array(SIZE).fill(false));

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (s.board[r][c] !== EMPTY || visited[r][c]) continue;

        const region = [];
        const borders = new Set();
        const queue = [[r, c]];
        visited[r][c] = true;

        while (queue.length > 0) {
          const [cr, cc] = queue.shift();
          region.push([cr, cc]);
          for (const [nr, nc] of neighbors(cr, cc)) {
            if (s.board[nr][nc] === EMPTY && !visited[nr][nc]) {
              visited[nr][nc] = true;
              queue.push([nr, nc]);
            } else if (s.board[nr][nc] !== EMPTY) {
              borders.add(s.board[nr][nc]);
            }
          }
        }

        if (borders.size === 1) {
          const owner = [...borders][0];
          if (owner === BLACK) territory.black += region.length;
          else                 territory.white += region.length;
        }
      }
    }

    return territory;
  }

  restart() {
    if (this._aiTimer) { clearTimeout(this._aiTimer); this._aiTimer = null; }
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    if (this._aiTimer) { clearTimeout(this._aiTimer); this._aiTimer = null; }
    super.destroy();
  }
}
