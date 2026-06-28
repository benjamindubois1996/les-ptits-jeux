import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';
import { randInt }  from '../../js/utils/Random.js';

// Satellite offsets per orientation: up / right / down / left
const SAT_OFFSETS = { up: [-1, 0], right: [0, 1], down: [1, 0], left: [0, -1] };
const ORIENTS     = ['up', 'right', 'down', 'left'];

export default class PuyoPuyo extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._loop = new GameLoop(() => this._tick());
  }

  _gameId() { return 'puyo-puyo'; }

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
    this._prepareNext();
    this._spawnPair();
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

  _interval() { return Math.max(150, 600 - Math.floor(this.state.score / 500) * 30); }

  // ── Controls ──────────────────────────────────────────────────

  _bindControls() {
    this._onKey = e => {
      const s = this.state;
      if (!s || s.status !== 'playing' || !s.pair || s.resolving) return;
      switch (e.code) {
        case 'ArrowLeft':  case 'KeyA': e.preventDefault(); this._moveH(-1);         break;
        case 'ArrowRight': case 'KeyD': e.preventDefault(); this._moveH(1);          break;
        case 'ArrowDown':  case 'KeyS': e.preventDefault(); this._drop();            break;
        case 'ArrowUp':    case 'KeyW': e.preventDefault(); this._rotateCW();        break;
        case 'Space':                   e.preventDefault(); this._rotateCCW();       break;
      }
    };
    window.addEventListener('keydown', this._onKey);
  }

  _unbindControls() {
    if (this._onKey) { window.removeEventListener('keydown', this._onKey); this._onKey = null; }
  }

  // ── Pair movement ─────────────────────────────────────────────

  _pairCells(pair) {
    const { mainR, mainC, orient } = pair;
    const [dr, dc] = SAT_OFFSETS[orient];
    return [[mainR, mainC], [mainR + dr, mainC + dc]];
  }

  _cellFree(r, c, except = []) {
    const s = this.state;
    if (c < 0 || c >= s.cols) return false;
    if (r >= s.rows) return false;
    if (r < 0) return true; // above board = free (spawn area)
    const excKey = except.map(([er, ec]) => `${er},${ec}`);
    if (excKey.includes(`${r},${c}`)) return true;
    return s.board[r][c] === null;
  }

  _moveH(dc) {
    const s = this.state;
    const pair    = s.pair;
    const oldCells = this._pairCells(pair);
    const testPair = { ...pair, mainC: pair.mainC + dc };
    if (this._pairCells(testPair).every(([r, c]) => this._cellFree(r, c, oldCells))) {
      pair.mainC += dc;
      EventBus.emit('game:tick', { state: s });
    }
  }

  _rotateCW() {
    const s    = this.state;
    const pair = s.pair;
    const idx  = ORIENTS.indexOf(pair.orient);
    this._tryRotate(pair, ORIENTS[(idx + 1) % 4]);
  }

  _rotateCCW() {
    const s    = this.state;
    const pair = s.pair;
    const idx  = ORIENTS.indexOf(pair.orient);
    this._tryRotate(pair, ORIENTS[(idx + 3) % 4]);
  }

  _tryRotate(pair, newOrient) {
    const s       = this.state;
    const oldCells = this._pairCells(pair);
    const testPair = { ...pair, orient: newOrient };
    let offsets = [0, 1, -1];
    for (const dc of offsets) {
      const kicked = { ...testPair, mainC: testPair.mainC + dc };
      if (this._pairCells(kicked).every(([r, c]) => this._cellFree(r, c, oldCells))) {
        pair.orient = newOrient;
        pair.mainC  = kicked.mainC;
        EventBus.emit('game:tick', { state: s });
        return;
      }
    }
  }

  _drop() {
    const s = this.state;
    if (!this._stepDown()) this._lockPair();
    else EventBus.emit('game:tick', { state: s });
  }

  // ── Game loop ─────────────────────────────────────────────────

  _tick() {
    const s = this.state;
    if (s.status !== 'playing' || !s.pair || s.resolving) return;
    if (!this._stepDown()) this._lockPair();
    else EventBus.emit('game:tick', { state: s });
  }

  _stepDown() {
    const s    = this.state;
    const pair = s.pair;
    const old  = this._pairCells(pair);
    const test = { ...pair, mainR: pair.mainR + 1 };
    if (this._pairCells(test).every(([r, c]) => this._cellFree(r, c, old))) {
      pair.mainR++;
      return true;
    }
    return false;
  }

  _lockPair() {
    const s    = this.state;
    const pair = s.pair;
    const cells = this._pairCells(pair);
    const [mc, sc] = [pair.mainColor, pair.satColor];
    const colors   = [mc, sc];
    for (let i = 0; i < cells.length; i++) {
      const [r, c] = cells[i];
      if (r >= 0 && r < s.rows) s.board[r][c] = colors[i];
    }
    s.pair = null;
    this._loop.stop();
    s.resolving = true;
    s.chain     = 1;
    this._resolveMatches();
  }

  _resolveMatches() {
    const s      = this.state;
    const groups = this._findGroups();
    const toRemove = groups.filter(g => g.length >= s.cfg.matchMin);

    if (toRemove.length === 0) {
      s.resolving = false;
      s.chain     = 1;
      if (!this._spawnPair()) { this._gameOver(); return; }
      this._loop.start(this._interval());
      EventBus.emit('game:tick', { state: s });
      return;
    }

    const chainBonus = s.chain === 1 ? 1 : s.chain * s.cfg.chainMult;
    let cleared = 0;
    for (const group of toRemove) {
      for (const [r, c] of group) { s.board[r][c] = null; cleared++; }
    }
    s.score += cleared * s.cfg.perPuyo * chainBonus;
    s.chain++;

    this._applyGravity();
    EventBus.emit('game:tick', { state: s });
    setTimeout(() => { if (s.status === 'playing') this._resolveMatches(); }, 320);
  }

  _findGroups() {
    const s       = this.state;
    const visited = Array.from({ length: s.rows }, () => Array(s.cols).fill(false));
    const groups  = [];

    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        if (!s.board[r][c] || visited[r][c]) continue;
        const color = s.board[r][c];
        const group = [];
        const queue = [[r, c]];
        visited[r][c] = true;
        while (queue.length) {
          const [cr, cc] = queue.shift();
          group.push([cr, cc]);
          for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nr = cr + dr, nc = cc + dc;
            if (nr < 0 || nr >= s.rows || nc < 0 || nc >= s.cols) continue;
            if (visited[nr][nc] || s.board[nr][nc] !== color) continue;
            visited[nr][nc] = true;
            queue.push([nr, nc]);
          }
        }
        groups.push(group);
      }
    }
    return groups;
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

  _prepareNext() {
    const n = this.state.cfg.colors;
    this.state.nextPair = { mainColor: randInt(n), satColor: randInt(n) };
  }

  _spawnPair() {
    const s = this.state;
    const spawnC = Math.floor(s.cols / 2) - 1;
    if (s.board[0][spawnC] !== null) return false;
    const { mainColor, satColor } = s.nextPair;
    s.pair = { mainR: 1, mainC: spawnC, orient: 'up', mainColor, satColor };
    this._prepareNext();
    return true;
  }

  _gameOver() {
    const s = this.state;
    s.status = 'over';
    this._loop.stop();
    const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:over', {
      result: 'lose', icon: '😵', title: 'GRILLE PLEINE',
      score: s.score, best, isRecord,
      extraInfo: `<div class="overlay-score">Meilleur combo : ×${s.chain - 1}</div>`,
    });
  }

  _buildFullState() {
    const cfg = {
      cols:      this.config?.gameplay?.cols      ?? 6,
      rows:      this.config?.gameplay?.rows      ?? 13,
      colors:    this.config?.gameplay?.colors    ?? 5,
      matchMin:  this.config?.gameplay?.matchMin  ?? 4,
      tickMs:    this.config?.gameplay?.tickMs    ?? 600,
      perPuyo:   this.config?.scoring?.perPuyo    ?? 10,
      chainMult: this.config?.scoring?.chainMultiplier ?? 8,
    };
    return {
      status: 'idle', mode: 'basique',
      score: 0, chain: 1, resolving: false,
      cfg, cols: cfg.cols, rows: cfg.rows,
      board: Array.from({ length: cfg.rows }, () => Array(cfg.cols).fill(null)),
      pair: null, nextPair: null,
    };
  }
}
