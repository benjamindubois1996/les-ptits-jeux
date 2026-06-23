import EventBus     from '../../js/core/EventBus.js';
import ScoreService  from '../../js/services/ScoreService.js';
import BaseGame      from '../../js/core/BaseGame.js';

const WORLD_W = 6400, GROUND_Y = 280;

export default class Defender extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = this._buildFullState();
    this._loopId = null;
    this._last   = 0;
    this._keys   = new Set();
    this._eid    = 0;
  }

  _gameId() { return 'defender'; }

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

  pressKey(code, down) {
    if (down) this._keys.add(code);
    else      this._keys.delete(code);
  }

  fire() {
    const { state } = this;
    if (state.status !== 'playing') return;
    const s = state.ship;
    state.bullets.push({
      id: this._eid++,
      x: s.x + (s.facing > 0 ? 24 : -4), y: s.y + 10,
      vx: this.config.gameplay.bulletSpeed * s.facing,
      life: this.config.gameplay.bulletLife
    });
  }

  smartBomb() {
    const { state } = this;
    if (state.status !== 'playing' || state.smartBombs <= 0) return;
    state.smartBombs--;
    const cfg = this.config.gameplay;
    // Kill all enemies on screen
    const x1 = state.camera - cfg.viewW / 2;
    const x2 = state.camera + cfg.viewW * 1.5;
    state.enemies.forEach(e => {
      if (e.x >= x1 && e.x <= x2) {
        e.dead = true;
        state.score += cfg.scoring?.[e.type] ?? 150;
      }
    });
    EventBus.emit('game:score-update', { score: state.score });
    state.bombFlash = 0.3;
  }

  hyperspace() {
    const { state } = this;
    if (state.status !== 'playing') return;
    state.ship.x = Math.random() * WORLD_W;
    state.ship.y = 40 + Math.random() * 220;
    state.camera = state.ship.x;
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
    const { state } = this;
    const cfg = this.config.gameplay;

    if (state.bombFlash > 0) state.bombFlash -= dt;

    this._updateShip(dt);
    this._updateBullets(dt);
    this._updateEnemies(dt);
    this._checkCollisions();

    // Wave clear
    if (state.enemies.every(e => e.dead)) this._nextWave();
  }

  _updateShip(dt) {
    const { state } = this;
    const cfg = this.config.gameplay;
    const s   = state.ship;

    // Horizontal thrust
    if (this._keys.has('ArrowLeft')  || this._keys.has('KeyA')) { s.vx -= 600 * dt; s.facing = -1; }
    if (this._keys.has('ArrowRight') || this._keys.has('KeyD')) { s.vx += 600 * dt; s.facing =  1; }

    // Drag
    s.vx *= Math.pow(0.08, dt);
    const spd = cfg.shipSpeed;
    s.vx = Math.max(-spd, Math.min(spd, s.vx));

    // Vertical
    if (this._keys.has('ArrowUp')   || this._keys.has('KeyW')) s.vy -= cfg.shipVSpeed * dt * 3;
    if (this._keys.has('ArrowDown') || this._keys.has('KeyS')) s.vy += cfg.shipVSpeed * dt * 3;
    s.vy *= Math.pow(0.05, dt);
    s.vy = Math.max(-cfg.shipVSpeed, Math.min(cfg.shipVSpeed, s.vy));

    s.x += s.vx * dt;
    s.y += s.vy * dt;

    s.x = ((s.x % WORLD_W) + WORLD_W) % WORLD_W;
    s.y = Math.max(20, Math.min(GROUND_Y - 20, s.y));

    // Camera follows ship
    state.camera = s.x;
  }

  _updateBullets(dt) {
    const { state } = this;
    state.bullets.forEach(b => {
      b.x    += b.vx * dt;
      b.life -= dt;
      b.x     = ((b.x % WORLD_W) + WORLD_W) % WORLD_W;
    });
    state.bullets = state.bullets.filter(b => b.life > 0);
  }

  _updateEnemies(dt) {
    const { state } = this;
    const cfg = this.config.gameplay;

    state.enemies.forEach(e => {
      if (e.dead) return;

      if (e.type === 'lander') {
        this._updateLander(e, dt);
      } else if (e.type === 'mutant') {
        // Mutants fly toward ship fast
        const dx = this._worldDx(e.x, state.ship.x);
        const dy = state.ship.y - e.y;
        const d  = Math.hypot(dx, dy) || 1;
        e.x += (dx / d) * 180 * dt;
        e.y += (dy / d) * 180 * dt;
        e.x  = ((e.x % WORLD_W) + WORLD_W) % WORLD_W;
        e.y  = Math.max(20, Math.min(GROUND_Y - 10, e.y));
      }
    });

    // Remove dead bodies after a moment
    state.enemies = state.enemies.filter(e => !e.dead || e.deathT > 0);
    state.enemies.forEach(e => { if (e.dead) e.deathT = (e.deathT || 0.4) - dt; });
  }

  _updateLander(e, dt) {
    const { state } = this;

    if (e.carrying !== null) {
      // Carrying a humanoid — flee upward
      const h = state.humanoids.find(h => h.id === e.carrying);
      if (h) { h.x = e.x; h.y = e.y + 18; }
      e.y -= 60 * dt;
      if (e.y < 5) {
        // Escape → mutant
        if (h) { h.alive = false; }
        e.type    = 'mutant';
        e.carrying = null;
        e.vx      = (Math.random() - 0.5) * 200;
      }
      return;
    }

    // Look for humanoid to abduct
    e.thinkT = (e.thinkT || 0) + dt;
    if (!e.target && e.thinkT > 1) {
      e.thinkT = 0;
      const alive = state.humanoids.filter(h => h.alive && !h.carried);
      if (alive.length) {
        const t  = alive[Math.floor(Math.random() * alive.length)];
        e.target = t.id;
        t.carried = true;
      }
    }

    if (e.target !== null) {
      const t = state.humanoids.find(h => h.id === e.target);
      if (!t || !t.alive) { e.target = null; return; }
      const dx = this._worldDx(e.x, t.x);
      const dy = t.y - e.y;
      const d  = Math.hypot(dx, dy) || 1;
      const spd = 90;
      e.x += (dx / d) * spd * dt;
      e.y += (dy / d) * spd * dt;
      e.x  = ((e.x % WORLD_W) + WORLD_W) % WORLD_W;

      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
        e.carrying = t.id;
        t.carried  = true;
      }
    } else {
      // Drift
      e.x = ((e.x + (e.vx || 40) * dt + WORLD_W) % WORLD_W);
      e.y += Math.sin(e.x * 0.01) * 20 * dt;
      e.y  = Math.max(30, Math.min(GROUND_Y - 50, e.y));
    }
  }

  _checkCollisions() {
    const { state } = this;
    const cfg = this.config.gameplay;

    // Bullets vs enemies
    state.bullets.forEach(b => {
      state.enemies.forEach(e => {
        if (e.dead) return;
        const dx = this._worldDx(b.x, e.x);
        if (Math.abs(dx) < 18 && Math.abs(b.y - e.y) < 14) {
          e.dead = true; e.deathT = 0.4;
          if (e.carrying !== null) {
            const h = state.humanoids.find(h => h.id === e.carrying);
            if (h) { h.carried = false; h.falling = true; h.vy = 0; }
          }
          if (e.target !== null) {
            const h = state.humanoids.find(h => h.id === e.target);
            if (h) h.carried = false;
          }
          state.score += this.config.scoring[e.type] ?? 150;
          EventBus.emit('game:score-update', { score: state.score });
          b.life = 0; // consume bullet
        }
      });
    });

    // Humanoids falling after lander destroyed
    state.humanoids.forEach(h => {
      if (!h.alive || !h.falling) return;
      h.vy  = (h.vy || 0) + 200 * 0.016;
      h.y  += h.vy * 0.016;
      if (h.y >= GROUND_Y - 10) {
        h.y = GROUND_Y - 10;
        h.falling = false; h.vy = 0;
        // Rescued! (player catches them in real game; here just bonus if near ground)
        state.score += this.config.scoring.humanoidRescued;
        EventBus.emit('game:score-update', { score: state.score });
      }
      if (h.y > GROUND_Y + 30) { h.alive = false; } // fell into abyss
    });

    // Ship vs enemies
    const s = state.ship;
    if (!state.ship.invincible || state.ship.invincible <= 0) {
      for (const e of state.enemies) {
        if (e.dead) continue;
        const dx = this._worldDx(s.x, e.x);
        if (Math.abs(dx) < 22 && Math.abs(s.y - e.y) < 18) {
          this._shipDie(); return;
        }
      }
    } else {
      state.ship.invincible -= 0.016;
    }
  }

  _shipDie() {
    const { state } = this;
    state.lives--;
    EventBus.emit('game:lives-update', { lives: state.lives });
    if (state.lives <= 0) {
      state.status = 'over';
      this._stopLoop();
      const { best } = ScoreService.submit(this._gameId(), state.score);
      EventBus.emit('game:over', {
        result: 'lose', icon: '🚀', title: 'GAME OVER',
        score: state.score, best,
        extraInfo: `<div class="overlay-score">Vague ${state.wave}</div>`
      });
    } else {
      state.ship = { ...this._makeShip(), invincible: 2 };
    }
  }

  _nextWave() {
    const { state } = this;
    this._stopLoop();
    state.wave++;
    state.score += this.config.scoring.waveBonus;
    EventBus.emit('game:score-update', { score: state.score });

    // Replenish humanoids & spawn new enemies
    const count = this.config.gameplay.landersPerWave + state.wave;
    state.enemies = this._spawnEnemies(Math.min(count, 12));
    // Respawn fallen humanoids
    state.humanoids.filter(h => !h.alive).forEach((h, i) => {
      if (i < 3) { h.alive = true; h.falling = false; h.carried = false; h.vy = 0; }
    });
    EventBus.emit('game:tick', { state, action: 'wave-clear' });
    this._startLoop();
  }

  _worldDx(ax, bx) {
    let dx = bx - ax;
    if (dx > WORLD_W / 2)  dx -= WORLD_W;
    if (dx < -WORLD_W / 2) dx += WORLD_W;
    return dx;
  }

  _makeShip() {
    return { x: WORLD_W / 2, y: 140, vx: 0, vy: 0, facing: 1, invincible: 0 };
  }

  _spawnEnemies(count) {
    const enemies = [];
    for (let i = 0; i < count; i++) {
      enemies.push({
        id: this._eid++, type: 'lander',
        x: Math.random() * WORLD_W,
        y: 30 + Math.random() * 100,
        vx: (Math.random() - 0.5) * 80 + 40,
        dead: false, deathT: 0,
        target: null, carrying: null, thinkT: Math.random() * 2
      });
    }
    return enemies;
  }

  _buildFullState() {
    const cfg       = this.config.gameplay;
    const humanoids = [];
    for (let i = 0; i < cfg.humanoids; i++) {
      humanoids.push({
        id: i, alive: true, carried: false, falling: false,
        x: (i + 1) * (WORLD_W / (cfg.humanoids + 1)),
        y: GROUND_Y - 10, vy: 0
      });
    }
    return {
      status: 'idle', mode: 'basique', score: 0, lives: 3, wave: 1,
      ship:       this._makeShip(),
      camera:     WORLD_W / 2,
      bullets:    [],
      enemies:    this._spawnEnemies(cfg.landersPerWave),
      humanoids,
      smartBombs: cfg.smartBombs,
      bombFlash:  0
    };
  }
}
