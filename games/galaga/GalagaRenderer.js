import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const TYPE_COLOR = { boss: '#ffe030', butterfly: '#ff4d8b', drone: '#00ffe1' };

export default class GalagaRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._stars   = [];
    this._keys    = new Set();

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
    this._keyLoop   = null;
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    if (this._keyLoop) { cancelAnimationFrame(this._keyLoop); this._keyLoop = null; }
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('gl-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('gl-styles')) return;
    const s = document.createElement('style');
    s.id = 'gl-styles';
    s.textContent = `
      .gl-wrapper { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
        justify-content:center; background:#050810; font-family:Orbitron,monospace; overflow:hidden; }
      .gl-canvas  { display:block; }
      .gl-info    { position:absolute; top:6px; left:50%; transform:translateX(-50%);
        font-size:10px; color:rgba(255,255,255,0.35); letter-spacing:.1em; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'gl-wrapper';

    this._info = document.createElement('div');
    this._info.className = 'gl-info';
    this._info.textContent = '← → DÉPLACER  ESPACE TIRER';

    const { width, height } = this.config.gameplay;

    // Scale canvas to fit viewport
    const vw = this.viewport.clientWidth  || 400;
    const vh = this.viewport.clientHeight || 580;
    const scale = Math.min(vw / width, vh / height, 1);
    this._scale = scale;

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'gl-canvas';
    this._canvas.width  = width;
    this._canvas.height = height;
    this._canvas.style.width  = Math.floor(width  * scale) + 'px';
    this._canvas.style.height = Math.floor(height * scale) + 'px';
    this._ctx = this._canvas.getContext('2d');

    // Generate stars
    this._stars = Array.from({ length: 80 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.5 + 0.3,
      b: Math.random() * 0.8 + 0.2,
    }));

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this._wrapper.appendChild(this._canvas);
    this._wrapper.appendChild(this._info);
    this.viewport.appendChild(this._wrapper);
  }

  _showStartScreen() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique',
         options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this.game.start(sel); this._startKeyLoop(); },
    );
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
  }

  _onKeyDown(e) {
    const k = this.config.controls?.keyboard ?? {};
    if ((k.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); return; }
    if ((k.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); return; }
    if (['ArrowLeft','KeyA'].includes(e.code))  { e.preventDefault(); this._keys.add('left'); }
    if (['ArrowRight','KeyD'].includes(e.code)) { e.preventDefault(); this._keys.add('right'); }
    if (['Space','ArrowUp','KeyW'].includes(e.code)) { e.preventDefault(); this._keys.add('shoot'); }
  }

  _onKeyUp(e) {
    if (['ArrowLeft','KeyA'].includes(e.code))  this._keys.delete('left');
    if (['ArrowRight','KeyD'].includes(e.code)) this._keys.delete('right');
    if (['Space','ArrowUp','KeyW'].includes(e.code)) this._keys.delete('shoot');
  }

  _startKeyLoop() {
    let lastShoot = 0;
    const loop = () => {
      if (this.game.state.status !== 'playing') { this._keyLoop = requestAnimationFrame(loop); return; }
      if (this._keys.has('left'))  this.game.moveLeft();
      else if (this._keys.has('right')) this.game.moveRight();
      else this.game.stopMove();
      const now = Date.now();
      if (this._keys.has('shoot') && now - lastShoot > 150) {
        this.game.shoot();
        lastShoot = now;
      }
      this._keyLoop = requestAnimationFrame(loop);
    };
    this._keyLoop = requestAnimationFrame(loop);
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    this._draw(state);
  }

  _draw(state) {
    const ctx = this._ctx;
    const { width, height } = this.config.gameplay;

    // Background
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, width, height);

    // Stars
    this._stars.forEach(s => {
      ctx.globalAlpha = s.b;
      ctx.fillStyle   = '#fff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Wave indicator
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '10px Orbitron,monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`VAGUE ${state.wave}`, width - 6, 14);

    // Enemy bullets
    ctx.fillStyle = '#ff8040';
    state.enemyBullets.forEach(b => {
      ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
    });

    // Player bullets
    ctx.fillStyle = '#00ffe1';
    state.bullets.forEach(b => {
      if (b.y < 0) return;
      ctx.fillRect(b.x - 2, b.y - 7, 4, 14);
    });

    // Enemies
    state.enemies.forEach(e => {
      if (!e.alive) return;
      this._drawEnemy(ctx, e);
    });

    // Player ship
    this._drawShip(ctx, state.player.x, state.player.y);

    // Pause overlay
    if (state.status === 'paused') {
      ctx.fillStyle = 'rgba(5,8,15,0.7)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px Orbitron,monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSE', width / 2, height / 2);
    }
    ctx.textAlign = 'left';
  }

  _drawEnemy(ctx, e) {
    const color = TYPE_COLOR[e.type] || '#fff';
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = e.diving ? 10 : 4;

    if (e.type === 'boss') {
      // Diamond boss
      ctx.beginPath();
      ctx.moveTo(0, -10); ctx.lineTo(12, 0);
      ctx.lineTo(0, 8);  ctx.lineTo(-12, 0);
      ctx.closePath(); ctx.fill();
      // "wings"
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(-12, 0); ctx.lineTo(-18, -6); ctx.lineTo(-10, -4); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(12, 0);  ctx.lineTo(18, -6);  ctx.lineTo(10, -4);  ctx.closePath(); ctx.fill();
    } else if (e.type === 'butterfly') {
      ctx.beginPath();
      ctx.moveTo(0, -9); ctx.lineTo(9, 3); ctx.lineTo(0, 1); ctx.lineTo(-9, 3);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(-6, 4, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc( 6, 4, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(7, 6); ctx.lineTo(-7, 6);
      ctx.closePath(); ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
    ctx.restore();
  }

  _drawShip(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#7b61ff';
    ctx.shadowColor = '#7b61ff';
    ctx.shadowBlur  = 8;
    // Body
    ctx.beginPath();
    ctx.moveTo(0, -14); ctx.lineTo(10, 8); ctx.lineTo(5, 6);
    ctx.lineTo(0, 10);  ctx.lineTo(-5, 6); ctx.lineTo(-10, 8);
    ctx.closePath(); ctx.fill();
    // Cockpit
    ctx.fillStyle = '#00ffe1';
    ctx.beginPath();
    ctx.ellipse(0, -4, 4, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  _onOver(data)    { this._showEnd(data); }
  _showEnd(data)   {
    this._overlay.showGameOver(
      { result: data.result, icon: data.icon, title: data.title,
        score: data.score, isRecord: data.score >= (data.best ?? 0), extraInfo: data.extraInfo ?? '' },
      () => this._showStartScreen(),
    );
  }
  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { if (this._keyLoop) { cancelAnimationFrame(this._keyLoop); this._keyLoop = null; } this._showStartScreen(); }
}
