import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// Murs stockés comme "r,c:DIR" = mur sur le côté DIR de la cellule (r,c)
// Un mur sur le côté S de (r,c) équivaut à un mur sur le côté N de (r+1,c)

const DIRS = { N:[-1,0], S:[1,0], E:[0,1], W:[0,-1] };
const OPP  = { N:'S', S:'N', E:'W', W:'E' };

const PUZZLES = [
  // P1: robot rouge doit aller en (3,5)
  {
    robots:  [
      { r:1, c:1, color:'red'    },
      { r:0, c:5, color:'blue'   },
      { r:5, c:0, color:'green'  },
      { r:6, c:6, color:'yellow' },
    ],
    target: { r:3, c:5, color:'red' },
    walls: ['2,5:S','3,4:E','4,5:N']
  },
  // P2: vert doit aller en (5,2)
  {
    robots: [
      { r:0, c:0, color:'red'    },
      { r:7, c:7, color:'blue'   },
      { r:3, c:2, color:'green'  },
      { r:5, c:5, color:'yellow' },
    ],
    target: { r:5, c:2, color:'green' },
    walls: ['2,2:S','5,1:E','5,3:W']
  },
  // P3: rouge doit aller en (2,1)
  {
    robots: [
      { r:2, c:6, color:'red'    },
      { r:0, c:1, color:'blue'   },
      { r:6, c:3, color:'green'  },
      { r:4, c:0, color:'yellow' },
    ],
    target: { r:2, c:1, color:'red' },
    walls: ['1,1:S','2,0:E','3,1:N']
  },
  // P4: bleu doit aller en (5,3)
  {
    robots: [
      { r:1, c:3, color:'red'    },
      { r:5, c:6, color:'blue'   },
      { r:0, c:7, color:'green'  },
      { r:7, c:1, color:'yellow' },
    ],
    target: { r:5, c:3, color:'blue' },
    walls: ['4,3:S','5,2:E','5,4:W','3,6:S']
  },
  // P5: rouge doit aller en (7,6)
  {
    robots: [
      { r:3, c:3, color:'red'    },
      { r:0, c:6, color:'blue'   },
      { r:7, c:2, color:'green'  },
      { r:5, c:7, color:'yellow' },
    ],
    target: { r:7, c:6, color:'red' },
    walls: ['6,6:S','7,5:E','1,3:S']
  },
];

export default class RicochetRobots extends BaseGame {
  constructor(config) {
    super(config);
    this.state      = this._buildFullState();
    this._puzzleIdx = 0;
  }

  _gameId() { return 'ricochet-robots'; }

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); this._unbindControls(); }

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

  _loadPuzzle(idx) {
    const s    = this.state;
    const tmpl = PUZZLES[idx];
    s.robots    = tmpl.robots.map(r => ({ ...r }));
    s.target    = { ...tmpl.target };
    s.walls     = new Set(tmpl.walls);
    s.puzzleNum = idx + 1;
    s.moves     = 0;
    s.selected  = null;
    s.history   = [];
    // Pré-sélectionner le robot cible pour faciliter la prise en main
    s.selected  = s.target.color;
  }

  selectRobot(color) {
    if (this.state.status !== 'playing') return;
    this.state.selected = color;
    EventBus.emit('game:tick', { state: this.state });
  }

  moveRobot(color, dir) {
    if (this.state.status !== 'playing') return;
    const s     = this.state;
    const robot = s.robots.find(r => r.color === color);
    if (!robot) return;

    const [dr, dc] = DIRS[dir];
    const n        = this.config.gameplay.size;
    let { r, c }   = robot;

    while (true) {
      if (s.walls.has(`${r},${c}:${dir}`)) break;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) break;
      if (s.walls.has(`${nr},${nc}:${OPP[dir]}`)) break;
      if (s.robots.some(rb => rb.r === nr && rb.c === nc)) break;
      r = nr; c = nc;
    }

    if (r === robot.r && c === robot.c) return;
    s.history.push({ color, r: robot.r, c: robot.c });
    robot.r = r; robot.c = c;
    s.moves++;
    EventBus.emit('game:tick', { state: s });

    const t = s.target;
    if (robot.color === t.color && robot.r === t.r && robot.c === t.c) this._nextPuzzle();
  }

  undoMove() {
    const s = this.state;
    if (!s.history.length || s.status !== 'playing') return;
    const last  = s.history.pop();
    const robot = s.robots.find(r => r.color === last.color);
    if (robot) { robot.r = last.r; robot.c = last.c; }
    s.moves = Math.max(0, s.moves - 1);
    EventBus.emit('game:tick', { state: s });
  }

  _nextPuzzle() {
    const s  = this.state;
    const sc = this.config.scoring;
    const pts = Math.max(0, sc.baseWin - s.moves * sc.movePenalty);
    s.score  += pts;
    s.totalMoves = (s.totalMoves || 0) + s.moves;

    this._puzzleIdx++;
    if (this._puzzleIdx >= PUZZLES.length) {
      s.status = 'won';
      const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
      EventBus.emit('game:won', {
        result: 'win', icon: '🤖', title: 'MISSION ACCOMPLIE !',
        score: s.score, best, isRecord,
        extraInfo: `<div class="overlay-score">Coups totaux : <strong>${s.totalMoves}</strong></div>`
      });
    } else {
      this._loadPuzzle(this._puzzleIdx);
      EventBus.emit('game:tick', { state: s, action: 'next-puzzle' });
    }
  }

  // ── Calcul des positions atteignables ────────────────────────────────────

  getReachable(color) {
    const s     = this.state;
    const robot = s.robots.find(r => r.color === color);
    if (!robot) return [];
    const n     = this.config.gameplay.size;
    const result = [];

    for (const [dir, [dr, dc]] of Object.entries(DIRS)) {
      let r = robot.r, c = robot.c;
      while (true) {
        if (s.walls.has(`${r},${c}:${dir}`)) break;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) break;
        if (s.walls.has(`${nr},${nc}:${OPP[dir]}`)) break;
        if (s.robots.some(rb => rb.r === nr && rb.c === nc)) break;
        r = nr; c = nc;
      }
      if (r !== robot.r || c !== robot.c) result.push({ r, c, dir });
    }
    return result;
  }

  // ── Contrôles clavier ────────────────────────────────────────────────────

  _bindControls() {
    this._onKey = (e) => {
      if (this.state.status !== 'playing') return;
      const s = this.state;
      if (!s.selected) return;
      const map = { ArrowUp:'N', ArrowDown:'S', ArrowRight:'E', ArrowLeft:'W',
                    KeyW:'N', KeyS:'S', KeyD:'E', KeyA:'W' };
      const dir = map[e.code];
      if (dir) { e.preventDefault(); this.moveRobot(s.selected, dir); }
      if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.undoMove(); }
    };
    window.addEventListener('keydown', this._onKey);
  }

  _unbindControls() { window.removeEventListener('keydown', this._onKey); }

  _buildFullState() {
    return {
      status: 'idle', mode: 'basique', score: 0, totalMoves: 0,
      robots: [], target: null, walls: new Set(),
      puzzleNum: 1, moves: 0, selected: null, history: []
    };
  }
}
