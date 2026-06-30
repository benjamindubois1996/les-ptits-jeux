import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const SIZE  = 9;
const EMPTY = 0, BLACK = 1, WHITE = 2;

const STAR_POINTS = [[2,2],[2,6],[6,2],[6,6],[4,4]]; // 9×9 hoshi

export default class GoRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._wrapper  = null;
    this._canvas   = null;
    this._ctx      = null;
    this._overlay  = null;
    this._state    = null;
    this._hover    = null;
    this._cell     = 40;
    this._pad      = 28;

    this._onTick      = this._onTick.bind(this);
    this._onOver      = this._onOver.bind(this);
    this._onWon       = this._onWon.bind(this);
    this._onPaused    = this._onPaused.bind(this);
    this._onResumed   = this._onResumed.bind(this);
    this._onRestart   = this._onRestart.bind(this);
    this._onClick     = this._onClick.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);
    this._onKey       = this._onKey.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._overlay = new GameOverlay(this._viewport);
    this._showStart();
    this._bindEvents();
    this._draw();
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      () => { this._overlay.hide(); this._game.start(); },
      { extraHtml: '<div style="color:#888;font-size:9px;text-align:center">⚫ Vous (noir) · ⚪ IA (blanc) · Komi 6.5 · Deux passes = fin</div>' }
    );
  }

  _injectStyles() {
    if (document.getElementById('go-styles')) return;
    const s = document.createElement('style');
    s.id = 'go-styles';
    s.textContent = `
      .go-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 4px;
        box-sizing: border-box; gap: 4px;
        font-family: Orbitron, monospace;
        background: #0a0d14; overflow: hidden;
      }
      .go-hud {
        width: 100%; display: flex; gap: 8px;
        align-items: center; justify-content: center;
        font-size: 10px; color: #aaa; flex-shrink: 0; flex-wrap: wrap;
      }
      .go-hud-pill {
        background: rgba(255,255,255,0.06); padding: 2px 8px;
        border-radius: 4px; white-space: nowrap;
      }
      .go-canvas-wrap {
        flex: 1; width: 100%;
        display: flex; align-items: center; justify-content: center;
        overflow: hidden;
      }
      #go-canvas { display: block; cursor: crosshair; }
      .go-actions { display: flex; gap: 8px; flex-shrink: 0; }
      .go-btn {
        background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14);
        color: #a0c4ff; font-family: Orbitron, monospace; font-size: 9px;
        padding: 4px 12px; border-radius: 4px; cursor: pointer;
      }
      .go-btn:hover { background: rgba(255,255,255,0.14); }
      .go-msg {
        font-size: 10px; color: #ffd700; min-height: 14px; text-align: center; flex-shrink: 0;
      }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'go-wrapper';
    this._wrapper.innerHTML = `
      <div class="go-hud">
        <div class="go-hud-pill">⚫ Captures : <span id="go-cap-b">0</span></div>
        <div class="go-hud-pill">⚪ Captures : <span id="go-cap-w">0</span></div>
      </div>
      <div class="go-canvas-wrap">
        <canvas id="go-canvas"></canvas>
      </div>
      <div class="go-actions">
        <button class="go-btn" id="go-pass">Passer</button>
        <button class="go-btn" id="go-resign">Abandonner</button>
      </div>
      <div class="go-msg" id="go-msg"></div>
    `;
    this._viewport.appendChild(this._wrapper);

    this._canvas = document.getElementById('go-canvas');
    this._ctx    = this._canvas.getContext('2d');

    const maxSide = Math.min(
      this._viewport.clientWidth  - 16,
      this._viewport.clientHeight - 110,
      400
    );
    this._cell = Math.floor((maxSide - 30) / (SIZE - 1));
    this._pad  = Math.floor((maxSide - this._cell * (SIZE - 1)) / 2);
    const sz   = this._cell * (SIZE - 1) + this._pad * 2;
    this._canvas.width  = sz;
    this._canvas.height = sz;
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    this._canvas.addEventListener('click',      this._onClick);
    this._canvas.addEventListener('mousemove',  this._onMouseMove);
    this._canvas.addEventListener('mouseleave', this._onMouseLeave);
    window.addEventListener('keydown', this._onKey);
    document.getElementById('go-pass')?.addEventListener('click',   () => this._game.pass());
    document.getElementById('go-resign')?.addEventListener('click', () => this._game.resign());
  }

  _onKey(e) {
    if (e.code === 'KeyP') EventBus.emit('game:pause-toggle');
    if (e.code === 'KeyR') EventBus.emit('game:restart');
  }

  _onClick(e) {
    if (!this._state || this._state.status !== 'playing' || this._state.currentPlayer !== BLACK) return;
    const rect = this._canvas.getBoundingClientRect();
    const cell = this._xyToCell(e.clientX - rect.left, e.clientY - rect.top);
    if (cell) this._game.placeStone(cell.r, cell.c);
  }

  _onMouseMove(e) {
    const rect = this._canvas.getBoundingClientRect();
    this._hover = this._xyToCell(e.clientX - rect.left, e.clientY - rect.top);
    this._draw();
  }

  _onMouseLeave() { this._hover = null; this._draw(); }

  _xyToCell(x, y) {
    const p = this._pad, cell = this._cell;
    const c = Math.round((x - p) / cell);
    const r = Math.round((y - p) / cell);
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) return { r, c };
    return null;
  }

  _onTick({ state }) {
    this._state = state;
    this._updateHUD(state);
    this._draw();
  }

  _onOver({ score }) {
    const s = this._state;
    const extra = s?.finalScore
      ? `<div style="font-size:10px;color:#aaa;margin-top:4px">Territoire Noir: ${s.finalScore.territory.black} · Blanc: ${s.finalScore.territory.white}</div>`
      : '';
    this._overlay.showGameOver(
      { result: 'lose', score, title: 'FIN DE PARTIE', extraInfo: extra },
      () => { this._overlay.hide(); this._game.restart(); }
    );
  }

  _onWon({ score }) {
    const s = this._state;
    const extra = s?.finalScore
      ? `<div style="font-size:10px;color:#aaa;margin-top:4px">Territoire Noir: ${s.finalScore.territory.black} · Blanc: ${s.finalScore.territory.white}</div>`
      : '';
    this._overlay.showGameOver(
      { result: 'win', score, title: 'VICTOIRE AU TERRITOIRE !', extraInfo: extra },
      () => { this._overlay.hide(); this._game.restart(); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStart(); }

  _updateHUD(state) {
    const $  = id => document.getElementById(id);
    if ($('go-cap-b')) $('go-cap-b').textContent = state.captures.black;
    if ($('go-cap-w')) $('go-cap-w').textContent = state.captures.white;
    if ($('go-msg'))   $('go-msg').textContent   = state.message;
  }

  _draw() {
    const ctx = this._ctx;
    if (!ctx) return;
    const s = this._state;
    const W = this._canvas.width, H = this._canvas.height;
    const p = this._pad, cell = this._cell;

    // Board color
    ctx.fillStyle = '#c5a84a';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = '#5a3a00';
    ctx.lineWidth = 1;
    for (let i = 0; i < SIZE; i++) {
      const x = p + i * cell, y = p + i * cell;
      ctx.beginPath(); ctx.moveTo(p, y); ctx.lineTo(p + (SIZE-1)*cell, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, p); ctx.lineTo(x, p + (SIZE-1)*cell); ctx.stroke();
    }

    // Border (thicker)
    ctx.strokeStyle = '#3a2000'; ctx.lineWidth = 2;
    ctx.strokeRect(p, p, (SIZE-1)*cell, (SIZE-1)*cell);

    // Star points (hoshi)
    ctx.fillStyle = '#3a2000';
    for (const [sr, sc] of STAR_POINTS) {
      ctx.beginPath(); ctx.arc(p + sc*cell, p + sr*cell, 3.5, 0, Math.PI*2); ctx.fill();
    }

    // Coordinates (letters top, numbers left)
    ctx.fillStyle = '#6b4400'; ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const cols = 'ABCDEFGHJ'; // no I in Go
    for (let i = 0; i < SIZE; i++) {
      ctx.fillText(cols[i], p + i*cell, p - 14);
      ctx.fillText(SIZE - i, p - 16, p + i*cell);
    }

    // Stones
    if (s?.board) {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const v = s.board[r][c];
          if (v === EMPTY) continue;
          const cx = p + c*cell, cy = p + r*cell;
          this._drawStone(ctx, cx, cy, cell * 0.45, v);

          // Last move marker
          if (s.lastMove && typeof s.lastMove === 'object' && s.lastMove.r === r && s.lastMove.c === c) {
            ctx.fillStyle = v === BLACK ? '#ff6' : '#222';
            ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill();
          }
        }
      }
    }

    // Hover ghost (player only)
    if (this._hover && s?.status === 'playing' && s.currentPlayer === BLACK) {
      const { r, c } = this._hover;
      if (s.board[r][c] === EMPTY) {
        ctx.globalAlpha = 0.38;
        this._drawStone(ctx, p + c*cell, p + r*cell, cell * 0.45, BLACK);
        ctx.globalAlpha = 1;
      }
    }
  }

  _drawStone(ctx, cx, cy, radius, color) {
    const grad = ctx.createRadialGradient(cx - radius*0.3, cy - radius*0.35, radius*0.05, cx, cy, radius);
    if (color === BLACK) {
      grad.addColorStop(0, '#888'); grad.addColorStop(1, '#111');
    } else {
      grad.addColorStop(0, '#fff'); grad.addColorStop(1, '#ccc');
    }
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI*2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = color === BLACK ? '#000' : '#999';
    ctx.lineWidth = 0.5; ctx.stroke();
  }

  destroy() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    this._canvas?.removeEventListener('click',      this._onClick);
    this._canvas?.removeEventListener('mousemove',  this._onMouseMove);
    this._canvas?.removeEventListener('mouseleave', this._onMouseLeave);
    window.removeEventListener('keydown', this._onKey);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('go-styles')?.remove();
  }
}
