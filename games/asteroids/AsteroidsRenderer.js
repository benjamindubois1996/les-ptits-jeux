import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const STARS = Array.from({ length: 100 }, (_, i) => ({
  x: ((i * 137.508) % 600),
  y: ((i * 73.13)   % 500),
  a: 0.25 + (i % 5) * 0.12,
  r: i % 7 === 0 ? 1.5 : 1,
}));

export default class AsteroidsRenderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._sel     = { mode: 'basique' };

    this._onFrame   = this._onFrame.bind(this);
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
  }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('ast-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('ast-styles')) return;
    const el = document.createElement('style');
    el.id = 'ast-styles';
    el.textContent = `
      .ast-wrapper {
        position:absolute; inset:0;
        display:flex; align-items:center; justify-content:center;
        background:#000; overflow:hidden; font-family:Orbitron,monospace;
      }
      .ast-canvas { display:block; max-width:100%; max-height:100%; }
    `;
    document.head.appendChild(el);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'ast-wrapper';

    const { W, H } = this.config.gameplay;
    this._canvas = document.createElement('canvas');
    this._canvas.className = 'ast-canvas';
    this._canvas.width  = W;
    this._canvas.height = H;
    this._ctx = this._canvas.getContext('2d');

    this._wrapper.appendChild(this._canvas);
    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();
    this.viewport.appendChild(this._wrapper);
  }

  _optionGroups() {
    return [
      {
        key: 'mode', label: 'MODE', default: 'basique',
        options: [{ value: 'basique', label: 'BASIQUE' }],
      },
    ];
  }

  _showStartScreen() {
    this._overlay.showStart(
      this._optionGroups(),
      sel => { this._sel = sel; this._overlay.hide(); this.game.start(sel); },
      { extraHtml: '<div style="font-size:10px;color:rgba(0,255,225,0.6);letter-spacing:0.1em;margin-top:4px">↑/W ACCÉLÉRER · ←/→ TOURNER · ESPACE TIRER</div>' },
    );
  }

  _showGameOverScreen({ score, best }) {
    this._overlay.showGameOver(
      {
        result:    'lose',
        score,
        isRecord:  score > 0 && score >= best,
        extraInfo: `<div class="overlay-score">Meilleur : ${best}</div>`,
      },
      () => this._showStartScreen(),
    );
  }

  _bindEvents() {
    EventBus.on('game:frame',   this._onFrame);
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindEvents() {
    EventBus.off('game:frame',   this._onFrame);
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    if (this.game.state.status === 'idle' && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      this._overlay.hide();
      this.game.start(this._sel);
    }
  }

  _onFrame({ state }) { this._draw(state); }
  _onTick({ state })  { if (state.status === 'idle') { this._overlay.show(); this._draw(state); } }
  _onOver(data)       { this._draw(this.game.state); this._showGameOverScreen(data); }
  _onPaused()         { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed()        { this._overlay.hide(); }
  _onRestart()        { this._showStartScreen(); }

  _draw(state) {
    const ctx = this._ctx;
    const { W, H } = this.config.gameplay;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    for (const s of STARS) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    if (state.status === 'idle') return;

    /* Asteroids */
    ctx.strokeStyle = 'rgba(200,220,255,0.9)';
    ctx.lineWidth   = 1.5;
    for (const a of state.asteroids) this._drawAsteroid(ctx, a);

    /* Bullets */
    ctx.fillStyle   = '#fff';
    ctx.shadowColor = '#00ffe1';
    ctx.shadowBlur  = 6;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    /* Ship (blink when invincible) */
    const vis = this.game._invincible <= 0 ||
                Math.floor(this.game._invincible / 120) % 2 === 0;
    if (vis && state.status !== 'gameover') this._drawShip(ctx, state.ship);

    /* HUD */
    ctx.font         = 'bold 18px Orbitron, monospace';
    ctx.fillStyle    = 'rgba(255,255,255,0.9)';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Score : ${state.score}`, 12, 12);
    ctx.textAlign = 'right';
    ctx.fillText(`Niv. ${state.level}`, W - 12, 12);
    ctx.textAlign = 'left';

    /* Lives (small ships) */
    for (let i = 0; i < state.lives; i++) this._drawLifeShip(ctx, 14 + i * 24, 40);
  }

  _drawShip(ctx, ship) {
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    ctx.shadowColor = '#00ffe1';
    ctx.shadowBlur  = 10;
    ctx.strokeStyle = '#00ffe1';
    ctx.lineWidth   = 1.8;
    ctx.beginPath();
    ctx.moveTo(18,  0);
    ctx.lineTo(-12,  11);
    ctx.lineTo(-8,   0);
    ctx.lineTo(-12, -11);
    ctx.closePath();
    ctx.stroke();

    if (ship.thrusting) {
      ctx.strokeStyle = '#ff8800';
      ctx.shadowColor = '#ff8800';
      ctx.shadowBlur  = 14;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(-8,   6);
      ctx.lineTo(-18 - Math.random() * 10, 0);
      ctx.lineTo(-8,  -6);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawLifeShip(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 2);
    ctx.strokeStyle = '#00ffe1';
    ctx.lineWidth   = 1;
    ctx.shadowBlur  = 0;
    ctx.beginPath();
    ctx.moveTo(9,  0);
    ctx.lineTo(-6,  6);
    ctx.lineTo(-4,  0);
    ctx.lineTo(-6, -6);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  _drawAsteroid(ctx, a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rot);
    ctx.shadowColor = 'rgba(160,160,200,0.2)';
    ctx.shadowBlur  = 4;
    ctx.beginPath();
    const v = a.verts;
    ctx.moveTo(v[0][0], v[0][1]);
    for (let i = 1; i < v.length; i++) ctx.lineTo(v[i][0], v[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}
