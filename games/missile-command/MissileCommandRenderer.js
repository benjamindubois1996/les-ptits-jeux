import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

export default class MissileCommandRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onClick   = this._onClick.bind(this);
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
    document.getElementById('mc-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('mc-styles')) return;
    const s = document.createElement('style');
    s.id = 'mc-styles';
    s.textContent = `
      .mc-wrapper { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
        background:#050810; font-family:Orbitron,monospace; overflow:hidden; }
      .mc-canvas  { display:block; cursor:crosshair; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'mc-wrapper';

    const { width, height } = this.config.gameplay;
    const vw = this.viewport.clientWidth  || width;
    const vh = this.viewport.clientHeight || height;
    const scale = Math.min(vw / width, vh / height, 1);
    this._scale = scale;

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'mc-canvas';
    this._canvas.width  = width;
    this._canvas.height = height;
    this._canvas.style.width  = Math.floor(width  * scale) + 'px';
    this._canvas.style.height = Math.floor(height * scale) + 'px';
    this._ctx = this._canvas.getContext('2d');

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this._wrapper.appendChild(this._canvas);
    this.viewport.appendChild(this._wrapper);
  }

  _showStartScreen() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique',
         options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this.game.start(sel); },
    );
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown',  this._onKeyDown);
    this._canvas.addEventListener('click',      this._onClick);
    this._canvas.addEventListener('touchstart', this._onClick, { passive: true });
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown',  this._onKeyDown);
    this._canvas.removeEventListener('click',      this._onClick);
    this._canvas.removeEventListener('touchstart', this._onClick);
  }

  _onKeyDown(e) {
    const k = this.config.controls?.keyboard ?? {};
    if ((k.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if ((k.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
  }

  _onClick(e) {
    if (this.game.state.status !== 'playing') return;
    const rect = this._canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left)  / this._scale;
    const y = (clientY - rect.top)   / this._scale;
    this.game.intercept(x, y);
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    this._draw(state);
  }

  _draw(state) {
    const ctx = this._ctx;
    const { width, height } = this.config.gameplay;
    const groundY = height - 30;

    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, '#050810');
    grad.addColorStop(1, '#0a1520');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Ground
    ctx.fillStyle = '#1a3040';
    ctx.fillRect(0, groundY, width, height - groundY);
    ctx.strokeStyle = '#2a5060';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(width, groundY); ctx.stroke();

    // Wave label
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px Orbitron,monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`VAGUE ${state.wave}`, width / 2, 16);

    // Missile trails
    state.missiles.forEach(m => {
      if (!m.alive) return;
      ctx.strokeStyle = 'rgba(255,80,80,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(m.x - m.vx * 20, m.y - m.vy * 20);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
      ctx.fillStyle = '#ff4040';
      ctx.beginPath(); ctx.arc(m.x, m.y, 3, 0, Math.PI * 2); ctx.fill();
    });

    // Interceptors
    state.interceptors.forEach(i => {
      ctx.strokeStyle = 'rgba(0,255,225,0.7)';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(i.x - i.vx * 6, i.y - i.vy * 6);
      ctx.lineTo(i.x, i.y);
      ctx.stroke();
      ctx.fillStyle = '#00ffe1';
      ctx.beginPath(); ctx.arc(i.x, i.y, 3, 0, Math.PI * 2); ctx.fill();
    });

    // Explosions
    const now = Date.now();
    state.explosions.forEach(ex => {
      const age  = now - ex.born;
      const pct  = age / ex.dur;
      const alpha = pct < 0.5 ? pct * 2 : 2 - pct * 2;
      ctx.globalAlpha = alpha * 0.8;
      const grad2 = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, ex.r);
      grad2.addColorStop(0,   'rgba(255,255,200,0.9)');
      grad2.addColorStop(0.4, 'rgba(255,160,0,0.6)');
      grad2.addColorStop(1,   'rgba(255,80,0,0)');
      ctx.fillStyle = grad2;
      ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Cities
    state.cities.forEach(c => {
      if (!c.alive) {
        ctx.fillStyle = '#333';
        ctx.fillRect(c.x - 16, c.y - 6, 32, 20);
        return;
      }
      ctx.fillStyle = '#4af';
      // Simple city silhouette
      ctx.fillRect(c.x - 16, c.y,     32,  8);
      ctx.fillRect(c.x - 10, c.y - 8, 8,   8);
      ctx.fillRect(c.x +  2, c.y - 6, 8,   6);
      ctx.fillRect(c.x - 4,  c.y - 4, 6,   4);
    });

    // Batteries
    state.batteries.forEach(b => {
      if (!b.alive) return;
      ctx.fillStyle = '#8f8';
      ctx.fillRect(b.x - 14, b.y - 8, 28, 10);
      // Ammo dots
      for (let i = 0; i < b.ammo; i++) {
        ctx.fillStyle = '#ffe030';
        ctx.beginPath(); ctx.arc(b.x - 12 + i * 2.5, b.y + 4, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    });

    ctx.textAlign = 'left';
  }

  _onOver(data)   { this._showEnd(data); }
  _showEnd(data)  {
    this._overlay.showGameOver(
      { result: data.result, icon: data.icon, title: data.title,
        score: data.score, isRecord: data.score >= (data.best ?? 0), extraInfo: data.extraInfo ?? '' },
      () => this._showStartScreen(),
    );
  }
  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStartScreen(); }
}
