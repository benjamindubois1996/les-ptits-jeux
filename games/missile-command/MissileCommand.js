import EventBus     from '../../js/core/EventBus.js';
import ScoreService  from '../../js/services/ScoreService.js';
import BaseGame      from '../../js/core/BaseGame.js';

export default class MissileCommand extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = this._buildFullState();
    this._loopId = null;
    this._last   = 0;
  }

  _gameId() { return 'missile-command'; }

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
    this._startWave();
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

  // Fire an interceptor from the nearest battery toward (tx, ty)
  intercept(tx, ty) {
    const { state }  = this;
    if (state.status !== 'playing') return;
    const { batteries } = state;

    // Find battery with ammo closest to target
    let best = null, bestD = Infinity;
    batteries.forEach(b => {
      if (b.ammo <= 0) return;
      const d = Math.hypot(tx - b.x, ty - b.y);
      if (d < bestD) { bestD = d; best = b; }
    });
    if (!best) return;

    best.ammo--;
    const { interceptSpeed } = this.config.gameplay;
    const dx = tx - best.x, dy = ty - best.y;
    const mag = Math.hypot(dx, dy) || 1;
    state.interceptors.push({
      x: best.x, y: best.y,
      vx: (dx / mag) * interceptSpeed,
      vy: (dy / mag) * interceptSpeed,
      tx, ty,
    });
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
    const { state }  = this;
    const cfg        = this.config.gameplay;
    const groundY    = cfg.height - 30;

    // Advance incoming missiles
    state.missiles.forEach(m => {
      if (!m.alive) return;
      m.x += m.vx;
      m.y += m.vy;
      if (m.y >= groundY) {
        m.alive = false;
        // Hit a city or battery?
        const hit = this._closestTarget(m.x, groundY);
        if (hit) { hit.alive = false; }
      }
    });

    // Advance interceptors
    state.interceptors = state.interceptors.filter(i => {
      i.x += i.vx; i.y += i.vy;
      const reached = Math.hypot(i.x - i.tx, i.y - i.ty) < 6;
      if (reached) {
        state.explosions.push({
          x: i.tx, y: i.ty,
          r: 4, maxR: cfg.explosionRadius,
          born: Date.now(), dur: cfg.explosionDuration,
        });
        return false;
      }
      return i.y > 0;
    });

    // Update explosions — grow then shrink, collide with missiles
    const now = Date.now();
    state.explosions = state.explosions.filter(ex => {
      const age = now - ex.born;
      if (age > ex.dur) return false;
      const pct = age / ex.dur;
      ex.r = ex.maxR * (pct < 0.5 ? pct * 2 : 2 - pct * 2);
      state.missiles.forEach(m => {
        if (!m.alive) return;
        if (Math.hypot(m.x - ex.x, m.y - ex.y) < ex.r + 4) {
          m.alive = false;
          state.score += this.config.scoring.missileKill;
          state.kills++;
          EventBus.emit('game:score-update', { score: state.score });
        }
      });
      return true;
    });

    // Spawn new missiles
    if (state.waveMissiles > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        state.spawnTimer    = state.spawnInterval;
        state.spawnInterval = Math.max(0.4, state.spawnInterval * 0.98);
        this._spawnMissile();
        state.waveMissiles--;
      }
    }

    // Wave clear — all missiles spawned and none left alive
    if (state.waveMissiles <= 0 && state.missiles.filter(m => m.alive).length === 0
        && state.interceptors.length === 0) {
      this._endWave();
    }
  }

  _spawnMissile() {
    const { state } = this;
    const { width, height, missileSpeed } = this.config.gameplay;
    const groundY = height - 30;
    // Target a random city or battery
    const targets = [
      ...state.cities.filter(c => c.alive),
      ...state.batteries.filter(b => b.alive),
    ];
    if (!targets.length) return;
    const tgt = targets[Math.floor(Math.random() * targets.length)];
    const sx  = Math.random() * width;
    const sy  = 0;
    const dx  = tgt.x - sx, dy = groundY - sy;
    const mag = Math.hypot(dx, dy) || 1;
    const spd = missileSpeed * (1 + state.wave * 0.1);
    state.missiles.push({
      alive: true,
      x: sx, y: sy,
      vx: (dx / mag) * spd,
      vy: (dy / mag) * spd,
    });
  }

  _closestTarget(x, _y) {
    const { state } = this;
    const alive = [
      ...state.cities.filter(c => c.alive),
      ...state.batteries.filter(b => b.alive),
    ];
    let best = null, bestD = 40;
    alive.forEach(t => {
      const d = Math.abs(t.x - x);
      if (d < bestD) { bestD = d; best = t; }
    });
    return best;
  }

  _endWave() {
    const { state } = this;
    // Bonus points
    const ammo = state.batteries.reduce((s, b) => s + b.ammo, 0);
    const cities = state.cities.filter(c => c.alive).length;
    const bonus = ammo * this.config.scoring.ammoBonus
                + cities * this.config.scoring.cityBonus
                + this.config.scoring.waveClear;
    state.score += bonus;
    EventBus.emit('game:score-update', { score: state.score });

    if (cities === 0) {
      this._gameOver();
      return;
    }
    state.wave++;
    this._startWave();
  }

  _gameOver() {
    const { state } = this;
    state.status = 'over';
    this._stopLoop();
    const { best } = ScoreService.submit(this._gameId(), state.score);
    EventBus.emit('game:over', {
      result: 'lose', icon: '💥', title: 'VILLES DÉTRUITES !',
      score: state.score, best,
      extraInfo: `<div class="overlay-score">Vague ${state.wave}</div>`,
    });
  }

  _startWave() {
    const { state } = this;
    const { width, height, ammoPerBattery } = this.config.gameplay;
    // Refill batteries ammo each wave
    state.batteries.forEach(b => { if (b.alive) b.ammo = ammoPerBattery; });
    state.missiles      = [];
    state.interceptors  = [];
    state.explosions    = [];
    state.waveMissiles  = 10 + state.wave * 3;
    state.spawnInterval = Math.max(0.8, 2.5 - state.wave * 0.2);
    state.spawnTimer    = 1;
  }

  _buildFullState() {
    const cfg = this.config?.gameplay ?? {};
    const W   = cfg.width  ?? 480;
    const H   = cfg.height ?? 540;
    const groundY = H - 30;
    const cities  = cfg.cities ?? 6;
    const bats    = cfg.batteries ?? 3;

    const cityPositions = Array.from({ length: cities }, (_, i) =>
      ({ alive: true, x: W * 0.1 + (i / (cities - 1)) * W * 0.8, y: groundY - 22 })
    );
    const battPositions = [
      { alive: true, x: W * 0.1,  y: groundY - 10, ammo: cfg.ammoPerBattery ?? 10 },
      { alive: true, x: W * 0.5,  y: groundY - 10, ammo: cfg.ammoPerBattery ?? 10 },
      { alive: true, x: W * 0.9,  y: groundY - 10, ammo: cfg.ammoPerBattery ?? 10 },
    ];

    return {
      status: 'idle', mode: 'basique', score: 0, wave: 1, kills: 0,
      cities: cityPositions,
      batteries: battPositions,
      missiles: [], interceptors: [], explosions: [],
      waveMissiles: 0, spawnTimer: 1, spawnInterval: 2,
    };
  }
}
