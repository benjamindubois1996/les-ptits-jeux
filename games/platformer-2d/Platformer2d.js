import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

/* ─── Données de niveaux ────────────────────────────────────── */
// Canvas 480×400 — ground top à y=368, player feet à y=368 (player.y = 340)
// Platforms flottantes toutes accessibles depuis le sol (max 112px de haut)
const LEVELS = [
  /* ── Niveau 1 : Introduction ── */
  {
    worldWidth: 2080,
    playerStart: { x: 48, y: 340 },
    platforms: [
      // Sol (3 segments, 2 trous de 80px)
      { x: 0,    y: 368, w: 640,  h: 32 },
      { x: 720,  y: 368, w: 560,  h: 32 },
      { x: 1360, y: 368, w: 720,  h: 32 },
      // Plateformes flottantes (y=304 = 64px au-dessus du sol)
      { x: 192,  y: 304, w: 96,  h: 16 },
      { x: 480,  y: 304, w: 96,  h: 16 },
      { x: 820,  y: 304, w: 96,  h: 16 },
      { x: 1024, y: 304, w: 96,  h: 16 },
      { x: 1488, y: 304, w: 96,  h: 16 },
      { x: 1760, y: 304, w: 96,  h: 16 },
    ],
    coins: [
      // Sol
      { x:  80, y: 348 }, { x: 560, y: 348 }, { x: 1060, y: 348 }, { x: 1900, y: 348 },
      // Au-dessus des trous (osé !)
      { x: 658, y: 335 }, { x: 682, y: 335 },
      { x: 1300, y: 335 }, { x: 1324, y: 335 },
      // Sur les plateformes
      { x: 208, y: 280 }, { x: 240, y: 280 }, { x: 272, y: 280 },
      { x: 496, y: 280 }, { x: 528, y: 280 },
      { x: 836, y: 280 }, { x: 868, y: 280 },
      { x: 1040, y: 280 }, { x: 1072, y: 280 },
      { x: 1504, y: 280 }, { x: 1536, y: 280 },
      { x: 1776, y: 280 }, { x: 1808, y: 280 },
    ],
    enemies: [
      { x: 300,  y: 340, dir:  1, minX: 0,    maxX: 618 },
      { x: 900,  y: 340, dir: -1, minX: 720,  maxX: 1260 },
      { x: 1600, y: 340, dir:  1, minX: 1360, maxX: 2056 },
    ],
    goalX: 2010,
  },

  /* ── Niveau 2 : Trous & Ennemis ── */
  {
    worldWidth: 2400,
    playerStart: { x: 48, y: 340 },
    platforms: [
      // Sol (4 segments, trous croissants)
      { x: 0,    y: 368, w: 480,  h: 32 },
      { x: 576,  y: 368, w: 400,  h: 32 },
      { x: 1072, y: 368, w: 320,  h: 32 },
      { x: 1488, y: 368, w: 352,  h: 32 },
      { x: 1936, y: 368, w: 464,  h: 32 },
      // Flottantes
      { x: 160,  y: 288, w: 128, h: 16 },
      { x: 432,  y: 288, w: 128, h: 16 },
      { x: 608,  y: 288, w: 96,  h: 16 },
      { x: 848,  y: 256, w: 128, h: 16 },
      { x: 1040, y: 288, w: 80,  h: 16 },
      { x: 1152, y: 288, w: 128, h: 16 },
      { x: 1360, y: 256, w: 96,  h: 16 },
      { x: 1552, y: 288, w: 128, h: 16 },
      { x: 1808, y: 256, w: 96,  h: 16 },
      { x: 2064, y: 288, w: 128, h: 16 },
      { x: 2256, y: 288, w: 96,  h: 16 },
    ],
    coins: [
      { x:  96, y: 348 }, { x: 320, y: 348 }, { x: 700, y: 348 },
      { x: 1120, y: 348 }, { x: 1560, y: 348 }, { x: 2100, y: 348 },
      // Trous
      { x: 526, y: 335 }, { x: 550, y: 335 },
      { x: 1030, y: 335 }, { x: 1054, y: 335 },
      { x: 1462, y: 335 }, { x: 1486, y: 335 },
      { x: 1908, y: 335 }, { x: 1930, y: 335 },
      // Plateformes
      { x: 192, y: 264 }, { x: 224, y: 264 }, { x: 256, y: 264 },
      { x: 448, y: 264 }, { x: 480, y: 264 },
      { x: 864, y: 232 }, { x: 896, y: 232 }, { x: 928, y: 232 },
      { x: 1168, y: 264 }, { x: 1200, y: 264 },
      { x: 2080, y: 264 }, { x: 2112, y: 264 },
      { x: 2272, y: 264 }, { x: 2304, y: 264 },
    ],
    enemies: [
      { x: 200,  y: 340, dir:  1, minX: 0,    maxX: 458 },
      { x: 710,  y: 340, dir: -1, minX: 576,  maxX: 968 },
      { x: 1160, y: 340, dir:  1, minX: 1072, maxX: 1380 },
      { x: 1610, y: 340, dir: -1, minX: 1488, maxX: 1832 },
      { x: 2100, y: 340, dir:  1, minX: 1936, maxX: 2394 },
    ],
    goalX: 2330,
  },

  /* ── Niveau 3 : Le Gauntlet ── */
  {
    worldWidth: 2720,
    playerStart: { x: 48, y: 340 },
    platforms: [
      // Sol (petits îlots)
      { x: 0,    y: 368, w: 320,  h: 32 },
      { x: 416,  y: 368, w: 256,  h: 32 },
      { x: 768,  y: 368, w: 256,  h: 32 },
      { x: 1120, y: 368, w: 256,  h: 32 },
      { x: 1472, y: 368, w: 192,  h: 32 },
      { x: 1760, y: 368, w: 192,  h: 32 },
      { x: 2048, y: 368, w: 192,  h: 32 },
      { x: 2336, y: 368, w: 384,  h: 32 },
      // Flottantes (ponts et bonus)
      { x: 256,  y: 288, w: 80,  h: 16 },
      { x: 352,  y: 272, w: 80,  h: 16 },
      { x: 528,  y: 288, w: 96,  h: 16 },
      { x: 656,  y: 272, w: 80,  h: 16 },
      { x: 880,  y: 272, w: 96,  h: 16 },
      { x: 1040, y: 288, w: 80,  h: 16 },
      { x: 1200, y: 272, w: 96,  h: 16 },
      { x: 1360, y: 288, w: 80,  h: 16 },
      { x: 1600, y: 272, w: 96,  h: 16 },
      { x: 1680, y: 288, w: 80,  h: 16 },
      { x: 1872, y: 272, w: 96,  h: 16 },
      { x: 1968, y: 288, w: 80,  h: 16 },
      { x: 2160, y: 272, w: 96,  h: 16 },
      { x: 2256, y: 288, w: 80,  h: 16 },
      { x: 2432, y: 272, w: 128, h: 16 },
      { x: 2592, y: 288, w: 80,  h: 16 },
    ],
    coins: [
      { x:  80, y: 348 }, { x: 160, y: 348 },
      // Plateformes et chemins
      { x: 368, y: 248 }, { x: 544, y: 264 }, { x: 672, y: 248 },
      { x: 896, y: 248 }, { x: 1056, y: 264 },
      { x: 1216, y: 248 }, { x: 1376, y: 264 },
      { x: 1616, y: 248 }, { x: 1696, y: 264 },
      { x: 1888, y: 248 }, { x: 1984, y: 264 },
      { x: 2176, y: 248 }, { x: 2272, y: 264 },
      { x: 2448, y: 248 }, { x: 2480, y: 248 }, { x: 2512, y: 248 },
      // Trous (dangereux)
      { x: 370, y: 335 }, { x: 394, y: 335 },
      { x: 718, y: 335 }, { x: 742, y: 335 },
      { x: 1070, y: 335 }, { x: 1094, y: 335 },
      { x: 1422, y: 335 }, { x: 1446, y: 335 },
      { x: 1712, y: 335 }, { x: 1736, y: 335 },
      { x: 2004, y: 335 }, { x: 2028, y: 335 },
      { x: 2300, y: 335 }, { x: 2322, y: 335 },
    ],
    enemies: [
      { x: 160,  y: 340, dir:  1, minX: 0,    maxX: 296 },
      { x: 520,  y: 340, dir: -1, minX: 416,  maxX: 664 },
      { x: 860,  y: 340, dir:  1, minX: 768,  maxX: 1016 },
      { x: 1210, y: 340, dir: -1, minX: 1120, maxX: 1368 },
      { x: 1560, y: 340, dir:  1, minX: 1472, maxX: 1736 },
      { x: 1840, y: 340, dir: -1, minX: 1760, maxX: 2024 },
      { x: 2130, y: 340, dir:  1, minX: 2048, maxX: 2312 },
      { x: 2500, y: 340, dir: -1, minX: 2336, maxX: 2694 },
    ],
    goalX: 2640,
  },
];

export default class Platformer2D extends BaseGame {

  constructor(config) {
    super(config);
    this.state         = this._buildFullState();
    this._raf          = null;
    this._lastTime     = null;
    this._keys         = { left: false, right: false };
    this._jumpPressed  = false; // consommé chaque frame
  }

  _gameId() { return 'platformer-2d'; }

  /* ── Cycle de vie ──────────────────────────────────────────── */

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

  /* ── Actions publiques ─────────────────────────────────────── */

  start(options = {}) {
    const mode = options.mode ?? 'basique';
    this.state = { ...this._buildFullState(), status: 'playing', mode };
    this._loadLevel(0);
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  /* ── Boucle RAF ────────────────────────────────────────────── */

  _startLoop() {
    this._lastTime = null;
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

  /* ── Mise à jour ───────────────────────────────────────────── */

  _update(dt) {
    const { state } = this;
    if (state.status !== 'playing' || state.levelTransition) return;

    const f   = dt / 16.667;
    const cfg = this.config.gameplay;
    const { player, platforms, enemies, coins } = state;

    /* Mouvement horizontal */
    player.vx = 0;
    if (this._keys.left)  player.vx = -cfg.moveSpeed;
    if (this._keys.right) player.vx =  cfg.moveSpeed;
    if (player.vx !== 0) player.dir = player.vx > 0 ? 1 : -1;

    /* Saut */
    if (this._jumpPressed && player.grounded) {
      player.vy      = cfg.jumpForce;
      player.grounded = false;
    }
    this._jumpPressed = false;

    /* Gravité + vitesse terminale */
    player.vy = Math.min(player.vy + cfg.gravity * f, 18);

    /* Déplacement X + collisions X */
    player.x += player.vx * f;
    this._resolveX(player, platforms, cfg);
    player.x = Math.max(0, Math.min(player.x, state.worldWidth - cfg.playerW));

    /* Déplacement Y + collisions Y */
    player.grounded = false;
    player.y += player.vy * f;
    this._resolveY(player, platforms, cfg);

    /* Invincibilité post-dégat */
    if (player.invincible > 0) player.invincible--;

    /* Ennemis */
    for (const e of enemies) {
      e.x += e.dir * cfg.enemySpeed * f;
      if (e.x <= e.minX)              { e.x = e.minX;              e.dir =  1; }
      if (e.x + cfg.enemyW >= e.maxX) { e.x = e.maxX - cfg.enemyW; e.dir = -1; }
    }

    /* Pièces */
    const pcx = player.x + cfg.playerW / 2;
    const pcy = player.y + cfg.playerH / 2;
    const pickR = cfg.coinRadius + 12;
    for (const c of coins) {
      if (c.collected) continue;
      const dx = pcx - c.x, dy = pcy - c.y;
      if (dx * dx + dy * dy < pickR * pickR) {
        c.collected = true;
        state.score += this.config.scoring.coinValue;
        state.coinsLeft--;
        EventBus.emit('game:score-update', { score: state.score });
      }
    }

    /* Mort : tombé dans le vide */
    if (player.y > this.config.canvas.height + 64) {
      this._loseLife();
      return;
    }

    /* Collision ennemie */
    if (player.invincible <= 0) {
      const px = player.x + 3, py = player.y + 3;
      const pw = cfg.playerW - 6, ph = cfg.playerH - 3;
      for (const e of enemies) {
        if (this._overlap(px, py, pw, ph, e.x, e.y, cfg.enemyW, cfg.enemyH)) {
          this._loseLife();
          return;
        }
      }
    }

    /* Objectif atteint */
    if (Math.abs((player.x + cfg.playerW / 2) - state.goalX) < 40 && player.grounded) {
      this._nextLevel();
    }
  }

  _resolveX(player, platforms, cfg) {
    const pw = cfg.playerW, ph = cfg.playerH;
    for (const p of platforms) {
      if (!this._overlap(player.x, player.y, pw, ph, p.x, p.y, p.w, p.h)) continue;
      const overL = (player.x + pw) - p.x;
      const overR = (p.x + p.w) - player.x;
      if (overL < overR) { player.x = p.x - pw; }
      else               { player.x = p.x + p.w; }
      player.vx = 0;
    }
  }

  _resolveY(player, platforms, cfg) {
    const pw = cfg.playerW, ph = cfg.playerH;
    for (const p of platforms) {
      if (!this._overlap(player.x, player.y, pw, ph, p.x, p.y, p.w, p.h)) continue;
      const overTop = (player.y + ph) - p.y;
      const overBot = (p.y + p.h) - player.y;
      if (overTop < overBot) {
        player.y = p.y - ph;
        if (player.vy > 0) { player.vy = 0; player.grounded = true; }
      } else {
        player.y = p.y + p.h;
        if (player.vy < 0) player.vy = 0;
      }
    }
  }

  _overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  /* ── Vie & niveaux ─────────────────────────────────────────── */

  _loseLife() {
    const { state } = this;
    state.lives--;
    EventBus.emit('game:lives-update', { lives: state.lives });
    if (state.lives <= 0) {
      state.status = 'gameover';
      ScoreService.submit('platformer-2d', state.score);
      EventBus.emit('game:over', {
        score: state.score,
        best:  ScoreService.getBest('platformer-2d'),
      });
    } else {
      this._respawn();
    }
  }

  _respawn() {
    const { state } = this;
    const lvl = LEVELS[state.levelIndex];
    state.player.x          = lvl.playerStart.x;
    state.player.y          = lvl.playerStart.y;
    state.player.vx         = 0;
    state.player.vy         = 0;
    state.player.grounded   = false;
    state.player.invincible = 90;
    EventBus.emit('game:tick', { state, action: 'respawn' });
  }

  _nextLevel() {
    const { state } = this;
    const bonus = this.config.scoring.levelBonus + state.lives * this.config.scoring.livesBonus;
    state.score += bonus;
    EventBus.emit('game:score-update', { score: state.score });

    const nextIdx = state.levelIndex + 1;
    if (nextIdx >= LEVELS.length) {
      state.status = 'win';
      ScoreService.submit('platformer-2d', state.score);
      EventBus.emit('game:win', {
        score: state.score,
        best:  ScoreService.getBest('platformer-2d'),
      });
    } else {
      state.levelTransition = true;
      EventBus.emit('game:level-up', { level: nextIdx + 1 });
      setTimeout(() => {
        this._loadLevel(nextIdx);
        state.levelTransition = false;
        EventBus.emit('game:tick', { state, action: 'level-start' });
      }, 1800);
    }
  }

  _loadLevel(index) {
    const { state } = this;
    const lvl = LEVELS[index];
    state.levelIndex    = index;
    state.worldWidth    = lvl.worldWidth;
    state.platforms     = lvl.platforms.map(p => ({ ...p }));
    state.enemies       = lvl.enemies.map(e => ({ ...e }));
    state.coins         = lvl.coins.map(c => ({ ...c, collected: false }));
    state.coinsLeft     = state.coins.length;
    state.goalX         = lvl.goalX;
    state.player.x      = lvl.playerStart.x;
    state.player.y      = lvl.playerStart.y;
    state.player.vx     = 0;
    state.player.vy     = 0;
    state.player.grounded   = false;
    state.player.invincible = 0;
  }

  /* ── Contrôles ─────────────────────────────────────────────── */

  _bindControls() {
    const keys = this.config.controls.keyboard;

    this._onKeyDown = (e) => {
      if (keys.left.includes(e.code))    { e.preventDefault(); this._keys.left  = true; }
      if (keys.right.includes(e.code))   { e.preventDefault(); this._keys.right = true; }
      if (keys.jump.includes(e.code))    { e.preventDefault(); this._jumpPressed = true; }
      if (keys.pause.includes(e.code))   { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
      if (keys.restart.includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
    };

    this._onKeyUp = (e) => {
      if (keys.left.includes(e.code))  this._keys.left  = false;
      if (keys.right.includes(e.code)) this._keys.right = false;
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
  }

  _unbindControls() {
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
    if (this._onKeyUp)   window.removeEventListener('keyup',   this._onKeyUp);
  }

  /* ── État initial ──────────────────────────────────────────── */

  _buildFullState() {
    return {
      status:          'loading',
      mode:            'basique',
      levelIndex:      0,
      worldWidth:      LEVELS[0].worldWidth,
      score:           0,
      lives:           this.config.gameplay.lives,
      coinsLeft:       0,
      goalX:           LEVELS[0].goalX,
      platforms:       [],
      enemies:         [],
      coins:           [],
      levelTransition: false,
      player: {
        x: 48, y: 340,
        vx: 0, vy: 0,
        grounded:   false,
        invincible: 0,
        dir:        1,
      },
    };
  }
}
