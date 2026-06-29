import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';

// Hoop position (normalized 0-1)
const HOOP = { x: 0.78, y: 0.38, r: 0.045 };
// Ball start zone x range
const BALL_ZONES = [0.10, 0.25, 0.38, 0.52]; // different distances

const GRAVITY = 0.0018; // normalized per ms²

function ptValue(ballX) {
  if (ballX <= 0.30) return 3;
  if (ballX <= 0.50) return 2;
  return 1;
}

export default class Basketball extends BaseGame {
  constructor(config) {
    super(config);
    this.state     = null;
    this._loop     = new GameLoop(this._tick.bind(this));
    this._lastTick = null;
  }

  _gameId() { return 'basketball'; }

  _buildFullState() {
    return {
      status:    'idle',
      phase:     'aiming', // aiming | flying | scored | missed
      timeLeft:  60,
      score:     0,
      combo:     0,
      bestCombo: 0,
      shots:     0,
      makes:     0,
      ball: {
        x: 0.20, y: 0.72,
        vx: 0, vy: 0,
        active: false,
        trail: [],
      },
      aim: { angle: -Math.PI / 4, power: 0.7 },
      zone:    0,
      message: '',
      showTrajectory: false,
    };
  }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  start() {
    const s = this.state;
    s.status  = 'playing';
    s.message = 'Cliquez pour lancer !';
    this._lastTick = null;
    this._loop.start(16);
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  _tick() {
    const now = performance.now();
    if (this._lastTick === null) this._lastTick = now;
    const dt = Math.min(now - this._lastTick, 100);
    this._lastTick = now;

    const s = this.state;
    if (s.status !== 'playing') return;

    // Countdown
    s.timeLeft = Math.max(0, s.timeLeft - dt / 1000);
    if (s.timeLeft <= 0 && s.phase !== 'flying') {
      this._endGame();
      return;
    }

    if (s.phase === 'flying') {
      this._updateBall(dt);
    }

    EventBus.emit('game:tick', { state: s });
  }

  _updateBall(dt) {
    const s = this.state;
    const b = s.ball;
    b.vy += GRAVITY * dt;
    b.x  += b.vx * dt;
    b.y  += b.vy * dt;
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 12) b.trail.shift();

    // Check basket
    const dx = b.x - HOOP.x;
    const dy = b.y - HOOP.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < HOOP.r * 1.6 && b.vy > 0 && b.y < HOOP.y + 0.05) {
      const pts = ptValue(s.ball.x - b.vx * 15); // estimate launch x
      s.combo++;
      if (s.combo > s.bestCombo) s.bestCombo = s.combo;
      const bonusPts = pts * (1 + Math.floor(s.combo / 3));
      s.score += bonusPts;
      s.makes++;
      s.message = s.combo > 1
        ? `🏀 +${bonusPts} pts — Combo ×${s.combo} !`
        : `🏀 +${bonusPts} pts !`;
      this._resetBall();
      return;
    }

    // Miss (off screen)
    if (b.x > 1.1 || b.y > 1.05 || b.x < -0.1) {
      s.combo = 0;
      s.message = 'Raté… Réessaye !';
      this._resetBall();
    }
  }

  _resetBall() {
    const s = this.state;
    s.shots++;
    s.phase = 'aiming';
    s.ball.active = false;
    s.ball.trail  = [];
    // Cycle shooting zones
    s.zone = (s.zone + 1) % BALL_ZONES.length;
    s.ball.x = BALL_ZONES[s.zone];
    s.ball.y = 0.72;
    ScoreService.submit(this._gameId(), s.score);
  }

  aim(angle, power) {
    const s = this.state;
    if (s.status !== 'playing' || s.phase !== 'aiming') return;
    s.aim.angle = angle;
    s.aim.power = power;
    s.showTrajectory = true;
  }

  shoot() {
    const s = this.state;
    if (s.status !== 'playing' || s.phase !== 'aiming') return;
    const speed = 0.012 * s.aim.power;
    s.ball.vx = Math.cos(s.aim.angle) * speed;
    s.ball.vy = Math.sin(s.aim.angle) * speed;
    s.ball.active = true;
    s.ball.trail  = [{ x: s.ball.x, y: s.ball.y }];
    s.phase = 'flying';
    s.showTrajectory = false;
  }

  _endGame() {
    const s = this.state;
    s.status   = 'over';
    s.timeLeft = 0;
    this._loop.stop();
    ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:tick', { state: s });
    EventBus.emit('game:over', { score: s.score });
  }

  restart() {
    this._loop.stop();
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    this._loop.stop();
    super.destroy();
  }
}

