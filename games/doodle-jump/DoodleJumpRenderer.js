import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const PLT_COLORS = {
  normal:   '#4caf50',
  moving:   '#2196f3',
  breaking: '#ff7043',
  spring:   '#ffe030',
};

export default class DoodleJumpRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._keys    = new Set();
    this._keyLoop = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
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
    document.getElementById('dj-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('dj-styles')) return;
    const s = document.createElement('style');
    s.id = 'dj-styles';
    s.textContent = `
      .dj-wrapper { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
        background:#050810; font-family:Orbitron,monospace; overflow:hidden; }
      .dj-canvas  { display:block; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'dj-wrapper';

    const { width, height } = this.config.gameplay;
    const vw = this.viewport.clientWidth  || width;
    const vh = this.viewport.clientHeight || height;
    const scale = Math.min(vw / width, vh / height, 1);
    this._scale = scale;

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'dj-canvas';
    this._canvas.width  = width;
    this._canvas.height = height;
    this._canvas.style.width  = Math.floor(width  * scale) + 'px';
    this._canvas.style.height = Math.floor(height * scale) + 'px';
    this._ctx = this._canvas.getContext('2d');

    // Stars background (static)
    this._stars = Array.from({ length: 60 }, () => ({
      x: Math.random() * width, y: Math.random() * height,
      r: Math.random() * 1.2 + 0.3, b: Math.random() * 0.6 + 0.2,
    }));

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this._wrapper.appendChild(this._canvas);
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
    // Touch: tilt-like — swipe direction
    this._canvas.addEventListener('touchstart', this._onTouchStart = (e) => {
      this._touchX = e.touches[0].clientX;
    }, { passive: true });
    this._canvas.addEventListener('touchmove', this._onTouchMove = (e) => {
      const dx = e.touches[0].clientX - this._touchX;
      this.game.setInputX(dx * 0.12);
    }, { passive: true });
    this._canvas.addEventListener('touchend', this._onTouchEnd = () => {
      this.game.setInputX(0);
    }, { passive: true });
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
    this._canvas.removeEventListener('touchstart', this._onTouchStart);
    this._canvas.removeEventListener('touchmove',  this._onTouchMove);
    this._canvas.removeEventListener('touchend',   this._onTouchEnd);
  }

  _onKeyDown(e) {
    const k = this.config.controls?.keyboard ?? {};
    if ((k.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); return; }
    if ((k.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); return; }
    if (['ArrowLeft','KeyA'].includes(e.code))  { e.preventDefault(); this._keys.add('l'); }
    if (['ArrowRight','KeyD'].includes(e.code)) { e.preventDefault(); this._keys.add('r'); }
  }

  _onKeyUp(e) {
    if (['ArrowLeft','KeyA'].includes(e.code))  this._keys.delete('l');
    if (['ArrowRight','KeyD'].includes(e.code)) this._keys.delete('r');
  }

  _startKeyLoop() {
    const loop = () => {
      if (this.game.state.status === 'playing') {
        const dx = (this._keys.has('r') ? 1 : 0) - (this._keys.has('l') ? 1 : 0);
        this.game.setInputX(dx * 6);
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
    const cfg = this.config.gameplay;
    const { width, height } = cfg;
    const cam = state.camera; // worldY of screen top

    // Background
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, width, height);

    // Stars
    this._stars.forEach(s => {
      ctx.globalAlpha = s.b;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Score
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px Orbitron,monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${state.score} m`, width - 8, 18);

    // Platforms
    state.platforms.forEach(p => {
      if (!p.alive) return;
      const sx = p.x;
      const sy = p.y - cam;
      if (sy < -20 || sy > height + 20) return;

      const color = PLT_COLORS[p.type] || '#4caf50';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(sx, sy, cfg.platformW, cfg.platformH, 6);
      ctx.fill();

      // Highlight top
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.roundRect(sx + 4, sy + 2, cfg.platformW - 8, 4, 2);
      ctx.fill();

      // Spring indicator
      if (p.hasSpring) {
        ctx.fillStyle = '#ffe030';
        ctx.fillRect(sx + cfg.platformW / 2 - 4, sy - 10, 8, 10);
        ctx.fillStyle = '#ff8020';
        ctx.beginPath();
        ctx.arc(sx + cfg.platformW / 2, sy - 12, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Breaking: crack lines
      if (p.type === 'breaking') {
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx + cfg.platformW * 0.3, sy);
        ctx.lineTo(sx + cfg.platformW * 0.4, sy + cfg.platformH);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx + cfg.platformW * 0.65, sy);
        ctx.lineTo(sx + cfg.platformW * 0.55, sy + cfg.platformH);
        ctx.stroke();
      }
    });

    // Enemies
    state.enemies.forEach(e => {
      const sx = e.x, sy = e.y - cam;
      if (sy < -40 || sy > height + 40) return;
      // Simple alien face
      ctx.fillStyle = '#ff4d8b';
      ctx.shadowColor = '#ff4d8b'; ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(sx + e.w / 2, sy + e.h / 2, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Eyes
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(sx + e.w * 0.3, sy + e.h * 0.4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + e.w * 0.7, sy + e.h * 0.4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(sx + e.w * 0.3 + 1, sy + e.h * 0.4 - 1, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + e.w * 0.7 + 1, sy + e.h * 0.4 - 1, 1.5, 0, Math.PI * 2); ctx.fill();
    });

    // Player (Doodler)
    const px = state.player.x - cfg.playerW / 2;
    const py = state.player.y - cam - cfg.playerH / 2;
    const facingRight = state.player.vx >= 0;

    // Body
    ctx.fillStyle = '#7b61ff';
    ctx.shadowColor = '#7b61ff'; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(px, py, cfg.playerW, cfg.playerH, 8);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Eyes
    const eyeX = facingRight ? px + cfg.playerW * 0.65 : px + cfg.playerW * 0.35;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(eyeX, py + cfg.playerH * 0.35, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(eyeX + (facingRight ? 1 : -1), py + cfg.playerH * 0.35, 2.5, 0, Math.PI * 2); ctx.fill();

    // Nose
    ctx.fillStyle = '#ff8c00';
    ctx.beginPath();
    const noseX = facingRight ? px + cfg.playerW - 2 : px + 2;
    ctx.arc(noseX, py + cfg.playerH * 0.5, 4, 0, Math.PI * 2);
    ctx.fill();

    // Hint
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = '9px Orbitron,monospace';
    ctx.textAlign = 'center';
    ctx.fillText('← → pour diriger', width / 2, height - 6);
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
  _onRestart() {
    if (this._keyLoop) { cancelAnimationFrame(this._keyLoop); this._keyLoop = null; }
    this._showStartScreen();
  }
}
