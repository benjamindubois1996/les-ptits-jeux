import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const TERRAIN_STEP = 6;

function sampleT(ys, step, x) {
  if (x < 0) return ys[0];
  const idx = x / step;
  const i0  = Math.floor(idx);
  if (i0 >= ys.length - 1) return ys[ys.length - 1];
  const f = idx - i0;
  return ys[i0] * (1 - f) + ys[i0 + 1] * f;
}

export default class MotoTrialRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._wrapper  = null;
    this._canvas   = null;
    this._ctx      = null;
    this._overlay  = null;
    this._state    = null;
    this._raf      = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._overlay = new GameOverlay(this._viewport);
    this._showStart();
    this._bindEvents();
    this._startRenderLoop();
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      () => { this._overlay.hide(); this._game.start(); }
    );
  }

  _injectStyles() {
    if (document.getElementById('mt-styles')) return;
    const s = document.createElement('style');
    s.id = 'mt-styles';
    s.textContent = `
      .mt-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 6px;
        box-sizing: border-box; gap: 4px;
        font-family: Orbitron, monospace;
        background: #0a0c14; overflow: hidden;
      }
      .mt-hud {
        display: flex; gap: 18px; font-size: 11px;
        color: #888; justify-content: center; flex-wrap: wrap;
      }
      .mt-hud .val { color: #ffd700; font-weight: bold; }
      .mt-hud .spd { color: #44aaff; font-weight: bold; }
      #mt-canvas { display: block; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'mt-wrapper';
    this._wrapper.innerHTML = `
      <div class="mt-hud">
        <span>DISTANCE <span class="val" id="mt-dist">0</span> m</span>
        <span>VITESSE <span class="spd" id="mt-speed">0</span> km/h</span>
        <span>RECORD <span class="val" id="mt-best">—</span> m</span>
      </div>
      <canvas id="mt-canvas"></canvas>
    `;
    this._viewport.appendChild(this._wrapper);
    this._canvas  = this._wrapper.querySelector('#mt-canvas');
    this._ctx     = this._canvas.getContext('2d');
    this._distEl  = this._wrapper.querySelector('#mt-dist');
    this._speedEl = this._wrapper.querySelector('#mt-speed');
    this._bestEl  = this._wrapper.querySelector('#mt-best');

    const avW = this._viewport.clientWidth  - 12;
    const avH = this._viewport.clientHeight - 50;
    this._canvas.width  = avW;
    this._canvas.height = avH;
  }

  _startRenderLoop() {
    const loop = () => {
      this._render();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _stopRenderLoop() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
  }

  _onTick(e) {
    if (e.action === 'restart') { this._showStart(); this._state = null; return; }
    if (e.action === 'play')    { this._overlay.hide(); }
    this._state = e.state;
    const s = e.state;
    if (!s?.bike) return;
    this._distEl.textContent  = s.bike.maxDist;
    this._speedEl.textContent = Math.abs(Math.floor(s.bike.vx * 0.036));

    // Import best from ScoreService lazily via state score field
    if (s.score > 0) this._bestEl.textContent = s.score;
  }

  _render() {
    const s   = this._state;
    const ctx = this._ctx;
    const W   = this._canvas.width, H = this._canvas.height;

    ctx.clearRect(0, 0, W, H);

    if (!s?.terrain) {
      // Idle screen
      ctx.fillStyle = '#0a0c14';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const { bike, terrain } = s;
    // Camera: bike stays at 30% from left
    const camX = bike.x - W * 0.3;
    const camY = bike.y - H * 0.55;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.65);
    sky.addColorStop(0,   '#0a0a1e');
    sky.addColorStop(0.6, '#1a3055');
    sky.addColorStop(1,   '#2a4a22');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Stars (static, based on camX for parallax)
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 137 + Math.floor(camX * 0.02)) % W + W) % W;
      const sy = ((i * 97)  % (H * 0.5));
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Far hills (parallax)
    ctx.fillStyle = '#162810';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let px = 0; px <= W; px += 30) {
      const wx = camX * 0.3 + px;
      const hy = H * 0.6 + Math.sin(wx * 0.008) * 60 + Math.sin(wx * 0.003) * 100;
      if (px === 0) ctx.moveTo(px, hy); else ctx.lineTo(px, hy);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

    // Terrain polygon
    const visStart = Math.max(0, camX - 20);
    const visEnd   = Math.min(terrain.length, camX + W + 20);
    const step     = TERRAIN_STEP;

    ctx.fillStyle = '#1c3a0e';
    ctx.beginPath();

    let first = true;
    for (let wx = visStart; wx <= visEnd; wx += step) {
      const sx = wx - camX, sy = sampleT(terrain.ys, step, wx) - camY;
      if (first) { ctx.moveTo(sx, sy); first = false; }
      else ctx.lineTo(sx, sy);
    }
    ctx.lineTo(visEnd - camX, H + 20);
    ctx.lineTo(visStart - camX, H + 20);
    ctx.closePath();
    ctx.fill();

    // Terrain surface highlight
    ctx.strokeStyle = '#33aa22'; ctx.lineWidth = 2.5;
    ctx.beginPath(); first = true;
    for (let wx = visStart; wx <= visEnd; wx += step) {
      const sx = wx - camX, sy = sampleT(terrain.ys, step, wx) - camY;
      if (first) { ctx.moveTo(sx, sy); first = false; }
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // Draw bike
    this._drawBike(ctx, bike, camX, camY);

    // Distance markers
    ctx.fillStyle = '#334'; ctx.font = '9px Orbitron, monospace';
    for (let m = 0; m < terrain.length / 100; m += 5) {
      const wx = m * 100;
      const sx = wx - camX;
      if (sx < -20 || sx > W + 20) continue;
      const sy = sampleT(terrain.ys, step, wx) - camY - 12;
      ctx.fillStyle = '#2a4a2a';
      ctx.fillText(`${m}m`, sx - 8, sy);
    }

    // Crash visual
    if (bike.crashed) {
      ctx.fillStyle = 'rgba(255,50,50,0.15)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  _drawBike(ctx, bike, camX, camY) {
    const sx = bike.x - camX;
    const sy = bike.y - camY;
    const a  = bike.angle;
    const wb = 38; // wheelbase
    const wR = 9;  // wheel radius

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a);

    // Rear wheel
    ctx.beginPath();
    ctx.arc(-wb / 2, 0, wR, 0, Math.PI * 2);
    ctx.fillStyle = '#222'; ctx.fill();
    ctx.strokeStyle = '#666'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(-wb / 2, 0, wR * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5; ctx.stroke();

    // Front wheel
    ctx.beginPath();
    ctx.arc(wb / 2, 0, wR, 0, Math.PI * 2);
    ctx.fillStyle = '#222'; ctx.fill();
    ctx.strokeStyle = '#666'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(wb / 2, 0, wR * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#888'; ctx.lineWidth = 1.5; ctx.stroke();

    // Frame
    ctx.strokeStyle = bike.crashed ? '#ff4444' : '#cc8833';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-wb / 2, 0);
    ctx.lineTo(0, -20);
    ctx.lineTo(wb / 2, -2);
    ctx.stroke();

    // Suspension forks
    ctx.strokeStyle = '#999'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wb / 2, -8); ctx.lineTo(wb / 2, wR);
    ctx.stroke();

    // Body / seat
    ctx.fillStyle = bike.crashed ? '#882222' : '#cc6622';
    ctx.beginPath();
    ctx.ellipse(-4, -18, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rider helmet
    ctx.fillStyle = '#4488cc';
    ctx.beginPath();
    ctx.arc(-6, -28, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _onOver(e) {
    this._overlay.showGameOver(
      { result: 'lose', score: e.score, isRecord: e.isRecord,
        extraInfo: `<div style="color:#888;font-size:11px;margin-top:4px">Distance : ${e.score} m</div>` },
      () => EventBus.emit('game:restart')
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }

  destroy() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    this._stopRenderLoop();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('mt-styles')?.remove();
  }
}
