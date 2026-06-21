import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const TW = 52;
const TH = 64;
const DEPTH_X = 6;
const DEPTH_Y = 5;

// Arrangement of n items as [relX, relY] fractions within tile face
const LAYOUTS = {
  1: [[0.5, 0.5]],
  2: [[0.33, 0.5], [0.67, 0.5]],
  3: [[0.5, 0.25], [0.33, 0.68], [0.67, 0.68]],
  4: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
  5: [[0.5, 0.2], [0.25, 0.48], [0.75, 0.48], [0.33, 0.78], [0.67, 0.78]],
  6: [[0.3, 0.2], [0.7, 0.2], [0.3, 0.5], [0.7, 0.5], [0.3, 0.8], [0.7, 0.8]],
  7: [[0.5, 0.15], [0.25, 0.38], [0.75, 0.38], [0.25, 0.62], [0.75, 0.62], [0.33, 0.85], [0.67, 0.85]],
  8: [[0.25, 0.18], [0.5, 0.18], [0.75, 0.18], [0.25, 0.5], [0.75, 0.5], [0.25, 0.82], [0.5, 0.82], [0.75, 0.82]],
  9: [[0.25, 0.18], [0.5, 0.18], [0.75, 0.18], [0.25, 0.5], [0.5, 0.5], [0.75, 0.5], [0.25, 0.82], [0.5, 0.82], [0.75, 0.82]],
};

function getLayout(n) { return LAYOUTS[Math.min(n, 9)] || LAYOUTS[9]; }

// ── Bambou (B1-B9): green vertical sticks
function drawBambou(ctx, tx, ty, num) {
  const layout = getLayout(num);
  const stW = num <= 3 ? 9 : 7;
  const stH = num <= 3 ? 20 : 14;
  for (const [px, py] of layout) {
    const sx = Math.round(tx + px * TW - stW / 2);
    const sy = Math.round(ty + py * TH - stH / 2);
    // Stick body
    ctx.fillStyle = '#0d7a2e';
    ctx.fillRect(sx, sy, stW, stH);
    // Highlight left edge
    ctx.fillStyle = '#2ec45a';
    ctx.fillRect(sx, sy + 2, 2, stH - 4);
    // Darker right edge
    ctx.fillStyle = '#084d1c';
    ctx.fillRect(sx + stW - 2, sy + 2, 2, stH - 4);
    // Node ring (middle horizontal)
    ctx.fillStyle = '#054016';
    ctx.fillRect(sx, sy + Math.floor(stH * 0.42), stW, 2);
    // Top cap
    ctx.fillStyle = '#3dcc66';
    ctx.fillRect(sx + 1, sy, stW - 2, 2);
  }
}

// ── Cercles (C1-C9): concentric ring circles
function drawCercles(ctx, tx, ty, num) {
  const layout = getLayout(num);
  const cr = num <= 2 ? 12 : num <= 5 ? 9 : 7;
  const RING_COLORS = ['#cc2222', '#1155cc'];
  layout.forEach(([px, py], i) => {
    const cx = Math.round(tx + px * TW);
    const cy = Math.round(ty + py * TH);
    const col = RING_COLORS[i % 2];
    // Outer ring
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.stroke();
    // Inner fill (lighter, same hue)
    ctx.fillStyle = col + '28';
    ctx.beginPath(); ctx.arc(cx, cy, cr - 2, 0, Math.PI * 2); ctx.fill();
    // Center dot
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
  });
}

// ── Caractères (K1-K9): red number with horizontal bar
function drawCaracteres(ctx, tx, ty, num) {
  const numSize = TW > 45 ? 26 : 20;
  ctx.fillStyle = '#cc1111';
  ctx.font = `bold ${numSize}px Georgia,serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), tx + TW / 2, ty + TH / 2 - 5);
  // Horizontal bar (simplified Chinese stroke)
  ctx.fillStyle = '#cc1111';
  ctx.fillRect(tx + 10, ty + TH / 2 + 12, TW - 20, 2);
}

// ── Vents (V1=Est V2=Sud V3=Ouest V4=Nord)
const WIND_LABELS = ['E', 'S', 'O', 'N'];
const WIND_NAMES  = ['EST', 'SUD', 'OUEST', 'NORD'];
const WIND_COLORS = ['#bb2222', '#116622', '#1155aa', '#334455'];

function drawVents(ctx, tx, ty, num) {
  const label = WIND_LABELS[num - 1];
  const name  = WIND_NAMES[num - 1];
  const color = WIND_COLORS[num - 1];
  // Background circle
  ctx.fillStyle = color + '22';
  ctx.beginPath(); ctx.arc(tx + TW / 2, ty + TH / 2 - 4, 18, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(tx + TW / 2, ty + TH / 2 - 4, 18, 0, Math.PI * 2); ctx.stroke();
  // Letter
  ctx.fillStyle = color;
  ctx.font = 'bold 20px Orbitron,monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, tx + TW / 2, ty + TH / 2 - 4);
  // Small name below
  ctx.font = '7px Orbitron,monospace';
  ctx.fillStyle = color + 'cc';
  ctx.fillText(name, tx + TW / 2, ty + TH - 8);
}

// ── Dragons (D1=Rouge/中  D2=Vert/發  D3=Blanc/vide)
function drawDragons(ctx, tx, ty, num) {
  const cx = tx + TW / 2, cy = ty + TH / 2;
  ctx.lineCap = 'round';
  if (num === 1) {
    // Red dragon (中) — cross shape with horizontal bars
    ctx.strokeStyle = '#cc1111';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, ty + 8); ctx.lineTo(cx, ty + TH - 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx + 10, ty + 14); ctx.lineTo(tx + TW - 10, ty + 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx + 8, cy - 2); ctx.lineTo(tx + TW - 8, cy - 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx + 8, ty + TH - 20); ctx.lineTo(tx + TW - 8, ty + TH - 20); ctx.stroke();
    ctx.fillStyle = '#cc1111';
    ctx.font = 'bold 9px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('中', cx, ty + TH - 2);
  } else if (num === 2) {
    // Green dragon (發) — tree/arrow shape
    ctx.strokeStyle = '#0d7a2e';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, ty + TH - 8); ctx.lineTo(cx, ty + 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, ty + 18); ctx.lineTo(tx + 10, ty + 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, ty + 18); ctx.lineTo(tx + TW - 10, ty + 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, ty + 34); ctx.lineTo(tx + 10, ty + 46); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, ty + 34); ctx.lineTo(tx + TW - 10, ty + 46); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx + 10, ty + TH - 8); ctx.lineTo(tx + TW - 10, ty + TH - 8); ctx.stroke();
    ctx.fillStyle = '#0d7a2e';
    ctx.font = 'bold 9px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('發', cx, ty + TH - 2);
  } else {
    // White dragon (白) — empty double-border rectangle
    ctx.strokeStyle = '#8899aa';
    ctx.lineWidth = 3;
    ctx.strokeRect(tx + 8, ty + 10, TW - 16, TH - 20);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#aabbcc';
    ctx.strokeRect(tx + 13, ty + 15, TW - 26, TH - 30);
  }
  ctx.lineCap = 'butt';
}

// ── Spéciaux (S1=Fleur  S2=Saison)
function drawSpeciaux(ctx, tx, ty, num) {
  const cx = tx + TW / 2, cy = ty + TH / 2 - 2;
  const color = num === 1 ? '#cc44aa' : '#cc8800';
  ctx.save();
  ctx.translate(cx, cy);
  // 4 petals
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i / 4) * Math.PI * 2);
    ctx.fillStyle = color + '88';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, -11, 5, 11, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // Center
  ctx.fillStyle = '#ffdd44';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
  // Small number
  ctx.fillStyle = color;
  ctx.font = 'bold 8px Orbitron,monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(String(num), cx, ty + TH - 3);
}

function drawTileSymbol(ctx, tx, ty, type) {
  if (type < 9)  return drawBambou(ctx, tx, ty, type + 1);
  if (type < 18) return drawCercles(ctx, tx, ty, type - 8);
  if (type < 27) return drawCaracteres(ctx, tx, ty, type - 17);
  if (type < 31) return drawVents(ctx, tx, ty, type - 26);
  if (type < 34) return drawDragons(ctx, tx, ty, type - 30);
  return drawSpeciaux(ctx, tx, ty, type - 33);
}

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

    const cols = Math.max(...state.tiles.map(t => t.c)) + 2;
    const rows = Math.max(...state.tiles.map(t => t.r)) + 2;
    const maxL = Math.max(...state.tiles.map(t => t.layer)) + 1;
    const W    = 60 + cols * (TW + 2) + maxL * DEPTH_X + TW;
    const H    = 40 + rows * (TH + 2) + maxL * DEPTH_Y + TH;

    this._canvas.width  = W;
    this._canvas.height = H;
    const ctx = this._ctx;
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, W, H);

    const sorted = [...state.tiles.filter(t => !t.removed)]
      .sort((a, b) => a.layer - b.layer || a.r - b.r || a.c - b.c);

    for (const tile of sorted) {
      const { x, y } = this._tilePos(tile);
      const isFree   = this.game._isFree(tile);
      const selected = state.selected === tile.id;
      this._drawTile(ctx, x, y, tile, isFree, selected);
    }

    const pairsEl = document.getElementById('mhj-pairs');
    if (pairsEl) pairsEl.textContent = `Paires : ${state.pairsRemoved} / ${state.totalPairs}`;
  }

  _drawTile(ctx, x, y, tile, isFree, selected) {
    // 3D depth (side face)
    ctx.fillStyle = '#3d2a14';
    ctx.fillRect(x + DEPTH_X, y - DEPTH_Y, TW, TH);

    // Tile face — ivory/cream for free, darker for blocked
    const bg = selected ? '#fff8ec' : isFree ? '#f0dfa8' : '#b0a080';
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, TW, TH);

    // Outer border
    ctx.strokeStyle = selected ? '#00ffe1' : isFree ? '#c8a050' : 'rgba(120,100,60,0.5)';
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, TW - 1, TH - 1);

    // Inner inset line (classic Mahjong tile feel)
    if (isFree || selected) {
      ctx.strokeStyle = 'rgba(150,110,40,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 3, y + 3, TW - 6, TH - 6);
    }

    // Selection glow
    if (selected) {
      ctx.shadowColor = '#00ffe1';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#00ffe1';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 0.5, y + 0.5, TW - 1, TH - 1);
      ctx.shadowBlur = 0;
    }

    // Symbol — dimmed for blocked tiles
    ctx.globalAlpha = isFree ? 1 : 0.3;
    ctx.save();
    drawTileSymbol(ctx, x, y, tile.type);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
