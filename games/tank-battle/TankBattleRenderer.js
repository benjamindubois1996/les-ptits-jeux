import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const COLS = 17, ROWS = 13;
const TILE_COLORS = { 0: null, 1: '#b44', 2: '#666' };

export default class TankBattleRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._canvas   = null;
    this._ctx      = null;
    this._wrapper  = null;
    this._overlay  = null;
    this._state    = null;
    this._tileSize = 30;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
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
    if (document.getElementById('tb-styles')) return;
    const s = document.createElement('style');
    s.id = 'tb-styles';
    s.textContent = `
      .tb-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 8px;
        box-sizing: border-box; gap: 4px;
        font-family: Orbitron, monospace; overflow: hidden;
      }
      .tb-hud {
        display: flex; gap: 12px; color: #e0e0e0; font-size: 11px; width: 100%; justify-content: center;
      }
      .tb-hud span { color: #ffd700; font-weight: bold; }
      .tb-hud .lives-p { color: #4af; }
      .tb-hud .lives-e { color: #f64; }
      .tb-canvas-wrap { flex: 1; width: 100%; display: flex; align-items: center; justify-content: center; }
      #tb-canvas { display: block; image-rendering: pixelated; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'tb-wrapper';

    const hud = document.createElement('div');
    hud.className = 'tb-hud';
    hud.innerHTML = `Score: <span id="tb-score">0</span>&nbsp; Joueur: <span id="tb-plives" class="lives-p">❤❤❤</span>&nbsp; Ennemi: <span id="tb-elives" class="lives-e">❤❤❤</span>`;

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'tb-canvas-wrap';
    this._canvas = document.createElement('canvas');
    this._canvas.id = 'tb-canvas';
    canvasWrap.appendChild(this._canvas);

    this._wrapper.append(hud, canvasWrap);
    this._viewport.appendChild(this._wrapper);
    this._ctx = this._canvas.getContext('2d');
    this._resizeCanvas();
  }

  _resizeCanvas() {
    const wrap = this._canvas.parentElement;
    const maxW = (wrap.clientWidth  || 510) - 4;
    const maxH = (wrap.clientHeight || 390) - 4;
    const tileW = Math.floor(maxW / COLS);
    const tileH = Math.floor(maxH / ROWS);
    this._tileSize = Math.max(20, Math.min(tileW, tileH, 34));
    this._canvas.width  = this._tileSize * COLS;
    this._canvas.height = this._tileSize * ROWS;
  }

  _px(col) { return col * this._tileSize; }
  _py(row) { return row * this._tileSize; }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
  }

  _onTick({ state, action }) {
    if (action === 'restart') { this._showStart(); return; }
    this._state = state;

    const sc = document.getElementById('tb-score');
    if (sc) sc.textContent = state.score;
    const pl = document.getElementById('tb-plives');
    if (pl) pl.textContent = '❤'.repeat(Math.max(0, state.player.lives));
    const el = document.getElementById('tb-elives');
    if (el) el.textContent = '❤'.repeat(Math.max(0, state.enemy.lives));

    this._draw(state);
  }

  _draw(s) {
    const ctx  = this._ctx;
    const ts   = this._tileSize;
    if (!ctx) return;

    // Fond
    ctx.fillStyle = '#1a2a1a';
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    // Tuiles
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = s.map[r][c];
        if (tile === 0) continue;
        const x = this._px(c), y = this._py(r);
        if (tile === 1) {
          // Brique
          ctx.fillStyle = '#994422';
          ctx.fillRect(x, y, ts, ts);
          ctx.fillStyle = '#bb5533';
          // Joints de brique
          ctx.fillRect(x, y, ts, 2);
          ctx.fillRect(x, y + ts / 2, ts, 2);
          ctx.fillRect(x, y, 2, ts);
          ctx.fillRect(x + ts / 2, y + ts / 4, 2, ts / 4);
          ctx.fillRect(x + ts / 2, y + ts * 3 / 4, 2, ts / 4);
        } else {
          // Acier
          ctx.fillStyle = '#555566';
          ctx.fillRect(x, y, ts, ts);
          ctx.fillStyle = '#777788';
          ctx.fillRect(x + 2, y + 2, ts - 4, ts - 4);
          ctx.fillStyle = '#555566';
          ctx.fillRect(x + ts / 2 - 1, y, 2, ts);
          ctx.fillRect(x, y + ts / 2 - 1, ts, 2);
        }
      }
    }

    // Bullets
    for (const b of s.bullets) {
      ctx.fillStyle = b.owner === 'player' ? '#ffe066' : '#ff6644';
      ctx.beginPath();
      ctx.arc(this._px(b.col), this._py(b.row), ts * 0.18, 0, Math.PI * 2);
      ctx.fill();
      // Traînée
      ctx.fillStyle = b.owner === 'player' ? 'rgba(255,220,50,0.4)' : 'rgba(255,80,40,0.4)';
      ctx.beginPath();
      ctx.arc(this._px(b.col - b.dx * 0.4), this._py(b.row - b.dy * 0.4), ts * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tanks
    this._drawTank(ctx, s.player, '#44aaff', '#2266cc', ts);
    this._drawTank(ctx, s.enemy,  '#ff6644', '#cc2200', ts);
  }

  _drawTank(ctx, tank, colorBody, colorDark, ts) {
    const DIRS_ANGLE = { UP: -Math.PI/2, DOWN: Math.PI/2, LEFT: Math.PI, RIGHT: 0 };
    const x = this._px(tank.col);
    const y = this._py(tank.row);
    const angle = DIRS_ANGLE[tank.dir] ?? 0;
    const r = ts * 0.38;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Corps
    ctx.fillStyle = colorBody;
    ctx.fillRect(-r, -r, r * 2, r * 2);

    // Chenilles
    ctx.fillStyle = colorDark;
    ctx.fillRect(-r, -r, r * 0.3, r * 2);
    ctx.fillRect( r * 0.7, -r, r * 0.3, r * 2);

    // Tourelle
    ctx.fillStyle = colorDark;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // Canon
    ctx.fillStyle = colorBody;
    ctx.fillRect(0, -r * 0.12, r * 1.1, r * 0.24);

    ctx.restore();
  }

  _onOver({ score, best }) {
    this._overlay.showGameOver(
      { result: 'lose', score, extraInfo: best > score ? `Record: ${best}` : '🏆 Nouveau record !' },
      () => EventBus.emit('game:restart')
    );
  }

  _onWon({ score, best }) {
    this._overlay.showGameOver(
      { result: 'win', score, extraInfo: `Ennemi détruit !${best > score ? ` Record: ${best}` : ' 🏆 Record !'}` },
      () => EventBus.emit('game:restart')
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStart(); }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('tb-styles')?.remove();
  }
}
