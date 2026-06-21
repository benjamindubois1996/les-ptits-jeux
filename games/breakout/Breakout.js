/**
 * Breakout — Logique de jeu
 *
 * États possibles :
 *   idle      → écran titre, attente du joueur
 *   ready     → balle posée sur la raquette, attente du lancer
 *   playing   → partie en cours
 *   paused    → pause
 *   gameover  → plus de vies
 *
 * Événements émis :
 *   game:ready, game:tick, game:frame
 *   game:score-update, game:brick-hit
 *   game:life-lost, game:level-up, game:over
 *   game:paused, game:resumed
 */

import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class Breakout extends BaseGame {

  constructor(config) {
    super(config);
    this.state     = this._buildState();
    this._raf      = null;
    this._lastTime = null;
    this._keys     = { left: false, right: false };
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  _gameId() { return 'breakout'; }

  init() {
    this._bindControls();
    this._setupEventBusBindings();
    EventBus.emit('game:ready', { gameId: 'breakout' });
    EventBus.emit('game:tick',  { state: this.state, action: 'init' });
    this._startLoop();
  }

  destroy() {
    super.destroy();
    this._stopLoop();
    this._unbindControls();
  }

  /* ============================================================
     DÉMARRAGE / RESTART
     ============================================================ */

  start() {
    this.state = this._buildState();
    this.state.status = 'ready';
    this._resetBall();
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'start' });
  }

  restart() {
    this.state = this._buildState();
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  /* ============================================================
     LANCER LA BALLE
     ============================================================ */

  launch() {
    if (this.state.status !== 'ready') return;
    const speed = this.config.gameplay.ball.initialSpeed * this._getSpeedMult();
    const angle = (Math.random() - 0.5) * (Math.PI / 3); // −30° à +30° par rapport au haut
    this.state.ball.vx = Math.sin(angle) * speed;
    this.state.ball.vy = -Math.cos(angle) * speed; // toujours vers le haut
    this.state.status  = 'playing';
    EventBus.emit('game:tick', { state: this.state, action: 'launch' });
  }

  /* ============================================================
     PAUSE
     ============================================================ */

  togglePause() {
    if (this.state.status === 'playing') {
      this.state.status = 'paused';
      EventBus.emit('game:paused',  { state: this.state });
    } else if (this.state.status === 'paused') {
      this.state.status = 'playing';
      EventBus.emit('game:resumed', { state: this.state });
    }
  }

  /* ============================================================
     BOUCLE DE JEU
     ============================================================ */

  _startLoop() {
    this._lastTime = null;
    const loop = (timestamp) => {
      if (!this._lastTime) this._lastTime = timestamp;
      const dt = Math.min((timestamp - this._lastTime) / 16.667, 3); // normalisé à 1 = 60fps
      this._lastTime = timestamp;

      this._update(dt);
      EventBus.emit('game:frame', { state: this.state });
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _stopLoop() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  /* ============================================================
     MISE À JOUR PHYSIQUE
     ============================================================ */

  _update(dt) {
    const s = this.state;
    const { canvas, paddle, ball } = this.config.gameplay;
    const W      = canvas.width;
    const padY   = this._getPaddleY();

    // Déplacement raquette (ready + playing)
    if (s.status === 'ready' || s.status === 'playing') {
      const spd = paddle.speed * dt;
      if (this._keys.left)  s.paddle.x = Math.max(0,                  s.paddle.x - spd);
      if (this._keys.right) s.paddle.x = Math.min(W - paddle.width,   s.paddle.x + spd);
      s.paddle.y = padY;
    }

    // Balle collée à la raquette en état "ready"
    if (s.status === 'ready') {
      s.ball.x = s.paddle.x + paddle.width / 2;
      s.ball.y = padY - ball.radius - 2;
      return;
    }

    if (s.status !== 'playing') return;

    // Déplacement balle
    s.ball.x += s.ball.vx * dt;
    s.ball.y += s.ball.vy * dt;

    const r = ball.radius;
    const H = canvas.height;

    // Rebond murs gauche / droite
    if (s.ball.x - r < 0) {
      s.ball.x  = r;
      s.ball.vx = Math.abs(s.ball.vx);
    } else if (s.ball.x + r > W) {
      s.ball.x  = W - r;
      s.ball.vx = -Math.abs(s.ball.vx);
    }

    // Rebond plafond
    if (s.ball.y - r < 0) {
      s.ball.y  = r;
      s.ball.vy = Math.abs(s.ball.vy);
    }

    // Sortie par le bas → vie perdue
    if (s.ball.y - r > H) {
      this._loseLife();
      return;
    }

    // Collision raquette
    this._checkPaddleCollision(padY);

    // Collisions briques
    this._checkBrickCollisions();

    // Victoire de niveau : toutes les briques détruites
    if (s.bricks.every(row => row.every(b => !b))) {
      this._nextLevel();
    }
  }

  /* ============================================================
     COLLISION RAQUETTE
     ============================================================ */

  _checkPaddleCollision(padY) {
    const { paddle, ball } = this.config.gameplay;
    const s  = this.state;
    const r  = ball.radius;
    const px = s.paddle.x;
    const pw = paddle.width;
    const ph = paddle.height;

    if (
      s.ball.vy > 0 &&
      s.ball.y + r >= padY &&
      s.ball.y - r <= padY + ph &&
      s.ball.x + r >= px &&
      s.ball.x - r <= px + pw
    ) {
      // Angle selon la position de frappe (bord = angle prononcé)
      const hit   = (s.ball.x - px) / pw; // 0..1
      const angle = (hit - 0.5) * (Math.PI * 0.65); // −59° à +59°
      const speed = Math.hypot(s.ball.vx, s.ball.vy);

      s.ball.vx = Math.sin(angle) * speed;
      s.ball.vy = -Math.abs(Math.cos(angle)) * speed;
      s.ball.y  = padY - r - 1; // éviter double-collision
    }
  }

  /* ============================================================
     COLLISION BRIQUES
     ============================================================ */

  _checkBrickCollisions() {
    const { bricks: bCfg, canvas, ball: ballCfg, scoring } = {
      ...this.config.gameplay,
      scoring: this.config.scoring
    };
    const W      = canvas.width;
    const brickW = (W - bCfg.offsetLeft * 2 - bCfg.padding * (bCfg.cols - 1)) / bCfg.cols;
    const brickH = bCfg.height;
    const r      = ballCfg.radius;
    const b      = this.state.ball;

    for (let row = 0; row < bCfg.rows; row++) {
      for (let col = 0; col < bCfg.cols; col++) {
        if (!this.state.bricks[row][col]) continue;

        const bx = bCfg.offsetLeft + col * (brickW + bCfg.padding);
        const by = bCfg.offsetTop  + row * (brickH + bCfg.padding);

        // Test cercle vs AABB
        const nearX = Math.max(bx, Math.min(b.x, bx + brickW));
        const nearY = Math.max(by, Math.min(b.y, by + brickH));
        const dx    = b.x - nearX;
        const dy    = b.y - nearY;

        if (dx * dx + dy * dy >= r * r) continue;

        // Profondeur de pénétration → détermine côté touché
        const overlapLeft   = b.x + r - bx;
        const overlapRight  = bx + brickW - (b.x - r);
        const overlapTop    = b.y + r - by;
        const overlapBottom = by + brickH - (b.y - r);

        const minH = Math.min(overlapLeft, overlapRight);
        const minV = Math.min(overlapTop,  overlapBottom);

        if (minV <= minH) {
          b.vy = -b.vy;
        } else {
          b.vx = -b.vx;
        }

        // Destruction + score
        this.state.bricks[row][col] = false;
        const points = this.config.scoring.brickPoints[row] ?? 10;
        this.state.score += points;

        ScoreService.submit('breakout', this.state.score);
        EventBus.emit('game:score-update', { score: this.state.score });
        EventBus.emit('game:brick-hit', {
          row, col, points,
          x: bx, y: by, w: brickW, h: brickH
        });

        return; // une seule brique par frame (évite les glitches de double-rebond)
      }
    }
  }

  /* ============================================================
     VIE / NIVEAU / GAME OVER
     ============================================================ */

  _loseLife() {
    this.state.lives--;
    EventBus.emit('game:life-lost', { lives: this.state.lives });

    if (this.state.lives <= 0) {
      this._gameOver();
      return;
    }

    this.state.status = 'ready';
    this._resetBall();
    EventBus.emit('game:tick', { state: this.state, action: 'life-lost' });
  }

  _nextLevel() {
    this.state.level++;
    this.state.bricks = this._buildBricks();
    this.state.status = 'ready';
    this._resetBall();
    EventBus.emit('game:level-up',  { level: this.state.level });
    EventBus.emit('game:tick',      { state: this.state, action: 'level-up' });
  }

  _gameOver() {
    this.state.status = 'gameover';
    EventBus.emit('game:over', {
      score: this.state.score,
      level: this.state.level,
      best:  ScoreService.getBest('breakout')
    });
  }

  /* ============================================================
     HELPERS
     ============================================================ */

  /** Y du bord supérieur de la raquette */
  _getPaddleY() {
    const { canvas, paddle } = this.config.gameplay;
    return canvas.height - 35 - paddle.height;
  }

  /** Multiplicateur de vitesse selon le niveau (20 % par niveau) */
  _getSpeedMult() {
    return 1 + (this.state.level - 1) * 0.2;
  }

  _resetBall() {
    const { paddle, ball } = this.config.gameplay;
    const padY = this._getPaddleY();
    this.state.ball = {
      x: this.state.paddle.x + paddle.width / 2,
      y: padY - ball.radius - 2,
      vx: 0,
      vy: 0
    };
  }

  /* ============================================================
     CONTRÔLES
     ============================================================ */

  _bindControls() {
    const keys = this.config.controls?.keyboard || {};

    this._onKeyDown = (e) => {
      const s = this.state.status;

      if (keys.restart?.includes(e.code)) {
        e.preventDefault();
        this.restart();
        return;
      }

      if (keys.left?.includes(e.code))  { e.preventDefault(); this._keys.left  = true; return; }
      if (keys.right?.includes(e.code)) { e.preventDefault(); this._keys.right = true; return; }

      // P : pause standard (en plus de l'espace, qui sert aussi à lancer la balle)
      if (e.code === 'KeyP' && (s === 'playing' || s === 'paused')) {
        e.preventDefault();
        this.togglePause();
        return;
      }

      if (keys.launch?.includes(e.code)) {
        e.preventDefault();
        if (s === 'idle' || s === 'gameover') { this.start();       return; }
        if (s === 'ready')                    { this.launch();      return; }
        if (s === 'playing' || s === 'paused'){ this.togglePause(); return; }
      }
    };

    this._onKeyUp = (e) => {
      if (keys.left?.includes(e.code))  this._keys.left  = false;
      if (keys.right?.includes(e.code)) this._keys.right = false;
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);

    // EventBus (boutons GameShell) — gérés par BaseGame._setupEventBusBindings()
  }

  _unbindControls() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
  }

  /* ============================================================
     ÉTAT INITIAL
     ============================================================ */

  _buildState() {
    const { canvas, paddle } = this.config.gameplay;
    const W    = canvas.width;
    const padY = canvas.height - 35 - paddle.height;

    return {
      status: 'idle',
      score:  0,
      lives:  this.config.gameplay.lives,
      level:  1,
      paddle: {
        x: (W - paddle.width) / 2,
        y: padY
      },
      ball: {
        x:  W / 2,
        y:  padY - this.config.gameplay.ball.radius - 2,
        vx: 0,
        vy: 0
      },
      bricks: this._buildBricks()
    };
  }

  _buildBricks() {
    const { rows, cols } = this.config.gameplay.bricks;
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => true)
    );
  }
}
