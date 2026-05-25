/**
 * ConnectFour.js — Logique pure du jeu
 * Emplacement : /games/connect-four/ConnectFour.js
 *
 * Mécanique :
 *  - Grille configurable (5×4 / 7×6 / 9×7), 2 joueurs locaux OU Joueur vs IA
 *  - Les pièces tombent vers le bas de la colonne choisie
 *  - Victoire : 4 pièces alignées (horizontal, vertical, diagonal)
 *  - Score décroissant : plus la partie dure, moins de points
 *  - IA : minimax avec alpha-beta pruning (profondeur configurable)
 *  - Machine à états : idle → playing → paused → gameover
 *
 * Communication : uniquement via EventBus
 */

import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';

export default class ConnectFour {

  constructor(config) {
    this.config     = config;
    this.mode       = 'pvp';                                       // 'pvp' | 'vs-cpu'
    this.gridSizeId = config.gameplay.defaultGridSize || 'classique';
    this._applyGridSize(this.gridSizeId);                          // initialise rows/cols

    this.state    = this._buildInitialState();
    this._aiTimer = null;

    this._onPauseToggle = this.togglePause.bind(this);
    this._onRestart     = this.restart.bind(this);
    this._onDrop        = ({ col }) => this.dropPiece(col);
    this._onKey         = this._handleKey.bind(this);
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init() {
    EventBus.on('game:pause-toggle', this._onPauseToggle);
    EventBus.on('game:restart',      this._onRestart);
    EventBus.on('connectfour:drop',  this._onDrop);
    window.addEventListener('keydown', this._onKey);
    EventBus.emit('game:ready', { gameId: 'connect-four' });
  }

  start(mode = null) {
    if (mode) this.mode = mode;
    const scores      = { ...this.state.scores };
    this.state        = this._buildInitialState();
    this.state.scores = scores;
    this.state.status = 'playing';
    EventBus.emit('game:started',      { state: this.state });
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick',         { state: this.state });
  }

  togglePause() {
    if (this.state.status === 'playing') {
      this.state.status = 'paused';
      clearTimeout(this._aiTimer);
      EventBus.emit('game:paused', { state: this.state });
    } else if (this.state.status === 'paused') {
      this.state.status = 'playing';
      EventBus.emit('game:resumed', { state: this.state });
      if (this.mode === 'vs-cpu' && this.state.currentPlayer === 2) {
        this._scheduleAiMove();
      }
    }
  }

  restart() {
    clearTimeout(this._aiTimer);
    const scores      = { ...this.state.scores };
    this.state        = this._buildInitialState();
    this.state.scores = scores;
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state });
  }

  destroy() {
    clearTimeout(this._aiTimer);
    EventBus.off('game:pause-toggle', this._onPauseToggle);
    EventBus.off('game:restart',      this._onRestart);
    EventBus.off('connectfour:drop',  this._onDrop);
    window.removeEventListener('keydown', this._onKey);
  }

  /* ============================================================
     TAILLE DE GRILLE
     ============================================================ */

  setGridSize(sizeId) {
    if (sizeId === this.gridSizeId) return;
    this._applyGridSize(sizeId);
    this.state = this._buildInitialState(); // reset board avec nouvelles dimensions
    EventBus.emit('connectfour:grid-changed', {
      rows: this.config.gameplay.rows,
      cols: this.config.gameplay.cols,
    });
    EventBus.emit('game:tick', { state: this.state });
  }

  _applyGridSize(sizeId) {
    const sizes = this.config.gameplay.gridSizes || [];
    const size  = sizes.find(s => s.id === sizeId);
    if (!size) return;
    this.gridSizeId              = sizeId;
    this.config.gameplay.rows    = size.rows;
    this.config.gameplay.cols    = size.cols;
  }

  /* ============================================================
     ÉTAT INITIAL
     ============================================================ */

  _buildInitialState() {
    const { rows, cols } = this.config.gameplay;
    return {
      status:        'idle',
      board:         Array.from({ length: rows }, () => Array(cols).fill(0)),
      currentPlayer: 1,
      winner:        null,       // null | 1 | 2 | 'draw'
      winningCells:  [],
      scores:        { p1: 0, p2: 0 },
      moveCount:     0,
      finalScore:    0,
      lastDrop:      null,
      hoveredCol:    -1,
      aiThinking:    false,
    };
  }

  /* ============================================================
     CONTRÔLES CLAVIER
     ============================================================ */

  _handleKey(e) {
    const kb = this.config.controls.keyboard;

    if (kb.pause.includes(e.code)) {
      this.togglePause();
      return;
    }
    if (kb.restart.includes(e.code)) {
      if (this.state.status === 'idle' || this.state.status === 'gameover') {
        this.start();
      } else {
        this.restart();
      }
      return;
    }
    for (let c = 0; c < this.config.gameplay.cols; c++) {
      const keys = kb[`col${c + 1}`] || [];
      if (keys.includes(e.code)) {
        if (this.state.status === 'idle' || this.state.status === 'gameover') {
          this.start();
        } else {
          this.dropPiece(c);
        }
        return;
      }
    }
  }

  /* ============================================================
     ACTIONS JOUEUR
     ============================================================ */

  dropPiece(col) {
    if (this.state.status !== 'playing') return;
    if (this.state.aiThinking) return;
    if (this.mode === 'vs-cpu' && this.state.currentPlayer === 2) return;

    const row = this._getDropRow(this.state.board, col);
    if (row === -1) return;
    this._placePiece(col, row);
  }

  setHoveredCol(col) {
    this.state.hoveredCol = col;
  }

  /* ============================================================
     LOGIQUE DE PLACEMENT
     ============================================================ */

  _placePiece(col, row) {
    const player = this.state.currentPlayer;
    this.state.board[row][col] = player;
    this.state.lastDrop         = { row, col };
    this.state.moveCount++;

    EventBus.emit('connectfour:drop-anim', { row, col, player });

    // ── Victoire ? ──────────────────────────────────────────
    const winCells = this._getWinningCells(row, col, player);
    if (winCells.length > 0) {
      this.state.winner       = player;
      this.state.winningCells = winCells;
      this.state.status       = 'gameover';

      if (player === 1) this.state.scores.p1++;
      else              this.state.scores.p2++;

      const score = this._computeScore();
      this.state.finalScore = score;
      ScoreService.submit('connect-four', score);
      EventBus.emit('game:score-update', { score });
      EventBus.emit('game:tick',         { state: this.state });
      EventBus.emit('game:over',         { winner: player, state: this.state });
      return;
    }

    // ── Match nul ? ─────────────────────────────────────────
    if (this._isBoardFull(this.state.board)) {
      this.state.winner     = 'draw';
      this.state.status     = 'gameover';
      this.state.finalScore = 0;
      EventBus.emit('game:score-update', { score: 0 });
      EventBus.emit('game:tick',         { state: this.state });
      EventBus.emit('game:over',         { winner: 'draw', state: this.state });
      return;
    }

    // ── Prochain tour ────────────────────────────────────────
    this.state.currentPlayer = player === 1 ? 2 : 1;
    EventBus.emit('game:tick', { state: this.state });

    if (this.mode === 'vs-cpu' && this.state.currentPlayer === 2) {
      this._scheduleAiMove();
    }
  }

  _computeScore() {
    const { baseScore, penaltyPerMove, minScore } = this.config.scoring;
    return Math.max(minScore, baseScore - this.state.moveCount * penaltyPerMove);
  }

  /* ============================================================
     IA — PLANIFICATION
     ============================================================ */

  _scheduleAiMove() {
    this.state.aiThinking = true;
    EventBus.emit('game:tick', { state: this.state });

    this._aiTimer = setTimeout(() => {
      if (this.state.status !== 'playing') return;
      this.state.aiThinking = false;
      const col = this._getBestMove();
      const row = this._getDropRow(this.state.board, col);
      if (row !== -1) this._placePiece(col, row);
    }, this.config.gameplay.aiDelay);
  }

  /* ============================================================
     IA — MINIMAX AVEC ALPHA-BETA
     ============================================================ */

  _getBestMove() {
    const { cols } = this.config.gameplay;
    const depth    = this.config.gameplay.aiDepth || 6;
    const colOrder = this._getColOrder(cols);
    const board    = this.state.board.map(r => [...r]);

    let bestScore = -Infinity;
    let bestCol   = colOrder.find(c => this._getDropRow(board, c) !== -1) ?? Math.floor(cols / 2);

    for (const c of colOrder) {
      const row = this._getDropRow(board, c);
      if (row === -1) continue;
      board[row][c] = 2;
      const score = this._minimax(board, depth - 1, -Infinity, Infinity, false, row, c);
      board[row][c] = 0;
      if (score > bestScore) { bestScore = score; bestCol = c; }
    }
    return bestCol;
  }

  _minimax(board, depth, alpha, beta, isMaximizing, lastRow, lastCol) {
    const lastPlayer = isMaximizing ? 1 : 2;

    if (this._checkWinAt(board, lastRow, lastCol, lastPlayer)) {
      return isMaximizing ? -(10000 + depth) : (10000 + depth);
    }
    if (this._isBoardFull(board)) return 0;
    if (depth === 0) return this._evaluateBoard(board);

    const { cols } = this.config.gameplay;
    const colOrder  = this._getColOrder(cols);

    if (isMaximizing) {
      let max = -Infinity;
      for (const c of colOrder) {
        const row = this._getDropRow(board, c);
        if (row === -1) continue;
        board[row][c] = 2;
        const s = this._minimax(board, depth - 1, alpha, beta, false, row, c);
        board[row][c] = 0;
        max   = Math.max(max, s);
        alpha = Math.max(alpha, s);
        if (beta <= alpha) break;
      }
      return max;
    } else {
      let min = Infinity;
      for (const c of colOrder) {
        const row = this._getDropRow(board, c);
        if (row === -1) continue;
        board[row][c] = 1;
        const s = this._minimax(board, depth - 1, alpha, beta, true, row, c);
        board[row][c] = 0;
        min  = Math.min(min, s);
        beta = Math.min(beta, s);
        if (beta <= alpha) break;
      }
      return min;
    }
  }

  _evaluateBoard(board) {
    const { rows, cols, winLength } = this.config.gameplay;
    let score = 0;

    const center = Math.floor(cols / 2);
    for (let r = 0; r < rows; r++) {
      if (board[r][center] === 2) score += 3;
      if (board[r][center] === 1) score -= 3;
    }

    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        for (const [dr, dc] of dirs) {
          const win = [];
          for (let i = 0; i < winLength; i++) {
            const nr = r + dr * i, nc = c + dc * i;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break;
            win.push(board[nr][nc]);
          }
          if (win.length === winLength) score += this._scoreWindow(win);
        }
      }
    }
    return score;
  }

  _scoreWindow(win) {
    const ai    = win.filter(c => c === 2).length;
    const human = win.filter(c => c === 1).length;
    const empty = win.filter(c => c === 0).length;
    if (ai === 4)                   return 100;
    if (ai === 3 && empty === 1)    return 5;
    if (ai === 2 && empty === 2)    return 2;
    if (human === 3 && empty === 1) return -4;
    return 0;
  }

  /* ============================================================
     DÉTECTION VICTOIRE / NUL
     ============================================================ */

  _checkWinAt(board, row, col, player) {
    if (row === undefined) return false;
    const { rows, cols, winLength } = this.config.gameplay;
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    for (const [dr, dc] of dirs) {
      let count = 1;
      for (let i = 1; i < winLength; i++) {
        const r = row + dr * i, c = col + dc * i;
        if (r < 0 || r >= rows || c < 0 || c >= cols || board[r][c] !== player) break;
        count++;
      }
      for (let i = 1; i < winLength; i++) {
        const r = row - dr * i, c = col - dc * i;
        if (r < 0 || r >= rows || c < 0 || c >= cols || board[r][c] !== player) break;
        count++;
      }
      if (count >= winLength) return true;
    }
    return false;
  }

  _getWinningCells(row, col, player) {
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    for (const [dr, dc] of dirs) {
      const cells = this._scanLine(row, col, player, dr, dc);
      if (cells.length >= this.config.gameplay.winLength) {
        return cells.slice(0, this.config.gameplay.winLength);
      }
    }
    return [];
  }

  _scanLine(row, col, player, dr, dc) {
    const { rows, cols, winLength } = this.config.gameplay;
    const board = this.state.board;
    const cells = [{ row, col }];
    for (let i = 1; i < winLength; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r >= rows || c < 0 || c >= cols || board[r][c] !== player) break;
      cells.push({ row: r, col: c });
    }
    for (let i = 1; i < winLength; i++) {
      const r = row - dr * i, c = col - dc * i;
      if (r < 0 || r >= rows || c < 0 || c >= cols || board[r][c] !== player) break;
      cells.unshift({ row: r, col: c });
    }
    return cells;
  }

  /* ============================================================
     UTILITAIRES
     ============================================================ */

  _getDropRow(board, col) {
    const rows = this.config.gameplay.rows;
    for (let r = rows - 1; r >= 0; r--) {
      if (board[r][col] === 0) return r;
    }
    return -1;
  }

  _isBoardFull(board) {
    return board[0].every(cell => cell !== 0);
  }

  /** Ordre de priorité des colonnes pour le minimax (centre → bords) */
  _getColOrder(cols) {
    const center = Math.floor(cols / 2);
    const order  = [center];
    for (let i = 1; i <= center; i++) {
      if (center + i < cols) order.push(center + i);
      if (center - i >= 0)   order.push(center - i);
    }
    return order;
  }
}
