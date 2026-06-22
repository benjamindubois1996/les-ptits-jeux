import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ROWS    = 10;
const COLS    = 11;
const BUCKETS = [100, 30, 10, 5, 2, 500, 2, 5, 10, 30, 100];

function bucketColor(val) {
  if (val >= 500) return '#7b61ff';
  if (val >= 100) return '#00ffe1';
  if (val >= 30)  return '#ffe030';
  if (val >= 10)  return '#ff6b35';
  if (val >= 5)   return '#ff4d8b';
  return '#334466';
}

export default class PlinkoRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._hoverCol = null;

    this._onTick      = this._onTick.bind(this);
    this._onOver      = this._onOver.bind(this);
    this._onPaused    = this._onPaused.bind(this);
    this._onResumed   = this._onResumed.bind(this);
    this._onRestart   = this._onRestart.bind(this);
    this._onKeyDown   = this._onKeyDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseLeave= this._onMouseLeave.bind(this);
    this._onClick     = this._onClick.bind(this);
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
    document.getElementById('pk-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('pk-styles')) return;
    const s = document.createElement('style');
    s.id = 'pk-styles';
    s.textContent = `
      .pk-wrapper {
        position:absolute; inset:0; display:flex; flex-direction:column;
        background:#050810; font-family:Orbitron,monospace; color:#fff; overflow:hidden;
      }
      .pk-hud {
        flex:0 0 auto; display:flex; justify-content:space-between; align-items:center;
        padding:8px 16px; background:rgba(0,0,0,0.4);
        border-bottom:1px solid rgba(0,255,225,0.1); font-size:11px; letter-spacing:.08em;
      }
      .pk-canvas-area {
        flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden;
      }
      .pk-canvas { display:block; cursor:crosshair; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'pk-wrapper';

    const hud = document.createElement('div');
    hud.className = 'pk-hud';
    this._roundLabel = document.createElement('span');
    this._scoreLabel = document.createElement('span');
    hud.appendChild(this._roundLabel);
    hud.appendChild(this._scoreLabel);

    const area = document.createElement('div');
    area.className = 'pk-canvas-area';
    this._canvas = document.createElement('canvas');
    this._canvas.className = 'pk-canvas';
    this._ctx = this._canvas.getContext('2d');
    area.appendChild(this._canvas);

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this._wrapper.appendChild(hud);
    this._wrapper.appendChild(area);
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
    this._canvas.addEventListener('mousemove',  this._onMouseMove);
    this._canvas.addEventListener('mouseleave', this._onMouseLeave);
    this._canvas.addEventListener('click',      this._onClick);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
    this._canvas.removeEventListener('mousemove',  this._onMouseMove);
    this._canvas.removeEventListener('mouseleave', this._onMouseLeave);
    this._canvas.removeEventListener('click',      this._onClick);
  }

  _onKeyDown(e) {
    const k = this.config.controls?.keyboard ?? {};
    if ((k.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if ((k.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
  }

  // ── Layout helpers ──────────────────────────────────────────────

  _layout() {
    const W        = this._canvas.width;
    const H        = this._canvas.height;
    const dropH    = 44;           // height of drop zone at top
    const bucketH  = 52;           // height of bucket row at bottom
    const padX     = 20;
    const boardH   = H - dropH - bucketH;
    const cellW    = (W - padX * 2) / (COLS - 1);
    const rowH     = boardH / ROWS;
    return { W, H, dropH, bucketH, padX, boardH, cellW, rowH };
  }

  _colX(col, L) { return L.padX + col * L.cellW; }

  _stepY(step, L) {
    // step 0 = drop zone, step ROWS = bucket level
    return L.dropH + step * L.rowH;
  }

  _colFromEvent(e, L) {
    const rect = this._canvas.getBoundingClientRect();
    const x    = (e.clientX - rect.left) * (this._canvas.width / rect.width);
    return Math.max(0, Math.min(COLS - 1, Math.round((x - L.padX) / L.cellW)));
  }

  // ── Events ──────────────────────────────────────────────────────

  _onMouseMove(e) {
    this._hoverCol = this._colFromEvent(e, this._layout());
    if (this.game.state.status === 'playing') this._draw(this.game.state);
  }

  _onMouseLeave() {
    this._hoverCol = null;
    if (this.game.state.status === 'playing') this._draw(this.game.state);
  }

  _onClick(e) {
    const { state } = this.game;
    if (state.status !== 'playing' || state.phase !== 'choose') return;
    this.game.drop(this._colFromEvent(e, this._layout()));
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    this._roundLabel.textContent = `BILLE ${state.round} / ${state.totalRounds}`;
    this._scoreLabel.textContent = `SCORE : ${state.score}`;
    this._resizeCanvas();
    this._draw(state);
  }

  _resizeCanvas() {
    const area = this._canvas.parentElement;
    if (!area) return;
    const W = Math.min(area.clientWidth  - 16, 440);
    const H = Math.min(area.clientHeight - 16, 580);
    if (this._canvas.width !== W || this._canvas.height !== H) {
      this._canvas.width  = W;
      this._canvas.height = H;
    }
  }

  // ── Drawing ─────────────────────────────────────────────────────

  _draw(state) {
    const ctx = this._ctx;
    const L   = this._layout();
    const { W, H, dropH, bucketH, padX, cellW, rowH } = L;

    // Background
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, W, H);

    // Bucket row
    for (let col = 0; col < COLS; col++) {
      const x    = this._colX(col, L);
      const bW   = cellW - 2;
      const bX   = x - bW / 2;
      const bY   = H - bucketH + 4;
      const bH   = bucketH - 8;
      const val  = BUCKETS[col];
      const land = state.lastBucket === col;
      const col_ = bucketColor(val);

      ctx.fillStyle   = land ? col_ : col_ + '33';
      ctx.strokeStyle = land ? '#fff' : col_ + '99';
      ctx.lineWidth   = land ? 2 : 1;
      this._roundRect(ctx, bX, bY, bW, bH, 4);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle  = '#fff';
      ctx.font       = `bold ${val >= 100 ? 9 : 10}px Orbitron,monospace`;
      ctx.textAlign  = 'center';
      ctx.fillText(val, x, bY + bH / 2 + 4);
    }

    // Pegs
    // Peg row i sits between step i and step i+1.
    // Even peg rows (0,2,4...): integer x columns → 11 pegs
    // Odd peg rows (1,3,5...): half-integer x → 10 pegs
    for (let row = 0; row < ROWS; row++) {
      const y        = this._stepY(row, L) + rowH * 0.5;
      const isEven   = row % 2 === 0;
      const start    = isEven ? 0 : 0.5;
      const stop     = isEven ? COLS - 1 : COLS - 1.5;
      for (let col = start; col <= stop + 0.01; col++) {
        const x = this._colX(col, L);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
      }
    }

    // Drop zone — clickable column indicators
    for (let col = 0; col < COLS; col++) {
      const x        = this._colX(col, L);
      const isHover  = this._hoverCol === col && state.phase === 'choose';
      ctx.beginPath();
      ctx.arc(x, dropH * 0.4, 7, 0, Math.PI * 2);
      ctx.fillStyle = isHover ? '#ffe030' : 'rgba(255,255,255,0.15)';
      ctx.fill();
      if (isHover) {
        ctx.strokeStyle = 'rgba(255,224,48,0.5)';
        ctx.lineWidth   = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x, dropH * 0.7);
        ctx.lineTo(x, dropH);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Ball + trail
    if (state.path.length > 0 && state.ballStep >= 0) {
      const step = Math.min(state.ballStep, state.path.length - 1);

      // Trail
      if (step > 0) {
        ctx.strokeStyle = 'rgba(255,224,48,0.25)';
        ctx.lineWidth   = 2;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        for (let i = 0; i <= step; i++) {
          const x = this._colX(state.path[i], L);
          const y = this._stepY(i, L);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Ball
      const bx = this._colX(state.path[step], L);
      const by = this._stepY(step, L);
      ctx.beginPath();
      ctx.arc(bx, by, 10, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(bx - 3, by - 3, 1, bx, by, 10);
      grad.addColorStop(0, '#fff8aa');
      grad.addColorStop(1, '#ffe030');
      ctx.fillStyle   = grad;
      ctx.shadowBlur  = 18;
      ctx.shadowColor = '#ffe030';
      ctx.fill();
      ctx.shadowBlur  = 0;
    }

    // Score pop on land
    if (state.phase === 'landed' && state.lastPts && state.lastBucket >= 0) {
      const px  = this._colX(state.lastBucket, L);
      const py  = H - bucketH - 12;
      const col = bucketColor(state.lastPts);
      ctx.font        = 'bold 20px Orbitron,monospace';
      ctx.textAlign   = 'center';
      ctx.fillStyle   = col;
      ctx.shadowBlur  = 14;
      ctx.shadowColor = col;
      ctx.fillText(`+${state.lastPts}`, px, py);
      ctx.shadowBlur  = 0;
      ctx.textAlign   = 'left';
    }

    // Instruction
    if (state.phase === 'choose') {
      ctx.font      = '9px Orbitron,monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillText('CLIQUEZ POUR LÂCHER LA BILLE', W / 2, H - bucketH - 10);
      ctx.textAlign = 'left';
    }
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  _onOver(data) {
    this._overlay.showGameOver(
      { result: 'lose', icon: data.icon, title: data.title,
        score: data.score, isRecord: data.score >= (data.best ?? 0) },
      () => this._showStartScreen(),
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStartScreen(); }
}
