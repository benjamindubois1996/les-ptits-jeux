import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const PLAYER_STORE = 6;
const AI_STORE     = 13;

export default class MancalaRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._wrapper  = null;
    this._canvas   = null;
    this._ctx      = null;
    this._overlay  = null;
    this._state    = null;
    this._hoverPit = null;

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
      { extraHtml: '<div style="color:#888;font-size:9px;text-align:center">Vous jouez en bas · Cliquez sur un trou pour semer</div>' }
    );
  }

  _injectStyles() {
    if (document.getElementById('mancala-styles')) return;
    const s = document.createElement('style');
    s.id = 'mancala-styles';
    s.textContent = `
      .mancala-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center; padding: 8px;
        box-sizing: border-box; gap: 8px;
        font-family: Orbitron, monospace;
        background: #0a0d14; overflow: hidden;
      }
      #mancala-canvas { display: block; cursor: pointer; }
      .mancala-msg {
        font-size: 11px; color: #ffd700; min-height: 16px;
        text-align: center; max-width: 380px;
      }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'mancala-wrapper';
    this._wrapper.innerHTML = `
      <canvas id="mancala-canvas"></canvas>
      <div class="mancala-msg" id="mancala-msg"></div>
    `;
    this._viewport.appendChild(this._wrapper);

    this._canvas = document.getElementById('mancala-canvas');
    this._ctx    = this._canvas.getContext('2d');
    this._computeLayout();
    this._canvas.width  = this._W;
    this._canvas.height = this._H;
  }

  _computeLayout() {
    const vw = Math.min(this._viewport.clientWidth  - 16, 480);
    const vh = Math.min(this._viewport.clientHeight - 80, 300);
    // Board: 8 columns (1 store + 6 pits + 1 store), 2 rows
    const pitW = Math.floor(Math.min(vw / 8, vh / 2.8));
    const pitH = Math.floor(pitW * 1.4);
    this._pitW = pitW;
    this._pitH = pitH;
    this._pad  = 8;
    this._W    = this._pad * 2 + pitW * 8;
    this._H    = this._pad * 2 + pitH * 2 + 10;
  }

  // Returns screen rect for pit at index
  _pitRect(index) {
    // Layout: [AI_STORE] [12][11][10][9][8][7] [PLAYER_STORE]
    //         [empty col] [0][ 1][ 2][3][4][5] [empty col]
    // Actually: col 0 = stores, cols 1-6 = pits, col 7 = stores
    // AI pits: indices 7-12 are shown left to right as 12,11,10,9,8,7 (cols 1-6, row 0)
    // Player pits: indices 0-5 shown left to right (cols 1-6, row 1)
    // AI store (13): col 0 rows 0-1
    // Player store (6): col 7 rows 0-1
    const p = this._pad, pW = this._pitW, pH = this._pitH;

    if (index === AI_STORE) {
      return { x: p, y: p, w: pW, h: pH * 2 + 10 };
    }
    if (index === PLAYER_STORE) {
      return { x: p + pW * 7, y: p, w: pW, h: pH * 2 + 10 };
    }
    if (index >= 0 && index <= 5) {
      // Player pits: 0 at col 1, 5 at col 6 (row 1)
      const col = index + 1;
      return { x: p + col * pW, y: p + pH + 10, w: pW, h: pH };
    }
    if (index >= 7 && index <= 12) {
      // AI pits: 12 at col 1, 7 at col 6 (row 0)
      const col = 12 - index + 1;
      return { x: p + col * pW, y: p, w: pW, h: pH };
    }
    return null;
  }

  _canvasToPit(px, py) {
    for (let i = 0; i < 14; i++) {
      const r = this._pitRect(i);
      if (!r) continue;
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
    }
    return null;
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
  }

  _onKey(e) {
    if (e.code === 'KeyP') EventBus.emit('game:pause-toggle');
    if (e.code === 'KeyR') EventBus.emit('game:restart');
  }

  _onClick(e) {
    if (!this._state || this._state.status !== 'playing' || this._state.currentPlayer !== 'player') return;
    const rect = this._canvas.getBoundingClientRect();
    const pit = this._canvasToPit(e.clientX - rect.left, e.clientY - rect.top);
    if (pit !== null && pit >= 0 && pit <= 5) this._game.pick(pit);
  }

  _onMouseMove(e) {
    if (!this._state || this._state.currentPlayer !== 'player') { this._hoverPit = null; return; }
    const rect = this._canvas.getBoundingClientRect();
    const pit = this._canvasToPit(e.clientX - rect.left, e.clientY - rect.top);
    this._hoverPit = (pit !== null && pit >= 0 && pit <= 5) ? pit : null;
    this._draw();
  }

  _onMouseLeave() { this._hoverPit = null; this._draw(); }

  _onTick({ state }) {
    this._state = state;
    this._draw();
    const msg = document.getElementById('mancala-msg');
    if (msg) msg.textContent = state.message;
    EventBus.emit('game:score-update', { score: state.pits[PLAYER_STORE] });
  }

  _onOver({ score }) {
    this._overlay.showGameOver(
      { result: 'lose', score, title: "L'IA gagne !" },
      () => { this._overlay.hide(); this._game.restart(); }
    );
  }

  _onWon({ score }) {
    this._overlay.showGameOver(
      { result: 'win', score, title: 'VOUS GAGNEZ !' },
      () => { this._overlay.hide(); this._game.restart(); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStart(); }

  _draw() {
    const ctx = this._ctx;
    if (!ctx) return;
    const s = this._state;
    const W = this._W, H = this._H;

    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, W, H);

    // Board background
    ctx.fillStyle = '#1a1200';
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    const p = this._pad, pW = this._pitW, pH = this._pitH;
    ctx.beginPath();
    ctx.roundRect(p, p, pW * 8, pH * 2 + 10, 10);
    ctx.fill(); ctx.stroke();

    // Draw all pits
    for (let i = 0; i < 14; i++) {
      if (i === 6 || i === 13) continue; // stores drawn separately
      const r = this._pitRect(i);
      if (!r) continue;
      const seeds = s?.pits[i] ?? 0;
      const isPlayerPit = i >= 0 && i <= 5;
      const isHover = this._hoverPit === i;
      const isEmpty = seeds === 0;
      this._drawPit(ctx, r, seeds, isPlayerPit, isHover, isEmpty && isPlayerPit && s?.currentPlayer === 'player');
    }

    // Draw stores (taller)
    const aiStore   = this._pitRect(AI_STORE);
    const plrStore  = this._pitRect(PLAYER_STORE);
    this._drawStore(ctx, aiStore,  s?.pits[AI_STORE] ?? 0,  'IA', '#ff8844');
    this._drawStore(ctx, plrStore, s?.pits[PLAYER_STORE] ?? 0, 'Vous', '#4488ff');

    // Labels
    ctx.fillStyle = '#aaa'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
    ctx.fillText('← IA joue', p + pW * 4, p - 2);
    ctx.fillText('Vous jouez →', p + pW * 4, H - 2);
  }

  _drawPit(ctx, r, seeds, isPlayer, isHover, isDisabled) {
    ctx.save();
    // Pit background
    const bg = isDisabled ? '#1a1000' : isHover ? '#3d2800' : '#2a1800';
    ctx.fillStyle = bg;
    ctx.strokeStyle = isHover ? '#ffd700' : '#8B4513';
    ctx.lineWidth = isHover ? 2 : 1;
    ctx.beginPath();
    ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.42, r.h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Seeds count
    ctx.fillStyle = isDisabled ? '#444' : isPlayer ? '#88ccff' : '#ffbb66';
    ctx.font = `bold ${Math.min(14, r.w * 0.35)}px Orbitron, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(seeds, r.x + r.w / 2, r.y + r.h / 2);

    ctx.restore();
  }

  _drawStore(ctx, r, seeds, label, color) {
    ctx.save();
    ctx.fillStyle = '#1a1200';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 8);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = `bold ${Math.min(18, r.w * 0.5)}px Orbitron, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(seeds, r.x + r.w / 2, r.y + r.h / 2);

    ctx.font = '8px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h - 10);
    ctx.restore();
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
    document.getElementById('mancala-styles')?.remove();
  }
}
