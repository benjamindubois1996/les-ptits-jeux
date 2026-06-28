import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';
import { randInt, randChoice } from '../../js/utils/Random.js';

const COLORS  = ['r', 'y', 'b'];
const MATCH   = 4;

export default class DrMario extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._loop = new GameLoop(() => this._tick());
  }

  _gameId() { return 'dr-mario'; }

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
    this.state.status  = 'playing';
    this.state.mode    = options.mode  ?? 'basique';
    this.state.level   = options.level ?? 1;
    this._placeViruses();
    this._prepareNext();
    this._spawnPill();
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

  _interval() { return Math.max(150, 700 - (this.state.level - 1) * 80); }

  // ── Controls ──────────────────────────────────────────────────

  _bindControls() {
    this._onKey = e => {
      const s = this.state;
      if (!s || s.status !== 'playing' || !s.pill || s.resolving) return;
      switch (e.code) {
        case 'ArrowLeft':  case 'KeyA': e.preventDefault(); this._moveH(-1); break;
        case 'ArrowRight': case 'KeyD': e.preventDefault(); this._moveH(1);  break;
        case 'ArrowDown':  case 'KeyS': e.preventDefault(); this._moveV(1);  break;
        case 'ArrowUp':    case 'KeyW':
        case 'Space':                   e.preventDefault(); this._rotate();  break;
      }
    };
    window.addEventListener('keydown', this._onKey);
  }

  _unbindControls() {
    if (this._onKey) { window.removeEventListener('keydown', this._onKey); this._onKey = null; }
  }

  // ── Pill movement ─────────────────────────────────────────────

  _positions(pill) {
    const { r, c, orient } = pill;
    return orient === 'h' ? [[r, c], [r, c + 1]] : [[r, c], [r + 1, c]];
  }

  _canPlace(r, c, exceptPositions = []) {
    const s = this.state;
    if (r < 0 || r >= s.rows || c < 0 || c >= s.cols) return false;
    const excKey = exceptPositions.map(([er, ec]) => `${er},${ec}`);
    if (excKey.includes(`${r},${c}`)) return true;
    return s.board[r][c] === null;
  }

  _moveH(dc) {
    const s = this.state;
    const { r, c, orient, color1, color2 } = s.pill;
    const test = { r, c: c + dc, orient, color1, color2 };
    const oldPos = this._positions(s.pill);
    if (this._positions(test).every(([pr, pc]) => this._canPlace(pr, pc, oldPos))) {
      s.pill.c = c + dc;
      EventBus.emit('game:tick', { state: s });
    }
  }

  _moveV(dr) {
    const s = this.state;
    const { r, c, orient, color1, color2 } = s.pill;
    const test = { r: r + dr, c, orient, color1, color2 };
    const oldPos = this._positions(s.pill);
    if (this._positions(test).every(([pr, pc]) => this._canPlace(pr, pc, oldPos))) {
      s.pill.r = r + dr;
      EventBus.emit('game:tick', { state: s });
      return true;
    }
    return false;
  }

  _rotate() {
    const s = this.state;
    const { r, c, orient, color1, color2 } = s.pill;
    const newOrient = orient === 'h' ? 'v' : 'h';
    let nc = c;
    // H→V: new positions (r, c) and (r+1, c)
    // V→H: new positions (r, c) and (r, c+1) — if c+1 out of bounds, kick left
    if (newOrient === 'h' && c + 1 >= s.cols) nc = s.cols - 2;
    const test = { r, c: nc, orient: newOrient, color1, color2 };
    const oldPos = this._positions(s.pill);
    if (this._positions(test).every(([pr, pc]) => this._canPlace(pr, pc, oldPos))) {
      s.pill.orient = newOrient;
      s.pill.c = nc;
      // V→H rotates the colors
      if (newOrient === 'h') { s.pill.color1 = color1; s.pill.color2 = color2; }
      EventBus.emit('game:tick', { state: s });
    }
  }

  // ── Game loop ─────────────────────────────────────────────────

  _tick() {
    const s = this.state;
    if (s.status !== 'playing' || !s.pill || s.resolving) return;
    if (!this._moveV(1)) this._lockPill();
  }

  _lockPill() {
    const s = this.state;
    const { r, c, orient, color1, color2 } = s.pill;
    if (orient === 'h') {
      s.board[r][c]     = { color: color1, virus: false };
      s.board[r][c + 1] = { color: color2, virus: false };
    } else {
      s.board[r][c]     = { color: color1, virus: false };
      s.board[r + 1][c] = { color: color2, virus: false };
    }
    s.pill = null;
    this._loop.stop();
    s.resolving = true;
    this._resolveMatches();
  }

  _resolveMatches() {
    const s = this.state;
    const hits = this._findMatches();

    if (hits.size === 0) {
      s.resolving = false;
      s.chain     = 1;
      if (!this._spawnPill()) { this._lose(); return; }
      this._loop.start(this._interval());
      EventBus.emit('game:tick', { state: s });
      return;
    }

    let virusCleared = 0;
    for (const key of hits) {
      const [r, c] = key.split(',').map(Number);
      if (s.board[r][c]?.virus) virusCleared++;
      s.board[r][c] = null;
    }
    s.score      += hits.size * this.config.scoring.perMatch * s.chain
                  + virusCleared * this.config.scoring.perVirus;
    s.chain      += 1;
    s.virusCount -= virusCleared;

    if (s.virusCount <= 0) { this._win(s.score); return; }

    this._applyGravity();
    EventBus.emit('game:tick', { state: s });

    setTimeout(() => { if (s.status === 'playing') this._resolveMatches(); }, 300);
  }

  _findMatches() {
    const s = this.state;
    const { rows, cols } = s;
    const matched = new Set();

    // Horizontal runs
    for (let r = 0; r < rows; r++) {
      let run = 1;
      for (let c = 1; c <= cols; c++) {
        const prev = s.board[r][c - 1];
        const curr = c < cols ? s.board[r][c] : null;
        if (curr && prev && curr.color === prev.color) { run++; }
        else {
          if (run >= MATCH) for (let i = c - run; i < c; i++) matched.add(`${r},${i}`);
          run = 1;
        }
      }
    }

    // Vertical runs
    for (let c = 0; c < cols; c++) {
      let run = 1;
      for (let r = 1; r <= rows; r++) {
        const prev = s.board[r - 1][c];
        const curr = r < rows ? s.board[r][c] : null;
        if (curr && prev && curr.color === prev.color) { run++; }
        else {
          if (run >= MATCH) for (let i = r - run; i < r; i++) matched.add(`${i},${c}`);
          run = 1;
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

  _prepareNext() {
    this.state.nextPill = { color1: randChoice(COLORS), color2: randChoice(COLORS) };
  }

  _spawnPill() {
    const s = this.state;
    const spawnR = 0, spawnC = Math.floor(s.cols / 2) - 1;
    if (s.board[spawnR][spawnC] !== null || s.board[spawnR][spawnC + 1] !== null) return false;
    const { color1, color2 } = s.nextPill;
    s.pill = { r: spawnR, c: spawnC, color1, color2, orient: 'h' };
    this._prepareNext();
    return true;
  }

  _placeViruses() {
    const s = this.state;
    const count  = Math.min(4 + s.level * 3, 24);
    const rowMin = s.cfg.virusRowStart;
    let placed = 0, tries = 0;
    while (placed < count && tries < 1000) {
      tries++;
      const r = rowMin + randInt(s.rows - rowMin);
      const c = randInt(s.cols);
      if (s.board[r][c] !== null) continue;
      s.board[r][c] = { color: COLORS[placed % 3], virus: true };
      placed++;
    }
    s.virusCount = placed;
  }

  _win(score) {
    const s = this.state;
    s.status = 'won';
    this._loop.stop();
    const { best, isRecord } = ScoreService.submit(this._gameId(), score);
    EventBus.emit('game:won', {
      result: 'win', icon: '💊', title: 'SOIGNE !',
      score, best, isRecord,
      extraInfo: `<div class="overlay-score">Niveau ${s.level} — tous les virus éliminés</div>`,
    });
  }

  _lose() {
    const s = this.state;
    s.status = 'over';
    this._loop.stop();
    EventBus.emit('game:over', {
      result: 'lose', icon: '☠️', title: 'CONTAMINÉ',
      score: s.score, best: ScoreService.getBest(this._gameId()),
      extraInfo: `<div class="overlay-score">Virus restants : <strong>${s.virusCount}</strong></div>`,
    });
  }

  _buildFullState() {
    const cfg = {
      cols:         this.config?.gameplay?.cols         ?? 8,
      rows:         this.config?.gameplay?.rows         ?? 16,
      virusRowStart:this.config?.gameplay?.virusRowStart?? 10,
      tickMs:       this.config?.gameplay?.tickMs       ?? 700,
    };
    return {
      status: 'idle', mode: 'basique', level: 1,
      score: 0, chain: 1, virusCount: 0, resolving: false,
      cfg, cols: cfg.cols, rows: cfg.rows,
      board: Array.from({ length: cfg.rows }, () => Array(cfg.cols).fill(null)),
      pill: null, nextPill: null,
    };
  }
}
