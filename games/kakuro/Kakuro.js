import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// null = mur solide   {d,a} = cellule clue (0 = pas de clue)   0 = cellule à remplir
const PUZZLES = [
  {
    title: 'Niveau 1', rows: 3, cols: 3,
    grid: [
      [null,        {d:5,a:0},  {d:5,a:0} ],
      [{a:3,d:0},   0,          0         ],
      [{a:7,d:0},   0,          0         ],
    ],
  },
  {
    title: 'Niveau 2', rows: 3, cols: 4,
    grid: [
      [null,         {d:3,a:0}, {d:6,a:0}, {d:8,a:0}],
      [{a:7,d:0},    0,         0,          0        ],
      [{a:10,d:0},   0,         0,          0        ],
    ],
  },
  {
    title: 'Niveau 3', rows: 6, cols: 6,
    grid: [
      [null,       {d:4,a:0},  {d:7,a:0},  null,       {d:8,a:0},  {d:5,a:0}],
      [{a:6,d:0},  0,          0,          {a:6,d:0},  0,          0        ],
      [{a:5,d:0},  0,          0,          {a:7,d:0},  0,          0        ],
      [null,       {d:7,a:0},  {d:5,a:0},  null,       {d:7,a:0},  {d:7,a:0}],
      [{a:6,d:0},  0,          0,          {a:8,d:0},  0,          0        ],
      [{a:6,d:0},  0,          0,          {a:6,d:0},  0,          0        ],
    ],
  },
  {
    title: 'Niveau 4', rows: 6, cols: 7,
    grid: [
      [null,        {d:11,a:0},{d:5,a:0}, {d:8,a:0},  null,        {d:7,a:0},  {d:9,a:0}],
      [{a:15,d:0},  0,         0,          0,         {a:7,d:0},   0,           0        ],
      [{a:9,d:0},   0,         0,          0,         {a:9,d:0},   0,           0        ],
      [null,        {d:14,a:0},{d:4,a:0}, {d:6,a:0},  null,        {d:8,a:0},  {d:7,a:0}],
      [{a:9,d:0},   0,         0,          0,         {a:8,d:0},   0,           0        ],
      [{a:15,d:0},  0,         0,          0,         {a:7,d:0},   0,           0        ],
    ],
  },
];

export default class Kakuro extends BaseGame {
  constructor(config) {
    super(config);
    this.PUZZLES = PUZZLES;
    this.state   = this._buildFullState();
  }

  _gameId() { return 'kakuro'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); }

  start(options = {}) {
    this.state           = this._buildFullState();
    this.state.status    = 'playing';
    this.state.mode      = options.mode  ?? 'basique';
    this.state.puzzleIdx = (options.puzzle ?? 0);
    this._initPuzzle();
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  restart() {
    this.state        = this._buildFullState();
    this.state.status = 'idle';
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  setCellValue(r, c, val) {
    const s = this.state;
    if (s.status !== 'playing') return;
    const cell = s.grid[r]?.[c];
    if (cell === null || typeof cell === 'object') return; // wall/clue
    s.grid[r][c] = val; // 0 = erase, 1-9 = value
    s.errors     = this._computeErrors();
    EventBus.emit('game:tick', { state: s, action: 'cell' });
    if (this._isComplete(s)) this._win(s);
  }

  selectCell(r, c) {
    const s = this.state;
    if (s.status !== 'playing') return;
    const cell = s.grid[r]?.[c];
    if (cell === null || typeof cell === 'object') return;
    s.selectedCell = [r, c];
    EventBus.emit('game:tick', { state: s, action: 'select' });
  }

  // ── Logique interne ───────────────────────────────────────────────────────

  _initPuzzle() {
    const s   = this.state;
    const puz = PUZZLES[s.puzzleIdx];
    s.rows    = puz.rows;
    s.cols    = puz.cols;
    s.title   = puz.title;
    s.grid    = puz.grid.map(row => row.map(cell => {
      if (cell === null) return null;
      if (typeof cell === 'object') return { ...cell };
      return 0; // white cell, empty
    }));
    s.errors  = new Set();
    s.selectedCell = null;
  }

  _computeErrors() {
    const { grid, rows, cols } = this.state;
    const errors = new Set();

    // Check each run: duplicates and sum
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (typeof cell === 'object' && cell !== null && cell.a > 0) {
          // Across run starting at (r, c+1)
          this._checkRun(grid, r, c+1, 0, 1, cell.a, errors);
        }
        if (typeof cell === 'object' && cell !== null && cell.d > 0) {
          // Down run starting at (r+1, c)
          this._checkRun(grid, r+1, c, 1, 0, cell.d, errors);
        }
      }
    }
    return errors;
  }

  _checkRun(grid, r, c, dr, dc, target, errors) {
    const cells = [];
    let rr = r, cc = c;
    while (rr < this.state.rows && cc < this.state.cols) {
      const v = grid[rr]?.[cc];
      if (v === null || typeof v === 'object') break;
      cells.push([rr, cc, v]);
      rr += dr; cc += dc;
    }
    // Mark duplicates
    const seen = {};
    cells.forEach(([cr, cc2, v]) => {
      if (v === 0) return;
      const k = `${cr},${cc2}`;
      if (seen[v]) {
        errors.add(k); errors.add(seen[v]);
      } else { seen[v] = k; }
    });
    // Mark if sum wrong and all filled
    if (cells.every(([,, v]) => v > 0)) {
      const sum = cells.reduce((a, [,, v]) => a + v, 0);
      if (sum !== target) cells.forEach(([cr, cc2]) => errors.add(`${cr},${cc2}`));
    }
  }

  _isComplete(s) {
    const { grid, rows, cols } = s;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = grid[r][c];
        if (v === 0) return false; // unfilled white cell
      }
    }
    return s.errors.size === 0;
  }

  _win(s) {
    s.status = 'won';
    const pts = Math.max(0, this.config.scoring.baseWin - s.moves * this.config.scoring.timePenalty);
    const { best, isRecord } = ScoreService.submit(this._gameId(), pts);
    EventBus.emit('game:won', {
      result: 'win', icon: '🔢', title: 'RÉSOLU !',
      score: pts, best, isRecord,
      extraInfo: `<div class="overlay-score">${s.title} terminé !</div>`
    });
  }

  _buildFullState() {
    return {
      status: 'idle', mode: 'basique',
      puzzleIdx: 0, rows: 0, cols: 0, title: '',
      grid: [], errors: new Set(), selectedCell: null, moves: 0,
    };
  }
}
