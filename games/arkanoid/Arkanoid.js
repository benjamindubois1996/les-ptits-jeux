import EventBus     from '../../js/core/EventBus.js';
import ScoreService  from '../../js/services/ScoreService.js';
import BaseGame      from '../../js/core/BaseGame.js';

const POWER_UPS = ['wide','laser','slow','life','multi'];

export default class Arkanoid extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = this._buildFullState();
    this._loopId = null;
    this._last   = 0;
  }

  _gameId() { return 'arkanoid'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); this._stopLoop(); }

  start(options = {}) {
    this.state        = this._buildFullState();
    this.state.status = 'playing';
    this.state.mode   = options.mode ?? 'basique';
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
    this._startLoop();
  }

  restart() {
    this._stopLoop();
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  { this._stopLoop(); }
  _onResume() { this._startLoop(); }

  movePaddle(x) {
    const { state } = this;
    if (state.status !== 'playing') return;
    const hw = state.paddle.w / 2;
    const W  = this.config.gameplay.width;
    state.paddle.x = Math.max(hw, Math.min(W - hw, x));
  }

  movePaddleDelta(dx) {
    const { state } = this;
    if (state.status !== 'playing') return;
    const { paddleSpeed, width } = this.config.gameplay;
    const hw = state.paddle.w / 2;
    state.paddle.x = Math.max(hw, Math.min(width - hw, state.paddle.x + dx * paddleSpeed));
  }

  launchBall() {
    const { state } = this;
    if (state.balls.some(b => !b.stuck)) return; // already launched
    state.balls.forEach(b => { if (b.stuck) { b.stuck = false; } });
  }

  _startLoop() {
    this._last = performance.now();
    const tick = (t) => {
      if (this.state.status !== 'playing') return;
      const dt = Math.min((t - this._last) / 1000, 0.05);
      this._last = t;
      this._update(dt);
      EventBus.emit('game:tick', { state: this.state, action: 'tick' });
      this._loopId = requestAnimationFrame(tick);
    };
    this._loopId = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this._loopId) { cancelAnimationFrame(this._loopId); this._loopId = null; }
  }

  _update(dt) {
    const { state }  = this;
    const cfg        = this.config.gameplay;
    const { width, height, ballRadius } = cfg;
    const paddleY    = height - 30;

    // Move falling power-ups
    state.fallingPUs = state.fallingPUs.filter(pu => {
      pu.y += 2;
      if (pu.y >= paddleY && Math.abs(pu.x - state.paddle.x) < state.paddle.w / 2 + 12) {
        this._applyPowerUp(pu.type);
        return false;
      }
      return pu.y < height;
    });

    // Power-up timers
    if (state.powerUp.wide && (state.powerUp.wideTimer -= dt) <= 0) {
      state.paddle.w = cfg.paddleW;
      state.powerUp.wide = false;
    }
    if (state.powerUp.slow && (state.powerUp.slowTimer -= dt) <= 0) {
      state.balls.forEach(b => { b.speed = cfg.ballSpeed; });
      state.powerUp.slow = false;
    }

    // Update balls
    state.balls = state.balls.filter(ball => {
      if (ball.stuck) {
        ball.x = state.paddle.x;
        ball.y = paddleY - ballRadius - cfg.paddleH;
        return true;
      }

      ball.x += ball.vx * ball.speed * dt * 60;
      ball.y += ball.vy * ball.speed * dt * 60;

      // Wall bounces
      if (ball.x - ballRadius < 0)         { ball.x = ballRadius;       ball.vx =  Math.abs(ball.vx); }
      if (ball.x + ballRadius > width)      { ball.x = width - ballRadius; ball.vx = -Math.abs(ball.vx); }
      if (ball.y - ballRadius < 0)          { ball.y = ballRadius;       ball.vy =  Math.abs(ball.vy); }

      // Fell below paddle
      if (ball.y > height + 20) return false;

      // Paddle bounce
      if (ball.vy > 0 &&
          ball.y + ballRadius >= paddleY &&
          ball.y - ballRadius <= paddleY + cfg.paddleH &&
          ball.x >= state.paddle.x - state.paddle.w / 2 - ballRadius &&
          ball.x <= state.paddle.x + state.paddle.w / 2 + ballRadius) {
        ball.vy = -Math.abs(ball.vy);
        // Angle based on hit position
        const offset = (ball.x - state.paddle.x) / (state.paddle.w / 2);
        ball.vx = offset * 1.2;
        const mag = Math.hypot(ball.vx, ball.vy);
        ball.vx /= mag; ball.vy /= mag;
      }

      // Brick collisions
      this._checkBrickCollision(ball, state, cfg);

      return true;
    });

    // All balls lost
    if (state.balls.length === 0) {
      state.lives--;
      EventBus.emit('game:lives-update', { lives: state.lives });
      if (state.lives <= 0) {
        state.status = 'over';
        this._stopLoop();
        const { best } = ScoreService.submit(this._gameId(), state.score);
        EventBus.emit('game:over', {
          result: 'lose', icon: '🧱', title: 'GAME OVER',
          score: state.score, best,
          extraInfo: `<div class="overlay-score">Niveau ${state.level}</div>`,
        });
      } else {
        // Respawn ball on paddle
        state.balls = [this._makeBall(state.paddle.x, paddleY - cfg.ballRadius - cfg.paddleH, true)];
      }
      return;
    }

    // Level clear
    if (state.bricks.filter(b => b.alive && b.type !== 'unbreakable').length === 0) {
      this._nextLevel();
    }
  }

  _checkBrickCollision(ball, state, cfg) {
    const { ballRadius, brickW, brickH } = cfg;
    const brickOffX = (cfg.width - cfg.brickCols * (brickW + 2)) / 2;
    const brickOffY = 40;

    state.bricks.forEach(brick => {
      if (!brick.alive) return;
      const bx = brickOffX + brick.col * (brickW + 2);
      const by = brickOffY + brick.row * (brickH + 3);

      if (ball.x + ballRadius < bx || ball.x - ballRadius > bx + brickW) return;
      if (ball.y + ballRadius < by || ball.y - ballRadius > by + brickH) return;

      // Hit
      if (brick.type !== 'unbreakable') {
        brick.hits--;
        if (brick.hits <= 0) {
          brick.alive = false;
          state.score += this.config.scoring.brickBase * brick.value;
          EventBus.emit('game:score-update', { score: state.score });
          // Drop power-up?
          if (Math.random() < this.config.gameplay.powerUpChance) {
            const type = POWER_UPS[Math.floor(Math.random() * POWER_UPS.length)];
            state.fallingPUs.push({ x: bx + brickW / 2, y: by + brickH, type });
          }
        }
      }

      // Determine bounce axis
      const overlapLeft   = ball.x + ballRadius - bx;
      const overlapRight  = bx + brickW - (ball.x - ballRadius);
      const overlapTop    = ball.y + ballRadius - by;
      const overlapBottom = by + brickH - (ball.y - ballRadius);
      const minH = Math.min(overlapLeft, overlapRight);
      const minV = Math.min(overlapTop, overlapBottom);
      if (minH < minV) ball.vx *= -1;
      else             ball.vy *= -1;
    });
  }

  _applyPowerUp(type) {
    const { state } = this;
    const cfg = this.config.gameplay;
    const paddleY = cfg.height - 30;
    if (type === 'wide') {
      state.paddle.w = Math.min(cfg.paddleW * 1.8, cfg.width * 0.5);
      state.powerUp.wide = true;
      state.powerUp.wideTimer = 10;
    } else if (type === 'slow') {
      state.balls.forEach(b => { b.speed = Math.max(2, b.speed * 0.6); });
      state.powerUp.slow = true;
      state.powerUp.slowTimer = 8;
    } else if (type === 'life') {
      state.lives++;
      EventBus.emit('game:lives-update', { lives: state.lives });
    } else if (type === 'multi') {
      // Split existing balls
      const current = [...state.balls];
      current.forEach(b => {
        state.balls.push(this._makeBall(b.x, b.y, false, b.vx * -1, b.vy));
      });
    } else if (type === 'laser') {
      // Fire laser shots from paddle
      state.lasers = state.lasers || [];
      state.lasers.push(
        { x: state.paddle.x - 20, y: paddleY },
        { x: state.paddle.x + 20, y: paddleY },
      );
    }
  }

  _nextLevel() {
    const { state } = this;
    state.level++;
    state.score += this.config.scoring.levelBonus;
    EventBus.emit('game:score-update', { score: state.score });

    if (state.level > 5) {
      state.status = 'won';
      this._stopLoop();
      const { best } = ScoreService.submit(this._gameId(), state.score);
      EventBus.emit('game:won', {
        result: 'win', icon: '🏆', title: 'VICTOIRE !',
        score: state.score, best,
        extraInfo: `<div class="overlay-score">Tous les niveaux franchis !</div>`,
      });
      return;
    }

    const cfg = this.config.gameplay;
    const paddleY = cfg.height - 30;
    state.bricks     = this._buildBricks(state.level);
    state.fallingPUs = [];
    state.lasers     = [];
    state.balls      = [this._makeBall(
      state.paddle.x, paddleY - cfg.ballRadius - cfg.paddleH, true
    )];
    EventBus.emit('game:tick', { state, action: 'level-up' });
  }

  _buildBricks(level) {
    const { brickCols, brickRows } = this.config.gameplay;
    const bricks = [];
    const patterns = [
      null,         // level 1: all normal
      'checker',    // level 2
      'diamond',    // level 3
      'fortress',   // level 4
      'chaos',      // level 5
    ];
    const pat = patterns[Math.min(level - 1, 4)];

    for (let row = 0; row < brickRows; row++) {
      for (let col = 0; col < brickCols; col++) {
        let type  = 'normal', hits = 1, value = 1;
        const r   = row / brickRows;

        if (pat === 'checker' && (row + col) % 2 === 0) { type = 'hard'; hits = 2; value = 2; }
        if (pat === 'diamond') {
          const d = Math.abs(col - brickCols / 2) + Math.abs(row - brickRows / 2);
          if (d < 3) { type = 'hard'; hits = 2; value = 2; }
          if (d > 5) { type = 'unbreakable'; hits = 99; }
        }
        if (pat === 'fortress') {
          if (row === 0 || row === brickRows - 1 ||
              col === 0 || col === brickCols - 1) { type = 'hard'; hits = 2; value = 2; }
          if ((row + col) % 4 === 0) { type = 'unbreakable'; hits = 99; }
        }
        if (pat === 'chaos') {
          const rand = Math.random();
          if (rand < 0.1)      { type = 'unbreakable'; hits = 99; }
          else if (rand < 0.3) { type = 'hard'; hits = 2; value = 2; }
        }

        // Color by row
        const hue = ((row * 30) + level * 40) % 360;
        bricks.push({ alive: true, row, col, type, hits, value, hue });
      }
    }
    return bricks;
  }

  _makeBall(x, y, stuck = false, vx = null, vy = null) {
    const angle = (-70 + Math.random() * 40) * Math.PI / 180;
    return {
      x, y, stuck,
      vx: vx ?? Math.sin(angle),
      vy: vy ?? -Math.cos(angle),
      speed: this.config.gameplay.ballSpeed,
    };
  }

  _buildFullState() {
    const cfg   = this.config?.gameplay ?? {};
    const pY    = (cfg.height ?? 560) - 30;
    const pX    = (cfg.width  ?? 400) / 2;
    const paddle = { x: pX, w: cfg.paddleW ?? 80 };
    return {
      status: 'idle', mode: 'basique', score: 0, lives: 3, level: 1,
      paddle,
      balls: [this._makeBall(pX, pY - (cfg.ballRadius ?? 7) - (cfg.paddleH ?? 10), true)],
      bricks: this._buildBricks(1),
      fallingPUs: [], lasers: [],
      powerUp: { wide: false, wideTimer: 0, slow: false, slowTimer: 0 },
    };
  }
}
