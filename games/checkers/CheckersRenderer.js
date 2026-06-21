import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const CELL = 60;

export default class CheckersRenderer {

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
    document.getElementById('chk-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('chk-styles')) return;
    const el = document.createElement('style');
    el.id = 'chk-styles';
    el.textContent = `
      .chk-wrapper {
        position:absolute; inset:0;
        display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        background:#050810; font-family:Orbitron,monospace; gap:12px;
      }
      .chk-canvas { display:block; cursor:pointer; max-width:100%; max-height:85%; }
      .chk-info {
        font-size:11px; letter-spacing:0.1em; color:rgba(255,255,255,0.5);
        min-height:16px;
      }
    `;
    document.head.appendChild(el);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'chk-wrapper';

    const { W, H } = this.config.gameplay;
    this._canvas = document.createElement('canvas');
    this._canvas.className = 'chk-canvas';
    this._canvas.width  = W;
    this._canvas.height = H;
    this._ctx = this._canvas.getContext('2d');

    this._canvas.addEventListener('click', e => {
      const rect = this._canvas.getBoundingClientRect();
      const sx   = this._canvas.width  / rect.width;
      const sy   = this._canvas.height / rect.height;
      const col  = Math.floor((e.clientX - rect.left)  * sx / CELL);
      const row  = Math.floor((e.clientY - rect.top)   * sy / CELL);
      this.game.click(row, col);
    });

    this._infoEl = document.createElement('div');
    this._infoEl.className = 'chk-info';

    this._wrapper.appendChild(this._canvas);
    this._wrapper.appendChild(this._infoEl);

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();
    this.viewport.appendChild(this._wrapper);
  }

  _optionGroups() {
    return [
      {
        key: 'mode', label: 'MODE', default: 'basique',
        options: [{ value: 'basique', label: 'BASIQUE' }],
      },
    ];
  }

  _showStartScreen() {
    this._overlay.showStart(
      this._optionGroups(),
      sel => { this._sel = sel; this._overlay.hide(); this.game.start(sel); },
      { extraHtml: '<div style="font-size:10px;color:rgba(0,255,225,0.6);letter-spacing:0.1em;margin-top:4px">Pièces rouges (bas) · Clique pour jouer</div>' },
    );
  }

  _showEndScreen(data) {
    const isWin = data.result === 'win';
    this._overlay.showGameOver(
      {
        result:    isWin ? 'win' : 'lose',
        score:     data.score,
        isRecord:  data.isRecord,
        extraInfo: `<div class="overlay-score">Score : <strong>${data.score}</strong></div>`,
      },
      () => this._showStartScreen(),
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
    if (e.code === 'KeyP') { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if (e.code === 'KeyR') { e.preventDefault(); EventBus.emit('game:restart'); }
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    this._draw(state);
    this._updateInfo(state);
  }

  _onWon(data)  { this._draw(this.game.state); this._showEndScreen({ ...data, result: 'win' }); }
  _onOver(data) { this._draw(this.game.state); this._showEndScreen({ ...data, result: 'lose' }); }
  _onPaused()   { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed()  { this._overlay.hide(); }
  _onRestart()  { this._showStartScreen(); }

  _updateInfo(state) {
    if (!this._infoEl) return;
    if (state.turn === 'player') {
      this._infoEl.textContent = state.mustJump.length
        ? '⚠ Capture obligatoire !'
        : 'À toi de jouer';
    } else {
      this._infoEl.textContent = 'L\'IA réfléchit…';
    }
  }

  _draw(state) {
    const ctx   = this._ctx;
    const board = state.board;
    const SIZE  = 8;

    /* Board squares */
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const isDark = (r + c) % 2 === 1;
        ctx.fillStyle = isDark ? '#3b2b1a' : '#f0d9a0';
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    }

    /* Highlight selected piece */
    if (state.selected) {
      const { row, col } = state.selected;
      ctx.fillStyle = 'rgba(0,255,180,0.25)';
      ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
    }

    /* Highlight mandatory jumps */
    for (const p of (state.mustJump || [])) {
      if (state.selected?.row === p.row && state.selected?.col === p.col) continue;
      ctx.strokeStyle = 'rgba(255,200,0,0.7)';
      ctx.lineWidth   = 2.5;
      ctx.strokeRect(p.col * CELL + 2, p.row * CELL + 2, CELL - 4, CELL - 4);
    }

    /* Valid move targets */
    for (const m of (state.validMoves || [])) {
      const { row: tr, col: tc } = m.to;
      ctx.fillStyle = 'rgba(0,255,180,0.18)';
      ctx.fillRect(tc * CELL, tr * CELL, CELL, CELL);
      ctx.fillStyle = 'rgba(0,255,180,0.55)';
      ctx.beginPath();
      ctx.arc(tc * CELL + CELL / 2, tr * CELL + CELL / 2, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    /* Pieces */
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const val = board[r][c];
        if (val === 0) continue;
        const cx = c * CELL + CELL / 2;
        const cy = r * CELL + CELL / 2;
        this._drawPiece(ctx, cx, cy, val);
      }
    }

    /* Board border */
    ctx.strokeStyle = 'rgba(0,255,225,0.3)';
    ctx.lineWidth   = 2;
    ctx.strokeRect(1, 1, SIZE * CELL - 2, SIZE * CELL - 2);
  }

  _drawPiece(ctx, cx, cy, val) {
    const isPlayer = val === 1 || val === 3;
    const isKing   = val === 3 || val === 4;
    const r        = CELL * 0.36;

    /* Shadow */
    ctx.shadowColor = isPlayer ? 'rgba(220,50,50,0.5)' : 'rgba(30,30,50,0.7)';
    ctx.shadowBlur  = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    /* Outer ring */
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = isPlayer ? '#c02020' : '#222244';
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

    /* Inner highlight */
    ctx.beginPath();
    ctx.arc(cx - r * 0.2, cy - r * 0.2, r * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = isPlayer ? 'rgba(255,120,120,0.35)' : 'rgba(100,100,180,0.35)';
    ctx.fill();

    /* Border */
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = isPlayer ? '#ff6060' : '#6060cc';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    /* King crown */
    if (isKing) {
      ctx.fillStyle = '#ffd700';
      ctx.font      = `bold ${Math.round(r * 0.9)}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♛', cx, cy + 1);
    }
  }
}
