import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';
import Particles   from '../../js/core/Particles.js';

export default class LunarLanderRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._particles = new Particles();
    this._lastTs  = null;
    this._rafId   = null;

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
    document.getElementById('ll-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('ll-styles')) return;
    const el = document.createElement('style');
    el.id = 'll-styles';
    el.textContent = `
      .ll-wrapper {
        position:absolute; inset:0;
        display:flex; flex-direction:column;
        background:#000; font-family:Orbitron,monospace; overflow:hidden; color:#fff;
      }
      .ll-hud {
        flex:0 0 auto; padding:6px 16px; background:#050810;
        display:flex; justify-content:space-between; align-items:center; font-size:11px;
        border-bottom:1px solid rgba(0,255,225,0.12); letter-spacing:0.1em;
        color:rgba(255,255,255,0.55);
      }
      .ll-canvas-area { flex:1; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; }
      .ll-canvas { display:block; }
      .ll-fuel-bar {
        position:absolute; bottom:8px; left:50%; transform:translateX(-50%);
        width:160px; height:10px; border-radius:5px;
        background:rgba(255,255,255,0.1); overflow:hidden;
      }
      .ll-fuel-fill {
        height:100%; background:#00ffe1; border-radius:5px;
        transition:width 0.1s; width:100%;
      }
      .ll-hint {
        position:absolute; bottom:24px; left:50%; transform:translateX(-50%);
        font-size:9px; color:rgba(255,255,255,0.25); letter-spacing:0.08em; white-space:nowrap;
      }
    `;
    document.head.appendChild(el);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'll-wrapper';

    this._hudEl = document.createElement('div');
    this._hudEl.className = 'll-hud';
    this._hudEl.innerHTML = `<span id="ll-level">Niveau 1</span><span id="ll-status">Prêt</span>`;

    const area = document.createElement('div');
    area.className = 'll-canvas-area';

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'll-canvas';
    this._canvas.width  = 700;
    this._canvas.height = 500;
    this._ctx = this._canvas.getContext('2d');
    area.appendChild(this._canvas);

    const fuelBar = document.createElement('div');
    fuelBar.className = 'll-fuel-bar';
    this._fuelFill = document.createElement('div');
    this._fuelFill.className = 'll-fuel-fill';
    fuelBar.appendChild(this._fuelFill);
    area.appendChild(fuelBar);

    const hint = document.createElement('div');
    hint.className = 'll-hint';
    hint.textContent = '↑ Propulsion · ← → Rotation';
    area.appendChild(hint);

    this._wrapper.appendChild(this._hudEl);
    this._wrapper.appendChild(area);

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

  _onTick({ state, action }) {
    if (state.status === 'idle') { this._overlay.show(); return; }

    if (state.ship.thrusting) {
      this._particles.emit(
        state.ship.x + Math.sin(state.ship.angle) * 14,
        state.ship.y + Math.cos(state.ship.angle) * 14,
        { count: 3, angle: state.ship.angle + Math.PI, spread: 0.5,
          speed: 80, color: '#ff6600', life: 300, size: 3 }
      );
    }
    if (action === 'crashed') {
      this._particles.emit(state.ship.x, state.ship.y,
        { count: 30, angle: 0, spread: Math.PI * 2, speed: 120, color: '#ff4400', life: 800, size: 4 });
    }

    const lvlEl    = document.getElementById('ll-level');
    const statusEl = document.getElementById('ll-status');
    if (lvlEl)    lvlEl.textContent    = `Niveau ${state.level}`;
    if (statusEl) {
      const msgs = { playing: 'En vol', crashed: '💥 CRASH !', 'level-complete': '✅ POSÉ !' };
      statusEl.textContent = msgs[state.status] ?? '';
    }
    const fuelPct = state.ship.fuel / this.config.gameplay.initialFuel * 100;
    if (this._fuelFill) {
      this._fuelFill.style.width = `${fuelPct}%`;
      this._fuelFill.style.background = fuelPct < 20 ? '#ff4400' : fuelPct < 50 ? '#ff9900' : '#00ffe1';
    }
  }

  _onOver(data) {
    const best = data.best ?? 0;
    this._overlay.showGameOver(
      { result: 'lose', icon: '🚀', title: 'CRASH !', score: data.score,
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
    const W     = this._canvas.width;
    const H     = this._canvas.height;

    ctx.fillStyle = '#000010';
    ctx.fillRect(0, 0, W, H);

    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 80; i++) {
      const sx = (i * 137 + 17) % W;
      const sy = (i * 97 + 31) % (H - 100);
      ctx.fillRect(sx, sy, 1, 1);
    }

    if (!state.terrain?.points?.length) return;

    // Terrain
    const pts = state.terrain.points;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = '#1a2840';
    ctx.fill();
    ctx.strokeStyle = '#00ffe1';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Landing pad
    const pad = state.terrain.pad;
    ctx.fillStyle = '#00ff88';
    ctx.fillRect(pad.x, pad.y - 3, pad.w, 4);
    ctx.fillStyle = 'rgba(0,255,136,0.15)';
    ctx.fillRect(pad.x, pad.y - 20, pad.w, 20);

    // Ship
    const ship = state.ship;
    if (state.status !== 'gameover') {
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.angle);
      ctx.strokeStyle = state.status === 'crashed' ? '#ff4400' : '#00ffe1';
      ctx.lineWidth = 2;
      // Body
      ctx.beginPath();
      ctx.moveTo(0, -14); ctx.lineTo(-8, 10); ctx.lineTo(8, 10); ctx.closePath();
      ctx.stroke();
      // Legs
      ctx.beginPath();
      ctx.moveTo(-8, 10); ctx.lineTo(-14, 16);
      ctx.moveTo(8, 10);  ctx.lineTo(14, 16);
      ctx.stroke();
      ctx.restore();
    }

    this._particles.draw(ctx);
  }
}
