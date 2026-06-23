import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

export default class CentipedeRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._keys    = new Set();
    this._shootTimer = 0;
    this._keyLoop    = null;

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
    document.getElementById('ct-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('ct-styles')) return;
    const s = document.createElement('style');
    s.id = 'ct-styles';
    s.textContent = `
      .ct-wrapper { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
        background:#050810; font-family:Orbitron,monospace; overflow:hidden; }
      .ct-canvas  { display:block; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'ct-wrapper';

    const cfg = this.config.gameplay;
    const canvasW = cfg.cols * cfg.cellSize;
    const canvasH = cfg.rows * cfg.cellSize;

    const vw = this.viewport.clientWidth  || canvasW;
    const vh = this.viewport.clientHeight || canvasH;
    const scale = Math.min(vw / canvasW, vh / canvasH, 1);
    this._scale = scale;
    this._cfg   = cfg;

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'ct-canvas';
    this._canvas.width  = canvasW;
    this._canvas.height = canvasH;
    this._canvas.style.width  = Math.floor(canvasW * scale) + 'px';
    this._canvas.style.height = Math.floor(canvasH * scale) + 'px';
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
    const dirs = { ArrowLeft:'l', KeyA:'l', ArrowRight:'r', KeyD:'r', ArrowUp:'u', KeyW:'u', ArrowDown:'d', KeyS:'d' };
    if (dirs[e.code]) { e.preventDefault(); this._keys.add(dirs[e.code]); }
    if (e.code === 'Space') { e.preventDefault(); this._keys.add('shoot'); }
  }

  _onKeyUp(e) {
    const dirs = { ArrowLeft:'l', KeyA:'l', ArrowRight:'r', KeyD:'r', ArrowUp:'u', KeyW:'u', ArrowDown:'d', KeyS:'d' };
    if (dirs[e.code]) this._keys.delete(dirs[e.code]);
    if (e.code === 'Space') this._keys.delete('shoot');
  }

  _startKeyLoop() {
    let last = performance.now();
    const loop = (t) => {
      const dt = Math.min((t - last) / 1000, 0.05); last = t;
      if (this.game.state.status === 'playing') {
        const dx = (this._keys.has('r') ? 1 : 0) - (this._keys.has('l') ? 1 : 0);
        const dy = (this._keys.has('d') ? 1 : 0) - (this._keys.has('u') ? 1 : 0);
        if (dx || dy) this.game.movePlayer(dx, dy);
        if (this._keys.has('shoot')) this.game.shoot();
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
    const cfg = this._cfg;
    const CS  = cfg.cellSize;
    const W   = cfg.cols * CS;
    const H   = cfg.rows * CS;

    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, W, H);

    // Player zone divider
    const zoneY = (cfg.rows - cfg.playerZoneRows) * CS;
    ctx.fillStyle = 'rgba(0,255,225,0.04)';
    ctx.fillRect(0, zoneY, W, H - zoneY);
    ctx.strokeStyle = 'rgba(0,255,225,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, zoneY); ctx.lineTo(W, zoneY); ctx.stroke();

    // Mushrooms
    Object.entries(state.mushrooms).forEach(([key, hits]) => {
      const [r, c] = key.split(',').map(Number);
      const x = c * CS + CS / 2, y = r * CS + CS / 2;
      const colors = ['#5a2d0c','#8B4513','#c45c14','#e8851c'];
      ctx.fillStyle = colors[Math.min(hits - 1, 3)];
      ctx.beginPath(); ctx.arc(x, y, CS * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Centipede
    state.segments.forEach((s, i) => {
      if (!s.alive) return;
      const x = s.c * CS + CS / 2;
      const y = s.r * CS + CS / 2;
      const isHead = i === 0 || !state.segments[i-1]?.alive;
      ctx.fillStyle = isHead ? '#ffe030' : '#a0e040';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur  = 4;
      ctx.beginPath(); ctx.arc(x, y, CS * 0.4, 0, Math.PI * 2); ctx.fill();
      if (isHead) {
        // Eyes
        ctx.fillStyle = '#000';
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(x - 3, y - 2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 3, y - 2, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
    });

    // Spider
    if (state.spider) {
      const sx = state.spider.x * CS + CS / 2;
      const sy = state.spider.y * CS + CS / 2;
      ctx.fillStyle = '#ff4d8b';
      ctx.shadowColor = '#ff4d8b'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(sx, sy, CS * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // Legs
      ctx.strokeStyle = '#ff4d8b';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a) * CS * 0.7, sy + Math.sin(a) * CS * 0.7);
        ctx.stroke();
      }
    }

    // Bullet
    if (state.bullet) {
      const bx = state.bullet.x * CS + CS / 2;
      const by = state.bullet.y * CS + CS / 2;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 6;
      ctx.fillRect(bx - 2, by - 6, 4, 12);
      ctx.shadowBlur = 0;
    }

    // Player ship
    const px = state.player.x * CS + CS / 2;
    const py = state.player.y * CS + CS / 2;
    ctx.fillStyle = '#7b61ff';
    ctx.shadowColor = '#7b61ff'; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(px, py - CS * 0.45);
    ctx.lineTo(px + CS * 0.38, py + CS * 0.38);
    ctx.lineTo(px, py + CS * 0.2);
    ctx.lineTo(px - CS * 0.38, py + CS * 0.38);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;

    // Wave
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '10px Orbitron,monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`VAGUE ${state.wave}`, W - 6, 14);
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
  _onRestart() { if (this._keyLoop) { cancelAnimationFrame(this._keyLoop); this._keyLoop = null; } this._showStartScreen(); }
}
