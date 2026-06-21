import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import Physics2D    from '../../js/core/Physics2D.js';

export default class LunarLander extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = this._buildFullState();
    this._phys   = new Physics2D({ gravity: config.gameplay.gravity });
    this._keys   = {};
    this._lastTs = null;
    this._rafId  = null;
  }

  _gameId() { return 'lunar-lander'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick', { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    this._stopLoop();
    window.removeEventListener('keydown',  this._onKeyDown);
    window.removeEventListener('keyup',    this._onKeyUp);
  }

  start(options = {}) {
    const mode  = options.mode ?? 'basique';
    const level = 1;
    this.lives.reset();

    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode, level,
      terrain:  this._generateTerrain(level),
      pad:      null,
      score:    0,
    };
    this.state.pad = this.state.terrain.pad;
    this._spawnShip();
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
    this._onKeyDown = e => { this._keys[e.code] = true; };
    this._onKeyUp   = e => { this._keys[e.code] = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
  }

  _startLoop() {
    const loop = (ts) => {
      if (!this._lastTs) this._lastTs = ts;
      const dt = Math.min((ts - this._lastTs) / 1000, 0.05);
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
    const keys = this._keys;
    const ctrl = this.config.controls.keyboard;

    const thrust = ctrl.thrust.some(k => keys[k]);
    const rotL   = ctrl.rotateLeft.some(k => keys[k]);
    const rotR   = ctrl.rotateRight.some(k => keys[k]);

    // Rotation
    if (rotL) state.ship.angle -= cfg.rotateSpeed * dt;
    if (rotR) state.ship.angle += cfg.rotateSpeed * dt;

    // Thrust
    state.ship.thrusting = thrust && state.ship.fuel > 0;
    if (state.ship.thrusting) {
      const ax = -Math.sin(state.ship.angle) * cfg.thrustForce;
      const ay = -Math.cos(state.ship.angle) * cfg.thrustForce;
      this._phys.applyForce(ax * dt, ay * dt);
      state.ship.fuel = Math.max(0, state.ship.fuel - cfg.fuelBurnRate * dt);
    }

    this._phys.update(dt);
    state.ship.x = this._phys.x;
    state.ship.y = this._phys.y;
    state.ship.vx = this._phys.vx;
    state.ship.vy = this._phys.vy;

    // Check canvas bounds (left/right wrap, top ceiling)
    if (state.ship.x < 0)             state.ship.x = state.terrain.width;
    if (state.ship.x > state.terrain.width) state.ship.x = 0;
    if (state.ship.y < 0) { this._phys.vy = Math.abs(this._phys.vy); state.ship.y = 0; }

    // Collision with terrain
    const result = this._checkCollision();
    if (result === 'land') {
      this._land();
    } else if (result === 'crash') {
      this._crash();
    }

    EventBus.emit('game:tick', { state, action: 'tick' });
  }

  _checkCollision() {
    const { ship, terrain, pad } = this.state;
    const cfg  = this.config.gameplay;
    const foot = { x: ship.x, y: ship.y + 12 };

    // Landing pad check first
    if (foot.x >= pad.x && foot.x <= pad.x + pad.w) {
      const padY = terrain.points.find((p, i) => {
        const n = terrain.points[i + 1];
        return n && p.x <= pad.x && n.x >= pad.x + pad.w;
      });
      const groundY = pad.y;
      if (foot.y >= groundY - 2) {
        const angleOk = Math.abs(ship.angle) < cfg.maxLandingAngle;
        const vyOk    = Math.abs(ship.vy) < cfg.maxLandingVY;
        const vxOk    = Math.abs(ship.vx) < cfg.maxLandingVX;
        return (angleOk && vyOk && vxOk) ? 'land' : 'crash';
      }
    }

    // Terrain collision
    const pts = terrain.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      if (foot.x < p1.x || foot.x > p2.x) continue;
      const t   = (foot.x - p1.x) / (p2.x - p1.x);
      const gY  = p1.y + t * (p2.y - p1.y);
      if (foot.y >= gY) return 'crash';
    }
    return null;
  }

  _land() {
    const { state } = this;
    const fuel  = Math.floor(state.ship.fuel);
    const bonus = fuel * this.config.scoring.fuelBonus;
    const pts   = this.config.scoring.basePoints + bonus;
    state.score += pts;
    state.level++;
    this._stopLoop();
    state.status = 'level-complete';
    EventBus.emit('game:score-update', { score: state.score });
    EventBus.emit('game:tick', { state, action: 'landed' });

    setTimeout(() => {
      if (this.state.status !== 'level-complete') return;
      state.terrain = this._generateTerrain(state.level);
      state.pad     = state.terrain.pad;
      this._spawnShip();
      state.status = 'playing';
      this._lastTs = null;
      this._startLoop();
      EventBus.emit('game:tick', { state, action: 'next-level' });
    }, 1800);
  }

  _crash() {
    const { state } = this;
    this._stopLoop();
    state.status = 'crashed';
    this.lives.lose(1);
    EventBus.emit('game:score-update', { score: state.score, lives: this.lives.count });
    EventBus.emit('game:tick', { state, action: 'crashed' });

    if (!this.lives.isAlive) {
      state.status = 'gameover';
      ScoreService.submit(this._gameId(), state.score);
      EventBus.emit('game:over', {
        result: 'lose', icon: '🚀', title: 'CRASH !',
        score: state.score, best: ScoreService.getBest(this._gameId()),
      });
    } else {
      setTimeout(() => {
        if (this.state.status !== 'crashed') return;
        this._spawnShip();
        state.status = 'playing';
        this._lastTs = null;
        this._startLoop();
        EventBus.emit('game:tick', { state, action: 'respawn' });
      }, 1200);
    }
  }

  _spawnShip() {
    const { terrain } = this.state;
    this._phys.reset(terrain.width / 2, 40);
    this.state.ship = {
      x: terrain.width / 2,
      y: 40,
      vx: 0, vy: 0,
      angle: 0,
      fuel: this.config.gameplay.initialFuel,
      thrusting: false,
    };
  }

  _generateTerrain(level) {
    const W      = 700;
    const H      = 500;
    const padW   = this.config.gameplay.padWidth;
    const padX   = 100 + Math.random() * (W - padW - 200);
    const padY   = 340 + level * 8;
    const points = [];

    points.push({ x: 0, y: 380 + Math.random() * 60 });

    const segments = 12;
    for (let i = 1; i < segments; i++) {
      const px = (W / segments) * i;
      if (px >= padX - 10 && px <= padX + padW + 10) {
        if (points[points.length - 1].x < padX) {
          points.push({ x: padX, y: padY });
          points.push({ x: padX + padW, y: padY });
        }
        continue;
      }
      const roughness = 40 + level * 5;
      points.push({ x: px, y: Math.min(H - 30, Math.max(260, padY - 60 + (Math.random() - 0.5) * roughness)) });
    }
    points.push({ x: W, y: 380 + Math.random() * 60 });

    return { points, width: W, height: H, pad: { x: padX, y: padY, w: padW } };
  }

  _buildFullState() {
    return {
      status: 'loading',
      mode:   'basique',
      level:  1,
      ship:   { x: 0, y: 0, vx: 0, vy: 0, angle: 0, fuel: 0, thrusting: false },
      terrain: { points: [], width: 700, height: 500, pad: { x: 300, y: 400, w: 80 } },
      pad:    null,
      score:  0,
    };
  }
}
