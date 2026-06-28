import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

const UPGRADES = [
  { id:'damage',    label:'⚔️ Dégâts +25%',     desc:'Projectiles plus puissants' },
  { id:'speed',     label:'💨 Vitesse +20%',     desc:'Tu cours plus vite' },
  { id:'atkspeed',  label:'🔫 Cadence +25%',     desc:'Tu tires plus rapidement' },
  { id:'hp',        label:'❤️ +1 Vie',           desc:'Récupère un point de vie' },
  { id:'range',     label:'🎯 Portée +30%',      desc:'Projectiles qui vont plus loin' },
  { id:'multishot', label:'✨ Multitir',          desc:'Deux projectiles par tir' },
];

export const WORLD = { W: 800, H: 600 };

export default class VampireSurvivors extends BaseGame {
  constructor(config) {
    super(config);
    this.UPGRADES = UPGRADES;
    this.state    = this._buildFullState();
  }

  _gameId() { return 'vampire-survivors'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); }

  start(options = {}) {
    this.state        = this._buildFullState();
    this.state.status = 'playing';
    this.state.mode   = options.mode ?? 'basique';
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  restart() {
    this.state        = this._buildFullState();
    this.state.status = 'idle';
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  chooseUpgrade(idx) {
    const s = this.state;
    if (s.status !== 'upgrading') return;
    const up = s.pendingUpgrades[idx];
    if (!up) return;
    this._applyUpgrade(s, up.id);
    s.pendingUpgrades = [];
    s.status = 'playing';
    EventBus.emit('game:tick', { state: s, action: 'upgraded' });
  }

  // Main update loop — called each frame by renderer
  update(dt) {
    const s = this.state;
    if (s.status !== 'playing') return;

    s.time += dt;
    this._movePlayer(s, dt);
    this._updateProjectiles(s, dt);
    this._spawnEnemies(s, dt);
    this._moveEnemies(s, dt);
    this._collectXP(s);
    this._checkProjectileHits(s);
    this._checkEnemyHits(s, dt);
    this._updateWeapon(s, dt);
  }

  // ── Player ────────────────────────────────────────────────────────────────

  _movePlayer(s, dt) {
    const p = s.player;
    let dx = 0, dy = 0;
    if (s.keys.has('ArrowUp')   || s.keys.has('KeyW')) dy -= 1;
    if (s.keys.has('ArrowDown') || s.keys.has('KeyS')) dy += 1;
    if (s.keys.has('ArrowLeft') || s.keys.has('KeyA')) dx -= 1;
    if (s.keys.has('ArrowRight')|| s.keys.has('KeyD')) dx += 1;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
    p.x = Math.max(p.r, Math.min(WORLD.W - p.r, p.x + dx * p.speed * dt));
    p.y = Math.max(p.r, Math.min(WORLD.H - p.r, p.y + dy * p.speed * dt));
  }

  // ── Weapon ────────────────────────────────────────────────────────────────

  _updateWeapon(s, dt) {
    s.weaponTimer += dt;
    if (s.weaponTimer < s.weaponInterval) return;
    s.weaponTimer = 0;

    const p = s.player;
    // Find nearest enemy
    let target = null, bestDist = Infinity;
    for (const e of s.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bestDist) { bestDist = d; target = e; }
    }
    if (!target) return;

    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    this._spawnProjectile(s, angle);
    if (s.multishot) this._spawnProjectile(s, angle + 0.2);
  }

  _spawnProjectile(s, angle) {
    const p = s.player;
    s.projectiles.push({
      x: p.x, y: p.y, r: 6,
      vx: Math.cos(angle) * 320,
      vy: Math.sin(angle) * 320,
      damage: s.damage,
      range:  s.range,
      dist:   0,
    });
  }

  _updateProjectiles(s, dt) {
    for (const proj of s.projectiles) {
      proj.x    += proj.vx * dt;
      proj.y    += proj.vy * dt;
      proj.dist += Math.hypot(proj.vx, proj.vy) * dt;
    }
    s.projectiles = s.projectiles.filter(p =>
      p.dist < p.range &&
      p.x > -20 && p.x < WORLD.W+20 && p.y > -20 && p.y < WORLD.H+20
    );
  }

  // ── Enemies ───────────────────────────────────────────────────────────────

  _spawnEnemies(s, dt) {
    s.spawnTimer += dt;
    const interval = Math.max(0.6, 2.0 - s.time * 0.002); // ramp up
    if (s.spawnTimer < interval) return;
    s.spawnTimer = 0;

    const count = 1 + Math.floor(s.time / 35); // ramp up progressivement
    for (let i = 0; i < count; i++) this._spawnEnemy(s);
  }

  _spawnEnemy(s) {
    const edge = Math.floor(Math.random() * 4);
    let x, y;
    if (edge === 0)      { x = Math.random() * WORLD.W; y = -30; }
    else if (edge === 1) { x = WORLD.W + 30; y = Math.random() * WORLD.H; }
    else if (edge === 2) { x = Math.random() * WORLD.W; y = WORLD.H + 30; }
    else                 { x = -30; y = Math.random() * WORLD.H; }

    const tier  = Math.min(3, Math.floor(s.time / 30));
    const hpMul = 1 + tier * 0.5 + s.time * 0.005;
    s.enemies.push({
      x, y, r: 14 + tier * 4,
      hp: Math.round(this.config.gameplay.enemyBaseHP * hpMul),
      maxHp: Math.round(this.config.gameplay.enemyBaseHP * hpMul),
      speed: this.config.gameplay.enemyBaseSpeed + tier * 15 + Math.random() * 10,
      tier,
    });
  }

  _moveEnemies(s, dt) {
    const p = s.player;
    for (const e of s.enemies) {
      const angle = Math.atan2(p.y - e.y, p.x - e.x);
      e.x += Math.cos(angle) * e.speed * dt;
      e.y += Math.sin(angle) * e.speed * dt;
    }
  }

  _checkProjectileHits(s) {
    const dead = new Set();
    const deadEnemies = [];

    for (let pi = 0; pi < s.projectiles.length; pi++) {
      const proj = s.projectiles[pi];
      for (let ei = 0; ei < s.enemies.length; ei++) {
        const e = s.enemies[ei];
        if (Math.hypot(proj.x - e.x, proj.y - e.y) < proj.r + e.r) {
          e.hp -= proj.damage;
          dead.add(pi);
          if (e.hp <= 0) deadEnemies.push(ei);
          break;
        }
      }
    }

    s.projectiles = s.projectiles.filter((_, i) => !dead.has(i));

    // Kill enemies (reverse to keep indices valid)
    for (const ei of deadEnemies.slice().reverse()) {
      const e = s.enemies[ei];
      // Drop XP gem
      s.xpGems.push({ x: e.x, y: e.y, value: 1 + e.tier, r: 7 });
      s.kills++;
      s.score += this.config.scoring.killValue * (1 + e.tier);
      s.enemies.splice(ei, 1);
    }
  }

  _checkEnemyHits(s, dt) {
    const p = s.player;
    if (s.invincibleTimer > 0) {
      s.invincibleTimer = Math.max(0, s.invincibleTimer - dt);
      return;
    }
    for (const e of s.enemies) {
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) {
        p.hp--;
        s.invincibleTimer = 2.0;
        if (p.hp <= 0) { this._die(s); return; }
        break; // un seul coup par frame
      }
    }
  }

  _collectXP(s) {
    const p = s.player;
    s.xpGems = s.xpGems.filter(gem => {
      if (Math.hypot(gem.x - p.x, gem.y - p.y) < 45) {
        s.xp += gem.value;
        if (s.xp >= s.xpToLevel) this._levelUp(s);
        return false;
      }
      return true;
    });
  }

  _levelUp(s) {
    s.xp = 0;
    s.level++;
    s.xpToLevel = Math.round(s.xpToLevel * 1.4);
    s.score += this.config.scoring.levelBonus;

    // Pick 3 random distinct upgrades
    const available = [...this.UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
    s.pendingUpgrades = available;
    s.status = 'upgrading';
    EventBus.emit('game:tick', { state: s, action: 'levelup' });
  }

  _applyUpgrade(s, id) {
    const p = s.player;
    if (id === 'damage')    s.damage       = Math.round(s.damage * 1.25);
    if (id === 'speed')     p.speed        = Math.round(p.speed  * 1.20);
    if (id === 'atkspeed')  s.weaponInterval *= 0.8;
    if (id === 'hp')        p.hp = Math.min(p.hp + 1, p.maxHp + 1);
    if (id === 'range')     s.range        *= 1.30;
    if (id === 'multishot') s.multishot    = true;
  }

  _die(s) {
    s.status = 'over';
    const pts = s.score + Math.floor(s.time) * this.config.scoring.timeSurvivalBonus;
    const { best, isRecord } = ScoreService.submit(this._gameId(), pts);
    const mins  = Math.floor(s.time / 60);
    const secs  = Math.floor(s.time % 60).toString().padStart(2,'0');
    EventBus.emit('game:over', {
      result: 'lose', icon: '💀', title: 'GAME OVER',
      score: pts, best, isRecord: false,
      extraInfo: `<div class="overlay-score">Survie : <strong>${mins}:${secs}</strong> · Niveau <strong>${s.level}</strong> · <strong>${s.kills}</strong> ennemis</div>`
    });
  }

  _buildFullState() {
    const cfg = this.config?.gameplay ?? {};
    return {
      status: 'idle', mode: 'basique',
      player: {
        x: WORLD.W/2, y: WORLD.H/2, r: 16,
        hp: cfg.playerHP ?? 100,
        maxHp: cfg.playerHP ?? 100,
        speed: cfg.playerSpeed ?? 140,
      },
      enemies: [], projectiles: [], xpGems: [],
      keys: new Set(),
      time: 0, score: 0, kills: 0,
      level: 1, xp: 0, xpToLevel: cfg.xpPerLevel ?? 20,
      damage: 25, range: 350, multishot: false,
      weaponInterval: (cfg.weaponInterval ?? 800) / 1000,
      weaponTimer: 0, spawnTimer: 0, invincibleTimer: 0,
      pendingUpgrades: [],
    };
  }
}
