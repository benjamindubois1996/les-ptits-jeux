import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const CELL   = 48;
const COLORS = {
  '#': '#1a2840',
  ' ': '#0a1020',
  '.': '#0a1020',
  '@': '#00ffe1',
  '$': '#ff9900',
  '*': '#00ff88',
  '+': '#00ffe1',
};

export default class SokobanRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._sel     = { mode: 'basique' };

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
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
    document.getElementById('sok-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('sok-styles')) return;
    const el = document.createElement('style');
    el.id = 'sok-styles';
    el.textContent = `
      .sok-wrapper {
        position:absolute; inset:0;
        display:flex; flex-direction:column;
        background:#050810; font-family:Orbitron,monospace;
        overflow:hidden; color:#fff; align-items:center;
      }
      .sok-info {
        flex:0 0 auto; padding:8px 16px; width:100%; box-sizing:border-box;
        display:flex; justify-content:space-between; align-items:center;
        border-bottom:1px solid rgba(0,255,225,0.12); font-size:11px;
        color:rgba(255,255,255,0.5); letter-spacing:0.1em;
      }
      .sok-level-name { color:#00ffe1; font-size:12px; font-weight:bold; }
      .sok-canvas-area {
        flex:1; overflow:auto; display:flex;
        align-items:center; justify-content:center;
        padding:8px; box-sizing:border-box;
      }
      .sok-canvas { display:block; image-rendering:pixelated; }
      .sok-hint {
        flex:0 0 auto; padding:6px; font-size:9px;
        color:rgba(255,255,255,0.25); letter-spacing:0.08em; text-align:center;
      }
    `;
    document.head.appendChild(el);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'sok-wrapper';

    this._info = document.createElement('div');
    this._info.className = 'sok-info';
    this._info.innerHTML = `
      <span class="sok-level-name" id="sok-lvl">Niveau 1</span>
      <span id="sok-moves">Coups : 0</span>
    `;

    const area = document.createElement('div');
    area.className = 'sok-canvas-area';

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'sok-canvas';
    this._ctx = this._canvas.getContext('2d');
    area.appendChild(this._canvas);

    const hint = document.createElement('div');
    hint.className = 'sok-hint';
    hint.textContent = '↑↓←→ déplacer · Z annuler · R relancer';

    this._wrapper.appendChild(this._info);
    this._wrapper.appendChild(area);
    this._wrapper.appendChild(hint);

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();
    this.viewport.appendChild(this._wrapper);
  }

  _showStartScreen() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._sel = sel; this._overlay.hide(); this.game.start(sel); },
    );
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    const keys = this.config.controls?.keyboard ?? {};
    if ((keys.up    ?? []).includes(e.code)) { e.preventDefault(); this.game.move(-1, 0); return; }
    if ((keys.down  ?? []).includes(e.code)) { e.preventDefault(); this.game.move(1, 0);  return; }
    if ((keys.left  ?? []).includes(e.code)) { e.preventDefault(); this.game.move(0, -1); return; }
    if ((keys.right ?? []).includes(e.code)) { e.preventDefault(); this.game.move(0, 1);  return; }
    if ((keys.undo  ?? []).includes(e.code)) { e.preventDefault(); this.game.undo();       return; }
    if ((keys.pause ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); return; }
    if ((keys.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    this._render(state);
  }

  _onWon(data) {
    const best = data.best ?? 0;
    this._overlay.showGameOver(
      { result: 'win', icon: '📦', title: 'TERMINÉ !', score: data.score,
        isRecord: data.score > 0 && data.score >= best,
        extraInfo: `<div class="overlay-score">Meilleur : ${best}</div>` },
      () => this._showStartScreen(),
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStartScreen(); }

  _render(state) {
    const { grid, player, moves, levelIndex, levelName } = state;
    if (!grid.length) return;

    const rows  = grid.length;
    const cols  = Math.max(...grid.map(r => r.length));
    const cell  = CELL;

    this._canvas.width  = cols * cell;
    this._canvas.height = rows * cell;
    const ctx = this._ctx;

    // Background
    ctx.fillStyle = '#0a1020';
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const ch = grid[r][c];
        const x  = c * cell;
        const y  = r * cell;

        // Floor base
        ctx.fillStyle = '#0a1020';
        ctx.fillRect(x, y, cell, cell);

        if (ch === '#') {
          ctx.fillStyle = '#1a2840';
          ctx.fillRect(x, y, cell, cell);
          ctx.strokeStyle = 'rgba(0,255,225,0.1)';
          ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        } else if (ch === '.' || ch === '*' || ch === '+') {
          // Target marker
          ctx.strokeStyle = 'rgba(0,255,136,0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x + cell/2, y + cell/2, cell/2 - 8, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Box
        if (ch === '$' || ch === '*') {
          const pad = 6;
          const onTarget = ch === '*';
          ctx.fillStyle = onTarget ? 'rgba(0,255,136,0.2)' : 'rgba(255,153,0,0.15)';
          ctx.fillRect(x + pad, y + pad, cell - pad*2, cell - pad*2);
          ctx.strokeStyle = onTarget ? '#00ff88' : '#ff9900';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + pad + 1, y + pad + 1, cell - pad*2 - 2, cell - pad*2 - 2);
        }

        // Player
        if (ch === '@' || ch === '+') {
          ctx.fillStyle = '#00ffe1';
          ctx.beginPath();
          ctx.arc(x + cell/2, y + cell/2, cell/2 - 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#050810';
          ctx.fillRect(x + cell/2 - 4, y + cell/2 - 4, 8, 8);
        }
      }
    }

    // Info bar
    const lvlEl   = document.getElementById('sok-lvl');
    const movesEl = document.getElementById('sok-moves');
    if (lvlEl)   lvlEl.textContent   = `${levelIndex + 1}/${this.config.levels.length} — ${levelName}`;
    if (movesEl) movesEl.textContent = `Coups : ${moves}`;
  }
}
