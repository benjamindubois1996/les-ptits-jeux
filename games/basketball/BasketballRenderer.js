import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const HOOP    = { x: 0.78, y: 0.38, r: 0.045 };
const GRAVITY = 0.0018;
const BALL_ZONES = [0.10, 0.25, 0.38, 0.52];

export default class BasketballRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._canvas   = null;
    this._ctx      = null;
    this._wrapper  = null;
    this._overlay  = null;
    this._state    = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onMouse   = this._onMouse.bind(this);
    this._onClick   = this._onClick.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._overlay = new GameOverlay(this._viewport);
    this._showStart();
    this._bindEvents();
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      () => { this._overlay.hide(); this._game.start(); }
    );
  }

  _injectStyles() {
    if (document.getElementById('basketball-styles')) return;
    const s = document.createElement('style');
    s.id = 'basketball-styles';
    s.textContent = `
      .bball-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 8px;
        box-sizing: border-box; gap: 4px;
        font-family: Orbitron, monospace; overflow: hidden;
      }
      .bball-hud { display: flex; gap: 16px; color: #e0e0e0; font-size: 12px; }
      .bball-hud span { color: #ffd700; font-weight: bold; }
      .bball-canvas-wrap {
        flex: 1; width: 100%;
        display: flex; align-items: center; justify-content: center;
      }
      #bball-canvas { cursor: crosshair; display: block; }
      .bball-msg { color: #a0c4ff; font-size: 12px; text-align: center; min-height: 18px; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'bball-wrapper';

    const hud = document.createElement('div');
    hud.className = 'bball-hud';
    hud.innerHTML = `Score: <span id="bball-score">0</span> &nbsp; Temps: <span id="bball-time">60</span>s &nbsp; Combo: <span id="bball-combo">0</span>`;

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'bball-canvas-wrap';
    this._canvas = document.createElement('canvas');
    this._canvas.id = 'bball-canvas';
    canvasWrap.appendChild(this._canvas);

    const msg = document.createElement('div');
    msg.className = 'bball-msg';
    msg.id = 'bball-msg';

    this._wrapper.append(hud, canvasWrap, msg);
    this._viewport.appendChild(this._wrapper);

    this._ctx = this._canvas.getContext('2d');
    this._resizeCanvas();
  }

  _resizeCanvas() {
    const wrap = this._canvas.parentElement;
    const W = Math.min(wrap.clientWidth  || 380, 500);
    const H = Math.min(wrap.clientHeight || 300, 400);
    this._canvas.width  = W;
    this._canvas.height = H;
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    this._canvas.addEventListener('mousemove', this._onMouse);
    this._canvas.addEventListener('click',     this._onClick);
    this._canvas.addEventListener('touchmove', this._onTouchMove = (e) => {
      e.preventDefault();
      const t = e.touches[0];
      this._onMouse({ clientX: t.clientX, clientY: t.clientY });
    }, { passive: false });
    this._canvas.addEventListener('touchend', this._onTouchEnd = (e) => {
      e.preventDefault(); this._onClick();
    }, { passive: false });
  }

  _onTick({ state }) {
    this._state = state;
    this._updateHUD(state);
    this._draw(state);
  }

  _onOver({ score }) {
    const makes = this._state?.makes ?? 0;
    this._overlay.showGameOver(
      { result: 'lose', score, title: 'TEMPS ÉCOULÉ !', extraInfo: `<div style="color:#aaa;font-size:12px">Paniers : ${makes}</div>` },
      () => { this._overlay.hide(); this._game.restart(); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStart(); }

  _onMouse(e) {
    const s = this._state;
    if (!s || s.status !== 'playing' || s.phase !== 'aiming') return;
    const rect = this._canvas.getBoundingClientRect();
    const scaleX = this._canvas.width / rect.width;
    const scaleY = this._canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top)  * scaleY;
    const W = this._canvas.width, H = this._canvas.height;
    const bx = s.ball.x * W, by = s.ball.y * H;
    const angle = Math.atan2(my - by, mx - bx);
    const dist  = Math.sqrt((mx - bx) ** 2 + (my - by) ** 2);
    const power = Math.min(1.4, Math.max(0.4, dist / (W * 0.3)));
    this._game.aim(angle, power);
  }

  _onClick() {
    if (this._state?.phase === 'aiming') this._game.shoot();
  }

  _draw(state) {
    const c = this._canvas, ctx = this._ctx;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    // Court
    ctx.fillStyle = '#3a2510'; ctx.fillRect(0, 0, W, H);
    const floorY = H * 0.88;
    ctx.fillStyle = '#8B5E2A'; ctx.fillRect(0, floorY, W, H - floorY);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(W, floorY); ctx.stroke();

    // Zone markers
    const threePtX = W * 0.55;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(threePtX, 0); ctx.lineTo(threePtX, floorY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `${Math.max(8,W*0.02)}px monospace`;
    ctx.fillText('3pt', threePtX - W * 0.08, floorY - 4);

    // Backboard
    const bbX = HOOP.x * W + HOOP.r * W * 1.5;
    const bbY = HOOP.y * H - H * 0.09;
    const bbW = W * 0.025, bbH = H * 0.18;
    ctx.fillStyle = 'rgba(200,200,255,0.85)'; ctx.fillRect(bbX, bbY, bbW, bbH);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(bbX, bbY, bbW, bbH);

    // Pole
    ctx.fillStyle = '#999';
    ctx.fillRect(bbX + bbW * 0.4, HOOP.y * H, bbW * 0.2, floorY - HOOP.y * H);

    // Hoop
    const hoopX = HOOP.x * W, hoopY = HOOP.y * H, hoopR = HOOP.r * W;
    ctx.strokeStyle = '#ff6600'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(hoopX, hoopY, hoopR, hoopR * 0.25, 0, 0, Math.PI * 2); ctx.stroke();

    // Net (simple lines)
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const nx = hoopX - hoopR + (i / 5) * hoopR * 2;
      ctx.beginPath(); ctx.moveTo(nx, hoopY); ctx.lineTo(hoopX + (nx - hoopX) * 0.5, hoopY + H * 0.1); ctx.stroke();
    }

    // Trajectory preview
    if (state.status === 'playing' && state.phase === 'aiming' && state.showTrajectory) {
      this._drawTrajectory(ctx, state, W, H);
    }

    // Ball trail
    if (state.ball.trail?.length > 1) {
      ctx.save();
      state.ball.trail.forEach((pt, i) => {
        ctx.globalAlpha = (i / state.ball.trail.length) * 0.35;
        ctx.fillStyle = '#ff6600';
        ctx.beginPath(); ctx.arc(pt.x * W, pt.y * H, W * 0.012, 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
    }

    // Ball
    const bx = state.ball.x * W, by = state.ball.y * H, br = W * 0.033;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
    const bg = ctx.createRadialGradient(bx - br*0.3, by - br*0.3, 0, bx, by, br);
    bg.addColorStop(0, '#ff8833'); bg.addColorStop(0.7, '#cc4400'); bg.addColorStop(1, '#882200');
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(bx, by, br, -Math.PI*0.5, Math.PI*0.5); ctx.stroke();

    // Player stick figure
    const pBase = state.ball.x * W;
    ctx.strokeStyle = '#ffdd88'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pBase, floorY - 12); ctx.lineTo(pBase, floorY - 30); ctx.stroke();
    ctx.fillStyle = '#ffdd88';
    ctx.beginPath(); ctx.arc(pBase, floorY - 35, 5, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ffdd88';
    ctx.beginPath(); ctx.moveTo(pBase-8, floorY-25); ctx.lineTo(pBase+10, floorY-38); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pBase, floorY-12); ctx.lineTo(pBase-6, floorY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pBase, floorY-12); ctx.lineTo(pBase+6, floorY); ctx.stroke();
  }

  _drawTrajectory(ctx, state, W, H) {
    const b = state.ball;
    const speed = 0.012 * state.aim.power;
    let x = b.x * W, y = b.y * H;
    let vx = Math.cos(state.aim.angle) * speed;
    let vy = Math.sin(state.aim.angle) * speed;
    const dt = 16;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,200,100,0.4)'; ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(x, y);
    for (let i = 0; i < 60; i++) {
      vy += GRAVITY * dt; x += vx * dt * W; y += vy * dt * H;
      ctx.lineTo(x, y);
      if (x > W || y > H) break;
    }
    ctx.stroke(); ctx.restore();
  }

  _updateHUD(state) {
    const el = (id) => document.getElementById(id);
    if (el('bball-score')) el('bball-score').textContent = state.score;
    if (el('bball-time'))  el('bball-time').textContent  = Math.ceil(state.timeLeft ?? 0);
    if (el('bball-combo')) el('bball-combo').textContent = state.combo;
    if (el('bball-msg'))   el('bball-msg').textContent   = state.message;
  }

  destroy() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    this._canvas?.removeEventListener('mousemove', this._onMouse);
    this._canvas?.removeEventListener('click',     this._onClick);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('basketball-styles')?.remove();
  }
}
