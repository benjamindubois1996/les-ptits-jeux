/**
 * SpaceInvaders.js — Logique pure du jeu
 * Emplacement : /games/space-invaders/SpaceInvaders.js
 *
 * Mécanique :
 *  - Grille 11×5 d'aliens se déplaçant en groupe (gauche/droite + descente)
 *  - Joueur en bas : déplacement continu, 1 tir à la fois
 *  - Tirs aliens : un tireur aléatoire à intervalle décroissant
 *  - 4 boucliers en pixel-art qui s'érodent case par case
 *  - Vaisseau mystère bonus (apparition périodique)
 *  - Vies (3), niveaux infinis avec difficulté croissante
 *  - Machine à états : idle → playing → paused | levelup | gameover
 *
 * Communication : uniquement via EventBus
 * Update : appelé chaque frame par SpaceInvadersRenderer
 */

import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// Template du bouclier (8 colonnes × 5 rangées)
const SHIELD_TEMPLATE = [
  [0, 1, 1, 1, 1, 1, 1, 0],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 0, 0, 1, 1, 1],
  [1, 1, 0, 0, 0, 0, 1, 1],
];

export default class SpaceInvaders extends BaseGame {

  constructor(config) {
    super(config);
    this.state  = this._buildInitialState();
    this._keys  = {};
    this._onKeyDown    = null;
    this._onKeyUp      = null;
    this._nextBulletId = 0;
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  _gameId() { return 'space-invaders'; }

  init() {
    this._bindControls();
    this._setupEventBusBindings();
    EventBus.emit('game:ready', { gameId: 'space-invaders' });
  }

  /** game:restart → soumettre le score et relancer depuis le niveau 1 */
  restart() { this._restart(); }

  start(level = 1) {
    const best  = this.state.best;
    this.state  = this._buildInitialState();
    this.state.status = 'playing';
    this.state.level  = level;
    this.state.best   = best;
    EventBus.emit('game:started', { state: this.state });
  }

  destroy() {
    super.destroy();
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
    if (this._onKeyUp)   window.removeEventListener('keyup',   this._onKeyUp);
  }

  /* ============================================================
     BOUCLE DE MISE À JOUR (appelée par le Renderer chaque frame)
     ============================================================ */

  update(dt) {
    const s = this.state;

    if (s.status === 'levelup') {
      s.levelupTimer -= dt * 1000;
      if (s.levelupTimer <= 0) this._nextLevel();
      return;
    }

    if (s.status !== 'playing') return;

    this._updatePlayer(dt);
    this._updatePlayerBullet(dt);
    this._updateAliens(dt);
    this._updateAlienBullets(dt);
    this._updateMystery(dt);
    this._updateExplosions(dt);
    this._checkCollisions();

    // Nettoyage balles aliens mortes
    s.alienBullets = s.alienBullets.filter(b => !b.dead);

    // Timer d'invincibilité joueur
    if (s.player.invincible) {
      s.player.invTimer -= dt * 1000;
      if (s.player.invTimer <= 0) s.player.invincible = false;
    }
  }

  togglePause() {
    if (this.state.status === 'playing') {
      this.state.status = 'paused';
    } else if (this.state.status === 'paused') {
      this.state.status = 'playing';
    }
  }

  /* ============================================================
     CONTRÔLES
     ============================================================ */

  _bindControls() {
    const kb = this.config.controls.keyboard;

    this._onKeyDown = (e) => {
      this._keys[e.code] = true;

      // Bloquer le scroll sur les touches de jeu
      const allKeys = [...kb.left, ...kb.right, ...kb.shoot, ...kb.pause, ...kb.restart];
      if (allKeys.includes(e.code)) e.preventDefault();

      // Démarrer depuis idle
      if (this.state.status === 'idle') {
        const startKeys = [...kb.left, ...kb.right, ...kb.shoot];
        if (startKeys.includes(e.code)) this.start(1);
        return;
      }

      if (kb.restart.includes(e.code)) { this._restart(); return; }
      if (kb.pause.includes(e.code))   { this.togglePause(); return; }

      if (this.state.status !== 'playing') return;

      if (kb.shoot.includes(e.code)) this._tryShoot();
    };

    this._onKeyUp = (e) => { delete this._keys[e.code]; };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);

    // EventBus (boutons GameShell) — gérés par BaseGame._setupEventBusBindings()
  }

  _restart() {
    if (['playing', 'paused'].includes(this.state.status) && this.state.score > 0) {
      ScoreService.submit('space-invaders', this.state.score);
    }
    this.start(1);
  }

  /* ============================================================
     JOUEUR
     ============================================================ */

  _updatePlayer(dt) {
    const s  = this.state;
    const kb = this.config.controls.keyboard;
    const w  = this.config.world;
    const p  = s.player;

    const goLeft  = kb.left.some(k  => this._keys[k]);
    const goRight = kb.right.some(k => this._keys[k]);

    if (goLeft)  p.x -= w.playerSpeed * dt;
    if (goRight) p.x += w.playerSpeed * dt;

    p.x = Math.max(w.edgeMarginL, Math.min(w.W - w.edgeMarginR - w.playerW, p.x));
  }

  /* ============================================================
     TIRS JOUEUR
     ============================================================ */

  _tryShoot() {
    const s = this.state;
    if (s.playerBullet.active) return;

    const p = s.player;
    const w = this.config.world;
    s.playerBullet = {
      x:      p.x + w.playerW / 2 - w.bulletW / 2,
      y:      w.playerY - w.playerBulletH,
      active: true,
    };
  }

  _updatePlayerBullet(dt) {
    const b = this.state.playerBullet;
    if (!b.active) return;
    b.y -= this.config.world.playerBulletSpeed * dt;
    if (b.y + this.config.world.playerBulletH < 0) b.active = false;
  }

  /* ============================================================
     TIRS ALIENS
     ============================================================ */

  _updateAlienBullets(dt) {
    const s  = this.state;
    const w  = this.config.world;
    const gp = this.config.gameplay;

    // Déplacer les balles
    for (const b of s.alienBullets) {
      b.y += w.alienBulletSpeed * dt;
      if (b.y > w.H + 20) b.dead = true;
    }

    // Tirer depuis un alien aléatoire
    s.alienBulletTimer -= dt * 1000;
    if (s.alienBulletTimer <= 0 && s.aliveCount > 0) {
      const alive = s.aliens.filter(a => a.alive);
      if (alive.length > 0) {
        const shooter = alive[Math.floor(Math.random() * alive.length)];
        const ax = this._alienX(shooter);
        const ay = this._alienY(shooter);
        s.alienBullets.push({
          id:   ++this._nextBulletId,
          x:    ax + w.alienW / 2 - w.bulletW / 2,
          y:    ay + w.alienH,
          dead: false,
        });
      }

      // Intervalle raccourcit avec la progression du niveau et les aliens éliminés
      const killRatio = 1 - s.aliveCount / s.totalAliens;
      const levelMult = 1 - Math.min((s.level - 1) * 0.08, 0.5);
      const interval  = (gp.alienBulletIntervalInit - killRatio * (gp.alienBulletIntervalInit - gp.alienBulletIntervalMin)) * levelMult;
      s.alienBulletTimer = Math.max(gp.alienBulletIntervalMin, interval);
    }
  }

  /* ============================================================
     MOUVEMENT DES ALIENS
     ============================================================ */

  _updateAliens(dt) {
    const s  = this.state;
    const w  = this.config.world;
    const gp = this.config.gameplay;

    // Vitesse : proportionnelle aux aliens restants, accélère chaque niveau
    const ratio      = s.aliveCount / s.totalAliens;
    const levelBoost = 1 + (s.level - 1) * 0.10;
    s.alienStepTime  = Math.max(gp.stepTimeMin, gp.stepTimeInit * ratio / levelBoost);

    s.alienStepTimer += dt;
    if (s.alienStepTimer < s.alienStepTime) return;
    s.alienStepTimer = 0;

    // Vérifier les limites
    const { minCol, maxCol, maxRow } = this._alienBounds();
    const leftX  = w.alienX0 + minCol * w.alienColGap + s.groupOffsetX;
    const rightX = w.alienX0 + maxCol * w.alienColGap + s.groupOffsetX + w.alienW;
    const botY   = w.alienY0 + maxRow * w.alienRowGap + s.groupOffsetY + w.alienH;

    let drop = false;
    if (s.alienDir === 1  && rightX + gp.stepX > w.W - w.edgeMarginR) drop = true;
    if (s.alienDir === -1 && leftX  - gp.stepX < w.edgeMarginL)        drop = true;

    if (drop) {
      s.groupOffsetY += gp.dropY;
      s.alienDir     *= -1;

      // Aliens atteignent le sol → game over
      if (botY + gp.dropY >= w.playerY - 6) {
        this._gameOver();
        return;
      }
    } else {
      s.groupOffsetX += gp.stepX * s.alienDir;
    }
  }

  _alienBounds() {
    const alive = this.state.aliens.filter(a => a.alive);
    if (!alive.length) return { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 };
    const cols = alive.map(a => a.col);
    const rows = alive.map(a => a.row);
    return {
      minCol: Math.min(...cols),
      maxCol: Math.max(...cols),
      minRow: Math.min(...rows),
      maxRow: Math.max(...rows),
    };
  }

  /* ============================================================
     VAISSEAU MYSTÈRE
     ============================================================ */

  _updateMystery(dt) {
    const s  = this.state;
    const w  = this.config.world;
    const gp = this.config.gameplay;
    const m  = s.mystery;

    if (m.active) {
      m.x += w.mysterySpeed * m.dir * dt;
      // Sortie de l'écran
      if ((m.dir === 1 && m.x > w.W + w.mysteryW + 10) ||
          (m.dir === -1 && m.x < -w.mysteryW * 2)) {
        m.active = false;
        this._scheduleMystery();
      }
    }

    // Affichage des points après destruction
    if (m.showPoints) {
      m.showTimer -= dt * 1000;
      if (m.showTimer <= 0) m.showPoints = false;
    }

    // Délai avant prochaine apparition
    if (!m.active) {
      s.mysteryTimer -= dt * 1000;
      if (s.mysteryTimer <= 0) this._spawnMystery();
    }
  }

  _spawnMystery() {
    const s  = this.state;
    const w  = this.config.world;
    const gp = this.config.gameplay;
    const m  = s.mystery;

    m.dir    = Math.random() < 0.5 ? 1 : -1;
    m.x      = m.dir === 1 ? -w.mysteryW - 10 : w.W + 10;
    m.y      = w.mysteryY;
    m.active = true;
    m.points = gp.mysteryPoints[Math.floor(Math.random() * gp.mysteryPoints.length)];
    m.lastX  = m.x;
  }

  _scheduleMystery() {
    const gp = this.config.gameplay;
    this.state.mysteryTimer = gp.mysteryIntervalMin +
      Math.random() * (gp.mysteryIntervalMax - gp.mysteryIntervalMin);
  }

  /* ============================================================
     DÉTECTION DE COLLISIONS
     ============================================================ */

  _checkCollisions() {
    const s = this.state;
    const pb = s.playerBullet;

    // Balle joueur → aliens, mystère, boucliers
    if (pb.active) {
      this._pbVsAliens();
      if (pb.active) this._pbVsMystery();
      if (pb.active) this._pbVsShield(pb, true);
    }

    // Balles aliens → joueur et boucliers
    for (const b of s.alienBullets) {
      if (b.dead) continue;
      this._abVsPlayer(b);
      if (!b.dead) this._pbVsShield(b, false);
    }
  }

  _pbVsAliens() {
    const s  = this.state;
    const b  = s.playerBullet;
    const w  = this.config.world;
    const gp = this.config.gameplay;

    for (const alien of s.aliens) {
      if (!alien.alive) continue;
      const ax = this._alienX(alien);
      const ay = this._alienY(alien);

      if (this._overlap(b.x, b.y, w.bulletW, w.playerBulletH, ax, ay, w.alienW, w.alienH)) {
        alien.alive  = false;
        b.active     = false;
        s.aliveCount -= 1;
        s.score      += alien.points;
        if (s.score > s.best) s.best = s.score;

        s.explosions.push({ x: ax + w.alienW / 2, y: ay + w.alienH / 2, timer: 380, maxTimer: 380 });

        if (s.aliveCount === 0) {
          ScoreService.submit('space-invaders', s.score);
          s.status      = 'levelup';
          s.levelupTimer = gp.levelupDelay;
        }
        return;
      }
    }
  }

  _pbVsMystery() {
    const s  = this.state;
    const b  = s.playerBullet;
    const w  = this.config.world;
    const m  = s.mystery;

    if (!m.active || m.showPoints) return;

    if (this._overlap(b.x, b.y, w.bulletW, w.playerBulletH, m.x, m.y, w.mysteryW, w.mysteryH)) {
      b.active     = false;
      s.score     += m.points;
      if (s.score > s.best) s.best = s.score;
      m.active     = false;
      m.lastX      = m.x;
      m.showPoints = true;
      m.showTimer  = 1200;
      s.explosions.push({ x: m.x + w.mysteryW / 2, y: m.y + w.mysteryH / 2, timer: 400, maxTimer: 400 });
      this._scheduleMystery();
    }
  }

  _pbVsShield(bullet, isPlayer) {
    const s        = this.state;
    const w        = this.config.world;
    const cs       = w.shieldCellSize;
    const bh       = isPlayer ? w.playerBulletH : w.alienBulletH;

    for (const shield of s.shields) {
      const rows = shield.cells.length;
      const cols = shield.cells[0].length;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!shield.cells[r][c]) continue;
          const cx = shield.x + c * cs;
          const cy = shield.y + r * cs;

          if (this._overlap(bullet.x, bullet.y, w.bulletW, bh, cx, cy, cs, cs)) {
            shield.cells[r][c] = false;
            bullet.active = false;
            bullet.dead   = true;
            this._damageShield(shield, r, c);
            return;
          }
        }
      }
    }
  }

  _damageShield(shield, r, c) {
    // Détruire aléatoirement quelques cellules adjacentes
    const rows = shield.cells.length;
    const cols = shield.cells[0].length;
    const neighbors = [
      [r-1, c], [r+1, c], [r, c-1], [r, c+1],
      [r-1, c-1], [r-1, c+1], [r+1, c-1], [r+1, c+1],
    ].filter(([nr, nc]) => nr >= 0 && nr < rows && nc >= 0 && nc < cols && shield.cells[nr][nc]);

    neighbors.sort(() => Math.random() - 0.5);
    const toKill = neighbors.slice(0, 1 + Math.floor(Math.random() * 3));
    for (const [nr, nc] of toKill) {
      if (Math.random() < 0.55) shield.cells[nr][nc] = false;
    }
  }

  _abVsPlayer(bullet) {
    const s = this.state;
    const w = this.config.world;
    const p = s.player;

    if (p.invincible) return;

    if (this._overlap(bullet.x, bullet.y, w.bulletW, w.alienBulletH, p.x, w.playerY, w.playerW, w.playerH)) {
      bullet.dead = true;
      this._playerHit();
    }
  }

  _playerHit() {
    const s  = this.state;
    const w  = this.config.world;
    const gp = this.config.gameplay;

    s.lives -= 1;
    s.explosions.push({
      x: s.player.x + w.playerW / 2,
      y: w.playerY + w.playerH / 2,
      timer: 600, maxTimer: 600,
    });

    if (s.lives <= 0) {
      this._gameOver();
    } else {
      s.player.invincible = true;
      s.player.invTimer   = gp.invincibleDuration;
      s.player.x          = (w.W - w.playerW) / 2;
      s.alienBullets      = [];
    }
  }

  /* ============================================================
     EXPLOSIONS
     ============================================================ */

  _updateExplosions(dt) {
    for (const e of this.state.explosions) e.timer -= dt * 1000;
    this.state.explosions = this.state.explosions.filter(e => e.timer > 0);
  }

  /* ============================================================
     FIN DE PARTIE / NIVEAU SUIVANT
     ============================================================ */

  _gameOver() {
    const s = this.state;
    s.status = 'gameover';
    const { isRecord } = ScoreService.submit('space-invaders', s.score);
    EventBus.emit('game:over', { state: s, score: s.score, isRecord });
  }

  _nextLevel() {
    const prev = this.state;
    this.state  = this._buildInitialState();
    this.state.status = 'playing';
    this.state.level  = prev.level + 1;
    this.state.score  = prev.score;
    this.state.best   = prev.best;
    this.state.lives  = Math.min(prev.lives + 1, 5); // +1 vie bonus, max 5
  }

  /* ============================================================
     UTILITAIRES
     ============================================================ */

  _alienX(alien) {
    const w = this.config.world;
    return w.alienX0 + alien.col * w.alienColGap + this.state.groupOffsetX;
  }

  _alienY(alien) {
    const w = this.config.world;
    return w.alienY0 + alien.row * w.alienRowGap + this.state.groupOffsetY;
  }

  _overlap(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  }

  /* ============================================================
     ÉTAT INITIAL
     ============================================================ */

  _buildInitialState() {
    const gp = this.config.gameplay;
    const w  = this.config.world;

    // Grille d'aliens
    const aliens = [];
    for (let row = 0; row < gp.rows; row++) {
      for (let col = 0; col < gp.cols; col++) {
        aliens.push({
          id:     row * gp.cols + col,
          row,
          col,
          alive:  true,
          points: gp.alienRowPoints[row],
          type:   row === 0 ? 'top' : row <= 2 ? 'mid' : 'bot',
        });
      }
    }

    const total = gp.rows * gp.cols;

    return {
      status:    'idle',
      score:     0,
      best:      ScoreService.getBest('space-invaders'),
      lives:     gp.lives,
      level:     1,

      // Aliens
      aliens,
      totalAliens:      total,
      aliveCount:       total,
      groupOffsetX:     0,
      groupOffsetY:     0,
      alienDir:         1,
      alienStepTime:    gp.stepTimeInit,
      alienStepTimer:   0,
      alienBulletTimer: gp.alienBulletIntervalInit,

      // Joueur
      player: {
        x:          (w.W - w.playerW) / 2,
        invincible: false,
        invTimer:   0,
      },

      // Tirs
      playerBullet: { x: 0, y: 0, active: false },
      alienBullets: [],

      // Vaisseau mystère
      mystery: {
        active:     false,
        x:          0,
        y:          w.mysteryY,
        dir:        1,
        points:     100,
        lastX:      0,
        showPoints: false,
        showTimer:  0,
      },
      mysteryTimer: gp.mysteryIntervalMin + Math.random() * (gp.mysteryIntervalMax - gp.mysteryIntervalMin),

      // Boucliers
      shields: this._buildShields(),

      // Effets
      explosions:   [],
      levelupTimer: 0,
    };
  }

  _buildShields() {
    const w   = this.config.world;
    const gp  = this.config.gameplay;
    const cs  = w.shieldCellSize;
    const sw  = SHIELD_TEMPLATE[0].length * cs; // largeur d'un bouclier
    const shields = [];

    const usable  = w.W - 2 * w.edgeMarginL;
    const spacing = usable / gp.shieldCount;

    for (let i = 0; i < gp.shieldCount; i++) {
      const cx = w.edgeMarginL + (i + 0.5) * spacing;
      shields.push({
        x:     cx - sw / 2,
        y:     w.shieldY,
        cells: SHIELD_TEMPLATE.map(row => row.map(v => v === 1)),
      });
    }

    return shields;
  }
}
