import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const PIN_POS = [
  { x: 0.50, y: 0.22 },
  { x: 0.44, y: 0.32 },
  { x: 0.56, y: 0.32 },
  { x: 0.38, y: 0.42 },
  { x: 0.50, y: 0.42 },
  { x: 0.62, y: 0.42 },
  { x: 0.32, y: 0.52 },
  { x: 0.44, y: 0.52 },
  { x: 0.56, y: 0.52 },
  { x: 0.68, y: 0.52 },
];

export default class BowlingRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._canvas   = null;
    this._ctx      = null;
    this._wrapper  = null;
    this._overlay  = null;
    this._state    = null;
    this._raf      = null;

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
    if (document.getElementById('bowling-styles')) return;
    const s = document.createElement('style');
    s.id = 'bowling-styles';
    s.textContent = `
      .bowling-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 8px;
        box-sizing: border-box; gap: 6px;
        font-family: Orbitron, monospace; overflow: hidden;
      }
      .bowling-msg {
        color: #a0c4ff; font-size: 12px;
        text-align: center; min-height: 18px;
      }
      .bowling-canvas-wrap {
        flex: 1; display: flex;
        align-items: center; justify-content: center;
        width: 100%; overflow: hidden;
      }
      #bowling-canvas { cursor: crosshair; display: block; }
      .bowling-scoreboard { width: 100%; overflow-x: auto; display: flex; justify-content: center; }
      .bowling-score-table {
        border-collapse: collapse;
        font-size: 10px; color: #e0e0e0;
      }
      .bowling-score-table th, .bowling-score-table td {
        border: 1px solid #334; padding: 2px 4px;
        text-align: center; min-width: 38px;
      }
      .bowling-score-table th { color: #a0c4ff; background: #111; }
      .bowling-score-table td.active { background: #1a2a3a; }
      .bowling-total { color: #ffd700; font-size: 14px; font-weight: bold; text-align: center; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'bowling-wrapper';

    const msg = document.createElement('div');
    msg.className = 'bowling-msg';
    msg.id = 'bowling-msg';

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'bowling-canvas-wrap';
    this._canvas = document.createElement('canvas');
    this._canvas.id = 'bowling-canvas';
    canvasWrap.appendChild(this._canvas);

    const scoreWrap = document.createElement('div');
    scoreWrap.className = 'bowling-scoreboard';
    scoreWrap.innerHTML = `
      <table class="bowling-score-table">
        <thead><tr>${Array.from({length:10},(_,i)=>`<th>${i+1}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody><tr id="bowling-rolls">${Array.from({length:10},(_,i)=>`<td id="bframe-${i}"></td>`).join('')}<td id="bowling-total">0</td></tr></tbody>
      </table>`;

    const total = document.createElement('div');
    total.className = 'bowling-total';
    total.id = 'bowling-total-big';

    this._wrapper.append(msg, canvasWrap, scoreWrap, total);
    this._viewport.appendChild(this._wrapper);

    this._ctx = this._canvas.getContext('2d');
    this._resizeCanvas();
  }

  _resizeCanvas() {
    const wrap = this._canvas.parentElement;
    const w = wrap.clientWidth  || 380;
    const h = wrap.clientHeight || 320;
    const size = Math.min(w, h, 480);
    this._canvas.width  = size;
    this._canvas.height = Math.round(size * 0.75);
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    this._canvas.addEventListener('mousemove', this._onMouse);
    this._canvas.addEventListener('click',     this._onClick);
    this._canvas.addEventListener('touchstart', this._onTouchStart = (e) => {
      e.preventDefault();
      const t = e.touches[0];
      this._onMouse({ clientX: t.clientX, clientY: t.clientY });
    }, { passive: false });
    this._canvas.addEventListener('touchend', this._onTouchEnd = (e) => {
      e.preventDefault();
      if (this._state?.phase === 'aiming') this._game.throw();
    }, { passive: false });
  }

  _onTick({ state }) {
    this._state = state;
    this._updateMsg(state.message);
    this._updateScoreboard(state);
    if (state.phase === 'throwing') this._animateBall(state);
    else this._draw(state);
  }

  _onOver({ score }) {
    this._overlay.showGameOver(
      { result: 'lose', score, title: 'PARTIE TERMINÉE' },
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
    const cx = this._canvas.width / 2;
    const cy = this._canvas.height * 0.87;
    const mx = (e.clientX - rect.left) * (this._canvas.width / rect.width);
    const my = (e.clientY - rect.top)  * (this._canvas.height / rect.height);
    const angle = Math.atan2(cx - mx, cy - my) * 0.8;
    this._game.setAim(angle);
  }

  _onClick() {
    const s = this._state;
    if (!s || s.status !== 'playing' || s.phase !== 'aiming') return;
    this._game.throw();
  }

  _animateBall(state) {
    if (this._raf) cancelAnimationFrame(this._raf);
    const startT = performance.now();
    const duration = 850;
    const animate = (now) => {
      const t = Math.min((now - startT) / duration, 1);
      const ballY = (1 - t) * 0.87 + t * 0.05;
      const ballX = 0.5 - Math.tan(state.aimAngle) * t * 0.3;
      this._draw({ ...state, _animBall: { x: ballX, y: ballY } });
      if (t < 1) this._raf = requestAnimationFrame(animate);
      else this._raf = null;
    };
    this._raf = requestAnimationFrame(animate);
  }

  _draw(state) {
    const c = this._canvas, ctx = this._ctx;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    // Lane background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1a2a1a');
    grad.addColorStop(1, '#2a3a2a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Lane
    const laneW = W * 0.55, laneX = (W - laneW) / 2;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(180,140,80,0.15)' : 'rgba(160,120,60,0.1)';
      ctx.fillRect(laneX + (i / 6) * laneW, 0, laneW / 6, H);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(laneX, 0); ctx.lineTo(laneX, H);
    ctx.moveTo(laneX + laneW, 0); ctx.lineTo(laneX + laneW, H);
    ctx.stroke();

    // Foul line
    ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(laneX, H * 0.78); ctx.lineTo(laneX + laneW, H * 0.78); ctx.stroke();

    // Aim line
    if (state.status === 'playing' && state.phase === 'aiming') {
      const bx = W * 0.5, by = H * 0.87;
      ctx.save();
      ctx.strokeStyle = 'rgba(100,200,255,0.4)'; ctx.lineWidth = 1;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - Math.tan(state.aimAngle) * H * 0.6, by - H * 0.6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Pins
    const pinR = W * 0.028;
    for (let i = 0; i < 10; i++) {
      const px = PIN_POS[i].x * W, py = PIN_POS[i].y * H;
      ctx.beginPath(); ctx.arc(px, py, pinR, 0, Math.PI * 2);
      if (state.pins[i]) {
        const pg = ctx.createRadialGradient(px - pinR * 0.3, py - pinR * 0.3, 0, px, py, pinR);
        pg.addColorStop(0, '#fff'); pg.addColorStop(0.6, '#dde'); pg.addColorStop(1, '#aab');
        ctx.fillStyle = pg; ctx.fill();
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(100,80,60,0.3)'; ctx.fill();
      }
    }

    // Ball
    const ab = state._animBall;
    const bx = (ab ? ab.x : 0.5) * W;
    const by = (ab ? ab.y : 0.87) * H;
    if (ab || (state.status === 'playing' && state.phase === 'aiming')) {
      this._drawBall(ctx, bx, by, W * 0.04);
    }
  }

  _drawBall(ctx, x, y, r) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, '#7a5ccc'); g.addColorStop(0.5, '#553a99'); g.addColorStop(1, '#2a1a55');
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.arc(x + r*0.2, y - r*0.25, r*0.15, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - r*0.1, y - r*0.38, r*0.12, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r*0.05, y - r*0.42, r*0.12, 0, Math.PI*2); ctx.fill();
  }

  _updateMsg(msg) {
    const el = document.getElementById('bowling-msg');
    if (el) el.textContent = msg;
  }

  _updateScoreboard(state) {
    const totalEl = document.getElementById('bowling-total');
    if (totalEl) totalEl.textContent = state.totalScore;
    const bigEl = document.getElementById('bowling-total-big');
    if (bigEl) bigEl.textContent = state.status === 'over' ? `Score final : ${state.totalScore} / 300` : '';
    for (let f = 0; f < 10; f++) {
      const td = document.getElementById(`bframe-${f}`);
      if (!td) continue;
      const frame = state.frames[f];
      td.className = f === state.frame && state.status === 'playing' ? 'active' : '';
      if (!frame || frame.rolls.length === 0) { td.textContent = ''; continue; }
      if (f < 9) {
        if (frame.rolls[0] === 10) td.textContent = 'X';
        else if (frame.rolls.length >= 2 && frame.rolls[0] + frame.rolls[1] === 10)
          td.textContent = `${frame.rolls[0]} /`;
        else td.textContent = frame.rolls.map(r => r === 0 ? '-' : r).join(' ');
      } else {
        td.textContent = frame.rolls.map(r => r === 10 ? 'X' : r === 0 ? '-' : r).join(' ');
      }
    }
  }

  destroy() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    this._canvas?.removeEventListener('mousemove', this._onMouse);
    this._canvas?.removeEventListener('click',     this._onClick);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('bowling-styles')?.remove();
  }
}
