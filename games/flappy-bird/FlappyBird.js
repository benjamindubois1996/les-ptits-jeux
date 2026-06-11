import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class FlappyBird extends BaseGame {

  constructor(config) {
    super(config);
    this.state     = this._buildFullState();
    this._raf      = null;
    this._lastTime = null;
    this._pipeTimer = 0;
  }

  _gameId() { return 'flappy-bird'; }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

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

  /* ============================================================
     ACTIONS
     ============================================================ */

  start(options = {}) {
    const mode      = options.mode  ?? 'basique';
    const gap       = options.gap   ?? 'normal';
    const speed     = options.speed ?? 'normale';
    const gapSize   = this.config.gameplay.gapSizeMap[gap];
    const pipeSpeed = this.config.gameplay.speedMap[speed];

    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode, gap, speed, gapSize, pipeSpeed,
    };

    this._lastTime  = null;
    this._pipeTimer = this.config.gameplay.pipeInterval * 0.55;
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  flap() {
    if (this.state.status !== 'playing') return;
    this.state.bird.vy       = this.config.gameplay.flapForce;
    this.state.bird.flapAnim = 8;
  }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  /* ============================================================
     BOUCLE RAF
     ============================================================ */

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

  /* ============================================================
     MISE À JOUR
     ============================================================ */

  _update(dt) {
    const { state } = this;
    if (state.status !== 'playing') return;

    const cfg    = this.config.gameplay;
    const factor = dt / 16.667;

    /* Physique oiseau */
    state.bird.vy += cfg.gravity * factor;
    state.bird.y  += state.bird.vy * factor;
    if (state.bird.flapAnim > 0) state.bird.flapAnim--;

    /* Déplacement des tuyaux */
    const px = state.pipeSpeed * factor;
    for (const p of state.pipes) p.x -= px;

    /* Spawn */
    this._pipeTimer += dt;
    if (this._pipeTimer >= cfg.pipeInterval) {
      this._pipeTimer -= cfg.pipeInterval;
      this._spawnPipe();
    }

    /* Score + nettoyage */
    for (let i = state.pipes.length - 1; i >= 0; i--) {
      const p = state.pipes[i];
      if (p.x + cfg.pipeWidth < 0) { state.pipes.splice(i, 1); continue; }
      if (!p.scored && p.x + cfg.pipeWidth < cfg.birdX) {
        p.scored = true;
        state.score++;
        state.pipeSpeed += cfg.speedIncrementPerPipe;
        EventBus.emit('game:score-update', { score: state.score });
      }
    }

    /* Collisions */
    if (this._checkCollisions()) this._onGameOver();
  }

  _spawnPipe() {
    const { state } = this;
    const cfg   = this.config.gameplay;
    const H     = this.config.canvas.height;
    const minY  = 55;
    const maxY  = H - cfg.groundHeight - state.gapSize - 55;
    const gapY  = minY + Math.random() * Math.max(0, maxY - minY);
    state.pipes.push({ x: this.config.canvas.width, gapY, scored: false });
  }

  _checkCollisions() {
    const { state } = this;
    const cfg = this.config.gameplay;
    const { bird, pipes, gapSize } = state;
    const { birdX, birdRadius, pipeWidth, groundHeight } = cfg;
    const H = this.config.canvas.height;

    if (bird.y - birdRadius < 0)              return true;
    if (bird.y + birdRadius > H - groundHeight) return true;

    for (const p of pipes) {
      if (birdX + birdRadius > p.x && birdX - birdRadius < p.x + pipeWidth) {
        if (bird.y - birdRadius < p.gapY || bird.y + birdRadius > p.gapY + gapSize) return true;
      }
    }
    return false;
  }

  _onGameOver() {
    const { state } = this;
    state.status = 'gameover';
    ScoreService.submit('flappy-bird', state.score);
    EventBus.emit('game:score-update', { score: state.score });
    EventBus.emit('game:over', {
      score: state.score,
      best:  ScoreService.getBest('flappy-bird'),
    });
  }

  /* ============================================================
     CONTRÔLES
     ============================================================ */

  _bindControls() {
    this._onKeyDown = (e) => {
      const s = this.state.status;
      const keys = this.config.controls.keyboard;

      if (keys.flap.includes(e.code)) {
        e.preventDefault();
        if (s === 'playing')  { this.flap(); return; }
        if (s === 'gameover') { EventBus.emit('game:restart'); return; }
      }
      if (keys.restart.includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
      if (keys.pause.includes(e.code))   { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindControls() {
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
  }

  /* ============================================================
     ÉTAT
     ============================================================ */

  _buildFullState() {
    const cfg = this.config.gameplay;
    return {
      status:     'loading',
      bird:       { y: this.config.canvas.height / 2 - 20, vy: 0, flapAnim: 0 },
      pipes:      [],
      score:      0,
      pipeSpeed:  cfg.speedMap['normale'],
      gapSize:    cfg.gapSizeMap['normal'],
      mode:       'basique',
      gap:        'normal',
      speed:      'normale',
    };
  }
}
