import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';

const COLS = 6, ROWS = 12, COLORS = 6;

function rnd()     { return 1 + Math.floor(Math.random() * COLORS); }
function genRow()  { return Array.from({ length: COLS }, rnd); }

function genGrid() {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let r = 5; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      g[r][c] = rnd();
  return g;
}

export default class PanelDePon extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._loop = new GameLoop(this._tick.bind(this));
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  _gameId() { return 'panel-de-pon'; }

  _buildFullState() {
    return {
      status:        'idle',
      grid:          genGrid(),
      cursor:        { x: 2, y: 8 },
      score:         0,
      chain:         0,
      riseProgress:  0,
      riseSpeed:     1.5,
      riseLimit:     100,
      nextRow:       genRow(),
      flashCells:    [],
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
    s.status = 'playing';
    this._loop.start(100);
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }


  _tick() {
    const s = this.state;
    if (s.status !== 'playing') return;

    s.flashCells = [];
    s.riseProgress += s.riseSpeed;

    if (s.riseProgress >= s.riseLimit) {
      s.riseProgress -= s.riseLimit;
      this._rise(s);
      if (s.status !== 'playing') return;
    }

    EventBus.emit('game:tick', { state: s, action: 'tick' });
  }

  _rise(s) {
    const g = s.grid;
    for (let c = 0; c < COLS; c++) {
      if (g[0][c] !== null) {
        s.status = 'over';
        this._loop.stop();
        const res = ScoreService.submit(this._gameId(), s.score);
        EventBus.emit('game:over', { score: s.score, best: res.best, isRecord: res.isRecord });
        return;
      }
    }
    for (let r = 0; r < ROWS - 1; r++) g[r] = [...g[r + 1]];
    g[ROWS - 1]    = [...s.nextRow];
    s.nextRow      = genRow();
    if (s.cursor.y > 0) s.cursor.y--;

    if (s.score > 2000) s.riseSpeed = 2.5;
    if (s.score > 6000) s.riseSpeed = 4;
  }

  _bindControls() {
    document.addEventListener('keydown', this._onKeyDown);
  }

  _unbindControls() {
    document.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    const s = this.state;
    if (!s || s.status !== 'playing') return;
    if (e.key === 'p' || e.key === 'P') { EventBus.emit('game:pause-toggle'); return; }
    if (e.key === 'r' || e.key === 'R') { EventBus.emit('game:restart');      return; }

    const { cursor } = s;
    switch (e.key) {
      case 'ArrowLeft':  cursor.x = Math.max(0,          cursor.x - 1); break;
      case 'ArrowRight': cursor.x = Math.min(COLS - 2,   cursor.x + 1); break;
      case 'ArrowUp':    cursor.y = Math.max(0,          cursor.y - 1); break;
      case 'ArrowDown':  cursor.y = Math.min(ROWS - 1,   cursor.y + 1); break;
      case ' ':
      case 'z':
      case 'Z':
        e.preventDefault();
        this._swap(s, cursor.x, cursor.y);
        return;
    }
    EventBus.emit('game:tick', { state: s, action: 'move' });
  }

  _swap(s, x, y) {
    const g = s.grid;
    const tmp = g[y][x]; g[y][x] = g[y][x + 1]; g[y][x + 1] = tmp;
    s.chain = 0;
    this._resolveMatches(s);
    EventBus.emit('game:tick', { state: s, action: 'swap' });
  }

  _resolveMatches(s) {
    const matched = this._findMatches(s.grid);
    if (matched.length === 0) return;

    s.chain++;
    const bonus = Math.max(1, s.chain);
    s.score += matched.length * 100 * bonus;
    s.flashCells = matched;

    for (const { r, c } of matched) s.grid[r][c] = null;
    this._applyGravity(s.grid);
    this._resolveMatches(s); // chain
    ScoreService.submit(this._gameId(), s.score);
  }

  _findMatches(g) {
    const set = new Set();
    const key = (r, c) => r * COLS + c;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c <= COLS - 3; c++) {
        const v = g[r][c];
        if (!v) continue;
        let len = 1;
        while (c + len < COLS && g[r][c + len] === v) len++;
        if (len >= 3) for (let i = 0; i < len; i++) set.add(key(r, c + i));
      }
    }

    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r <= ROWS - 3; r++) {
        const v = g[r][c];
        if (!v) continue;
        let len = 1;
        while (r + len < ROWS && g[r + len][c] === v) len++;
        if (len >= 3) for (let i = 0; i < len; i++) set.add(key(r + i, c));
      }
    }

    return [...set].map(k => ({ r: Math.floor(k / COLS), c: k % COLS }));
  }

  _applyGravity(g) {
    for (let c = 0; c < COLS; c++) {
      let w = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (g[r][c] !== null) { g[w][c] = g[r][c]; if (w !== r) g[r][c] = null; w--; }
      }
      while (w >= 0) { g[w--][c] = null; }
    }
  }

  _onPause()  { this._loop.stop(); }
  _onResume() { this._loop.start(100); }

  restart() {
    this._loop.stop();
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    this._loop.destroy();
    this._unbindControls();
    super.destroy();
  }
}
