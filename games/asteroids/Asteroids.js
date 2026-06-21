import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class Asteroids extends BaseGame {

  constructor(config) {
    super(config);
    this.state         = this._buildFullState();
    this._raf          = null;
    this._lastTime     = null;
    this._keys         = {};
    this._shootTimer   = 0;
    this._invincible   = 0;
  }

  _gameId() { return 'asteroids'; }

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
    this._startLoop();
  }

  destroy() {
    super.destroy();
    this._stopLoop();
    this._unbindControls();
  }

  start(options = {}) {
    const mode = options.mode ?? 'basique';
    const cfg  = this.config.gameplay;
    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode,
    };
    this._invincible = cfg.invincibleMs;
    this._shootTimer = 0;
    this._spawnAsteroids(cfg.initialAsteroids);
    EventBus.emit('game:score-update', { score: 0, lives: this.state.lives });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  {}
  _onResume() {}

  /* RAF loop */

  _startLoop() {
    const loop = (ts) => {
      if (!this._lastTime) this._lastTime = ts;
      const dt = Math.min(ts - this._lastTime, 50);
      this._lastTime = ts;
      this._update(dt);
      EventBus.emit('game:frame', { state: this.state });
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _stopLoop() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  /* Update */

  _update(dt) {
    const { state } = this;
    if (state.status !== 'playing') return;

    const cfg    = this.config.gameplay;
    const f      = dt / 16.667;
    const { W, H } = cfg;
    const ship   = state.ship;

    /* Rotation */
    if (this._keys['ArrowLeft']  || this._keys['KeyA']) ship.angle -= cfg.rotSpeed * f;
    if (this._keys['ArrowRight'] || this._keys['KeyD']) ship.angle += cfg.rotSpeed * f;

    /* Thrust */
    if (this._keys['ArrowUp'] || this._keys['KeyW']) {
      ship.vx += Math.cos(ship.angle) * cfg.thrust * f;
      ship.vy += Math.sin(ship.angle) * cfg.thrust * f;
      ship.thrusting = true;
    } else {
      ship.thrusting = false;
    }

    /* Friction */
    ship.vx *= Math.pow(cfg.drag, f);
    ship.vy *= Math.pow(cfg.drag, f);

    /* Clamp speed */
    const spd = Math.hypot(ship.vx, ship.vy);
    if (spd > cfg.maxSpeed) { ship.vx = ship.vx / spd * cfg.maxSpeed; ship.vy = ship.vy / spd * cfg.maxSpeed; }

    /* Wrap */
    ship.x = ((ship.x + ship.vx * f) % W + W) % W;
    ship.y = ((ship.y + ship.vy * f) % H + H) % H;

    /* Shoot */
    if (this._shootTimer > 0) this._shootTimer -= dt;
    if (this._keys['Space'] && this._shootTimer <= 0) {
      this._shoot();
      this._shootTimer = cfg.shootCooldown;
    }

    /* Bullets */
    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      b.x    = ((b.x + b.vx * f) % W + W) % W;
      b.y    = ((b.y + b.vy * f) % H + H) % H;
      b.life -= dt;
      if (b.life <= 0) state.bullets.splice(i, 1);
    }

    /* Asteroids */
    for (const a of state.asteroids) {
      a.x    = ((a.x + a.vx * f) % W + W) % W;
      a.y    = ((a.y + a.vy * f) % H + H) % H;
      a.rot += a.rotSpeed * f;
    }

    /* Bullet–asteroid */
    outer: for (let bi = state.bullets.length - 1; bi >= 0; bi--) {
      const b = state.bullets[bi];
      for (let ai = state.asteroids.length - 1; ai >= 0; ai--) {
        const a = state.asteroids[ai];
        if (this._dist(b.x, b.y, a.x, a.y) < a.radius) {
          state.bullets.splice(bi, 1);
          this._destroyAsteroid(ai);
          continue outer;
        }
      }
    }

    /* Ship–asteroid */
    if (this._invincible > 0) {
      this._invincible -= dt;
    } else {
      for (const a of state.asteroids) {
        if (this._dist(ship.x, ship.y, a.x, a.y) < a.radius + cfg.shipRadius) {
          this._loseLife();
          return;
        }
      }
    }

    /* Next level */
    if (state.asteroids.length === 0) {
      state.level++;
      this._spawnAsteroids(cfg.initialAsteroids + state.level - 1);
      this._invincible = cfg.invincibleMs;
    }
  }

  _shoot() {
    const { ship } = this.state;
    const cfg = this.config.gameplay;
    this.state.bullets.push({
      x:    ship.x + Math.cos(ship.angle) * 16,
      y:    ship.y + Math.sin(ship.angle) * 16,
      vx:   Math.cos(ship.angle) * cfg.bulletSpeed + ship.vx,
      vy:   Math.sin(ship.angle) * cfg.bulletSpeed + ship.vy,
      life: cfg.bulletLife,
    });
  }

  _spawnAsteroids(count) {
    const cfg = this.config.gameplay;
    const { x: sx, y: sy } = this.state.ship;
    for (let i = 0; i < count; i++) {
      let x, y;
      do {
        x = Math.random() * cfg.W;
        y = Math.random() * cfg.H;
      } while (this._dist(x, y, sx, sy) < 130);
      this._createAsteroid(x, y, 3);
    }
  }

  _createAsteroid(x, y, size) {
    const radii    = { 1: 18, 2: 34, 3: 56 };
    const maxSpeed = { 1: 2.8, 2: 1.8, 3: 1.0 };
    const radius   = radii[size];
    const angle    = Math.random() * Math.PI * 2;
    const spd      = maxSpeed[size] * (0.7 + Math.random() * 0.6);
    const numV     = 8 + Math.floor(Math.random() * 5);
    const verts    = Array.from({ length: numV }, (_, i) => {
      const a = (i / numV) * Math.PI * 2;
      const r = radius * (0.72 + Math.random() * 0.28);
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
    this.state.asteroids.push({
      x, y,
      vx:       Math.cos(angle) * spd,
      vy:       Math.sin(angle) * spd,
      size,
      radius,
      rot:      0,
      rotSpeed: (Math.random() - 0.5) * 0.04,
      verts,
    });
  }

  _destroyAsteroid(index) {
    const a      = this.state.asteroids.splice(index, 1)[0];
    const pts    = this.config.gameplay.pointsMap[a.size] ?? 10;
    this.state.score += pts;
    EventBus.emit('game:score-update', { score: this.state.score });
    if (a.size > 1) {
      this._createAsteroid(a.x, a.y, a.size - 1);
      this._createAsteroid(a.x, a.y, a.size - 1);
    }
  }

  _loseLife() {
    const { state } = this;
    state.lives--;
    EventBus.emit('game:score-update', { lives: state.lives });
    if (state.lives <= 0) {
      state.status = 'gameover';
      ScoreService.submit(this._gameId(), state.score);
      EventBus.emit('game:over', {
        score: state.score,
        best:  ScoreService.getBest(this._gameId()),
      });
    } else {
      const cfg    = this.config.gameplay;
      state.ship   = this._buildShip(cfg.W / 2, cfg.H / 2);
      state.bullets = [];
      this._invincible = cfg.invincibleMs;
    }
  }

  _dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

  _buildShip(x, y) {
    return { x, y, angle: -Math.PI / 2, vx: 0, vy: 0, thrusting: false };
  }

  _buildFullState() {
    const cfg = this.config?.gameplay ?? {};
    return {
      status:    'loading',
      ship:      this._buildShip((cfg.W ?? 600) / 2, (cfg.H ?? 500) / 2),
      asteroids: [],
      bullets:   [],
      score:     0,
      lives:     3,
      level:     1,
      mode:      'basique',
    };
  }

  /* Controls */

  _bindControls() {
    this._onKeyDown = (e) => {
      this._keys[e.code] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyP') { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
      if (e.code === 'KeyR') { e.preventDefault(); EventBus.emit('game:restart'); }
    };
    this._onKeyUp = (e) => { delete this._keys[e.code]; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
  }

  _unbindControls() {
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
    if (this._onKeyUp)   window.removeEventListener('keyup',   this._onKeyUp);
  }
}
