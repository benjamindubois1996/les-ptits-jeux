import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// Puzzles vérifiés sans chevauchement, solvables
// Chaque voiture : { id, row, col, len, horiz }
// 'red' doit atteindre exitCol (col 5, row 2) pour sortir
// Solution commentée pour chaque puzzle
const PUZZLES = [
  // P1 — 2 moves: A down, Red right
  // Grid: red(2,0-1), A(1,2-2)
  [
    { id:'red', row:2, col:0, len:2, horiz:true  },
    { id:'a',   row:1, col:2, len:2, horiz:false },
    { id:'b',   row:0, col:4, len:2, horiz:false },
    { id:'c',   row:4, col:0, len:3, horiz:true  },
    { id:'d',   row:5, col:3, len:3, horiz:true  },
  ],
  // P2 — 4 moves: B left, A down, C up, Red right
  // Grid: red(2,0-1), A(1,2-2), B(3,2-3), C(1,4-2)
  [
    { id:'red', row:2, col:0, len:2, horiz:true  },
    { id:'a',   row:1, col:2, len:2, horiz:false },
    { id:'b',   row:3, col:2, len:2, horiz:true  },
    { id:'c',   row:1, col:4, len:2, horiz:false },
    { id:'d',   row:0, col:0, len:2, horiz:false },
    { id:'e',   row:5, col:0, len:3, horiz:true  },
  ],
  // P3 — 5 moves: E right (free D), D down, B left (free A), A down, Red right
  [
    { id:'red', row:2, col:0, len:2, horiz:true  },
    { id:'a',   row:0, col:2, len:3, horiz:false },
    { id:'b',   row:3, col:2, len:2, horiz:true  },
    { id:'c',   row:2, col:4, len:2, horiz:false },
    { id:'d',   row:4, col:3, len:2, horiz:false },
    { id:'e',   row:4, col:4, len:2, horiz:true  },
    { id:'f',   row:0, col:0, len:2, horiz:false },
  ],
  // P4 — 4 moves: B down, F down, C up, Red right
  [
    { id:'red', row:2, col:0, len:2, horiz:true  },
    { id:'a',   row:0, col:2, len:2, horiz:false },
    { id:'b',   row:2, col:2, len:2, horiz:false },
    { id:'c',   row:1, col:4, len:2, horiz:false },
    { id:'d',   row:3, col:4, len:2, horiz:false },
    { id:'e',   row:5, col:1, len:3, horiz:true  },
    { id:'f',   row:2, col:3, len:2, horiz:false },
  ],
  // P5 — 5 moves: D left, B right, A down, C up, Red right
  [
    { id:'red', row:2, col:0, len:2, horiz:true  },
    { id:'a',   row:2, col:2, len:2, horiz:false },
    { id:'b',   row:4, col:2, len:2, horiz:true  },
    { id:'c',   row:1, col:4, len:2, horiz:false },
    { id:'d',   row:0, col:4, len:2, horiz:true  },
    { id:'e',   row:3, col:0, len:2, horiz:true  },
    { id:'f',   row:5, col:3, len:3, horiz:true  },
  ],
];

export default class RushHour extends BaseGame {
  constructor(config) {
    super(config);
    this.state      = this._buildFullState();
    this._puzzleIdx = 0;
  }

  _gameId() { return 'rush-hour'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); }

  start(options = {}) {
    this._puzzleIdx   = 0;
    this.state        = this._buildFullState();
    this.state.status = 'playing';
    this.state.mode   = options.mode ?? 'basique';
    this._loadPuzzle(0);
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  restart() {
    this.state        = this._buildFullState();
    this.state.status = 'idle';
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  // ── Puzzle ────────────────────────────────────────────────────────────────

  _loadPuzzle(idx) {
    const s = this.state;
    s.cars      = PUZZLES[idx].map(c => ({ ...c }));
    s.puzzleNum = idx + 1;
    s.moves     = 0;
    s.selected  = null;
    s.grid      = this._buildGrid(s.cars);
  }

  _buildGrid(cars) {
    const n = this.config.gameplay.size;
    const g = Array.from({ length: n }, () => new Array(n).fill(null));
    for (const car of cars) {
      for (let i = 0; i < car.len; i++) {
        const r = car.horiz ? car.row : car.row + i;
        const c = car.horiz ? car.col + i : car.col;
        if (r >= 0 && r < n && c >= 0 && c < n) g[r][c] = car.id;
      }
    }
    return g;
  }

  selectCar(id) {
    if (this.state.status !== 'playing') return;
    this.state.selected = this.state.selected === id ? null : id;
    EventBus.emit('game:tick', { state: this.state });
  }

  moveCar(id, delta) {
    if (this.state.status !== 'playing') return;
    const s   = this.state;
    const car = s.cars.find(c => c.id === id);
    if (!car) return;

    const n  = this.config.gameplay.size;
    const nr = car.horiz ? car.row : car.row + delta;
    const nc = car.horiz ? car.col + delta : car.col;

    if (nr < 0 || nc < 0) return;
    if (car.horiz  && nc + car.len - 1 >= n) return;
    if (!car.horiz && nr + car.len - 1 >= n) return;

    // Vérifier collisions
    const tempG = this._buildGrid(s.cars.filter(c => c.id !== id));
    for (let i = 0; i < car.len; i++) {
      const r = car.horiz ? nr : nr + i;
      const c = car.horiz ? nc + i : nc;
      if (tempG[r]?.[c] !== null && tempG[r]?.[c] !== undefined) return;
    }

    car.row = nr; car.col = nc;
    s.moves++;
    s.grid = this._buildGrid(s.cars);

    const red     = s.cars.find(c => c.id === 'red');
    const exitCol = this.config.gameplay.exitCol;
    const exitRow = this.config.gameplay.exitRow;
    if (red && red.row === exitRow && red.col + red.len - 1 === exitCol) {
      this._puzzleSolved();
    } else {
      EventBus.emit('game:tick', { state: s });
    }
  }

  _puzzleSolved() {
    const s  = this.state;
    const sc = this.config.scoring;
    const pts = Math.max(0, sc.baseWin - s.moves * sc.movePenalty);
    s.score  += pts;
    s.totalMoves += s.moves;

    this._puzzleIdx++;
    if (this._puzzleIdx >= PUZZLES.length) {
      s.status = 'won';
      const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
      EventBus.emit('game:won', {
        result: 'win', icon: '🚗', title: 'EMBOUTEILLAGE RÉSOLU !',
        score: s.score, best, isRecord,
        extraInfo: `<div class="overlay-score">Déplacements totaux : <strong>${s.totalMoves}</strong></div>`
      });
    } else {
      this._loadPuzzle(this._puzzleIdx);
      EventBus.emit('game:tick', { state: s, action: 'next-puzzle' });
    }
  }

  _buildFullState() {
    return {
      status: 'idle', mode: 'basique',
      cars: [], grid: [], moves: 0, totalMoves: 0, score: 0,
      puzzleNum: 1, selected: null
    };
  }
}
