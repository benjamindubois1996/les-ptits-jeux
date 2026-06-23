import EventBus     from '../../js/core/EventBus.js';
import ScoreService  from '../../js/services/ScoreService.js';
import BaseGame      from '../../js/core/BaseGame.js';

export default class DinoRunner extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = this._buildFullState();
    this._loopId = null;
    this._last   = 0;
  }

  _gameId() { return 'dino-runner'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); this._stopLoop(); }

  start(options = {}) {
    this.state        = this._buildFullState();
    this.state.status = 'playing';
    this.state.mode   = options.mode ?? 'basique';
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
    this._startLoop();
  }

  restart() {
    this._stopLoop();
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  { this._stopLoop(); }
  _onResume() { this._startLoop(); }

  jump() {
    if (this.state.status !== 'playing') return;
    const { dino } = this.state;
    if (dino.grounded) {
      dino.vy      = -this.config.gameplay.jumpForce;
      dino.grounded = false;
    }
  }

  duck(on) {
    if (this.state.status !== 'playing') return;
    const { dino } = this.state;
    dino.ducking = on;
    if (on && !dino.grounded && dino.vy < 0) dino.vy = Math.max(dino.vy, -80);
  }

  _startLoop() {
    this._last = performance.now();
    const tick = (t) => {
      if (this.state.status !== 'playing') return;
      const dt = Math.min((t - this._last) / 1000, 0.05);
      this._last = t;
      this._update(dt);
      EventBus.emit('game:tick', { state: this.state, action: 'tick' });
      this._loopId = requestAnimationFrame(tick);
    };
    this._loopId = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this._loopId) { cancelAnimationFrame(this._loopId); this._loopId = null; }
  }

  _update(dt) {
    const s   = this.state;
    const cfg = this.config.gameplay;

    s.speed = Math.min(cfg.maxSpeed, s.speed + cfg.speedIncrease * dt);
    s.dist += s.speed * dt;

    const newScore = Math.floor(s.dist / 10);
    if (newScore !== s.score) {
      s.score = newScore;
      EventBus.emit('game:score-update', { score: s.score });
      s.night = Math.floor(s.score / 700) % 2 === 1;
    }

    // Dino physics
    const dino = s.dino;
    dino.vy += cfg.gravity * dt;
    dino.y  += dino.vy * dt;
    const dinoH  = dino.ducking ? cfg.dinoDuckH : cfg.dinoH;
    const floorY = cfg.groundY - dinoH;
    if (dino.y >= floorY) { dino.y = floorY; dino.vy = 0; dino.grounded = true; }

    // Step animation
    if (dino.grounded) {
      s.stepAcc += s.speed * dt;
      s.step     = Math.floor(s.stepAcc / 110) % 2;
    } else {
      s.step = 0;
    }

    // Clouds
    s.clouds = s.clouds.map(c => ({ ...c, x: c.x - 48 * dt })).filter(c => c.x > -90);
    if (Math.random() < 0.007)
      s.clouds.push({ x: cfg.width + 90, y: 12 + Math.random() * 44, w: 48 + Math.random() * 44 });

    // Spawn obstacles
    s.spawnTimer -= s.speed * dt;
    if (s.spawnTimer <= 0) {
      s.obstacles.push(this._mkObs());
      s.spawnTimer = 175 + Math.random() * 310;
    }

    // Move obstacles
    s.obstacles.forEach(o => {
      o.x -= s.speed * dt;
      if (o.type === 'ptero') o.flapF = Math.floor((o.flapAcc += s.speed * dt / 280)) % 2;
    });
    s.obstacles = s.obstacles.filter(o => o.x > -80);

    // Collision (AABB with shrunk hitbox)
    const dw  = dino.ducking ? cfg.dinoW - 10 : cfg.dinoW - 6;
    const dx1 = cfg.dinoX + 8, dy1 = dino.y + 6;
    const dx2 = dx1 + dw - 8,  dy2 = dy1 + dinoH - 10;
    for (const o of s.obstacles) {
      if (dx1 < o.x + o.w - 4 && dx2 > o.x + 4 && dy1 < o.y + o.h - 4 && dy2 > o.y + 4) {
        this._die(); return;
      }
    }
  }

  _mkObs() {
    const cfg = this.config.gameplay;
    const G   = cfg.groundY;
    if (this.state.score < 80 || Math.random() < 0.62) {
      const vs = [[16, 32], [22, 44], [34, 40], [18, 50], [28, 36]];
      const [w, h] = vs[Math.floor(Math.random() * vs.length)];
      return { type: 'cactus', x: cfg.width + 20, y: G - h, w, h, v: Math.floor(Math.random() * 3) };
    }
    const ptH = 26, ptW = 44;
    const ys  = [G - 28 - ptH, G - 62 - ptH, G - 100 - ptH];
    return { type: 'ptero', x: cfg.width + 20, y: ys[Math.floor(Math.random() * ys.length)], w: ptW, h: ptH, flapF: 0, flapAcc: 0 };
  }

  _die() {
    this.state.status   = 'over';
    this.state.dino.dead = true;
    this._stopLoop();
    const { best } = ScoreService.submit(this._gameId(), this.state.score);
    EventBus.emit('game:over', { result: 'lose', icon: '🦕', title: 'GAME OVER', score: this.state.score, best });
  }

  _buildFullState() {
    const cfg = this.config?.gameplay ?? {};
    const G   = cfg.groundY ?? 135;
    return {
      status: 'idle', mode: 'basique', score: 0, dist: 0,
      speed: cfg.initialSpeed ?? 340, night: false,
      dino: { y: G - (cfg.dinoH ?? 52), vy: 0, grounded: true, ducking: false, dead: false },
      obstacles: [], clouds: [], spawnTimer: 500, step: 0, stepAcc: 0
    };
  }
}
