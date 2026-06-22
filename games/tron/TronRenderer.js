import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const PLAYER_COLOR = '#00ffe1';
const AI_COLOR     = '#ff4d8b';

export default class TronRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._overlay = null;
    this._canvas  = null;
    this._ctx     = null;

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
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
  }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('tr2-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('tr2-styles')) return;
    const s = document.createElement('style');
    s.id = 'tr2-styles';
    s.textContent = `
      .trn-wrapper {
        position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
        background:#010408; font-family:Orbitron,monospace; color:#fff; overflow:hidden; gap:8px;
      }
      .trn-legend { display:flex; gap:24px; font-size:10px; letter-spacing:.1em; }
      .trn-legend-item { display:flex; align-items:center; gap:6px; }
      .trn-dot { width:10px; height:10px; border-radius:50%; }
      .trn-canvas { display:block; border:1px solid rgba(0,255,225,0.15); border-radius:4px; }
      .trn-hint { font-size:9px; color:rgba(255,255,255,0.2); letter-spacing:.08em; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'trn-wrapper';

    const legend = document.createElement('div');
    legend.className = 'trn-legend';
    legend.innerHTML = `
      <div class="trn-legend-item"><div class="trn-dot" style="background:${PLAYER_COLOR}"></div> VOUS</div>
      <div class="trn-legend-item"><div class="trn-dot" style="background:${AI_COLOR}"></div> IA</div>
    `;

    const { rows, cols, cellSize } = this.config.gameplay;
    const CS = cellSize ?? 14;
    this._cs = CS;
    this._canvas = document.createElement('canvas');
    this._canvas.className = 'trn-canvas';
    this._canvas.width  = cols * CS;
    this._canvas.height = rows * CS;
    this._ctx = this._canvas.getContext('2d');

    const hint = document.createElement('div');
    hint.className = 'trn-hint';
    hint.textContent = '↑↓←→ / WASD pour diriger · P pause';

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this._wrapper.appendChild(legend);
    this._wrapper.appendChild(this._canvas);
    this._wrapper.appendChild(hint);
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
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    const k = this.config.controls?.keyboard ?? {};
    if ((k.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); return; }
    if ((k.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); return; }

    const dirMap = {
      ArrowUp:'UP', KeyW:'UP', ArrowDown:'DOWN', KeyS:'DOWN',
      ArrowLeft:'LEFT', KeyA:'LEFT', ArrowRight:'RIGHT', KeyD:'RIGHT',
    };
    const dir = dirMap[e.code];
    if (dir) { e.preventDefault(); this.game.setDir(dir); }
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    this._draw(state);
  }

  _draw(state) {
    const ctx = this._ctx;
    const CS  = this._cs;
    const { rows, cols, grid, player, ai } = state;

    ctx.fillStyle = '#010408';
    ctx.fillRect(0, 0, cols * CS, rows * CS);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = grid[r]?.[c];
        if (!v) continue;
        const isHead = (v === 1 && player?.r === r && player?.c === c)
                    || (v === 2 && ai?.r === r    && ai?.c === c);
        const color = v === 1 ? PLAYER_COLOR : AI_COLOR;
        ctx.fillStyle = isHead ? color : color + '55';
        ctx.fillRect(c * CS + 1, r * CS + 1, CS - 2, CS - 2);
        if (isHead) {
          ctx.shadowColor = color;
          ctx.shadowBlur  = 8;
          ctx.fillRect(c * CS + 1, r * CS + 1, CS - 2, CS - 2);
          ctx.shadowBlur = 0;
        }
      }
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
