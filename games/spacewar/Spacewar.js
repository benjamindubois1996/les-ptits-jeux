import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';

const G_CONST     = 18000; // force gravitationnelle (px³/s²)
const DRAG        = 0.998; // résistance spatiale par tick
const SHIP_THRUST = 80;    // px/s²
const SHIP_ROT    = 2.8;   // rad/s
const MAX_SPEED   = 220;   // px/s
const BULLET_V    = 280;   // px/s
const BULLET_LIFE = 2200;  // ms
const FIRE_CD     = 400;   // ms
const HYPER_CD    = 3000;  // ms
const STAR_R      = 18;
const SHIP_R      = 12;
const BULLET_R    = 3;
const INIT_LIVES  = 3;
const RESPAWN_MS  = 2000;

function mkShip(x, y, angle, isPlayer) {
  return {
    x, y, vx: 0, vy: 0, angle,
    lives:      INIT_LIVES,
    fireMs:     0,
    hyperMs:    0,
    respawnMs:  0,
    thrusting:  false,
    isPlayer,
  };
}

export default class Spacewar extends BaseGame {
  constructor(config) {
    super(config);
    this.state     = null;
    this._loop     = new GameLoop(this._tick.bind(this));
    this._lastTick = null;
    this._keys     = new Set();
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
    this._aiThinkMs = 0;
    this._W = 600; this._H = 450;
  }

  _gameId() { return 'spacewar'; }

  setDimensions(w, h) { this._W = w; this._H = h; }

  _buildFullState() {
    const cx = this._W / 2, cy = this._H / 2;
    return {
      status:  'idle',
      score:   0,
      player:  mkShip(cx - 120, cy, -Math.PI / 2, true),
      enemy:   mkShip(cx + 120, cy,  Math.PI / 2, false),
      bullets: [],  // { x, y, vx, vy, owner, lifeMs }
      star:    { x: cx, y: cy, r: STAR_R },
      cx, cy,
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
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup',   this._onKeyUp);
  }

  _unbindControls() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup',   this._onKeyUp);
  }

  _onKeyDown(e) {
    this._keys.add(e.key);
    if (e.key === 'p' || e.key === 'P') EventBus.emit('game:pause-toggle');
    if (e.key === 'r' || e.key === 'R') EventBus.emit('game:restart');
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  }

  _onKeyUp(e) { this._keys.delete(e.key); }

  start() {
    // Rebuild state with correct canvas dimensions (set by renderer before start)
    const fresh = this._buildFullState();
    fresh.status = 'playing';
    this.state   = fresh;
    this._aiThinkMs = 0;
    this._lastTick  = null;
    this._loop.start(16);
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  _tick() {
    const now = performance.now();
    if (this._lastTick === null) this._lastTick = now;
    const dt = Math.min(now - this._lastTick, 50);
    this._lastTick = now;
    const dtS = dt / 1000;

    const s = this.state;
    if (s.status !== 'playing') return;

    this._updateShip(s, s.player, dtS, this._keys);
    this._updateAI(s, dt, dtS);
    this._moveBullets(s, dt);
    this._checkCollisions(s);

    EventBus.emit('game:tick', { state: s, action: 'tick' });
  }

  _gravity(s, ship) {
    const dx = s.star.x - ship.x;
    const dy = s.star.y - ship.y;
    const dist2 = dx * dx + dy * dy;
    const dist  = Math.sqrt(dist2);
    if (dist < 1) return { gx: 0, gy: 0 };
    const force = G_CONST / dist2;
    return { gx: (dx / dist) * force, gy: (dy / dist) * force };
  }

  _updateShip(s, ship, dtS, keys) {
    if (ship.respawnMs > 0) {
      ship.respawnMs -= dtS * 1000;
      return;
    }

    ship.fireMs  = Math.max(0, ship.fireMs - dtS * 1000);
    ship.hyperMs = Math.max(0, ship.hyperMs - dtS * 1000);

    // Rotation
    if (ship.isPlayer) {
      if (keys.has('ArrowLeft'))  ship.angle -= SHIP_ROT * dtS;
      if (keys.has('ArrowRight')) ship.angle += SHIP_ROT * dtS;

      // Propulsion
      ship.thrusting = keys.has('ArrowUp');
      if (ship.thrusting) {
        ship.vx += Math.cos(ship.angle) * SHIP_THRUST * dtS;
        ship.vy += Math.sin(ship.angle) * SHIP_THRUST * dtS;
      }

      // Hyperespace
      if (keys.has('h') || keys.has('H')) {
        if (ship.hyperMs <= 0) this._hyperspace(s, ship);
      }

      // Tir
      if ((keys.has(' ')) && ship.fireMs <= 0) {
        this._fire(s, ship);
      }
    }

    // Gravité
    const { gx, gy } = this._gravity(s, ship);
    ship.vx += gx * dtS;
    ship.vy += gy * dtS;

    // Drag
    ship.vx *= Math.pow(DRAG, dtS * 60);
    ship.vy *= Math.pow(DRAG, dtS * 60);

    // Limite de vitesse
    const spd = Math.sqrt(ship.vx ** 2 + ship.vy ** 2);
    if (spd > MAX_SPEED) { ship.vx = (ship.vx / spd) * MAX_SPEED; ship.vy = (ship.vy / spd) * MAX_SPEED; }

    // Mouvement
    ship.x += ship.vx * dtS;
    ship.y += ship.vy * dtS;

    // Wrap
    if (ship.x < 0) ship.x += this._W;
    if (ship.x > this._W) ship.x -= this._W;
    if (ship.y < 0) ship.y += this._H;
    if (ship.y > this._H) ship.y -= this._H;
  }

  _fire(s, ship) {
    s.bullets.push({
      x: ship.x + Math.cos(ship.angle) * SHIP_R * 1.5,
      y: ship.y + Math.sin(ship.angle) * SHIP_R * 1.5,
      vx: ship.vx + Math.cos(ship.angle) * BULLET_V,
      vy: ship.vy + Math.sin(ship.angle) * BULLET_V,
      owner: ship.isPlayer ? 'player' : 'enemy',
      lifeMs: BULLET_LIFE,
    });
    ship.fireMs = FIRE_CD;
  }

  _hyperspace(s, ship) {
    ship.hyperMs = HYPER_CD;
    ship.x  = this._W * 0.1 + Math.random() * this._W * 0.8;
    ship.y  = this._H * 0.1 + Math.random() * this._H * 0.8;
    ship.vx = (Math.random() - 0.5) * 60;
    ship.vy = (Math.random() - 0.5) * 60;
  }

  _updateAI(s, dt, dtS) {
    const enemy  = s.enemy;
    const player = s.player;
    if (enemy.respawnMs > 0) { enemy.respawnMs -= dt; return; }

    enemy.fireMs  = Math.max(0, enemy.fireMs  - dt);
    enemy.hyperMs = Math.max(0, enemy.hyperMs - dt);

    this._aiThinkMs -= dt;
    if (this._aiThinkMs <= 0) {
      this._aiThinkMs = 300 + Math.random() * 200;

      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const targetAngle = Math.atan2(dy, dx);
      const da = this._angleDiff(targetAngle, enemy.angle);

      if (Math.abs(da) > 0.2) {
        enemy.angle += Math.sign(da) * SHIP_ROT * 0.3;
      }

      // Distance
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Fuir l'étoile si trop proche
      const sdx = enemy.x - s.star.x, sdy = enemy.y - s.star.y;
      const starDist = Math.sqrt(sdx * sdx + sdy * sdy);
      if (starDist < 80) {
        enemy.angle = Math.atan2(sdy, sdx);
        enemy.thrusting = true;
      } else {
        // Poursuite
        enemy.thrusting = dist > 100 || Math.random() < 0.4;
      }

      // Tir si aligné
      if (Math.abs(da) < 0.3 && dist < 350 && enemy.fireMs <= 0) {
        this._fire(s, enemy);
      }
    }

    if (enemy.thrusting) {
      enemy.vx += Math.cos(enemy.angle) * SHIP_THRUST * dtS;
      enemy.vy += Math.sin(enemy.angle) * SHIP_THRUST * dtS;
    }

    const { gx, gy } = this._gravity(s, enemy);
    enemy.vx += gx * dtS;
    enemy.vy += gy * dtS;
    enemy.vx *= Math.pow(DRAG, dtS * 60);
    enemy.vy *= Math.pow(DRAG, dtS * 60);
    const spd = Math.sqrt(enemy.vx ** 2 + enemy.vy ** 2);
    if (spd > MAX_SPEED) { enemy.vx = (enemy.vx / spd) * MAX_SPEED; enemy.vy = (enemy.vy / spd) * MAX_SPEED; }
    enemy.x += enemy.vx * dtS;
    enemy.y += enemy.vy * dtS;
    if (enemy.x < 0) enemy.x += this._W;
    if (enemy.x > this._W) enemy.x -= this._W;
    if (enemy.y < 0) enemy.y += this._H;
    if (enemy.y > this._H) enemy.y -= this._H;
  }

  _angleDiff(target, current) {
    let d = target - current;
    while (d > Math.PI)  d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  _moveBullets(s, dt) {
    for (let i = s.bullets.length - 1; i >= 0; i--) {
      const b = s.bullets[i];
      b.x += b.vx * (dt / 1000);
      b.y += b.vy * (dt / 1000);
      b.lifeMs -= dt;
      // Wrap
      if (b.x < 0) b.x += this._W;
      if (b.x > this._W) b.x -= this._W;
      if (b.y < 0) b.y += this._H;
      if (b.y > this._H) b.y -= this._H;
      if (b.lifeMs <= 0) { s.bullets.splice(i, 1); }
    }
  }

  _checkCollisions(s) {
    // Bullets
    for (let i = s.bullets.length - 1; i >= 0; i--) {
      const b = s.bullets[i];
      const target = b.owner === 'player' ? s.enemy : s.player;
      if (target.respawnMs > 0) continue;
      const dx = b.x - target.x, dy = b.y - target.y;
      if (Math.sqrt(dx * dx + dy * dy) < SHIP_R + BULLET_R) {
        s.bullets.splice(i, 1);
        if (b.owner === 'player') {
          s.score += 300;
          ScoreService.update(this._gameId(), s.score);
        }
        this._hitShip(s, target);
        if (s.status !== 'playing') return;
      }
    }

    // Ship vs star
    for (const ship of [s.player, s.enemy]) {
      if (ship.respawnMs > 0) continue;
      const dx = ship.x - s.star.x, dy = ship.y - s.star.y;
      if (Math.sqrt(dx * dx + dy * dy) < STAR_R + SHIP_R) {
        if (ship.isPlayer) s.score = Math.max(0, s.score - 100);
        this._hitShip(s, ship);
        if (s.status !== 'playing') return;
      }
    }
  }

  _hitShip(s, ship) {
    ship.lives--;
    ship.vx = 0; ship.vy = 0;

    if (ship.lives <= 0) {
      if (ship.isPlayer) {
        s.status = 'over';
        this._loop.stop();
        const best = ScoreService.update(this._gameId(), s.score);
        EventBus.emit('game:over', { score: s.score, best });
      } else {
        s.score += 1000;
        ScoreService.update(this._gameId(), s.score);
        s.status = 'won';
        this._loop.stop();
        const best = ScoreService.update(this._gameId(), s.score);
        EventBus.emit('game:won', { score: s.score, best });
      }
    } else {
      // Respawn de l'autre côté
      const cx = this._W / 2, cy = this._H / 2;
      ship.x = ship.isPlayer ? cx - 150 : cx + 150;
      ship.y = cy;
      ship.vx = 0; ship.vy = 0;
      ship.respawnMs = RESPAWN_MS;
    }
  }

  restart() {
    this._loop.stop();
    this._keys.clear();
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    this._loop.stop();
    this._unbindControls();
    super.destroy();
  }
}
