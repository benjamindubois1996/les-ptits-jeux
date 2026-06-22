import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const CELL = 64;
// For each pipe type, draw opening segments (from center toward each open direction)
// Directions: N=top, S=bottom, E=right, W=left
const PIPE_COLORS = { normal: '#00ffe1', flowed: '#00d4ff', source: '#00ff88', sink: '#ff6b35' };

export default class PipeDreamRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._overlay = null;
    this._canvas  = null;
    this._ctx     = null;
    this._hover   = null;

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onClick   = this._onClick.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
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
    document.getElementById('pd-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('pd-styles')) return;
    const s = document.createElement('style');
    s.id = 'pd-styles';
    s.textContent = `
      .pd-wrapper {
        position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
        background:#050810; font-family:Orbitron,monospace; color:#fff; overflow:hidden; gap:8px;
      }
      .pd-info { font-size:11px; color:rgba(255,255,255,0.4); letter-spacing:.1em; display:flex; gap:20px; }
      .pd-info span { color:#fff; }
      .pd-timer {
        font-size:22px; font-weight:bold; color:#ffe030;
        transition: color .3s;
      }
      .pd-timer.urgent { color:#ff4040; animation: pd-pulse .5s infinite; }
      @keyframes pd-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
      .pd-canvas { display:block; cursor:pointer; border-radius:8px; box-shadow:0 0 20px rgba(0,255,225,0.08); }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'pd-wrapper';

    this._infoEl = document.createElement('div');
    this._infoEl.className = 'pd-info';
    this._infoEl.innerHTML = `NIVEAU <span id="pd-level">1</span>`;

    this._timerEl = document.createElement('div');
    this._timerEl.className = 'pd-timer';
    this._timerEl.textContent = '';

    const { rows, cols } = this.config.gameplay;
    this._canvas = document.createElement('canvas');
    this._canvas.className = 'pd-canvas';
    this._canvas.width  = cols * CELL;
    this._canvas.height = rows * CELL;
    this._ctx = this._canvas.getContext('2d');

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this._wrapper.appendChild(this._infoEl);
    this._wrapper.appendChild(this._timerEl);
    this._wrapper.appendChild(this._canvas);
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
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
    this._canvas.addEventListener('click',     this._onClick);
    this._canvas.addEventListener('mousemove', this._onMouseMove);
    this._canvas.addEventListener('mouseleave', () => { this._hover = null; });
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
    this._canvas.removeEventListener('click',     this._onClick);
    this._canvas.removeEventListener('mousemove', this._onMouseMove);
  }

  _onKeyDown(e) {
    const k = this.config.controls?.keyboard ?? {};
    if ((k.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if ((k.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
  }

  _cellAt(e) {
    const rect = this._canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left) / CELL);
    const r = Math.floor((e.clientY - rect.top)  / CELL);
    const { rows, cols } = this.config.gameplay;
    if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
    return { r, c };
  }

  _onClick(e) {
    const cell = this._cellAt(e);
    if (cell) this.game.rotatePipe(cell.r, cell.c);
  }

  _onMouseMove(e) { this._hover = this._cellAt(e); }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    document.getElementById('pd-level') && (document.getElementById('pd-level').textContent = state.level);
    if (!state.flowing && state.countdown > 0) {
      this._timerEl.textContent = `Départ dans : ${state.countdown}s`;
      this._timerEl.className = 'pd-timer' + (state.countdown <= 3 ? ' urgent' : '');
    } else if (state.flowing) {
      this._timerEl.textContent = '💧 Eau en cours...';
      this._timerEl.className = 'pd-timer';
    } else {
      this._timerEl.textContent = '';
    }
    this._draw(state);
  }

  _draw(state) {
    const ctx  = this._ctx;
    const { rows, cols } = state;
    const flowSet = new Set(state.flowed.map(p => `${p.r},${p.c}`));

    ctx.fillStyle = '#0a0f1e';
    ctx.fillRect(0, 0, cols * CELL, rows * CELL);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell    = state.grid[r]?.[c];
        const x       = c * CELL, y = r * CELL;
        const cx      = x + CELL/2, cy = y + CELL/2;
        const flowed  = flowSet.has(`${r},${c}`);
        const hovered = this._hover?.r === r && this._hover?.c === c;

        // Background
        ctx.fillStyle = hovered && !state.flowing ? 'rgba(0,255,225,0.08)' : 'rgba(255,255,255,0.02)';
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);

        if (!cell) continue;

        if (cell.isSource) {
          ctx.fillStyle = PIPE_COLORS.source;
          ctx.font = `${CELL * 0.5}px monospace`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('🚰', cx, cy);
          ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
          continue;
        }
        if (cell.isSink) {
          const reached = flowSet.has(`${r},${c}`);
          ctx.font = `${CELL * 0.5}px monospace`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(reached ? '✅' : '🏁', cx, cy);
          ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
          continue;
        }

        // Draw pipe segments
        this._drawPipe(ctx, x, y, cell.type, flowed);
      }
    }
    ctx.textAlign = 'left';
  }

  _drawPipe(ctx, x, y, type, flowed) {
    const cx  = x + CELL / 2, cy = y + CELL / 2;
    const H   = CELL / 2;   // half cell
    const PW  = 14;          // pipe width (full)
    const PH  = PW / 2;      // pipe half-width

    const col   = flowed ? PIPE_COLORS.flowed : PIPE_COLORS.normal;
    const alpha = flowed ? 'ff' : '77';

    // Background tint by pipe family
    const bgColor = type <= 1 ? 'rgba(0,100,200,0.10)'
                  : type === 6 ? 'rgba(120,60,220,0.12)'
                  : 'rgba(200,80,0,0.10)';
    ctx.fillStyle = bgColor;
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);

    ctx.fillStyle = col + alpha;

    // Pre-computed arms (clipped to cell)
    const northArm = () => ctx.fillRect(cx - PH, y,      PW, H + PH);
    const southArm = () => ctx.fillRect(cx - PH, cy - PH, PW, H + PH);
    const eastArm  = () => ctx.fillRect(cx - PH, cy - PH, H + PH, PW);
    const westArm  = () => ctx.fillRect(x,       cy - PH, H + PH, PW);

    switch (type) {
      case 0: ctx.fillRect(x, cy - PH, CELL, PW); break;       // ━ straight H
      case 1: ctx.fillRect(cx - PH, y, PW, CELL); break;       // ┃ straight V
      case 2: northArm(); eastArm();  break;                    // └ NE bend
      case 3: southArm(); eastArm();  break;                    // ┌ SE bend
      case 4: southArm(); westArm();  break;                    // ┐ SW bend
      case 5: northArm(); westArm();  break;                    // ┘ NW bend
      case 6:                                                    // ╋ cross
        ctx.fillRect(x, cy - PH, CELL, PW);
        ctx.fillRect(cx - PH, y, PW, CELL);
        break;
    }

    // Inner highlight line for depth
    ctx.fillStyle = 'rgba(255,255,255,' + (flowed ? '0.18' : '0.08') + ')';
    const IL = 4; // inner line thickness
    switch (type) {
      case 0: ctx.fillRect(x, cy - IL/2, CELL, IL); break;
      case 1: ctx.fillRect(cx - IL/2, y, IL, CELL); break;
      case 6:
        ctx.fillRect(x, cy - IL/2, CELL, IL);
        ctx.fillRect(cx - IL/2, y, IL, CELL);
        break;
    }
  }

  _onWon(data)  { this._showEnd(data); }
  _onOver(data) { this._showEnd(data); }

  _showEnd(data) {
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
