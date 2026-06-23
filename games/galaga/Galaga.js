import EventBus     from '../../js/core/EventBus.js';
import ScoreService  from '../../js/services/ScoreService.js';
import BaseGame      from '../../js/core/BaseGame.js';
import { randInt }   from '../../js/utils/Random.js';

const ROW_TYPES = ['boss','boss','butterfly','butterfly','drone'];
const TYPE_PTS  = { boss: 400, butterfly: 160, drone: 100 };

export default class Galaga extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = this._buildFullState();
    this._loopId = null;
    this._last   = 0;
  }

  _gameId() { return 'galaga'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); this._stopLoop(); }

  start(options = {}) {
    this.state         = this._buildFullState();
    this.state.status  = 'playing';
    this.state.mode    = options.mode ?? 'basique';
    this._spawnWave();
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

  moveLeft()  { if (this.state.status === 'playing') this.state.player.vx = -1; }
  moveRight() { if (this.state.status === 'playing') this.state.player.vx =  1; }
  stopMove()  { if (this.state.status === 'playing') this.state.player.vx =  0; }

  shoot() {
    const { state } = this;
    if (state.status !== 'playing') return;
    const now = Date.now();
    if (now - state.player.lastShot < 280) return;
    state.player.lastShot = now;
    state.bullets.push({ x: state.player.x, y: state.player.y - 12 });
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
    const { width, height, playerSpeed, formationSpeed,
            formationMinX, formationMaxX } = this.config.gameplay;

    // Player movement
    state.player.x = Math.max(20, Math.min(width - 20,
      state.player.x + state.player.vx * playerSpeed));

    // Player bullets
    state.bullets = state.bullets.filter(b => { b.y -= 9; return b.y > 0; });

    // Formation drift
    state.fmX += state.fmDir * formationSpeed * (1 + state.wave * 0.05);
    if (state.fmX > formationMaxX || state.fmX < formationMinX) {
      state.fmDir *= -1;
      state.fmY   += 6;
    }

    // Enemy update
    state.enemies.forEach(e => {
      if (!e.alive) return;
      if (e.diving) {
        e.x   += e.dvx;
        e.y   += e.dvy;
        e.dvx += (state.player.x - e.x) * 0.003;
        if (e.y > height + 20) {
          e.diving = false;
          e.x = state.fmX + e.fx;
          e.y = state.fmY + e.fy;
          e.dvx = 0; e.dvy = 0;
        }
      } else {
        e.x = state.fmX + e.fx;
        e.y = state.fmY + e.fy;
      }
    });

    // Trigger random dive
    state.diveTimer -= dt;
    if (state.diveTimer <= 0) {
      state.diveTimer = 1.2 + Math.random() * 2;
      const candidates = state.enemies.filter(e => e.alive && !e.diving);
      if (candidates.length) {
        const e = candidates[randInt(candidates.length)];
        e.diving = true;
        e.dvx    = (Math.random() - 0.5) * 3;
        e.dvy    = 2.5 + Math.random() * 2;
      }
    }

    // Enemy bullets
    state.eBulletTimer -= dt;
    if (state.eBulletTimer <= 0) {
      state.eBulletTimer = 0.6 + Math.random() * 1.2;
      const divers = state.enemies.filter(e => e.alive && e.diving);
      if (divers.length) {
        const sh = divers[randInt(divers.length)];
        const dx = state.player.x - sh.x;
        const dy = state.player.y - sh.y;
        const d  = Math.hypot(dx, dy) || 1;
        state.enemyBullets.push({ x: sh.x, y: sh.y, vx: (dx/d)*4, vy: (dy/d)*4 });
      }
    }
    state.enemyBullets = state.enemyBullets.filter(b => {
      b.x += b.vx; b.y += b.vy;
      return b.y < height + 10;
    });

    // Bullet vs enemy
    state.bullets.forEach(b => {
      if (b.y < 0) return;
      state.enemies.forEach(e => {
        if (!e.alive) return;
        if (Math.abs(b.x - e.x) < 14 && Math.abs(b.y - e.y) < 11) {
          e.alive = false;
          b.y = -999;
          state.score += e.pts;
          state.kills++;
          EventBus.emit('game:score-update', { score: state.score });
        }
      });
    });

    // Enemy bullet vs player
    state.enemyBullets.forEach(b => {
      if (Math.abs(b.x - state.player.x) < 13 && Math.abs(b.y - state.player.y) < 13) {
        b.y = height + 99;
        this._hitPlayer();
      }
    });

    // Diving enemy vs player
    state.enemies.forEach(e => {
      if (!e.alive || !e.diving) return;
      if (Math.abs(e.x - state.player.x) < 18 && Math.abs(e.y - state.player.y) < 18) {
        e.alive = false;
        this._hitPlayer();
      }
    });

    // Wave clear
    if (state.enemies.filter(e => e.alive).length === 0) {
      state.wave++;
      this._spawnWave();
    }
  }

  _hitPlayer() {
    const { state } = this;
    state.lives--;
    state.player.x = this.config.gameplay.width / 2;
    EventBus.emit('game:lives-update', { lives: state.lives });
    if (state.lives <= 0) {
      state.status = 'over';
      this._stopLoop();
      const { best } = ScoreService.submit(this._gameId(), state.score);
      EventBus.emit('game:over', {
        result: 'lose', icon: '👾', title: 'GAME OVER',
        score: state.score, best,
        extraInfo: `<div class="overlay-score">Vague ${state.wave} — ${state.kills} ennemis</div>`,
      });
    }
  }

  _spawnWave() {
    const { width, formationStartY, cols } = this.config.gameplay;
    const enemies = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < cols; c++) {
        const type = ROW_TYPES[r];
        enemies.push({
          alive: true, type, diving: false,
          pts: TYPE_PTS[type] * (1 + (this.state.wave - 1) * 0.1 | 0),
          fx: (c - cols / 2 + 0.5) * 36,
          fy: r * 28,
          x: width / 2 + (c - cols / 2 + 0.5) * 36,
          y: formationStartY + r * 28,
          dvx: 0, dvy: 0,
        });
      }
    }
    this.state.enemies      = enemies;
    this.state.fmX          = width / 2;
    this.state.fmY          = this.config.gameplay.formationStartY;
    this.state.fmDir        = 1;
    this.state.bullets      = [];
    this.state.enemyBullets = [];
  }

  _buildFullState() {
    const w = this.config?.gameplay?.width  ?? 400;
    const h = this.config?.gameplay?.height ?? 580;
    return {
      status: 'idle', mode: 'basique', score: 0, lives: 3, wave: 1, kills: 0,
      player: { x: w / 2, y: h - 40, vx: 0, lastShot: 0 },
      bullets: [], enemyBullets: [], enemies: [],
      fmX: w / 2, fmY: this.config?.gameplay?.formationStartY ?? 60,
      fmDir: 1, diveTimer: 2, eBulletTimer: 1,
    };
  }
}
