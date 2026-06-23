import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const PU_COLORS = { wide:'#00ffe1', laser:'#ff4d8b', slow:'#7b61ff', life:'#00ff88', multi:'#ffe030' };
const PU_LABELS = { wide:'W', laser:'L', slow:'S', life:'♥', multi:'M' };

export default class ArkanoidRenderer {
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
    this._mouseX  = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onTouch     = this._onTouch.bind(this);
    this._onClick     = this._onClick.bind(this);
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
    document.getElementById('ak-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('ak-styles')) return;
    const s = document.createElement('style');
    s.id = 'ak-styles';
    s.textContent = `
      .ak-wrapper { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
        justify-content:center; background:#050810; font-family:Orbitron,monospace; overflow:hidden; gap:4px; }
      .ak-hud    { font-size:10px; color:rgba(255,255,255,0.4); letter-spacing:.1em; display:flex; gap:18px; }
      .ak-canvas { display:block; cursor:none; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'ak-wrapper';

    this._hud = document.createElement('div');
    this._hud.className = 'ak-hud';
    this._hud.innerHTML = `NIVEAU <span id="ak-lvl">1</span>`;

    const { width, height } = this.config.gameplay;
    const vw = this.viewport.clientWidth  || width;
    const vh = (this.viewport.clientHeight || height) - 30;
    const scale = Math.min(vw / width, vh / height, 1);
    this._scale  = scale;

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'ak-canvas';
    this._canvas.width  = width;
    this._canvas.height = height;
    this._canvas.style.width  = Math.floor(width  * scale) + 'px';
    this._canvas.style.height = Math.floor(height * scale) + 'px';
    this._ctx = this._canvas.getContext('2d');

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this._wrapper.appendChild(this._hud);
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
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
    this._canvas.addEventListener('mousemove', this._onMouseMove);
    this._canvas.addEventListener('touchmove', this._onTouch, { passive: true });
    this._canvas.addEventListener('click',     this._onClick);
    this._canvas.addEventListener('touchstart',this._onClick, { passive: true });
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
    this._canvas.removeEventListener('mousemove', this._onMouseMove);
    this._canvas.removeEventListener('touchmove', this._onTouch);
    this._canvas.removeEventListener('click',     this._onClick);
    this._canvas.removeEventListener('touchstart',this._onClick);
  }

  _onKeyDown(e) {
    const k = this.config.controls?.keyboard ?? {};
    if ((k.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); return; }
    if ((k.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); return; }
    if (['ArrowLeft','KeyA'].includes(e.code))  { e.preventDefault(); this._keys.add('l'); }
    if (['ArrowRight','KeyD'].includes(e.code)) { e.preventDefault(); this._keys.add('r'); }
    if (['Space'].includes(e.code)) { e.preventDefault(); this.game.launchBall(); }
  }

  _onKeyUp(e) {
    if (['ArrowLeft','KeyA'].includes(e.code))  this._keys.delete('l');
    if (['ArrowRight','KeyD'].includes(e.code)) this._keys.delete('r');
  }

  _onMouseMove(e) {
    const rect = this._canvas.getBoundingClientRect();
    this._mouseX = (e.clientX - rect.left) / this._scale;
  }

  _onTouch(e) {
    const rect = this._canvas.getBoundingClientRect();
    this._mouseX = (e.touches[0].clientX - rect.left) / this._scale;
  }

  _onClick() { this.game.launchBall(); }

  _startKeyLoop() {
    const loop = () => {
      if (this.game.state.status === 'playing') {
        if (this._mouseX !== null) {
          this.game.movePaddle(this._mouseX);
          this._mouseX = null;
        } else {
          const dx = (this._keys.has('r') ? 1 : 0) - (this._keys.has('l') ? 1 : 0);
          if (dx) this.game.movePaddleDelta(dx);
        }
      }
      this._keyLoop = requestAnimationFrame(loop);
    };
    this._keyLoop = requestAnimationFrame(loop);
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    const lvlEl = document.getElementById('ak-lvl');
    if (lvlEl) lvlEl.textContent = state.level;
    this._draw(state);
  }

  _draw(state) {
    const ctx = this._ctx;
    const cfg = this.config.gameplay;
    const { width, height, paddleH, ballRadius, brickW, brickH, brickCols } = cfg;
    const brickOffX = (width - brickCols * (brickW + 2)) / 2;
    const brickOffY = 40;
    const paddleY   = height - 30;

    // Background
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, width, height);

    // Side walls hint
    ctx.strokeStyle = 'rgba(123,97,255,0.15)';
    ctx.lineWidth   = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    // Bricks
    state.bricks.forEach(b => {
      if (!b.alive) return;
      const x = brickOffX + b.col * (brickW + 2);
      const y = brickOffY + b.row * (brickH + 3);

      if (b.type === 'unbreakable') {
        ctx.fillStyle = '#444';
        ctx.fillRect(x, y, brickW, brickH);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x, y, brickW, 3);
        return;
      }

      const alpha = b.type === 'hard' ? (b.hits >= 2 ? 1 : 0.55) : 1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `hsl(${b.hue},80%,55%)`;
      ctx.fillRect(x, y, brickW, brickH);
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(x, y, brickW, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x, y + brickH - 3, brickW, 3);
      ctx.globalAlpha = 1;
    });

    // Falling power-ups
    state.fallingPUs.forEach(pu => {
      const color = PU_COLORS[pu.type] || '#fff';
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(pu.x - 14, pu.y - 8, 28, 16);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px Orbitron,monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(PU_LABELS[pu.type] || '?', pu.x, pu.y);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    });

    // Balls
    state.balls.forEach(ball => {
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#00ffe1'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Paddle
    const pw = state.paddle.w;
    const px = state.paddle.x - pw / 2;
    const grad = ctx.createLinearGradient(px, paddleY, px, paddleY + paddleH);
    grad.addColorStop(0, '#a080ff');
    grad.addColorStop(1, '#5030cc');
    ctx.fillStyle = grad;
    ctx.shadowColor = '#7b61ff'; ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.roundRect(px, paddleY, pw, paddleH, 4);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Active power-up indicator
    let puText = '';
    if (state.powerUp.wide)  puText += ` WIDE(${state.powerUp.wideTimer | 0}s)`;
    if (state.powerUp.slow)  puText += ` SLOW(${state.powerUp.slowTimer | 0}s)`;
    if (puText) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '9px Orbitron,monospace';
      ctx.textAlign = 'center';
      ctx.fillText(puText.trim(), width / 2, height - 4);
    }

    // Hint when ball stuck
    if (state.balls.some(b => b.stuck)) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '9px Orbitron,monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ESPACE ou CLIC pour lancer', width / 2, paddleY - 12);
    }
    ctx.textAlign = 'left';
  }

  _onOver(data)   { this._showEnd(data); }
  _onWon(data)    { this._showEnd(data); }
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
