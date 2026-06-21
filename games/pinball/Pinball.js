import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

const W = 320;
const H = 560;

function buildBumpers() {
  return [
    { x: 110, y: 160, r: 18 },
    { x: 210, y: 140, r: 18 },
    { x: 160, y: 210, r: 18 },
    { x: 85,  y: 240, r: 18 },
    { x: 235, y: 250, r: 18 },
  ];
}

function buildSlings() {
  return [
    { x1: 55,  y1: 370, x2: 90,  y2: 310 },
    { x1: 265, y1: 370, x2: 230, y2: 310 },
  ];
}

function buildWalls() {
  // Gutter walls — diagonal guides funneling ball toward flippers
  return [
    { x1: 0,   y1: H - 100, x2: 70,  y2: H - 64 },
    { x1: W,   y1: H - 100, x2: 250, y2: H - 64 },
  ];
}

export default class Pinball extends BaseGame {
  constructor(config) {
    super(config);
    this.state  = this._buildFullState();
    this._keys  = {};
    this._lastTs = null;
    this._rafId  = null;
  }

  _gameId() { return 'pinball'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick', { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    this._stopLoop();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
  }

  start(options = {}) {
    const mode = options.mode ?? 'basique';
    this.lives.reset();
    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode,
      bumpers: buildBumpers(),
      slings:  buildSlings(),
      walls:   buildWalls(),
    };
    this._spawnBall();
    this._bindControls();
    this._startLoop();
    EventBus.emit('game:score-update', { score: 0, lives: this.lives.count });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  restart() {
    this._stopLoop();
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  { this._stopLoop(); }
  _onResume() { this._lastTs = null; this._startLoop(); }

  _bindControls() {
    this._onKeyDown = e => {
      this._keys[e.code] = true;
      const ctrl = this.config.controls.keyboard;
      if (ctrl.launch.includes(e.code) && this.state.ball.onLauncher) {
        this._launch();
      }
    };
    this._onKeyUp = e => { this._keys[e.code] = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
  }

  _launch() {
    const { ball } = this.state;
    ball.onLauncher = false;
    ball.vx = (Math.random() - 0.5) * 80;
    ball.vy = -this.config.gameplay.ballSpeed;
  }

  _startLoop() {
    const loop = (ts) => {
      if (!this._lastTs) this._lastTs = ts;
      const dt = Math.min((ts - this._lastTs) / 1000, 0.033);
      this._lastTs = ts;
      this._update(dt);
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _stopLoop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this._lastTs = null;
  }

  _update(dt) {
    const { state } = this;
    if (state.status !== 'playing') return;
    const cfg  = this.config.gameplay;
    const ctrl = this.config.controls.keyboard;
    const keys = this._keys;

    // Flippers
    const leftUp  = ctrl.flipperLeft.some(k => keys[k]);
    const rightUp = ctrl.flipperRight.some(k => keys[k]);
    const spd = cfg.flipperSpeed;

    // Left flipper: pivot left, tip points right
    //   rest: tip down-right (+0.52 rad)   active: tip up-right (-0.45 rad)
    state.flippers.left.angle  = this._moveAngle(
      state.flippers.left.angle,
      leftUp  ? -cfg.flipperAngleUp : cfg.flipperAngleDown, spd * dt);

    // Right flipper: pivot right, tip points left (base angle = π)
    //   rest: π - 0.52 (tip down-left)    active: π + 0.45 (tip up-left)
    state.flippers.right.angle = this._moveAngle(
      state.flippers.right.angle,
      rightUp ? Math.PI + cfg.flipperAngleUp : Math.PI - cfg.flipperAngleDown, spd * dt);

    const { ball } = state;
    if (ball.onLauncher) {
      EventBus.emit('game:tick', { state, action: 'tick' });
      return;
    }

    // Physics
    ball.vy += cfg.gravity * dt;
    ball.x  += ball.vx * dt;
    ball.y  += ball.vy * dt;

    // Wall bounces — skip lateral outer walls in gutter area (handled by gutter segments)
    const r = cfg.ballRadius;
    if (ball.x - r < 0 && ball.y < H - 100) { ball.x = r; ball.vx = Math.abs(ball.vx) * 0.85; }
    if (ball.x + r > W && ball.y < H - 100) { ball.x = W - r; ball.vx = -Math.abs(ball.vx) * 0.85; }
    if (ball.y - r < 0) { ball.y = r; ball.vy = Math.abs(ball.vy) * 0.85; }

    // Launch lane separator (right wall at x≈288, guides ball into play area at top)
    const laneX = W - 32;
    if (ball.x > laneX - r && ball.y > 60) {
      ball.x = laneX - r;
      ball.vx = -Math.abs(ball.vx) * 0.9;
    }
    // Curve at top of launcher lane — deflect ball left into play area
    if (ball.x > laneX - 20 && ball.y < 60) {
      ball.vx -= 300 * dt;
    }

    // Bumpers
    for (const b of state.bumpers) {
      const dx = ball.x - b.x, dy = ball.y - b.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < r + b.r) {
        const nx = dx / dist, ny = dy / dist;
        ball.x = b.x + nx * (r + b.r + 1);
        ball.y = b.y + ny * (r + b.r + 1);
        const dot = ball.vx * nx + ball.vy * ny;
        ball.vx = (ball.vx - 2 * dot * nx) * cfg.bumperBounce;
        ball.vy = (ball.vy - 2 * dot * ny) * cfg.bumperBounce;
        state.score += this.config.scoring.bumperPoints;
        b.lit = true;
        setTimeout(() => { b.lit = false; }, 120);
        EventBus.emit('game:score-update', { score: state.score });
      }
    }

    // Slingshots
    for (const s of state.slings) {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
      const len2 = dx*dx + dy*dy;
      const t = Math.max(0, Math.min(1, ((ball.x-s.x1)*dx + (ball.y-s.y1)*dy) / len2));
      const cx = s.x1 + t * dx, cy = s.y1 + t * dy;
      const ex = ball.x - cx, ey = ball.y - cy;
      const ed = Math.sqrt(ex*ex + ey*ey);
      if (ed < r + 4) {
        const nx = ex/ed, ny = ey/ed;
        const dot = ball.vx*nx + ball.vy*ny;
        ball.vx = (ball.vx - 2*dot*nx) * 1.2;
        ball.vy = (ball.vy - 2*dot*ny) * 1.2;
        ball.x = cx + nx*(r+5); ball.y = cy + ny*(r+5);
        state.score += this.config.scoring.slingPoints;
        EventBus.emit('game:score-update', { score: state.score });
      }
    }

    // Gutter wall collisions
    for (const s of state.walls) {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
      const len2 = dx*dx + dy*dy;
      const t = Math.max(0, Math.min(1, ((ball.x-s.x1)*dx + (ball.y-s.y1)*dy) / len2));
      const cx = s.x1 + t * dx, cy = s.y1 + t * dy;
      const ex = ball.x - cx, ey = ball.y - cy;
      const ed = Math.sqrt(ex*ex + ey*ey);
      if (ed < r + 6) {
        const nx = ex/ed, ny = ey/ed;
        const dot = ball.vx*nx + ball.vy*ny;
        ball.vx = (ball.vx - 2*dot*nx) * 0.85;
        ball.vy = (ball.vy - 2*dot*ny) * 0.85;
        ball.x = cx + nx*(r+7); ball.y = cy + ny*(r+7);
      }
    }

    // Flipper collision
    this._flipperCollide('left',  state.flippers.left);
    this._flipperCollide('right', state.flippers.right);

    // Ball lost
    if (ball.y > H + 20) {
      this.lives.lose(1);
      EventBus.emit('game:score-update', { score: state.score, lives: this.lives.count });
      if (!this.lives.isAlive) {
        this._stopLoop();
        state.status = 'gameover';
        ScoreService.submit(this._gameId(), state.score);
        EventBus.emit('game:over', {
          result: 'lose', icon: '🎯', title: 'GAME OVER',
          score: state.score, best: ScoreService.getBest(this._gameId()),
        });
      } else {
        this._spawnBall();
      }
    }

    // Speed cap
    const spd2 = Math.sqrt(ball.vx**2 + ball.vy**2);
    if (spd2 > 700) { ball.vx *= 700/spd2; ball.vy *= 700/spd2; }

    EventBus.emit('game:tick', { state, action: 'tick' });
  }

  _flipperCollide(side, flipper) {
    const cfg    = this.config.gameplay;
    const ball   = this.state.ball;
    const r      = cfg.ballRadius;
    const { x, y, angle } = flipper;
    const len    = cfg.flipperLength;
    const ex     = x + Math.cos(angle) * len;
    const ey     = y + Math.sin(angle) * len;
    const dx     = ex - x, dy = ey - y;
    const len2   = dx*dx + dy*dy;
    const t      = Math.max(0, Math.min(1, ((ball.x-x)*dx + (ball.y-y)*dy) / len2));
    const cx     = x + t*dx, cy = y + t*dy;
    const bx     = ball.x - cx, by = ball.y - cy;
    const bd     = Math.sqrt(bx*bx + by*by);
    if (bd < r + 4) {
      const nx = bx/bd, ny = by/bd;
      ball.x = cx + nx*(r+5); ball.y = cy + ny*(r+5);
      const dot = ball.vx*nx + ball.vy*ny;
      const speed = Math.max(Math.sqrt(ball.vx**2+ball.vy**2), 280);
      ball.vx = (ball.vx - 2*dot*nx);
      ball.vy = (ball.vy - 2*dot*ny);
      const spd2 = Math.sqrt(ball.vx**2+ball.vy**2);
      if (spd2 > 0) { ball.vx = ball.vx/spd2*speed; ball.vy = ball.vy/spd2*speed; }
    }
  }

  _moveAngle(current, target, speed) {
    const diff = target - current;
    if (Math.abs(diff) <= speed) return target;
    return current + Math.sign(diff) * speed;
  }

  _spawnBall() {
    const cfg = this.config.gameplay;
    this.state.ball = { x: W - 20, y: H - 120, vx: 0, vy: 0, onLauncher: true };
    EventBus.emit('game:tick', { state: this.state, action: 'spawn' });
  }

  _buildFullState() {
    return {
      status: 'loading',
      mode:   'basique',
      score:  0,
      ball:   { x: W - 20, y: H - 120, vx: 0, vy: 0, onLauncher: true },
      flippers: {
        left:  { x: 70,  y: H - 64, angle:  0.52 },
        right: { x: 250, y: H - 64, angle:  Math.PI - 0.52 },
      },
      bumpers: [],
      slings:  [],
      walls:   [],
    };
  }
}
