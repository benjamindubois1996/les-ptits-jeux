import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';

const W = 380, H = 580;
const PUCK_R = 14, PADDLE_R = 28;
const GOAL_W = 120;

export default class AirHockey extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._loop = new GameLoop(() => this._tick());
    this._mouseY = H / 2;
    this._mouseX = W / 2;
    this._canvas = null;
  }

  _gameId() { return 'air-hockey'; }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); this._loop.destroy(); this._unbindControls(); clearTimeout(this._resetTimer); }

  start(options = {}) {
    this._loop.stop();
    this._unbindControls();
    this._scoreLimit = parseInt(options.limit ?? '7', 10) || 7;
    this._aiDiff     = options.diff ?? 'normale';
    this._aiSpeed    = { facile: 2.5, normale: 4.5, difficile: 7.0 }[this._aiDiff] ?? 4.5;

    this.state = this._buildFullState();
    this.state.status    = 'playing';
    this.state.scoreLimit = this._scoreLimit;
    this._reset();
    this._bindControls();
    this._loop.start(16);
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  restart() {
    this._loop.stop();
    this._unbindControls();
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  { this._loop.stop(); }
  _onResume() { this._loop.start(16); }

  setCanvas(canvas) { this._canvas = canvas; }

  _bindControls() {
    const move = e => {
      if (!this._canvas) return;
      const rect = this._canvas.getBoundingClientRect();
      const scaleX = W / rect.width, scaleY = H / rect.height;
      const src = e.touches ? e.touches[0] : e;
      this._mouseX = (src.clientX - rect.left) * scaleX;
      this._mouseY = (src.clientY - rect.top)  * scaleY;
      e.preventDefault();
    };
    this._onMouseMove  = move;
    this._onTouchMove  = move;
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('touchmove', this._onTouchMove, { passive: false });

    this._onKey = e => {
      if (e.key === 'p' || e.key === 'P') EventBus.emit('game:pause-toggle');
      if (e.key === 'r' || e.key === 'R') this.restart();
    };
    window.addEventListener('keydown', this._onKey);
  }

  _unbindControls() {
    if (this._onMouseMove) { window.removeEventListener('mousemove', this._onMouseMove); this._onMouseMove = null; }
    if (this._onTouchMove) { window.removeEventListener('touchmove', this._onTouchMove); this._onTouchMove = null; }
    if (this._onKey)       { window.removeEventListener('keydown', this._onKey); this._onKey = null; }
  }

  _reset() {
    const s = this.state;
    s.puck   = { x: W/2, y: H/2, vx: (Math.random()>0.5?1:-1)*4, vy: (Math.random()>0.5?1:-1)*4 };
    s.player = { x: W/2, y: H - 80 };
    s.ai     = { x: W/2, y: 80 };
  }

  _tick() {
    const s = this.state;
    if (s.status !== 'playing') return;
    this._movePuck();
    this._movePlayer();
    this._moveAI();
    EventBus.emit('game:tick', { state: s });
  }

  _movePuck() {
    const s = this.state, p = s.puck;
    const speed = Math.hypot(p.vx, p.vy);
    const maxSpd = 12;
    if (speed > maxSpd) { p.vx *= maxSpd/speed; p.vy *= maxSpd/speed; }

    p.x += p.vx; p.y += p.vy;

    // Wall bouncing
    if (p.x - PUCK_R < 0)   { p.x = PUCK_R;       p.vx = Math.abs(p.vx); }
    if (p.x + PUCK_R > W)   { p.x = W - PUCK_R;   p.vx = -Math.abs(p.vx); }

    // Goals
    const gx1 = (W - GOAL_W) / 2, gx2 = (W + GOAL_W) / 2;
    if (p.y - PUCK_R < 0) {
      if (p.x >= gx1 && p.x <= gx2) { this._score('player'); return; }
      p.y = PUCK_R; p.vy = Math.abs(p.vy);
    }
    if (p.y + PUCK_R > H) {
      if (p.x >= gx1 && p.x <= gx2) { this._score('ai'); return; }
      p.y = H - PUCK_R; p.vy = -Math.abs(p.vy);
    }

    // Paddle collisions
    this._collidePaddle(p, s.player);
    this._collidePaddle(p, s.ai);
  }

  _collidePaddle(puck, paddle) {
    const dx = puck.x - paddle.x, dy = puck.y - paddle.y;
    const dist = Math.hypot(dx, dy);
    const minD = PUCK_R + PADDLE_R;
    if (dist < minD && dist > 0) {
      const nx = dx / dist, ny = dy / dist;
      puck.x = paddle.x + nx * minD;
      puck.y = paddle.y + ny * minD;
      const dot = puck.vx * nx + puck.vy * ny;
      puck.vx -= 2 * dot * nx;
      puck.vy -= 2 * dot * ny;
      const boost = 1.05;
      puck.vx *= boost; puck.vy *= boost;
    }
  }

  _movePlayer() {
    const s = this.state, p = s.player;
    const tx = Math.max(PADDLE_R, Math.min(W - PADDLE_R, this._mouseX));
    const ty = Math.max(H/2 + PADDLE_R, Math.min(H - PADDLE_R, this._mouseY));
    p.x += (tx - p.x) * 0.35;
    p.y += (ty - p.y) * 0.35;
  }

  _moveAI() {
    const s = this.state, ai = s.ai, puck = s.puck;
    const speed = this._aiSpeed ?? 4.5;

    // TX : track puck X (DIFFICILE prédiction par rebonds), sinon centre
    const tx = puck.vy < 0
      ? (this._aiDiff === 'difficile' ? this._predictX() : puck.x)
      : W / 2;

    // TY : toujours rester dans le quart supérieur, ne pas poursuivre le puck en Y
    const ty = H / 4;

    const dx = tx - ai.x, dy = ty - ai.y;
    const d  = Math.hypot(dx, dy);
    if (d > 0.5) {
      ai.x += (dx / d) * Math.min(speed, d);
      ai.y += (dy / d) * Math.min(speed, d);
    }
    ai.x = Math.max(PADDLE_R, Math.min(W - PADDLE_R, ai.x));
    ai.y = Math.max(PADDLE_R, Math.min(H / 2 - PADDLE_R, ai.y));
  }

  _predictX() {
    const puck = this.state.puck;
    if (puck.vy >= 0) return W / 2;
    let x = puck.x, vx = puck.vx, y = puck.y;
    for (let i = 0; i < 200; i++) {
      x += vx; y += puck.vy;
      if (x - PUCK_R < 0)   { x = PUCK_R;     vx = -vx; }
      if (x + PUCK_R > W)   { x = W - PUCK_R; vx = -vx; }
      if (y < H / 4) break;
    }
    return x;
  }

  _score(scorer) {
    const s = this.state;
    s[scorer === 'player' ? 'playerScore' : 'aiScore']++;
    s.score = s.playerScore * (this.config?.scoring?.perGoal ?? 100);
    const limit = this._scoreLimit ?? 7;
    if (s.playerScore >= limit || s.aiScore >= limit) {
      this._endGame(s.playerScore >= limit);
    } else {
      this._resetTimer = setTimeout(() => { if (s.status === 'playing') { this._reset(); } }, 600);
    }
  }

  _endGame(playerWon) {
    const s = this.state;
    s.status = playerWon ? 'won' : 'over';
    this._loop.stop();
    const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
    const ev = playerWon ? 'game:won' : 'game:over';
    EventBus.emit(ev, {
      result: playerWon ? 'win' : 'lose',
      icon: playerWon ? '🏒' : '😢',
      title: playerWon ? 'VICTOIRE !' : 'DÉFAITE',
      score: s.score, best, isRecord,
      extraInfo: `<div class="overlay-score">${s.playerScore} - ${s.aiScore}</div>`,
    });
  }

  _buildFullState() {
    return {
      status: 'idle', score: 0,
      playerScore: 0, aiScore: 0,
      puck: { x:W/2, y:H/2, vx:4, vy:4 },
      player: { x:W/2, y:H-80 },
      ai:     { x:W/2, y:80 },
      W, H, PUCK_R, PADDLE_R, GOAL_W,
    };
  }
}
