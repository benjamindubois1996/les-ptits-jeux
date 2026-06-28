import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';
import { randInt }  from '../../js/utils/Random.js';

export default class Columns extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._loop = new GameLoop(() => this._tick());
  }

  _gameId() { return 'columns'; }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); this._loop.destroy(); this._unbindControls(); }

  start(options = {}) {
    this._loop.stop();
    this.state = this._buildFullState();
    this.state.status = 'playing';
    this.state.mode   = options.mode ?? 'basique';
    this._spawnPiece();
    this._bindControls();
    this._loop.start(this._interval());
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  restart() {
    this._loop.stop();
    this._unbindControls();
    this.state = this._buildFullState();
    this.state.status = 'idle';
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  { this._loop.stop(); }
  _onResume() { this._loop.start(this._interval()); }

  _interval() { return Math.max(120, 600 - (this.state.level - 1) * 45); }

  // ── Controls ──────────────────────────────────────────────────

  _bindControls() {
    this._onKey = e => {
      const s = this.state;
      if (!s || s.status !== 'playing' || !s.piece || s.resolving) return;
      switch (e.code) {
        case 'ArrowLeft':  case 'KeyA': e.preventDefault(); this._moveH(-1); break;
        case 'ArrowRight': case 'KeyD': e.preventDefault(); this._moveH(1);  break;
        case 'ArrowDown':  case 'KeyS': e.preventDefault(); this._softDrop(); break;
        case 'ArrowUp':    case 'KeyW':
        case 'Space':                   e.preventDefault(); this._rotate();   break;
      }
    };
    window.addEventListener('keydown', this._onKey);
  }

  _unbindControls() {
    if (this._onKey) { window.removeEventListener('keydown', this._onKey); this._onKey = null; }
  }

  // ── Piece movement ────────────────────────────────────────────

  // Piece: { r, c, gems:[top,mid,bot] } — bot at r, mid at r-1, top at r-2

  _canMoveDown(r, c) {
    const s = this.state;
    if (r + 1 >= s.rows) return false;
    return s.board[r + 1][c] === null;
  }

  _canMoveH(r, c, dc) {
    const s  = this.state;
    const nc = c + dc;
    if (nc < 0 || nc >= s.cols) return false;
    for (let dr = 0; dr <= 2; dr++) {
      const row = r - dr;
      if (row >= 0 && s.board[row][nc] !== null) return false;
    }
    return true;
  }

  _moveH(dc) {
    const s = this.state;
    const { r, c } = s.piece;
    if (this._canMoveH(r, c, dc)) {
      s.piece.c += dc;
      EventBus.emit('game:tick', { state: s });
    }
  }

  _rotate() {
    const s = this.state;
    // Cycle up: [T, M, B] → [M, B, T]
    const [top, mid, bot] = s.piece.gems;
    s.piece.gems = [mid, bot, top];
    EventBus.emit('game:tick', { state: s });
  }

  _softDrop() {
    const s = this.state;
    if (this._canMoveDown(s.piece.r, s.piece.c)) {
      s.piece.r++;
      EventBus.emit('game:tick', { state: s });
    }
  }

  // ── Game loop ─────────────────────────────────────────────────

  _tick() {
    const s = this.state;
    if (s.status !== 'playing' || !s.piece || s.resolving) return;
    const { r, c } = s.piece;
    if (this._canMoveDown(r, c)) {
      s.piece.r++;
      EventBus.emit('game:tick', { state: s });
    } else {
      this._lockPiece();
    }
  }

  _lockPiece() {
    const s            = this.state;
    const { r, c, gems } = s.piece;
    // gems[2]=bot → r, gems[1]=mid → r-1, gems[0]=top → r-2
    for (let i = 0; i < 3; i++) {
      const row = r - (2 - i);
      if (row >= 0 && row < s.rows) s.board[row][c] = gems[i];
    }
    // If any gem locked in the first row, it's game over
    if (r <= 1 && s.board[0][c] !== null) { this._gameOver(); return; }
    s.piece = null;
    this._loop.stop();
    s.resolving = true;
    s.chain     = 0;
    this._processMatches();
  }

  _processMatches() {
    const s    = this.state;
    const hits = this._findMatches();

    if (hits.size === 0) {
      s.resolving = false;
      s.chain     = 0;
      if (!this._spawnPiece()) { this._gameOver(); return; }
      this._loop.start(this._interval());
      EventBus.emit('game:tick', { state: s });
      return;
    }

    s.chain++;
    const count = hits.size;
    s.score += count * s.cfg.perGem * s.chain;
    s.gemsCleared += count;

    const newLevel = 1 + Math.floor(s.gemsCleared / 20);
    if (newLevel > s.level) { s.level = newLevel; s.score += s.cfg.levelBonus; }

    for (const key of hits) {
      const [r, c] = key.split(',').map(Number);
      s.board[r][c] = null;
    }
    this._applyGravity();

    EventBus.emit('game:tick', { state: s });
    setTimeout(() => { if (s.status === 'playing') this._processMatches(); }, 260);
  }

  _findMatches() {
    const s         = this.state;
    const { rows, cols } = s;
    const matched   = new Set();
    const minLen    = s.cfg.matchLen;
    const dirs      = [[0, 1], [1, 0], [1, 1], [1, -1]]; // H, V, diag\, diag/

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (s.board[r][c] === null) continue;
        const color = s.board[r][c];
        for (const [dr, dc] of dirs) {
          // Only start runs (previous cell different)
          const pr = r - dr, pc = c - dc;
          if (pr >= 0 && pr < rows && pc >= 0 && pc < cols && s.board[pr][pc] === color) continue;
          // Measure run length
          let len = 1;
          while (true) {
            const nr = r + dr * len, nc = c + dc * len;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break;
            if (s.board[nr][nc] !== color) break;
            len++;
          }
          if (len >= minLen) {
            for (let i = 0; i < len; i++) matched.add(`${r + dr * i},${c + dc * i}`);
          }
        }
      }
    }
    return matched;
  }

  _applyGravity() {
    const s = this.state;
    for (let c = 0; c < s.cols; c++) {
      let write = s.rows - 1;
      for (let r = s.rows - 1; r >= 0; r--) {
        if (s.board[r][c] !== null) {
          s.board[write][c] = s.board[r][c];
          if (write !== r) s.board[r][c] = null;
          write--;
        }
      }
    }
  }

  _spawnPiece() {
    const s     = this.state;
    const spawnC = Math.floor(s.cols / 2) - 1;
    const spawnR = 2;
    if (s.board[spawnR][spawnC] !== null) return false;
    const n = s.cfg.colors;
    s.piece = { r: spawnR, c: spawnC, gems: [randInt(n), randInt(n), randInt(n)] };
    s.nextPiece = [randInt(n), randInt(n), randInt(n)];
    return true;
  }

  _gameOver() {
    const s = this.state;
    s.status = 'over';
    this._loop.stop();
    const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:over', {
      result: 'lose', icon: '💎', title: 'GRILLE PLEINE',
      score: s.score, best, isRecord,
      extraInfo: `<div class="overlay-score">Niveau ${s.level} — ${s.gemsCleared} gemmes effacées</div>`,
    });
  }

  _buildFullState() {
    const cfg = {
      cols:      this.config?.gameplay?.cols      ?? 6,
      rows:      this.config?.gameplay?.rows      ?? 13,
      colors:    this.config?.gameplay?.colors    ?? 7,
      matchLen:  this.config?.gameplay?.matchLen  ?? 3,
      tickMs:    this.config?.gameplay?.tickMs    ?? 600,
      perGem:    this.config?.scoring?.perGem     ?? 10,
      levelBonus:this.config?.scoring?.levelBonus ?? 100,
    };
    return {
      status: 'idle', mode: 'basique',
      score: 0, level: 1, chain: 0, gemsCleared: 0, resolving: false,
      cfg, cols: cfg.cols, rows: cfg.rows,
      board: Array.from({ length: cfg.rows }, () => Array(cfg.cols).fill(null)),
      piece: null, nextPiece: null,
    };
  }
}
