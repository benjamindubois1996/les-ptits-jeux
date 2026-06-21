/**
 * Pong — Logique de jeu (v2 : taille terrain, points à gagner, IA ou J2)
 *
 * États possibles :
 *   idle     → écran de sélection
 *   serving  → balle au centre, attente du service
 *   playing  → partie en cours
 *   paused   → pause
 *   gameover → un camp a atteint maxScore
 *
 * Événements émis :
 *   game:ready, game:start, game:tick, game:frame
 *   game:score-update, game:point, game:over
 *   game:paused, game:resumed
 *   pong:start-requested  (Space en mode idle → délégué au renderer)
 */

import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class Pong extends BaseGame {

  constructor(config) {
    super(config);
    this.state     = this._buildState();
    this._raf      = null;
    this._lastTime = null;
    this._keys     = { up: false, down: false };   // J1 (W/S + flèches en mode IA)
    this._keysJ2   = { up: false, down: false };   // J2 clavier (flèches)
    this._mouseY   = null;                          // J2 souris
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  _gameId() { return 'pong'; }

  init() {
    this._bindControls();
    this._setupEventBusBindings();
    EventBus.emit('game:ready', { gameId: 'pong' });
    EventBus.emit('game:tick',  { state: this.state, action: 'init' });
    this._startLoop();
  }

  destroy() {
    super.destroy();
    this._stopLoop();
    this._unbindControls();
  }

  /* ============================================================
     DÉMARRAGE AVEC PARAMÈTRES
     ============================================================ */

  start(settings = {}) {
    const { canvasSizes, defaultSize } = this.config.gameplay;
    const size     = settings.size     ?? defaultSize;
    const maxScore = settings.maxScore ?? 7;
    const opponent = settings.opponent ?? 'ai';
    const canvas   = { ...canvasSizes[size] };
    const scale    = Math.sqrt(canvas.width / 600); // scaling progressif

    const { paddle } = this.config.gameplay;
    const pH = paddle.height;

    this.state = {
      status:     'serving',
      canvas,
      scale,
      maxScore,
      opponent,
      scoreLeft:  0,
      scoreRight: 0,
      player:     { y: (canvas.height - pH) / 2 },
      ai:         { y: (canvas.height - pH) / 2 },
      ball:       { x: canvas.width / 2, y: canvas.height / 2, vx: 0, vy: 0 },
      _serveDir:  1,
      _aiError:   0
    };

    this._resetBall(1);
    EventBus.emit('game:start', { canvas, maxScore, opponent });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  restart() {
    this.state = this._buildState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  /* ============================================================
     SERVICE
     ============================================================ */

  launch() {
    if (this.state.status !== 'serving') return;
    const angle = (Math.random() - 0.5) * (Math.PI / 3); // −30° à +30°
    const speed = this.config.gameplay.ball.baseSpeed * this.state.scale;
    const dir   = this.state._serveDir;
    this.state.ball.vx = Math.cos(angle) * speed * dir;
    this.state.ball.vy = Math.sin(angle) * speed;
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
     J2 SOURIS
     ============================================================ */

  setJ2MouseY(y) {
    this._mouseY = y;
  }

  /* ============================================================
     BOUCLE
     ============================================================ */

  _startLoop() {
    this._lastTime = null;
    const loop = (ts) => {
      if (!this._lastTime) this._lastTime = ts;
      const dt = Math.min((ts - this._lastTime) / 16.667, 3);
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

  /* ============================================================
     MISE À JOUR PHYSIQUE
     ============================================================ */

  _update(dt) {
    const s = this.state;
    if (s.status !== 'playing') return;

    const { paddle, ball: bCfg } = this.config.gameplay;
    const W  = s.canvas.width;
    const H  = s.canvas.height;
    const r  = bCfg.baseRadius;
    const pH = paddle.height;

    // J1 — W/S en J2-mode, W/S + flèches en mode IA
    const up1   = this._keys.up   || (s.opponent === 'ai' && this._keysJ2.up);
    const down1 = this._keys.down || (s.opponent === 'ai' && this._keysJ2.down);
    const spd1  = paddle.baseSpeed * s.scale * dt;
    if (up1)   s.player.y = Math.max(0,      s.player.y - spd1);
    if (down1) s.player.y = Math.min(H - pH, s.player.y + spd1);

    // J2 / IA
    if (s.opponent === 'ai') {
      this._updateAI(dt);
    } else if (s.opponent === 'j2-keys') {
      const spd2 = paddle.baseSpeed * s.scale * dt;
      if (this._keysJ2.up)   s.ai.y = Math.max(0,      s.ai.y - spd2);
      if (this._keysJ2.down) s.ai.y = Math.min(H - pH, s.ai.y + spd2);
    } else if (s.opponent === 'j2-mouse') {
      if (this._mouseY !== null) {
        const targetY = this._mouseY - pH / 2;
        s.ai.y = Math.max(0, Math.min(H - pH, targetY));
      }
    }

    // Balle
    s.ball.x += s.ball.vx * dt;
    s.ball.y += s.ball.vy * dt;

    // Rebond haut / bas
    if (s.ball.y - r < 0) {
      s.ball.y  = r;
      s.ball.vy = Math.abs(s.ball.vy);
    } else if (s.ball.y + r > H) {
      s.ball.y  = H - r;
      s.ball.vy = -Math.abs(s.ball.vy);
    }

    this._checkPaddleCollision();

    if (s.ball.x - r < 0)      this._score('ai');
    else if (s.ball.x + r > W) this._score('player');
  }

  /* ============================================================
     IA
     ============================================================ */

  _updateAI(dt) {
    const { paddle, ai } = this.config.gameplay;
    const s = this.state;
    const targetY = s.ball.y + s._aiError - paddle.height / 2;
    const diff    = targetY - s.ai.y;
    const maxMove = ai.baseSpeed * s.scale * dt;
    const move    = Math.min(Math.abs(diff), maxMove) * Math.sign(diff);
    s.ai.y = Math.max(0, Math.min(s.canvas.height - paddle.height, s.ai.y + move));
  }

  /* ============================================================
     COLLISIONS RAQUETTES
     ============================================================ */

  _checkPaddleCollision() {
    const { paddle, ball: bCfg } = this.config.gameplay;
    const s  = this.state;
    const r  = bCfg.baseRadius;
    const pw = paddle.width;
    const pH = paddle.height;

    // Gauche — J1
    const lx = paddle.offset;
    if (
      s.ball.vx < 0 &&
      s.ball.x - r <= lx + pw &&
      s.ball.x + r >= lx &&
      s.ball.y + r >= s.player.y &&
      s.ball.y - r <= s.player.y + pH
    ) {
      s.ball.x  = lx + pw + r + 1;
      s.ball.vx = Math.abs(s.ball.vx);
      this._addSpin(s.player.y);
      this._speedUp();
    }

    // Droite — J2 / IA
    const rx = s.canvas.width - paddle.offset - pw;
    if (
      s.ball.vx > 0 &&
      s.ball.x + r >= rx &&
      s.ball.x - r <= rx + pw &&
      s.ball.y + r >= s.ai.y &&
      s.ball.y - r <= s.ai.y + pH
    ) {
      s.ball.x  = rx - r - 1;
      s.ball.vx = -Math.abs(s.ball.vx);
      this._addSpin(s.ai.y);
      this._speedUp();
      s._aiError = (Math.random() - 0.5) * this.config.gameplay.ai.errorMargin;
    }
  }

  _addSpin(paddleY) {
    const { paddle } = this.config.gameplay;
    const s     = this.state;
    const hit   = (s.ball.y - paddleY) / paddle.height;
    const angle = (hit - 0.5) * (Math.PI * 0.5); // −45° à +45°
    const speed = Math.hypot(s.ball.vx, s.ball.vy);
    const dir   = Math.sign(s.ball.vx);
    s.ball.vx = Math.cos(angle) * speed * dir;
    s.ball.vy = Math.sin(angle) * speed;
  }

  _speedUp() {
    const { ball: bCfg } = this.config.gameplay;
    const s     = this.state;
    const speed = Math.hypot(s.ball.vx, s.ball.vy);
    const max   = bCfg.maxSpeed * s.scale;
    const next  = Math.min(speed + bCfg.speedIncrement * s.scale, max);
    s.ball.vx *= next / speed;
    s.ball.vy *= next / speed;
  }

  /* ============================================================
     SCORE
     ============================================================ */

  _score(scorer) {
    const s = this.state;
    if (scorer === 'player') {
      s.scoreLeft++;
      ScoreService.submit('pong', s.scoreLeft);
    } else {
      s.scoreRight++;
    }

    EventBus.emit('game:score-update', { scoreLeft: s.scoreLeft, scoreRight: s.scoreRight });
    EventBus.emit('game:point', { scorer, scoreLeft: s.scoreLeft, scoreRight: s.scoreRight });

    if (s.scoreLeft >= s.maxScore || s.scoreRight >= s.maxScore) {
      s.status = 'gameover';
      EventBus.emit('game:over', {
        winner:     s.scoreLeft > s.scoreRight ? 'player' : 'ai',
        scoreLeft:  s.scoreLeft,
        scoreRight: s.scoreRight
      });
      return;
    }

    // Le perdant reçoit la balle (service vers son camp)
    s.status = 'serving';
    this._resetBall(scorer === 'player' ? 1 : -1);
    EventBus.emit('game:tick', { state: s, action: 'point' });
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

      // Contrôles J1 (W/S) — séparés des flèches
      if (e.code === 'KeyW') { e.preventDefault(); this._keys.up   = true; return; }
      if (e.code === 'KeyS') { e.preventDefault(); this._keys.down = true; return; }

      // Contrôles J2 (flèches) — aussi J1 si mode IA (géré dans _update)
      if (e.code === 'ArrowUp')   { e.preventDefault(); this._keysJ2.up   = true; return; }
      if (e.code === 'ArrowDown') { e.preventDefault(); this._keysJ2.down = true; return; }

      // P : pause standard (en plus de l'espace, qui sert aussi à servir)
      if (e.code === 'KeyP' && (s === 'playing' || s === 'paused')) {
        e.preventDefault();
        this.togglePause();
        return;
      }

      if (keys.launch?.includes(e.code)) {
        e.preventDefault();
        if (s === 'idle')                      { EventBus.emit('pong:start-requested'); return; }
        if (s === 'serving')                   { this.launch();      return; }
        if (s === 'playing' || s === 'paused') { this.togglePause(); return; }
        if (s === 'gameover')                  { this.restart();     return; }
      }
    };

    this._onKeyUp = (e) => {
      if (e.code === 'KeyW')      this._keys.up     = false;
      if (e.code === 'KeyS')      this._keys.down   = false;
      if (e.code === 'ArrowUp')   this._keysJ2.up   = false;
      if (e.code === 'ArrowDown') this._keysJ2.down = false;
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
  }

  _unbindControls() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
  }

  /* ============================================================
     ÉTAT INITIAL (idle — avant la sélection)
     ============================================================ */

  _buildState() {
    const { canvasSizes, defaultSize, paddle } = this.config.gameplay;
    const canvas = { ...canvasSizes[defaultSize] };
    return {
      status:     'idle',
      canvas,
      scale:      1,
      maxScore:   7,
      opponent:   'ai',
      scoreLeft:  0,
      scoreRight: 0,
      player:     { y: (canvas.height - paddle.height) / 2 },
      ai:         { y: (canvas.height - paddle.height) / 2 },
      ball:       { x: canvas.width / 2, y: canvas.height / 2, vx: 0, vy: 0 },
      _serveDir:  1,
      _aiError:   0
    };
  }

  _resetBall(dir = 1) {
    const s = this.state;
    s.ball      = { x: s.canvas.width / 2, y: s.canvas.height / 2, vx: 0, vy: 0 };
    s._serveDir = dir;
    s._aiError  = (Math.random() - 0.5) * this.config.gameplay.ai.errorMargin;
  }
}
