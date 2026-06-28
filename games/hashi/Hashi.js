import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// Puzzles : islands [{r,c,n}]  bridges validés dans la solution
const PUZZLES = [
  {
    title: 'Île 1', gridRows: 5, gridCols: 4,
    islands: [{r:0,c:0,n:2},{r:0,c:3,n:2},{r:2,c:0,n:3},{r:2,c:3,n:3},{r:4,c:0,n:2},{r:4,c:3,n:2}],
  },
  {
    title: 'Île 2', gridRows: 5, gridCols: 5,
    islands: [
      {r:0,c:0,n:2},{r:0,c:4,n:1},
      {r:2,c:0,n:3},{r:2,c:2,n:4},{r:2,c:4,n:3},
      {r:4,c:0,n:1},{r:4,c:2,n:2},{r:4,c:4,n:2},
    ],
  },
  {
    title: 'Île 3', gridRows: 5, gridCols: 5,
    islands: [
      {r:0,c:0,n:2},{r:0,c:2,n:3},{r:0,c:4,n:2},
      {r:2,c:0,n:3},{r:2,c:2,n:4},{r:2,c:4,n:3},
      {r:4,c:0,n:2},{r:4,c:2,n:3},{r:4,c:4,n:2},
    ],
  },
  {
    title: 'Île 4', gridRows: 7, gridCols: 7,
    islands: [
      {r:0,c:0,n:2},{r:0,c:3,n:3},{r:0,c:6,n:2},
      {r:3,c:0,n:2},{r:3,c:3,n:4},{r:3,c:6,n:3},
      {r:6,c:0,n:1},{r:6,c:3,n:3},{r:6,c:6,n:2},
    ],
  },
];

export default class Hashi extends BaseGame {
  constructor(config) {
    super(config);
    this.PUZZLES = PUZZLES;
    this.state   = this._buildFullState();
  }

  _gameId() { return 'hashi'; }

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
    this.state.mode      = options.mode    ?? 'basique';
    this.state.puzzleIdx = options.puzzle  ?? 0;
    this._initPuzzle();
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  restart() {
    this.state        = this._buildFullState();
    this.state.status = 'idle';
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  // Trouver ou créer un pont entre deux îles et cycler son count (0→1→2→0)
  toggleBridge(idxA, idxB) {
    const s = this.state;
    if (s.status !== 'playing') return;

    const key = this._bridgeKey(idxA, idxB);
    const cur = s.bridges.get(key) ?? 0;
    const next = (cur + 1) % 3;

    if (next === 0) s.bridges.delete(key);
    else            s.bridges.set(key, next);

    s.moves++;
    EventBus.emit('game:tick', { state: s, action: 'bridge' });
    if (this._isComplete(s)) this._win(s);
  }

  // Cherche si deux îles peuvent être reliées (même ligne/col, pas d'île entre elles, pas de croisement)
  canConnect(idxA, idxB) {
    const s = this.state;
    const a = s.islands[idxA], b = s.islands[idxB];
    if (!a || !b) return false;
    if (a.r !== b.r && a.c !== b.c) return false; // pas alignés

    // Pas d'île intermédiaire
    if (!this._clearPath(s, idxA, idxB)) return false;

    // Pas de croisement avec ponts existants
    if (this._crossesBridge(s, idxA, idxB)) return false;

    return true;
  }

  _clearPath(s, idxA, idxB) {
    const a = s.islands[idxA], b = s.islands[idxB];
    const horizontal = a.r === b.r;
    const [lo, hi] = horizontal
      ? [Math.min(a.c, b.c), Math.max(a.c, b.c)]
      : [Math.min(a.r, b.r), Math.max(a.r, b.r)];

    for (let i = 0; i < s.islands.length; i++) {
      if (i === idxA || i === idxB) continue;
      const isle = s.islands[i];
      if (horizontal && isle.r === a.r && isle.c > lo && isle.c < hi) return false;
      if (!horizontal && isle.c === a.c && isle.r > lo && isle.r < hi) return false;
    }
    return true;
  }

  _crossesBridge(s, idxA, idxB) {
    const a = s.islands[idxA], b = s.islands[idxB];
    const isHoriz = a.r === b.r;

    for (const [key, count] of s.bridges) {
      if (count === 0) continue;
      const [i1, i2] = key.split('-').map(Number);
      const c = s.islands[i1], d = s.islands[i2];
      const existHoriz = c.r === d.r;
      if (isHoriz === existHoriz) continue; // parallel, no cross

      // One is horizontal, one vertical — check intersection
      const [hr, hc1, hc2] = isHoriz
        ? [a.r, Math.min(a.c,b.c), Math.max(a.c,b.c)]
        : [c.r, Math.min(c.c,d.c), Math.max(c.c,d.c)];
      const [vc, vr1, vr2] = isHoriz
        ? [c.c, Math.min(c.r,d.r), Math.max(c.r,d.r)]
        : [a.c, Math.min(a.r,b.r), Math.max(a.r,b.r)];

      if (hc1 < vc && vc < hc2 && vr1 < hr && hr < vr2) return true;
    }
    return false;
  }

  _isComplete(s) {
    // All islands have correct bridge count
    for (let i = 0; i < s.islands.length; i++) {
      const total = this._islandBridgeCount(s, i);
      if (total !== s.islands[i].n) return false;
    }
    // All islands connected (BFS)
    const visited = new Set([0]);
    const queue   = [0];
    while (queue.length) {
      const cur = queue.shift();
      for (const [key, count] of s.bridges) {
        if (count === 0) continue;
        const [i1, i2] = key.split('-').map(Number);
        if (i1 === cur && !visited.has(i2)) { visited.add(i2); queue.push(i2); }
        if (i2 === cur && !visited.has(i1)) { visited.add(i1); queue.push(i1); }
      }
    }
    return visited.size === s.islands.length;
  }

  _islandBridgeCount(s, idx) {
    let total = 0;
    for (const [key, count] of s.bridges) {
      const [i1, i2] = key.split('-').map(Number);
      if (i1 === idx || i2 === idx) total += count;
    }
    return total;
  }

  _bridgeKey(a, b) { return a < b ? `${a}-${b}` : `${b}-${a}`; }

  _win(s) {
    s.status = 'won';
    const pts = Math.max(0, this.config.scoring.baseWin - s.moves * this.config.scoring.timePenalty);
    const { best, isRecord } = ScoreService.submit(this._gameId(), pts);
    EventBus.emit('game:won', {
      result: 'win', icon: '🌉', title: 'RÉSOLU !',
      score: pts, best, isRecord,
      extraInfo: `<div class="overlay-score">${s.title} terminé ! Ponts : <strong>${s.moves}</strong></div>`
    });
  }

  _initPuzzle() {
    const s   = this.state;
    const puz = PUZZLES[s.puzzleIdx];
    s.gridRows  = puz.gridRows;
    s.gridCols  = puz.gridCols;
    s.title     = puz.title;
    s.islands   = puz.islands.map(i => ({ ...i }));
    s.bridges   = new Map();
  }

  _buildFullState() {
    return {
      status: 'idle', mode: 'basique',
      puzzleIdx: 0, gridRows: 0, gridCols: 0, title: '',
      islands: [], bridges: new Map(), moves: 0,
    };
  }
}
