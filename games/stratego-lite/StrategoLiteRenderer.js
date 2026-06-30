import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';
import { PIECES, PLAYER_PIECES } from './StrategoLite.js';

const COLS = 6, ROWS = 6;
const CELL  = 52;
const PAD   = 8;
const PANEL = 100; // right panel width for setup

const PIECE_COLORS = {
  player: { bg: '#003388', border: '#4488ff', text: '#88ccff' },
  ai:     { bg: '#880000', border: '#ff4444', text: '#ffaaaa' },
};

export default class StrategoLiteRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._wrapper  = null;
    this._canvas   = null;
    this._ctx      = null;
    this._overlay  = null;
    this._state    = null;
    this._selectedSetup = null; // piece id selected in panel during setup

    this._onTick      = this._onTick.bind(this);
    this._onOver      = this._onOver.bind(this);
    this._onWon       = this._onWon.bind(this);
    this._onPaused    = this._onPaused.bind(this);
    this._onResumed   = this._onResumed.bind(this);
    this._onRestart   = this._onRestart.bind(this);
    this._onClick     = this._onClick.bind(this);
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
      { extraHtml: '<div style="color:#888;font-size:9px;text-align:center">🔵 Vous (bas) · 🔴 IA (haut) · Trouvez le drapeau ennemi !</div>' }
    );
  }

  _injectStyles() {
    if (document.getElementById('strat-styles')) return;
    const s = document.createElement('style');
    s.id = 'strat-styles';
    s.textContent = `
      .strat-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 4px;
        box-sizing: border-box; gap: 4px;
        font-family: Orbitron, monospace;
        background: #0a0d14; overflow: hidden;
      }
      .strat-top {
        width: 100%; display: flex; gap: 8px;
        align-items: center; justify-content: center;
        font-size: 10px; color: #aaa; flex-shrink: 0;
      }
      .strat-layout {
        display: flex; gap: 10px; flex: 1;
        align-items: center; justify-content: center;
      }
      .strat-board-wrap { position: relative; flex-shrink: 0; }
      #strat-canvas { display: block; cursor: pointer; }
      .strat-panel {
        width: 95px; display: flex; flex-direction: column; gap: 4px;
        font-size: 10px; color: #aaa;
      }
      .strat-panel-title { font-size: 9px; color: #888; margin-bottom: 2px; }
      .strat-piece-btn {
        background: rgba(0,51,136,0.3); border: 1px solid #224488;
        color: #88ccff; font-family: Orbitron, monospace; font-size: 9px;
        padding: 4px 6px; border-radius: 4px; cursor: pointer; text-align: left;
        display: flex; align-items: center; gap: 5px;
      }
      .strat-piece-btn.placed { opacity: 0.35; cursor: default; }
      .strat-piece-btn.selected { border-color: #ffd700; color: #ffd700; background: rgba(80,60,0,0.5); }
      .strat-piece-rank {
        width: 18px; height: 18px; background: #003388; border: 1px solid #4488ff;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 9px; border-radius: 3px; flex-shrink: 0;
      }
      #strat-start-btn {
        background: #006600; border: none; color: #88ff88;
        font-family: Orbitron, monospace; font-size: 9px;
        padding: 5px; border-radius: 4px; cursor: pointer; width: 100%;
        margin-top: 4px;
      }
      #strat-start-btn:disabled { opacity: 0.4; cursor: default; }
      .strat-msg {
        font-size: 10px; color: #ffd700; min-height: 14px; text-align: center; flex-shrink: 0;
      }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'strat-wrapper';
    this._wrapper.innerHTML = `
      <div class="strat-top">
        <span>🔴 IA — <span id="strat-ai-count">?</span> pièces</span>
        <span style="margin:0 10px">VS</span>
        <span>🔵 Vous — <span id="strat-pl-count">?</span> pièces</span>
      </div>
      <div class="strat-layout">
        <div class="strat-board-wrap">
          <canvas id="strat-canvas"></canvas>
        </div>
        <div class="strat-panel" id="strat-panel">
          <div class="strat-panel-title">PIÈCES À PLACER</div>
          ${PLAYER_PIECES.map(id => `
            <button class="strat-piece-btn" data-piece="${id}" id="sp-${id}">
              <span class="strat-piece-rank">${PIECES[id].label}</span>
              ${PIECES[id].name}
            </button>
          `).join('')}
          <button id="strat-start-btn" disabled>▶ COMMENCER</button>
        </div>
      </div>
      <div class="strat-msg" id="strat-msg"></div>
    `;
    this._viewport.appendChild(this._wrapper);

    this._canvas = document.getElementById('strat-canvas');
    this._ctx    = this._canvas.getContext('2d');

    const maxSide = Math.min(this._viewport.clientWidth - PANEL - 30, this._viewport.clientHeight - 80);
    const cell    = Math.floor(maxSide / ROWS);
    this._cell    = Math.min(cell, 62);
    const sz      = this._cell * COLS;
    this._canvas.width  = sz;
    this._canvas.height = this._cell * ROWS;
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    this._canvas.addEventListener('click', this._onClick);
    window.addEventListener('keydown', this._onKey);

    // Setup panel piece buttons
    PLAYER_PIECES.forEach(id => {
      document.getElementById(`sp-${id}`)?.addEventListener('click', () => {
        const s = this._state;
        if (!s || s.phase !== 'setup') return;
        if (!s.setupLeft.includes(id)) return;
        this._selectedSetup = id;
        PLAYER_PIECES.forEach(pid => {
          document.getElementById(`sp-${pid}`)?.classList.toggle('selected', pid === id);
        });
      });
    });

    document.getElementById('strat-start-btn')?.addEventListener('click', () => {
      this._game.startGame();
      document.getElementById('strat-panel')?.style.setProperty('display', 'none');
    });
  }

  _onKey(e) {
    if (e.code === 'KeyP') EventBus.emit('game:pause-toggle');
    if (e.code === 'KeyR') EventBus.emit('game:restart');
  }

  _onClick(e) {
    const s = this._state;
    if (!s || s.status !== 'playing') return;

    const rect = this._canvas.getBoundingClientRect();
    const x    = e.clientX - rect.left;
    const y    = e.clientY - rect.top;
    const c    = Math.floor(x / this._cell);
    const r    = Math.floor(y / this._cell);

    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;

    if (s.phase === 'setup') {
      if (!this._selectedSetup) {
        // Click existing player piece to remove it
        this._game.setupRemove(r, c);
        return;
      }
      if (r < 4 || r > 5) return;
      this._game.setupPlace(r, c, this._selectedSetup);
      this._selectedSetup = null;
      PLAYER_PIECES.forEach(id => document.getElementById(`sp-${id}`)?.classList.remove('selected'));
    } else {
      this._game.selectCell(r, c);
    }
  }

  _onTick({ state }) {
    this._state = state;
    this._updateUI(state);
    this._draw();
  }

  _updateUI(state) {
    const $ = id => document.getElementById(id);
    if ($('strat-msg')) $('strat-msg').textContent = state.message;
    EventBus.emit('game:score-update', { score: state.score });

    // Count pieces
    let playerCount = 0, aiCount = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = state.board[r][c];
        if (!cell) continue;
        if (cell.color === 'player') playerCount++;
        else aiCount++;
      }
    }
    if ($('strat-pl-count')) $('strat-pl-count').textContent = playerCount;
    if ($('strat-ai-count')) $('strat-ai-count').textContent = aiCount;

    // Update setup panel
    if (state.phase === 'setup') {
      PLAYER_PIECES.forEach(id => {
        const btn = $(`sp-${id}`);
        if (!btn) return;
        btn.classList.toggle('placed', !state.setupLeft.includes(id));
      });
      const startBtn = $('strat-start-btn');
      if (startBtn) startBtn.disabled = state.setupLeft.length > 0;
    }
  }

  _onOver({ score }) {
    this._overlay.showGameOver(
      { result: 'lose', score, title: "L'IA capture votre drapeau !" },
      () => { this._overlay.hide(); this._game.restart(); }
    );
  }

  _onWon({ score }) {
    this._overlay.showGameOver(
      { result: 'win', score, title: 'VOUS CAPTUREZ LE DRAPEAU !' },
      () => { this._overlay.hide(); this._game.restart(); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() {
    this._selectedSetup = null;
    document.getElementById('strat-panel')?.style.removeProperty('display');
    this._showStart();
  }

  _draw() {
    const ctx  = this._ctx;
    if (!ctx) return;
    const s    = this._state;
    const cell = this._cell;
    const W    = this._canvas.width, H = this._canvas.height;

    ctx.fillStyle = '#0c0f1a';
    ctx.fillRect(0, 0, W, H);

    // Row separators / setup area highlight
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * cell, y = r * cell;

        // Zone colors
        let bg = 'rgba(255,255,255,0.03)';
        if (s?.phase === 'setup' && r >= 4) bg = 'rgba(0,51,136,0.15)';
        else if (s?.phase === 'setup' && r <= 1) bg = 'rgba(136,0,0,0.15)';

        ctx.fillStyle = bg;
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth   = 0.5;
        ctx.strokeRect(x, y, cell, cell);
      }
    }

    if (!s) return;

    // Highlight valid moves
    s.validMoves?.forEach(({ r, c }) => {
      ctx.fillStyle = 'rgba(255,215,0,0.15)';
      ctx.fillRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(c * cell + 2, r * cell + 2, cell - 4, cell - 4);
      ctx.setLineDash([]);
    });

    // Highlight last battle
    if (s.lastBattle) {
      const { r, c } = s.lastBattle;
      ctx.strokeStyle = '#ff8800'; ctx.lineWidth = 2.5;
      ctx.strokeRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);
    }

    // Draw pieces
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = s.board[r][c];
        if (!piece) continue;
        const x   = c * cell, y = r * cell;
        const isSelected = s.selected && s.selected.r === r && s.selected.c === c;
        const revealed   = piece.revealed || piece.color === 'player';
        this._drawPiece(ctx, x, y, cell, piece, revealed, isSelected);
      }
    }

    // Setup zone labels
    if (s.phase === 'setup') {
      ctx.fillStyle = 'rgba(68,136,255,0.5)'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('⬇ Votre zone ⬇', W / 2, ROWS * cell - cell * 1.5 - 5);
    }
  }

  _drawPiece(ctx, x, y, cell, piece, revealed, isSelected) {
    const margin  = 3;
    const inner   = cell - margin * 2;
    const colors  = PIECE_COLORS[piece.color];

    ctx.save();
    ctx.fillStyle = isSelected
      ? 'rgba(80,60,0,0.9)'
      : piece.color === 'player' ? 'rgba(0,40,120,0.9)' : 'rgba(100,0,0,0.9)';
    ctx.strokeStyle = isSelected ? '#ffd700' : colors.border;
    ctx.lineWidth   = isSelected ? 2 : 1.5;
    ctx.beginPath();
    ctx.roundRect(x + margin, y + margin, inner, inner, 5);
    ctx.fill(); ctx.stroke();

    if (revealed) {
      // Rank label
      ctx.fillStyle = colors.text;
      ctx.font = `bold ${Math.min(13, inner * 0.3)}px Orbitron, monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(piece.label, x + cell / 2, y + cell / 2 - inner * 0.1);

      // Name below (tiny)
      ctx.font = `${Math.min(7, inner * 0.18)}px monospace`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(piece.name.substring(0, 5), x + cell / 2, y + cell / 2 + inner * 0.28);
    } else {
      // Hidden: show "?"
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `bold ${Math.min(16, inner * 0.4)}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', x + cell / 2, y + cell / 2);
    }

    ctx.restore();
  }

  destroy() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    this._canvas?.removeEventListener('click', this._onClick);
    window.removeEventListener('keydown', this._onKey);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('strat-styles')?.remove();
  }
}
