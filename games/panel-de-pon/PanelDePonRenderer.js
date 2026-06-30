import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const COLORS = [null, '#ff4466', '#44aaff', '#44ff88', '#ffcc00', '#ff8844', '#cc44ff'];
const DARKS  = [null, '#cc2244', '#2288cc', '#22cc66', '#ccaa00', '#cc6622', '#9922cc'];

export default class PanelDePonRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._wrapper  = null;
    this._canvas   = null;
    this._ctx      = null;
    this._nextCanvas = null;
    this._nextCtx    = null;
    this._overlay  = null;
    this._cs       = 28; // cell size

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
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      () => { this._overlay.hide(); this._game.start(); }
    );
  }

  _injectStyles() {
    if (document.getElementById('pdp-styles')) return;
    const s = document.createElement('style');
    s.id = 'pdp-styles';
    s.textContent = `
      .pdp-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 6px;
        box-sizing: border-box; gap: 5px;
        font-family: Orbitron, monospace;
        background: #05080f; overflow: hidden;
      }
      .pdp-hud {
        display: flex; gap: 20px; font-size: 11px;
        color: #888; align-items: center; justify-content: center; flex-wrap: wrap;
      }
      .pdp-hud .val { color: #ffd700; font-weight: bold; }
      .pdp-hud .chain-val { color: #ff8844; font-weight: bold; }
      .pdp-body { display: flex; gap: 8px; align-items: flex-start; }
      #pdp-canvas { display: block; border: 1px solid #1a1a2e; }
      .pdp-side {
        display: flex; flex-direction: column; gap: 8px;
        font-size: 9px; color: #555; width: 70px;
      }
      .pdp-side-lbl { color: #444; letter-spacing: 1px; text-transform: uppercase; }
      .pdp-ctrl { line-height: 1.9; color: #333; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'pdp-wrapper';
    this._wrapper.innerHTML = `
      <div class="pdp-hud">
        <span>SCORE <span class="val" id="pdp-score">0</span></span>
        <span>CHAIN <span class="chain-val" id="pdp-chain">×1</span></span>
      </div>
      <div class="pdp-body">
        <canvas id="pdp-canvas"></canvas>
        <div class="pdp-side">
          <div class="pdp-side-lbl">Suivant</div>
          <canvas id="pdp-next" width="72" height="18"></canvas>
          <div class="pdp-ctrl">
            ↑↓←→<br>curseur<br><br>
            SPACE<br>Z : swap
          </div>
        </div>
      </div>
    `;
    this._viewport.appendChild(this._wrapper);

    this._canvas = this._wrapper.querySelector('#pdp-canvas');
    this._ctx    = this._canvas.getContext('2d');
    this._nextCanvas = this._wrapper.querySelector('#pdp-next');
    this._nextCtx    = this._nextCanvas.getContext('2d');
    this._scoreEl    = this._wrapper.querySelector('#pdp-score');
    this._chainEl    = this._wrapper.querySelector('#pdp-chain');

    // Fit cell size to viewport
    const avH = this._viewport.clientHeight - 60;
    const avW = this._viewport.clientWidth  - 90;
    this._cs = Math.max(16, Math.min(30, Math.floor(Math.min(avW / 6, avH / 12))));
    this._canvas.width  = 6 * this._cs;
    this._canvas.height = 12 * this._cs;
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
  }

  _onTick(e) {
    if (e.action === 'restart') { this._showStart(); return; }
    if (e.action === 'play')    { this._overlay.hide(); }
    const s = e.state;
    if (!s) return;
    this._scoreEl.textContent = s.score;
    this._chainEl.textContent = s.chain > 1 ? `×${s.chain}` : '×1';
    this._draw(s);
  }

  _draw(s) {
    const ctx = this._ctx;
    const cs  = this._cs;
    const W   = 6 * cs, H = 12 * cs;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = '#111118'; ctx.lineWidth = 0.5;
    for (let r = 0; r <= 12; r++) { ctx.beginPath(); ctx.moveTo(0, r * cs); ctx.lineTo(W, r * cs); ctx.stroke(); }
    for (let c = 0; c <= 6;  c++) { ctx.beginPath(); ctx.moveTo(c * cs, 0); ctx.lineTo(c * cs, H); ctx.stroke(); }

    const flashSet = new Set((s.flashCells || []).map(({ r, c }) => r * 6 + c));

    // Cells
    const p = 2, rad = 4;
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 6; c++) {
        const v = s.grid[r][c];
        if (!v) continue;
        const x = c * cs, y = r * cs;
        const flash = flashSet.has(r * 6 + c);

        ctx.fillStyle = flash ? '#ffffff' : COLORS[v];
        this._rr(ctx, x + p, y + p, cs - p * 2, cs - p * 2, rad);
        ctx.fill();

        if (!flash) {
          // Inner highlight
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          this._rr(ctx, x + p, y + p, cs - p * 2, cs * 0.45, rad);
          ctx.fill();
          // Border
          ctx.strokeStyle = DARKS[v]; ctx.lineWidth = 1;
          this._rr(ctx, x + p, y + p, cs - p * 2, cs - p * 2, rad);
          ctx.stroke();
        }
      }
    }

    // Rise progress bar
    const pct = s.riseProgress / s.riseLimit;
    ctx.fillStyle = '#0f1a0f';
    ctx.fillRect(0, H - 3, W, 3);
    ctx.fillStyle = '#44ff88';
    ctx.fillRect(0, H - 3, W * pct, 3);

    // Cursor
    const cx = s.cursor.x * cs, cy = s.cursor.y * cs;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
    ctx.strokeRect(cx + 1, cy + 1, cs * 2 - 2, cs - 2);
    // Cursor corners
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    const co = 5;
    ctx.beginPath();
    ctx.moveTo(cx + 1, cy + co); ctx.lineTo(cx + 1, cy + 1); ctx.lineTo(cx + co, cy + 1);
    ctx.moveTo(cx + cs * 2 - co, cy + 1); ctx.lineTo(cx + cs * 2 - 1, cy + 1); ctx.lineTo(cx + cs * 2 - 1, cy + co);
    ctx.moveTo(cx + 1, cy + cs - co); ctx.lineTo(cx + 1, cy + cs - 1); ctx.lineTo(cx + co, cy + cs - 1);
    ctx.moveTo(cx + cs * 2 - co, cy + cs - 1); ctx.lineTo(cx + cs * 2 - 1, cy + cs - 1); ctx.lineTo(cx + cs * 2 - 1, cy + cs - co);
    ctx.stroke();

    this._drawNext(s);
  }

  _drawNext(s) {
    const ctx = this._nextCtx;
    const cs  = 11;
    ctx.clearRect(0, 0, 72, 18);
    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, 72, 18);
    for (let c = 0; c < 6; c++) {
      const v = s.nextRow[c];
      ctx.fillStyle = COLORS[v];
      this._rr(ctx, c * cs + 1, 2, cs - 2, 14, 3);
      ctx.fill();
    }
  }

  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _onOver(e) {
    this._overlay.showGameOver(
      { result: 'lose', score: e.score, isRecord: e.isRecord },
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
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('pdp-styles')?.remove();
  }
}
