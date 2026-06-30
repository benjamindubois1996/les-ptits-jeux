import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';

const GRAVITY    = 0.35;   // px/tick²
const BIRD_R     = 14;
const PIG_R      = 14;
const MAX_PULL   = 80;     // distance max de tir en px (normalized)
const POWER_MULT = 0.18;
const BIRD_PER_LEVEL = 4;

// Levels: plateformes (x,y,w) en normalized [0-1], cochons (cx,cy)
const LEVELS = [
  {
    platforms: [
      { x: 0.55, y: 0.82, w: 0.12 },
      { x: 0.72, y: 0.82, w: 0.12 },
    ],
    pigs: [
      { cx: 0.60, cy: 0.79 },
      { cx: 0.76, cy: 0.79 },
      { cx: 0.68, cy: 0.60 },
    ],
    blocks: [],
  },
  {
    platforms: [
      { x: 0.52, y: 0.82, w: 0.10 },
      { x: 0.65, y: 0.70, w: 0.10 },
      { x: 0.78, y: 0.82, w: 0.10 },
    ],
    pigs: [
      { cx: 0.57, cy: 0.79 },
      { cx: 0.70, cy: 0.67 },
      { cx: 0.83, cy: 0.79 },
      { cx: 0.83, cy: 0.55 },
    ],
    blocks: [
      { x: 0.65, y: 0.60, w: 0.035, h: 0.10 }, // colonne
    ],
  },
  {
    platforms: [
      { x: 0.50, y: 0.82, w: 0.36 },
    ],
    pigs: [
      { cx: 0.56, cy: 0.79 },
      { cx: 0.65, cy: 0.79 },
      { cx: 0.74, cy: 0.79 },
      { cx: 0.83, cy: 0.79 },
      { cx: 0.60, cy: 0.60 },
      { cx: 0.79, cy: 0.60 },
    ],
    blocks: [
      { x: 0.585, y: 0.67, w: 0.035, h: 0.12 },
      { x: 0.765, y: 0.67, w: 0.035, h: 0.12 },
      { x: 0.585, y: 0.52, w: 0.21, h: 0.025 }, // toit
    ],
  },
];

export default class AngryBirds extends BaseGame {
  constructor(config) {
    super(config);
    this.state     = null;
    this._loop     = new GameLoop(this._tick.bind(this));
    this._lastTick = null;
  }

  _gameId() { return 'angry-birds'; }

  _buildFullState(level = 0) {
    const lvl = LEVELS[level] ?? LEVELS[LEVELS.length - 1];
    return {
      status:    'idle',
      score:     0,
      level,
      birdsLeft: BIRD_PER_LEVEL,
      pigs:      lvl.pigs.map((p, i) => ({ ...p, id: i, alive: true })),
      platforms: lvl.platforms,
      blocks:    lvl.blocks,
      bird:      { x: 0.13, y: 0.78, vx: 0, vy: 0, active: false, trail: [] },
      phase:     'ready',   // ready | flying | settling
      settleMs:  0,
      sling:     { x: 0.13, y: 0.78 },
      drag:      null,      // { startX, startY, curX, curY }
    };
  }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState(0);
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  start() {
    const s = this.state;
    s.status   = 'playing';
    this._lastTick = null;
    this._loop.start(16);
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  startDrag(nx, ny) {
    const s = this.state;
    if (s.status !== 'playing' || s.phase !== 'ready') return;
    s.drag = { curX: nx, curY: ny };
    EventBus.emit('game:tick', { state: s, action: 'drag' });
  }

  updateDrag(nx, ny) {
    const s = this.state;
    if (!s.drag) return;
    s.drag.curX = nx;
    s.drag.curY = ny;
    EventBus.emit('game:tick', { state: s, action: 'drag' });
  }

  releaseDrag() {
    const s = this.state;
    if (!s.drag) return;

    // Vecteur du lancer : opposé au drag depuis le centre de la fronde
    const dx = s.sling.x - s.drag.curX;
    const dy = s.sling.y - s.drag.curY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const capped = Math.min(dist, MAX_PULL / 1000);

    if (capped > 0.01) {
      s.bird.x  = s.sling.x;
      s.bird.y  = s.sling.y;
      s.bird.vx = (dx / dist) * capped * POWER_MULT * 60;
      s.bird.vy = (dy / dist) * capped * POWER_MULT * 60;
      s.bird.active = true;
      s.bird.trail  = [];
      s.phase  = 'flying';
      s.birdsLeft--;
    }
    s.drag = null;
    EventBus.emit('game:tick', { state: s, action: 'launch' });
  }

  _tick() {
    const now = performance.now();
    if (this._lastTick === null) this._lastTick = now;
    const dt = Math.min(now - this._lastTick, 50);
    this._lastTick = now;

    const s = this.state;
    if (s.status !== 'playing') return;

    if (s.phase === 'flying') {
      const steps = Math.ceil(dt / 8);
      const stepDt = (dt / 1000) / steps;

      for (let i = 0; i < steps; i++) {
        s.bird.vy += GRAVITY * stepDt * 60 * stepDt;
        s.bird.x  += s.bird.vx * stepDt;
        s.bird.y  += s.bird.vy * stepDt;
        s.bird.trail.push({ x: s.bird.x, y: s.bird.y });
        if (s.bird.trail.length > 20) s.bird.trail.shift();
        this._checkCollisions(s);
        if (!s.bird.active) break;
      }

      // Bird out of bounds
      if (s.bird.active && (s.bird.x > 1.1 || s.bird.y > 1.05 || s.bird.x < -0.1)) {
        s.bird.active = false;
        s.phase = 'settling';
        s.settleMs = 800;
      }
    }

    if (s.phase === 'settling') {
      s.settleMs -= dt;
      if (s.settleMs <= 0) {
        this._afterSettle(s);
      }
    }

    EventBus.emit('game:tick', { state: s, action: 'tick' });
  }

  _checkCollisions(s) {
    const br = BIRD_R / 500; // normalized radius
    const pr = PIG_R / 500;

    // Cochons
    for (const pig of s.pigs) {
      if (!pig.alive) continue;
      const dx = s.bird.x - pig.cx;
      const dy = s.bird.y - pig.cy;
      if (Math.sqrt(dx * dx + dy * dy) < br + pr) {
        pig.alive = false;
        s.score  += 100;
        ScoreService.update(this._gameId(), s.score);
        s.bird.active = false;
        s.phase = 'settling';
        s.settleMs = 600;
        return;
      }
    }

    // Sol (y > 0.9)
    if (s.bird.y > 0.90) {
      s.bird.active = false;
      s.phase = 'settling';
      s.settleMs = 600;
    }

    // Blocs
    const bpx = s.bird.x;
    const bpy = s.bird.y;
    for (const blk of s.blocks) {
      if (bpx > blk.x && bpx < blk.x + blk.w && bpy > blk.y && bpy < blk.y + blk.h) {
        s.bird.active = false;
        s.phase = 'settling';
        s.settleMs = 600;
        return;
      }
    }
  }

  _afterSettle(s) {
    const alive = s.pigs.filter(p => p.alive).length;
    const cleared = alive === 0;

    if (cleared) {
      // Bonus oiseaux restants
      s.score += s.birdsLeft * 50;
      ScoreService.update(this._gameId(), s.score);

      if (s.level < LEVELS.length - 1) {
        // Niveau suivant
        const nextLevel = s.level + 1;
        const nextState = this._buildFullState(nextLevel);
        nextState.status   = 'playing';
        nextState.score    = s.score;
        nextState.birdsLeft = BIRD_PER_LEVEL;
        this.state = nextState;
        this._loop.start(16);
        EventBus.emit('game:tick', { state: this.state, action: 'next-level' });
      } else {
        s.status = 'won';
        this._loop.stop();
        const best = ScoreService.update(this._gameId(), s.score);
        EventBus.emit('game:won', { score: s.score, best });
      }
    } else if (s.birdsLeft <= 0) {
      // Plus d'oiseaux, cochons restants → game over
      s.status = 'over';
      this._loop.stop();
      const best = ScoreService.update(this._gameId(), s.score);
      EventBus.emit('game:over', { score: s.score, best });
    } else {
      // Prochain oiseau
      s.bird = { x: s.sling.x, y: s.sling.y, vx: 0, vy: 0, active: false, trail: [] };
      s.phase = 'ready';
    }
  }

  restart() {
    this._loop.stop();
    this.state = this._buildFullState(0);
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    this._loop.stop();
    super.destroy();
  }
}
