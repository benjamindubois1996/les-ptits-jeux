import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop      from '../../js/core/GameLoop.js';
import { randInt }   from '../../js/utils/Random.js';

export const ARENA_W = 340;
export const ARENA_H = 460;

const TICK_MS = 33;

const DODGE_DURATION  = 12000;
const DODGE_SPAWN_MS  = 300;
const DODGE_SPEED_MIN = 140;
const DODGE_SPEED_MAX = 230;
const PLAYER_SPEED    = 220;
const PLAYER_R        = 9;
const BULLET_R        = 5;
const HIT_INVULN_MS   = 1200;

const FLASH_ON  = 420;
const FLASH_GAP = 220;

const REFLEX_TARGET   = 8;
const REFLEX_DURATION = 12000;
const REFLEX_LIFESPAN = 850;

const BOSS_MAX_HP        = 100;
const BOSS_PLAYER_FIRE   = 380;
const BOSS_PLAYER_DMG    = 4;
const BOSS_ATTACK_PERIOD = 2800;

const MOVE_CODES = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export default class RetrovaultBoss extends BaseGame {
  constructor(config) {
    super(config);
    this._keys = new Set();
    this.state = this._buildFullState();
    this._loop = new GameLoop(() => this._update(TICK_MS));
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
  }

  _gameId() { return 'retrovault-boss'; }

  _buildFullState() {
    return {
      status: 'idle',
      phase: 'dodge',
      lives: this.lives?.count ?? 3,
      score: 0,
      dodge: null,
      memory: null,
      reflex: null,
      boss: null,
    };
  }

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  start() {
    this.lives.reset();
    this.state = { ...this._buildFullState(), status: 'playing', lives: this.lives.count };
    this._enterPhase('dodge');
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
    this._loop.start(TICK_MS);
  }

  /* ============================================================
     TRANSITIONS DE PHASE
     ============================================================ */

  _enterPhase(name) {
    const s = this.state;
    s.phase = name;
    if (name === 'dodge')  s.dodge  = this._initDodge();
    if (name === 'reflex') s.reflex = this._initReflex();
    if (name === 'boss')   s.boss   = this._initBoss();
    if (name === 'memory') {
      s.memory = this._initMemory();
      this._memoryBeginShow();
    }
    EventBus.emit('game:tick', { state: s, action: 'phase-change', phase: name });
  }

  _loseLife() {
    const remaining = this.lives.lose();
    this.state.lives = remaining;
    if (remaining <= 0) {
      this.state.status = 'over';
      this._loop.stop();
      const { isRecord, best } = ScoreService.submit(this._gameId(), this.state.score);
      EventBus.emit('game:over', { score: this.state.score, isRecord, best, phase: this.state.phase });
    }
  }

  /* ============================================================
     PHASE 1 — ESQUIVE
     ============================================================ */

  _initDodge() {
    return {
      timeLeft: DODGE_DURATION,
      player: { x: ARENA_W / 2, y: ARENA_H / 2 },
      bullets: [],
      spawnTimer: 0,
      invuln: 0,
    };
  }

  _updateDodge(dt) {
    const d = this.state.dodge;

    let vx = 0, vy = 0;
    if (this._keys.has('ArrowLeft')  || this._keys.has('KeyA')) vx -= 1;
    if (this._keys.has('ArrowRight') || this._keys.has('KeyD')) vx += 1;
    if (this._keys.has('ArrowUp')    || this._keys.has('KeyW')) vy -= 1;
    if (this._keys.has('ArrowDown')  || this._keys.has('KeyS')) vy += 1;
    const len = Math.hypot(vx, vy) || 1;
    d.player.x = clamp(d.player.x + (vx / len) * PLAYER_SPEED * dt / 1000, PLAYER_R, ARENA_W - PLAYER_R);
    d.player.y = clamp(d.player.y + (vy / len) * PLAYER_SPEED * dt / 1000, PLAYER_R, ARENA_H - PLAYER_R);

    d.spawnTimer -= dt;
    if (d.spawnTimer <= 0) {
      d.spawnTimer = DODGE_SPAWN_MS;
      d.bullets.push({
        x: 10 + randInt(ARENA_W - 20),
        y: -10,
        vy: DODGE_SPEED_MIN + Math.random() * (DODGE_SPEED_MAX - DODGE_SPEED_MIN),
      });
    }

    d.bullets.forEach(b => { b.y += b.vy * dt / 1000; });
    d.bullets = d.bullets.filter(b => b.y < ARENA_H + 20);

    if (d.invuln > 0) d.invuln = Math.max(0, d.invuln - dt);
    if (d.invuln <= 0) {
      for (const b of d.bullets) {
        if (Math.hypot(b.x - d.player.x, b.y - d.player.y) < PLAYER_R + BULLET_R) {
          this._loseLife();
          d.invuln = HIT_INVULN_MS;
          break;
        }
      }
    }

    if (this.state.status !== 'playing') return;

    d.timeLeft -= dt;
    if (d.timeLeft <= 0) {
      this.state.score += 150;
      this._enterPhase('memory');
    }
  }

  /* ============================================================
     PHASE 2 — MÉMOIRE MUSICALE
     ============================================================ */

  _initMemory() {
    return {
      sequence: [randInt(4)],
      round: 0,
      totalRounds: 5,
      inputIndex: 0,
      flashIndex: 0,
      sub: 'show-on',
      subTimer: 0,
      activeColor: null,
    };
  }

  _memoryBeginShow() {
    const m = this.state.memory;
    m.inputIndex   = 0;
    m.flashIndex   = 0;
    m.activeColor  = m.sequence[0];
    m.sub          = 'show-on';
    m.subTimer     = 0;
  }

  _updateMemory(dt) {
    const m = this.state.memory;
    switch (m.sub) {
      case 'show-on':
        m.subTimer += dt;
        if (m.subTimer >= FLASH_ON) { m.activeColor = null; m.sub = 'show-gap'; m.subTimer = 0; }
        break;
      case 'show-gap':
        m.subTimer += dt;
        if (m.subTimer >= FLASH_GAP) {
          m.flashIndex++;
          if (m.flashIndex >= m.sequence.length) {
            m.sub = 'waiting';
          } else {
            m.activeColor = m.sequence[m.flashIndex];
            m.sub = 'show-on';
          }
          m.subTimer = 0;
        }
        break;
      case 'waiting':
        break;
      case 'mistake':
        m.subTimer += dt;
        if (m.subTimer >= 900) this._memoryBeginShow();
        break;
      case 'complete':
        m.subTimer += dt;
        if (m.subTimer >= 700) {
          m.round++;
          if (m.round >= m.totalRounds) { this.state.score += 250; this._enterPhase('reflex'); return; }
          m.sequence.push(randInt(4));
          this._memoryBeginShow();
        }
        break;
    }
  }

  press(colorId) {
    const s = this.state;
    if (s.status !== 'playing' || s.phase !== 'memory' || s.memory.sub !== 'waiting') return;
    const m = s.memory;
    const expected = m.sequence[m.inputIndex];
    const correct  = colorId === expected;
    EventBus.emit('game:tick', { state: s, action: 'memory-press', note: colorId, correct });

    if (!correct) {
      this._loseLife();
      if (s.status !== 'playing') return;
      m.sub = 'mistake';
      m.subTimer = 0;
      return;
    }

    m.inputIndex++;
    if (m.inputIndex < m.sequence.length) return;
    m.sub = 'complete';
    m.subTimer = 0;
  }

  /* ============================================================
     PHASE 3 — RÉFLEXES
     ============================================================ */

  _initReflex() {
    return {
      hits: 0,
      target: REFLEX_TARGET,
      timeLeft: REFLEX_DURATION,
      spawnTimer: 0,
      holes: Array.from({ length: 9 }, () => ({ active: false, life: 0 })),
    };
  }

  _updateReflex(dt) {
    const r = this.state.reflex;
    r.timeLeft   -= dt;
    r.spawnTimer -= dt;

    r.holes.forEach(h => {
      if (h.active) {
        h.life -= dt;
        if (h.life <= 0) h.active = false;
      }
    });

    if (r.spawnTimer <= 0) {
      const idle = r.holes.map((h, i) => ({ h, i })).filter(o => !o.h.active);
      if (idle.length) {
        const pick = idle[randInt(idle.length)];
        pick.h.active = true;
        pick.h.life   = REFLEX_LIFESPAN;
      }
      r.spawnTimer = 450 + randInt(400);
    }

    if (r.hits >= r.target) {
      this.state.score += 260;
      this._enterPhase('boss');
      return;
    }

    if (r.timeLeft <= 0) {
      this._loseLife();
      if (this.state.status !== 'playing') return;
      this.state.reflex = this._initReflex();
    }
  }

  hitHole(index) {
    const s = this.state;
    if (s.status !== 'playing' || s.phase !== 'reflex') return;
    const h = s.reflex.holes[index];
    if (!h || !h.active) return;
    h.active = false;
    s.reflex.hits++;
    s.score += 20;
  }

  /* ============================================================
     PHASE 4 — DUEL FINAL
     ============================================================ */

  _initBoss() {
    return {
      hp: BOSS_MAX_HP,
      maxHp: BOSS_MAX_HP,
      player: { x: ARENA_W / 2, y: ARENA_H - 30 },
      playerBullets: [],
      bossBullets: [],
      fireTimer: 0,
      attackTimer: 0,
      pattern: 0,
      invuln: 0,
    };
  }

  _updateBoss(dt) {
    const b = this.state.boss;

    let vx = 0;
    if (this._keys.has('ArrowLeft')  || this._keys.has('KeyA')) vx -= 1;
    if (this._keys.has('ArrowRight') || this._keys.has('KeyD')) vx += 1;
    b.player.x = clamp(b.player.x + vx * PLAYER_SPEED * dt / 1000, 14, ARENA_W - 14);

    b.fireTimer -= dt;
    if (b.fireTimer <= 0) {
      b.fireTimer = BOSS_PLAYER_FIRE;
      b.playerBullets.push({ x: b.player.x, y: b.player.y - 14, vy: -320 });
    }
    b.playerBullets.forEach(pb => { pb.y += pb.vy * dt / 1000; });
    b.playerBullets = b.playerBullets.filter(pb => {
      if (pb.y <= 70) {
        b.hp = Math.max(0, b.hp - BOSS_PLAYER_DMG);
        this.state.score += 8;
        return false;
      }
      return pb.y > -10;
    });

    b.attackTimer -= dt;
    if (b.attackTimer <= 0) {
      b.attackTimer = BOSS_ATTACK_PERIOD;
      b.pattern = (b.pattern + 1) % 3;
      this._fireBossPattern(b);
    }

    b.bossBullets.forEach(bb => { bb.x += bb.vx * dt / 1000; bb.y += bb.vy * dt / 1000; });
    b.bossBullets = b.bossBullets.filter(bb => bb.y < ARENA_H + 20 && bb.x > -20 && bb.x < ARENA_W + 20);

    if (b.invuln > 0) b.invuln = Math.max(0, b.invuln - dt);
    if (b.invuln <= 0) {
      for (const bb of b.bossBullets) {
        if (Math.hypot(bb.x - b.player.x, bb.y - b.player.y) < 14 + 5) {
          this._loseLife();
          b.invuln = HIT_INVULN_MS;
          break;
        }
      }
    }

    if (this.state.status !== 'playing') return;

    if (b.hp <= 0) {
      this.state.score += 500 + this.lives.count * 50;
      this.state.status = 'won';
      this._loop.stop();
      const { isRecord, best } = ScoreService.submit(this._gameId(), this.state.score);
      EventBus.emit('game:won', { score: this.state.score, isRecord, best });
    }
  }

  _fireBossPattern(b) {
    const cx = ARENA_W / 2, cy = 60;
    if (b.pattern === 0) {
      for (let i = 0; i < 5; i++) {
        const angle = (Math.PI / 2) + (i - 2) * 0.28;
        b.bossBullets.push({ x: cx, y: cy, vx: Math.cos(angle) * 150, vy: Math.sin(angle) * 150 });
      }
    } else if (b.pattern === 1) {
      const dx = b.player.x - cx, dy = b.player.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      b.bossBullets.push({ x: cx, y: cy, vx: (dx / len) * 220, vy: (dy / len) * 220 });
    } else {
      for (let i = 0; i < 7; i++) {
        const x = 20 + i * (ARENA_W - 40) / 6;
        b.bossBullets.push({ x, y: cy, vx: 0, vy: 160 });
      }
    }
  }

  /* ============================================================
     BOUCLE PRINCIPALE
     ============================================================ */

  _update(dt) {
    if (this.state.status !== 'playing') return;
    switch (this.state.phase) {
      case 'dodge':  this._updateDodge(dt);  break;
      case 'memory': this._updateMemory(dt); break;
      case 'reflex': this._updateReflex(dt); break;
      case 'boss':   this._updateBoss(dt);   break;
    }
    if (this.state.status === 'playing') {
      EventBus.emit('game:tick', { state: this.state, action: 'frame' });
    }
  }

  /* ============================================================
     CONTRÔLES
     ============================================================ */

  _bindControls() {
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup',   this._onKeyUp);
  }

  _unbindControls() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup',   this._onKeyUp);
  }

  _onKeyDown(e) {
    if (e.key === 'p' || e.key === 'P') { EventBus.emit('game:pause-toggle'); return; }
    if (e.key === 'r' || e.key === 'R') { EventBus.emit('game:restart'); return; }
    if (MOVE_CODES.includes(e.code)) { e.preventDefault(); this._keys.add(e.code); return; }
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
    if (idx !== -1) this.press(idx);
  }

  _onKeyUp(e) {
    this._keys.delete(e.code);
  }

  _onPause()  { this._loop.stop(); }
  _onResume() { this._loop.start(TICK_MS); }

  restart() {
    this._loop.stop();
    this._keys.clear();
    this.lives.reset();
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    this._loop.destroy();
    this._unbindControls();
    super.destroy();
  }
}
