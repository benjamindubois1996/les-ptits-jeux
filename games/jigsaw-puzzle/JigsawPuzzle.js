import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

const COLS = 3, ROWS = 3, PIECES = COLS * ROWS;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default class JigsawPuzzle extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  _gameId() { return 'jigsaw-puzzle'; }

  _buildFullState() {
    // Each piece: { id, correctRow, correctCol, traySlot, placed, boardRow, boardCol }
    const pieces = [];
    const slots  = shuffle(Array.from({ length: PIECES }, (_, i) => i));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const id = r * COLS + c;
        pieces.push({ id, correctRow: r, correctCol: c, traySlot: slots[id], placed: false, boardRow: -1, boardCol: -1 });
      }
    }
    return {
      status:   'idle',
      pieces,
      selected: null, // piece id
      board:    Array.from({ length: ROWS }, () => Array(COLS).fill(null)), // piece id or null
      placedCount: 0,
      score:    0,
      startTime: null,
    };
  }

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  start() {
    const s = this.state;
    s.status    = 'playing';
    s.startTime = Date.now();
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  selectPiece(id) {
    const s = this.state;
    if (s.status !== 'playing') return;
    s.selected = (s.selected === id) ? null : id;
    EventBus.emit('game:tick', { state: s, action: 'select' });
  }

  placeOnBoard(row, col) {
    const s = this.state;
    if (s.status !== 'playing' || s.selected === null) return;

    const piece = s.pieces.find(p => p.id === s.selected);
    if (!piece) return;

    // Remove piece from any previous board position
    if (piece.placed) {
      s.board[piece.boardRow][piece.boardCol] = null;
      piece.placed    = false;
      piece.boardRow  = -1;
      piece.boardCol  = -1;
      s.placedCount--;
    }

    // If cell occupied, send existing piece back to tray
    const existing = s.board[row][col];
    if (existing !== null) {
      const oldPiece = s.pieces.find(p => p.id === existing);
      if (oldPiece) { oldPiece.placed = false; oldPiece.boardRow = -1; oldPiece.boardCol = -1; s.placedCount--; }
    }

    // Place selected piece
    s.board[row][col]  = piece.id;
    piece.placed       = true;
    piece.boardRow     = row;
    piece.boardCol     = col;
    s.placedCount++;
    s.selected         = null;

    // Recompute tray slots for unplaced pieces
    this._repackTray(s);

    // Check win
    this._checkWin(s);
    EventBus.emit('game:tick', { state: s, action: 'place' });
  }

  removePiece(row, col) {
    const s = this.state;
    if (s.status !== 'playing') return;
    const pid = s.board[row][col];
    if (pid === null) return;

    const piece = s.pieces.find(p => p.id === pid);
    if (!piece) return;

    s.board[row][col] = null;
    piece.placed      = false;
    piece.boardRow    = -1;
    piece.boardCol    = -1;
    s.placedCount--;
    s.selected = pid;
    this._repackTray(s);
    EventBus.emit('game:tick', { state: s, action: 'remove' });
  }

  _repackTray(s) {
    const unplaced = s.pieces.filter(p => !p.placed);
    unplaced.forEach((p, i) => { p.traySlot = i; });
  }

  _checkWin(s) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const pid = s.board[r][c];
        if (pid === null) return;
        const piece = s.pieces.find(p => p.id === pid);
        if (!piece || piece.correctRow !== r || piece.correctCol !== c) return;
      }
    }
    // All correct!
    const elapsed = Math.floor((Date.now() - s.startTime) / 1000);
    s.score  = Math.max(0, 10000 - elapsed * 20);
    s.status = 'won';
    const res = ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:won', { score: s.score, best: res.best, isRecord: res.isRecord });
  }

  _bindControls() {
    document.addEventListener('keydown', this._onKeyDown);
  }

  _unbindControls() {
    document.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    if (e.key === 'p' || e.key === 'P') EventBus.emit('game:pause-toggle');
    if (e.key === 'r' || e.key === 'R') EventBus.emit('game:restart');
  }

  _onPause()  {}
  _onResume() {}

  restart() {
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    this._unbindControls();
    super.destroy();
  }
}
