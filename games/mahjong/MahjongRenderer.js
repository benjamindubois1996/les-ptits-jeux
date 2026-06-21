import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

// Tile symbols by type (simplified into categories)
const TILE_FACES = [
  '🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏', // bambou 1-9
  '🀙','🀚','🀛','🀜','🀝','🀞','🀟','🀠','🀡', // cercles 1-9
  '🀐','🀑','🀒','🀓','🀔','🀕','🀖','🀗','🀘', // caractères 1-9
  '🀀','🀁','🀂','🀃',                            // vents
  '🀄','🀅','🀆',                                 // dragons
];

const TW = 52;
const TH = 64;
const DEPTH_X = 6;
const DEPTH_Y = 5;

export default class MahjongRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onClick   = this._onClick.bind(this);
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
    document.getElementById('mhj-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('mhj-styles')) return;
    const el = document.createElement('style');
    el.id = 'mhj-styles';
    el.textContent = `
      .mhj-wrapper {
        position:absolute; inset:0;
        display:flex; flex-direction:column;
        background:#050810; font-family:Orbitron,monospace;
        overflow:hidden; color:#fff; align-items:center;
      }
      .mhj-info {
        flex:0 0 auto; padding:6px 16px; width:100%; box-sizing:border-box;
        display:flex; justify-content:space-between; align-items:center;
        border-bottom:1px solid rgba(0,255,225,0.12); font-size:11px;
        color:rgba(255,255,255,0.45); letter-spacing:0.1em;
      }
      .mhj-canvas-area {
        flex:1; overflow:auto; display:flex;
        align-items:center; justify-content:center;
        padding:8px; box-sizing:border-box;
      }
      .mhj-canvas { display:block; cursor:pointer; }
    `;
    document.head.appendChild(el);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'mhj-wrapper';

    this._infoEl = document.createElement('div');
    this._infoEl.className = 'mhj-info';
    this._infoEl.innerHTML = `<span>MAHJONG</span><span id="mhj-pairs">Paires : 0 / 0</span>`;

    const area = document.createElement('div');
    area.className = 'mhj-canvas-area';
    this._area = area;

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'mhj-canvas';
    this._ctx = this._canvas.getContext('2d');
    area.appendChild(this._canvas);

    this._wrapper.appendChild(this._infoEl);
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
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
    this._canvas.addEventListener('click', this._onClick);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
    this._canvas.removeEventListener('click', this._onClick);
  }

  _onKeyDown(e) {
    const keys = this.config.controls?.keyboard ?? {};
    if ((keys.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if ((keys.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
  }

  _onClick(e) {
    const state = this.game.state;
    if (state.status !== 'playing') return;
    const rect = this._canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    const tile = this._hitTest(mx, my, state);
    if (tile) this.game.selectTile(tile.id);
  }

  _hitTest(mx, my, state) {
    const visible = state.tiles.filter(t => !t.removed)
      .sort((a, b) => b.layer - a.layer || b.r - a.r || b.c - a.c);
    for (const tile of visible) {
      const { x, y } = this._tilePos(tile);
      if (mx >= x && mx <= x + TW && my >= y && my <= y + TH) return tile;
    }
    return null;
  }

  _tilePos(tile) {
    const offsetX = 60;
    const offsetY = 40;
    const x = offsetX + tile.c * (TW + 2) + tile.layer * DEPTH_X;
    const y = offsetY + tile.r * (TH + 2) - tile.layer * DEPTH_Y;
    return { x, y };
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    this._drawFrame(state);
  }

  _onWon(data) {
    const best = data.best ?? 0;
    this._overlay.showGameOver(
      { result: 'win', icon: '🀄', title: 'MAHJONG !', score: data.score,
        isRecord: data.score >= best },
      () => this._showStartScreen(),
    );
  }

  _onOver(data) {
    this._overlay.showGameOver(
      { result: 'lose', icon: '🀄', title: 'BLOQUÉ !', score: data.score ?? 0 },
      () => this._showStartScreen(),
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStartScreen(); }

  _drawFrame(state) {
    if (!state.tiles.length) return;

    // Compute canvas size from layout extents
    const cols  = Math.max(...state.tiles.map(t => t.c)) + 2;
    const rows  = Math.max(...state.tiles.map(t => t.r)) + 2;
    const maxL  = Math.max(...state.tiles.map(t => t.layer)) + 1;
    const W     = 60 + cols * (TW + 2) + maxL * DEPTH_X + TW;
    const H     = 40 + rows * (TH + 2) + maxL * DEPTH_Y + TH;

    this._canvas.width  = W;
    this._canvas.height = H;
    const ctx = this._ctx;
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, W, H);

    // Sort: bottom layer first, then top
    const sorted = [...state.tiles.filter(t => !t.removed)]
      .sort((a, b) => a.layer - b.layer || a.r - b.r || a.c - b.c);

    for (const tile of sorted) {
      const { x, y } = this._tilePos(tile);
      const isFree   = this.game._isFree(tile);
      const selected = state.selected === tile.id;
      this._drawTile(ctx, x, y, tile, isFree, selected);
    }

    // Info
    const pairsEl = document.getElementById('mhj-pairs');
    if (pairsEl) pairsEl.textContent = `Paires : ${state.pairsRemoved} / ${state.totalPairs}`;
  }

  _drawTile(ctx, x, y, tile, isFree, selected) {
    const face = TILE_FACES[tile.type % TILE_FACES.length] ?? '🀫';

    // 3D depth shadow
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(x + DEPTH_X, y - DEPTH_Y, TW, TH);

    // Tile body
    const bg = selected ? '#003a3a' : isFree ? '#0e2035' : '#0a1428';
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, TW, TH);

    // Border
    ctx.strokeStyle = selected ? '#00ffe1' : isFree ? 'rgba(0,255,225,0.5)' : 'rgba(0,255,225,0.15)';
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, TW - 1, TH - 1);

    // Face emoji
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = isFree ? 1 : 0.5;
    ctx.fillText(face, x + TW / 2, y + TH / 2);
    ctx.globalAlpha = 1;
  }
}
