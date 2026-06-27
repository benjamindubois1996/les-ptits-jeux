import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// Directions du laser
const REFLECT_FWD = { right:'up', left:'down', up:'right', down:'left' };  // '/'
const REFLECT_BWD = { right:'down', left:'up', up:'left', down:'right' };  // '\'

// Réflexions :
//   mirror-fwd (/) : right→up, left→down, up→right, down→left
//   mirror-bwd (\) : right→down, left→up, up→left, down→right

const PUZZLES = [
  // P1 — Introduction : 1 rotation, chemin en L
  // Laser va droite → A fwd redirige vers le haut → cible
  {
    laser:   { r:6, c:0, dir:'right' },
    targets: [{ r:0, c:4 }],
    walls:   [],
    mirrors: [
      { r:6, c:4, type:'mirror-bwd', fixed:false }, // doit devenir fwd (right→up)
    ]
  },
  // P2 — Double détour : 2 rotations, chemin en Z
  // Laser droite → A (bwd: right→down) → B (bwd: down→right) → cible
  {
    laser:   { r:0, c:0, dir:'right' },
    targets: [{ r:6, c:6 }],
    walls:   [],
    mirrors: [
      { r:0, c:3, type:'mirror-fwd', fixed:false }, // doit devenir bwd (right→down)
      { r:6, c:3, type:'mirror-fwd', fixed:false }, // doit devenir bwd (down→right)
    ]
  },
  // P3 — Miroir guide + 1 rotation : chemin en 3 segments
  // Laser bas → fixe (down→left) → rotatif (left→down) → cible
  {
    laser:   { r:0, c:6, dir:'down' },
    targets: [{ r:6, c:0 }],
    walls:   [],
    mirrors: [
      { r:3, c:6, type:'mirror-fwd', fixed:true  }, // fixe : down→left
      { r:3, c:0, type:'mirror-bwd', fixed:false }, // doit devenir fwd (left→down)
    ]
  },
  // P4 — Triangle : 3 rotations, retour vers la cible intérieure
  // Laser droite → A (right→down) → B (down→left) → C (left→up) → passe par la cible
  {
    laser:   { r:0, c:0, dir:'right' },
    targets: [{ r:3, c:3 }],
    walls:   [],
    mirrors: [
      { r:0, c:5, type:'mirror-fwd', fixed:false }, // doit devenir bwd (right→down)
      { r:5, c:5, type:'mirror-bwd', fixed:false }, // doit devenir fwd (down→left)
      { r:5, c:3, type:'mirror-fwd', fixed:false }, // doit devenir bwd (left→up)
    ]
  },
  // P5 — Serpent : 1 fixe + 2 rotations, 4 segments
  // Laser haut → fixe (up→left) → B (left→up) → C (up→left) → cible
  {
    laser:   { r:6, c:6, dir:'up' },
    targets: [{ r:0, c:0 }],
    walls:   [],
    mirrors: [
      { r:2, c:6, type:'mirror-bwd', fixed:true  }, // fixe : up→left
      { r:2, c:3, type:'mirror-fwd', fixed:false }, // doit devenir bwd (left→up)
      { r:0, c:3, type:'mirror-fwd', fixed:false }, // doit devenir bwd (up→left)
    ]
  },
];

export default class LaserMaze extends BaseGame {
  constructor(config) {
    super(config);
    this.state      = this._buildFullState();
    this._puzzleIdx = 0;
  }

  _gameId() { return 'laser-maze'; }

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

  _loadPuzzle(idx) {
    const s    = this.state;
    const tmpl = PUZZLES[idx];
    s.laser     = { ...tmpl.laser };
    s.targets   = tmpl.targets.map(t => ({ ...t, hit: false }));
    s.walls     = tmpl.walls.map(w => ({ ...w }));
    s.mirrors   = tmpl.mirrors.map(m => ({ ...m }));
    s.puzzleNum = idx + 1;
    s.moves     = 0;
    s.beam      = this._traceBeam(s);
  }

  _traceBeam(s) {
    const n    = this.config.gameplay.size;
    let { r, c, dir } = s.laser;
    const path    = [];
    const visited = new Set();
    s.targets.forEach(t => { t.hit = false; });

    while (true) {
      const key = `${r},${c},${dir}`;
      if (visited.has(key)) break;
      visited.add(key);
      if (r < 0 || r >= n || c < 0 || c >= n) break;
      path.push({ r, c, dir });

      const isWall = s.walls.some(w => w.r === r && w.c === c);
      if (isWall) break;

      const mirror = s.mirrors.find(m => m.r === r && m.c === c);
      if (mirror) dir = mirror.type === 'mirror-fwd' ? REFLECT_FWD[dir] : REFLECT_BWD[dir];

      const target = s.targets.find(t => t.r === r && t.c === c);
      if (target) target.hit = true;

      if      (dir === 'right') c++;
      else if (dir === 'left')  c--;
      else if (dir === 'up')    r--;
      else if (dir === 'down')  r++;
    }
    return path;
  }

  rotateMirror(r, c) {
    if (this.state.status !== 'playing') return;
    const s      = this.state;
    const mirror = s.mirrors.find(m => m.r === r && m.c === c && !m.fixed);
    if (!mirror) return;
    mirror.type = mirror.type === 'mirror-fwd' ? 'mirror-bwd' : 'mirror-fwd';
    s.moves++;
    s.beam = this._traceBeam(s);
    EventBus.emit('game:tick', { state: s });
    if (s.targets.every(t => t.hit)) this._nextPuzzle();
  }

  _nextPuzzle() {
    const s  = this.state;
    const sc = this.config.scoring;
    const pts = Math.max(0, sc.baseWin - s.moves * sc.movePenalty);
    s.score  += pts;

    this._puzzleIdx++;
    if (this._puzzleIdx >= PUZZLES.length) {
      s.status = 'won';
      const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
      EventBus.emit('game:won', {
        result: 'win', icon: '🔴', title: 'TOUS LES NIVEAUX !',
        score: s.score, best, isRecord
      });
    } else {
      this._loadPuzzle(this._puzzleIdx);
      EventBus.emit('game:tick', { state: s, action: 'next-puzzle' });
    }
  }

  _buildFullState() {
    return {
      status: 'idle', mode: 'basique', score: 0,
      laser: null, targets: [], walls: [], mirrors: [], beam: [],
      puzzleNum: 1, moves: 0
    };
  }
}
