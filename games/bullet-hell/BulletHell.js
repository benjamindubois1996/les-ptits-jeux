import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';

const W = 1, H = 1; // normalized space
const PLAYER_SPEED  = 0.0004;
const BULLET_SPEED  = 0.001;
const BOSS_BULLET_SPEED = 0.00035;
const FIRE_RATE     = 180;   // ms between player shots
const HIT_RADIUS    = 0.018; // player hitbox
const BOSS_W = 0.28, BOSS_H = 0.14;

// Boss total HP by phase
const BOSS_HP = [1800, 1800, 1800]; // 600 HP per phase, 3 phases = 1800 total displayed

export default class BulletHell extends BaseGame {
  constructor(config) {
    super(config);
    this.state     = null;
    this._loop     = new GameLoop(this._tick.bind(this));
    this._keys     = new Set();
    this._onKey    = null;
    this._lastTick = null;
  }

  _gameId() { return 'bullet-hell'; }

  _buildFullState() {
    return {
      status:   'idle',
      phase:    1,             // boss phase 1-3
      bossHp:   BOSS_HP[0],
      bossMaxHp: BOSS_HP[0],
      bossX:    0.5,           // center of boss
      bossY:    0.12,
      bossDir:  1,
      bossTimer: 0,
      patternTimer: 0,
      patternStep:  0,

      player: { x: 0.5, y: 0.82, invincible: 0 },
      lives:  3,
      score:  0,
      time:   0,

      playerBullets: [], // { x, y }
      bossBullets:   [], // { x, y, vx, vy }

      fireTimer: 0,
      keys: { up: false, down: false, left: false, right: false },

      message: '',
      phaseTransition: false,
    };
  }

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  _bindControls() {
    this._onKey = (e) => {
      const down = e.type === 'keydown';
      if (['ArrowUp','KeyW'].includes(e.code))    this.state && (this.state.keys.up    = down);
      if (['ArrowDown','KeyS'].includes(e.code))  this.state && (this.state.keys.down  = down);
      if (['ArrowLeft','KeyA'].includes(e.code))  this.state && (this.state.keys.left  = down);
      if (['ArrowRight','KeyD'].includes(e.code)) this.state && (this.state.keys.right = down);
    };
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('keyup',   this._onKey);
  }

  _unbindControls() {
    if (this._onKey) {
      window.removeEventListener('keydown', this._onKey);
      window.removeEventListener('keyup',   this._onKey);
    }
  }

  start() {
    const s = this.state;
    s.status  = 'playing';
    s.message = '';
    this._lastTick = null;
    this._loop.start(16);
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  _tick() {
    const now = performance.now();
    if (this._lastTick === null) this._lastTick = now;
    const dt = Math.min(now - this._lastTick, 100);
    this._lastTick = now;

    const s = this.state;
    if (s.status !== 'playing' || s.phaseTransition) return;

    s.time += dt;

    // Move player
    const speed = PLAYER_SPEED * dt;
    if (s.keys.up)    s.player.y = Math.max(0.55, s.player.y - speed);
    if (s.keys.down)  s.player.y = Math.min(0.96, s.player.y + speed);
    if (s.keys.left)  s.player.x = Math.max(0.02, s.player.x - speed);
    if (s.keys.right) s.player.x = Math.min(0.98, s.player.x + speed);

    // Player invincibility
    if (s.player.invincible > 0) s.player.invincible -= dt;

    // Auto-fire player bullets
    s.fireTimer -= dt;
    if (s.fireTimer <= 0) {
      s.playerBullets.push({ x: s.player.x, y: s.player.y - 0.02 });
      s.fireTimer = FIRE_RATE;
    }

    // Move player bullets
    const bSpeed = BULLET_SPEED * dt;
    s.playerBullets = s.playerBullets.filter(b => {
      b.y -= bSpeed;
      return b.y > -0.05;
    });

    // Boss movement
    s.bossTimer += dt;
    s.bossX += s.bossDir * 0.00015 * dt;
    if (s.bossX > 0.82 || s.bossX < 0.18) s.bossDir *= -1;

    // Boss fires pattern
    s.patternTimer -= dt;
    if (s.patternTimer <= 0) {
      this._bossFirePattern();
    }

    // Move boss bullets
    s.bossBullets = s.bossBullets.filter(b => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      return b.x > -0.1 && b.x < 1.1 && b.y > -0.1 && b.y < 1.1;
    });

    // Check player bullets hitting boss
    const bossLeft  = s.bossX - BOSS_W / 2;
    const bossRight = s.bossX + BOSS_W / 2;
    const bossTop   = s.bossY - BOSS_H / 2;
    const bossBot   = s.bossY + BOSS_H / 2;

    s.playerBullets = s.playerBullets.filter(b => {
      if (b.x >= bossLeft && b.x <= bossRight && b.y >= bossTop && b.y <= bossBot) {
        s.bossHp--;
        s.score += 10;
        return false;
      }
      return true;
    });

    // Boss HP → phase transition
    if (s.bossHp <= 0) {
      if (s.phase < 3) {
        this._nextPhase();
      } else {
        this._victory();
      }
      return;
    }

    // Check player hit by boss bullets
    if (s.player.invincible <= 0) {
      for (const b of s.bossBullets) {
        const dx = b.x - s.player.x, dy = b.y - s.player.y;
        if (Math.sqrt(dx * dx + dy * dy) < HIT_RADIUS) {
          this._playerHit();
          break;
        }
      }
    }

    // Score time bonus
    if (Math.floor(s.time / 1000) > Math.floor((s.time - dt) / 1000)) {
      s.score += 1;
      ScoreService.submit(this._gameId(), s.score);
    }

    EventBus.emit('game:tick', { state: s });
  }

  _bossFirePattern() {
    const s  = this.state;
    const bx = s.bossX, by = s.bossY + 0.07;
    const px = s.player.x, py = s.player.y;
    const speed = BOSS_BULLET_SPEED * (1 + (s.phase - 1) * 0.25);

    if (s.phase === 1) {
      // Aimed shots — 3 bullets spread around player
      s.patternTimer = 1200;
      const baseAngle = Math.atan2(py - by, px - bx);
      [-0.25, 0, 0.25].forEach(off => {
        const angle = baseAngle + off;
        s.bossBullets.push({ x: bx, y: by, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
      });

    } else if (s.phase === 2) {
      // Spiral — fire in expanding ring
      s.patternTimer = 200;
      const count = 8;
      const angleOffset = (s.patternStep * Math.PI * 2) / (count * 6);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + angleOffset;
        s.bossBullets.push({ x: bx, y: by, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
      }
      s.patternStep++;

    } else {
      // Phase 3 — dense curtains with gap
      s.patternTimer = 900;
      const gapX = s.player.x; // gap around player
      for (let i = 0; i < 20; i++) {
        const x = i / 19;
        if (Math.abs(x - gapX) < 0.12) continue; // leave a gap
        s.bossBullets.push({ x, y: by + 0.02, vx: 0, vy: speed * 1.2 });
      }
    }
  }

  _nextPhase() {
    const s = this.state;
    s.phaseTransition = true;
    s.message = `Phase ${s.phase} terminée !`;
    s.bossBullets = [];
    EventBus.emit('game:tick', { state: s });

    setTimeout(() => {
      s.phase++;
      s.bossHp    = BOSS_HP[s.phase - 1];
      s.bossMaxHp = BOSS_HP[s.phase - 1];
      s.patternTimer = 1000;
      s.patternStep  = 0;
      s.phaseTransition = false;
      s.player.invincible = 2000;
      s.message = `Phase ${s.phase} — Attention !`;
      EventBus.emit('game:tick', { state: s });
    }, 2500);
  }

  _playerHit() {
    const s = this.state;
    s.lives--;
    s.player.invincible = 2000;
    s.bossBullets = []; // clear screen on hit

    if (s.lives <= 0) {
      s.status = 'over';
      this._loop.stop();
      s.message = 'Éliminé… le boss a gagné.';
      ScoreService.submit(this._gameId(), s.score);
      EventBus.emit('game:tick', { state: s });
      EventBus.emit('game:over', { score: s.score });
    } else {
      s.message = `Touché ! ${s.lives} vie${s.lives > 1 ? 's' : ''} restante${s.lives > 1 ? 's' : ''}`;
      EventBus.emit('game:tick', { state: s });
    }
  }

  _victory() {
    const s = this.state;
    s.status  = 'won';
    s.bossHp  = 0;
    s.message = '🏆 Boss vaincu !';
    this._loop.stop();
    s.score += 5000; // boss clear bonus
    ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:tick', { state: s });
    EventBus.emit('game:won', { score: s.score });
  }

  restart() {
    this._loop.stop();
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    this._loop.stop();
    this._unbindControls();
    super.destroy();
  }
}

