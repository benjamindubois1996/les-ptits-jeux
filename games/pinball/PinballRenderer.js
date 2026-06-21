import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';
import Particles   from '../../js/core/Particles.js';

const W = 320;
const H = 560;

export default class PinballRenderer {
  constructor(game, viewport, config) {
    this.game      = game;
    this.viewport  = viewport;
    this.config    = config;
    this._wrapper  = null;
    this._canvas   = null;
    this._ctx      = null;
    this._overlay  = null;
    this._particles = new Particles();
    this._lastTs   = null;
    this._rafId    = null;
    this._prevScore = 0;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._bindEvents();
    this._startRender();
  }

  destroy() {
    this._stopRender();
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('pb-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('pb-styles')) return;
    const el = document.createElement('style');
    el.id = 'pb-styles';
    el.textContent = `
      .pb-wrapper {
        position:absolute; inset:0;
        display:flex; flex-direction:column;
        background:#050810; font-family:Orbitron,monospace; overflow:hidden; color:#fff;
        align-items:center;
      }
      .pb-canvas-area {
        flex:1; display:flex; align-items:center; justify-content:center;
        overflow:hidden; padding:4px; box-sizing:border-box;
      }
      .pb-canvas { display:block; }
      .pb-hint {
        flex:0 0 auto; padding:5px; font-size:9px;
        color:rgba(255,255,255,0.2); letter-spacing:0.08em; text-align:center;
      }
    `;
    document.head.appendChild(el);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'pb-wrapper';

    const area = document.createElement('div');
    area.className = 'pb-canvas-area';

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'pb-canvas';
    this._canvas.width  = W;
    this._canvas.height = H;
    this._ctx = this._canvas.getContext('2d');
    area.appendChild(this._canvas);

    const hint = document.createElement('div');
    hint.className = 'pb-hint';
    hint.textContent = '← Z Flipper gauche · → X Flipper droit · Espace Lancer';

    this._wrapper.appendChild(area);
    this._wrapper.appendChild(hint);

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();
    this.viewport.appendChild(this._wrapper);
  }

  _showStartScreen() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this.game.start(sel); },
    );
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    const keys = this.config.controls?.keyboard ?? {};
    if ((keys.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if ((keys.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    if (state.score !== this._prevScore) {
      const ball = state.ball;
      this._particles.emit(ball.x, ball.y,
        { count: 5, angle: -Math.PI/2, spread: Math.PI, speed: 60, color: '#ffcc00', life: 400, size: 2 });
      this._prevScore = state.score;
    }
  }

  _onOver(data) {
    const best = data.best ?? 0;
    this._overlay.showGameOver(
      { result: 'lose', icon: '🎯', title: 'GAME OVER', score: data.score,
        extraInfo: `<div class="overlay-score">Meilleur : ${best}</div>` },
      () => this._showStartScreen(),
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._particles.clear(); this._showStartScreen(); }

  _startRender() {
    const loop = (ts) => {
      if (!this._lastTs) this._lastTs = ts;
      const dt = ts - this._lastTs;
      this._lastTs = ts;
      this._particles.update(dt);
      this._drawFrame();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _stopRender() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this._lastTs = null;
  }

  _drawFrame() {
    const state = this.game.state;
    const ctx   = this._ctx;
    const cfg   = this.config.gameplay;

    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, W, H);

    if (!state.bumpers?.length) return;

    // Outer walls
    ctx.strokeStyle = 'rgba(0,255,225,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // Gutter walls
    ctx.strokeStyle = 'rgba(0,255,225,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(55, H - 40); ctx.lineTo(25, H + 10);
    ctx.moveTo(W - 55, H - 40); ctx.lineTo(W - 25, H + 10);
    ctx.stroke();

    // Bumpers
    for (const b of state.bumpers) {
      const gradient = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, b.r);
      gradient.addColorStop(0, b.lit ? '#ffffff' : '#ff9900');
      gradient.addColorStop(1, b.lit ? 'rgba(255,255,0,0.3)' : 'rgba(255,153,0,0.1)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = b.lit ? '#fff' : '#ff9900';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Slingshots
    ctx.strokeStyle = '#ff4488';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const s of state.slings) {
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // Flippers
    this._drawFlipper(ctx, state.flippers.left,  cfg);
    this._drawFlipper(ctx, state.flippers.right, cfg);

    // Launcher lane
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(W - 30, 0, 30, H);

    // Launch arrow if ball on launcher
    if (state.ball?.onLauncher) {
      ctx.fillStyle = 'rgba(0,255,225,0.6)';
      ctx.font = '14px Orbitron,monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ESPACE', W/2, H/2 + 20);
      ctx.fillText('▲', W/2, H/2);
    }

    // Ball
    const ball = state.ball;
    if (ball) {
      const grad = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, cfg.ballRadius);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#aaccff');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, cfg.ballRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    this._particles.draw(ctx);
  }

  _drawFlipper(ctx, flipper, cfg) {
    const len = cfg.flipperLength;
    const ex  = flipper.x + Math.cos(flipper.angle) * len;
    const ey  = flipper.y + Math.sin(flipper.angle) * len;

    ctx.strokeStyle = '#00ffe1';
    ctx.lineWidth   = 10;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(flipper.x, flipper.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
}
