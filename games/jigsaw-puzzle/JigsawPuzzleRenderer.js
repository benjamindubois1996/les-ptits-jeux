import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const COLS = 3, ROWS = 3;

export default class JigsawPuzzleRenderer {
  constructor(game, viewport, config) {
    this._game      = game;
    this._viewport  = viewport;
    this._wrapper   = null;
    this._canvas    = null;
    this._ctx       = null;
    this._overlay   = null;
    this._offscreen = null; // generated image canvas
    this._pieceSize = 80;
    this._boardX    = 0;
    this._boardY    = 0;
    this._trayY     = 0;

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onClick   = this._onClick.bind(this);
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
    if (document.getElementById('jp-styles')) return;
    const s = document.createElement('style');
    s.id = 'jp-styles';
    s.textContent = `
      .jp-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 6px;
        box-sizing: border-box; gap: 5px;
        font-family: Orbitron, monospace;
        background: #05080f; overflow: hidden;
      }
      .jp-hud {
        display: flex; gap: 16px; font-size: 11px;
        color: #888; justify-content: center; flex-wrap: wrap;
      }
      .jp-hud .val { color: #ffd700; font-weight: bold; }
      #jp-canvas { display: block; cursor: pointer; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'jp-wrapper';
    this._wrapper.innerHTML = `
      <div class="jp-hud">
        <span>PIÈCES <span class="val" id="jp-placed">0</span>/9</span>
        <span>SCORE  <span class="val" id="jp-score">—</span></span>
      </div>
      <canvas id="jp-canvas"></canvas>
    `;
    this._viewport.appendChild(this._wrapper);
    this._canvas     = this._wrapper.querySelector('#jp-canvas');
    this._ctx        = this._canvas.getContext('2d');
    this._placedEl   = this._wrapper.querySelector('#jp-placed');
    this._scoreEl    = this._wrapper.querySelector('#jp-score');

    // Determine piece size from available space
    const avW = this._viewport.clientWidth  - 16;
    const avH = this._viewport.clientHeight - 60;
    // Canvas layout: board (3×pieceSize wide) + gap (16) + tray (3×pieceSize wide)
    // Total width = 6*ps + 16, height = 3*ps + ps + gap
    this._pieceSize = Math.max(50, Math.min(90, Math.floor(Math.min(avW / 6.5, avH / 4.5))));
    const ps = this._pieceSize;
    const gap = 14;
    const trayItemSize = Math.floor(ps * 0.8);
    this._trayItemSize = trayItemSize;

    const cW = ps * COLS + gap + trayItemSize * COLS;
    const cH = Math.max(ps * ROWS, trayItemSize * ROWS);
    this._canvas.width  = cW;
    this._canvas.height = cH;

    this._boardX = 0;
    this._boardY = Math.floor((cH - ps * ROWS) / 2);
    this._trayX  = ps * COLS + gap;
    this._trayY  = Math.floor((cH - trayItemSize * ROWS) / 2);

    // Generate the image to puzzle
    this._generateImage(ps);
  }

  _generateImage(ps) {
    const size = ps * COLS;
    this._offscreen = document.createElement('canvas');
    this._offscreen.width  = size;
    this._offscreen.height = size;
    const ctx = this._offscreen.getContext('2d');

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, size * 0.6);
    sky.addColorStop(0,    '#1a1a6e');
    sky.addColorStop(0.5,  '#3366cc');
    sky.addColorStop(1,    '#ff9944');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, size, size * 0.6);

    // Sun
    ctx.save();
    ctx.fillStyle = '#ffee44';
    ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(size * 0.72, size * 0.18, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Mountains (background)
    ctx.fillStyle = '#445566';
    ctx.beginPath();
    ctx.moveTo(0, size * 0.6);
    ctx.lineTo(size * 0.15, size * 0.3);
    ctx.lineTo(size * 0.32, size * 0.55);
    ctx.lineTo(size * 0.5,  size * 0.22);
    ctx.lineTo(size * 0.68, size * 0.45);
    ctx.lineTo(size * 0.85, size * 0.28);
    ctx.lineTo(size,         size * 0.5);
    ctx.lineTo(size,         size * 0.6);
    ctx.closePath();
    ctx.fill();

    // Ground
    const gnd = ctx.createLinearGradient(0, size * 0.6, 0, size);
    gnd.addColorStop(0, '#2d5a1b');
    gnd.addColorStop(1, '#1a3a0e');
    ctx.fillStyle = gnd;
    ctx.fillRect(0, size * 0.6, size, size * 0.4);

    // River
    ctx.fillStyle = '#2266cc';
    ctx.beginPath();
    ctx.ellipse(size * 0.5, size * 0.78, size * 0.28, size * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#44aaff44';
    ctx.beginPath();
    ctx.ellipse(size * 0.5, size * 0.76, size * 0.2, size * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();

    // Trees
    const trees = [0.1, 0.25, 0.78, 0.88];
    for (const tx of trees) {
      const bx = size * tx, by = size * 0.6;
      ctx.fillStyle = '#1a4d1a';
      ctx.beginPath();
      ctx.moveTo(bx, by - size * 0.18);
      ctx.lineTo(bx - size * 0.06, by);
      ctx.lineTo(bx + size * 0.06, by);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#226622';
      ctx.beginPath();
      ctx.moveTo(bx, by - size * 0.26);
      ctx.lineTo(bx - size * 0.05, by - size * 0.12);
      ctx.lineTo(bx + size * 0.05, by - size * 0.12);
      ctx.closePath();
      ctx.fill();
    }

    // Grid lines to help distinguish pieces
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5;
    for (let r = 1; r < ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * ps); ctx.lineTo(size, r * ps); ctx.stroke(); }
    for (let c = 1; c < COLS; c++) { ctx.beginPath(); ctx.moveTo(c * ps, 0); ctx.lineTo(c * ps, size); ctx.stroke(); }
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    this._canvas.addEventListener('click', this._onClick);
  }

  _onClick(e) {
    const s = this._game.state;
    if (!s || s.status !== 'playing') return;

    const rect = this._canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    const ps   = this._pieceSize;
    const ts   = this._trayItemSize;

    // Check board clicks
    const bx = mx - this._boardX, by = my - this._boardY;
    if (bx >= 0 && bx < ps * COLS && by >= 0 && by < ps * ROWS) {
      const col = Math.floor(bx / ps), row = Math.floor(by / ps);
      if (s.selected !== null) {
        this._game.placeOnBoard(row, col);
      } else if (s.board[row][col] !== null) {
        this._game.removePiece(row, col);
      }
      return;
    }

    // Check tray clicks
    const tx = mx - this._trayX, ty = my - this._trayY;
    if (tx >= 0 && tx < ts * COLS && ty >= 0 && ty < ts * ROWS) {
      const col = Math.floor(tx / ts), row = Math.floor(ty / ts);
      const slot = row * COLS + col;
      const piece = s.pieces.find(p => !p.placed && p.traySlot === slot);
      if (piece) this._game.selectPiece(piece.id);
    }
  }

  _onTick(e) {
    if (e.action === 'restart') { this._showStart(); return; }
    if (e.action === 'play')    { this._overlay.hide(); }
    const s = e.state;
    if (!s) return;
    this._placedEl.textContent = s.placedCount;
    this._scoreEl.textContent  = s.score > 0 ? s.score : '—';
    this._draw(s);
  }

  _draw(s) {
    const ctx = this._ctx;
    const ps  = this._pieceSize;
    const ts  = this._trayItemSize;
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

    // Board background
    ctx.fillStyle = '#111';
    ctx.fillRect(this._boardX, this._boardY, ps * COLS, ps * ROWS);

    // Board cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = this._boardX + c * ps, y = this._boardY + r * ps;
        const pid = s.board[r][c];

        // Cell background
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(x + 1, y + 1, ps - 2, ps - 2);

        // Dashed border for empty slots
        if (pid === null) {
          ctx.strokeStyle = '#1e2535'; ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(x + 2, y + 2, ps - 4, ps - 4);
          ctx.setLineDash([]);
        } else {
          // Draw piece image
          const piece = s.pieces.find(p => p.id === pid);
          if (piece && this._offscreen) {
            ctx.drawImage(this._offscreen,
              piece.correctCol * ps, piece.correctRow * ps, ps, ps,
              x, y, ps, ps
            );
            // Correct indicator
            if (piece.correctRow === r && piece.correctCol === c) {
              ctx.strokeStyle = '#44ff88'; ctx.lineWidth = 2;
              ctx.strokeRect(x + 1, y + 1, ps - 2, ps - 2);
            }
          }
          // Selected highlight
          if (s.selected === pid) {
            ctx.fillStyle = 'rgba(255,255,100,0.3)';
            ctx.fillRect(x, y, ps, ps);
          }
        }
      }
    }

    // Board border
    ctx.strokeStyle = '#334'; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.strokeRect(this._boardX, this._boardY, ps * COLS, ps * ROWS);

    // Tray background
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(this._trayX, this._trayY, ts * COLS, ts * ROWS);

    // Tray pieces
    const unplaced = s.pieces.filter(p => !p.placed);
    for (const piece of unplaced) {
      const slot = piece.traySlot;
      const tc   = slot % COLS, tr = Math.floor(slot / COLS);
      const x    = this._trayX + tc * ts, y = this._trayY + tr * ts;

      if (this._offscreen) {
        ctx.drawImage(this._offscreen,
          piece.correctCol * ps, piece.correctRow * ps, ps, ps,
          x + 2, y + 2, ts - 4, ts - 4
        );
      }

      // Selected highlight
      if (s.selected === piece.id) {
        ctx.fillStyle = 'rgba(255,255,100,0.35)';
        ctx.fillRect(x, y, ts, ts);
        ctx.strokeStyle = '#ffff44'; ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
      } else {
        ctx.strokeStyle = '#222'; ctx.lineWidth = 1;
        ctx.strokeRect(x, y, ts, ts);
      }
    }

    // Tray border
    ctx.strokeStyle = '#334'; ctx.lineWidth = 2;
    ctx.strokeRect(this._trayX, this._trayY, ts * COLS, ts * ROWS);

    // Labels
    ctx.fillStyle = '#444'; ctx.font = '8px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PUZZLE', this._boardX + ps * COLS / 2, this._boardY - 4);
    ctx.fillText('PIÈCES',  this._trayX  + ts * COLS / 2, this._trayY - 4);
    ctx.textAlign = 'left';
  }

  _onWon(e) {
    this._overlay.showGameOver(
      { result: 'win', score: e.score, isRecord: e.isRecord,
        extraInfo: `<div style="color:#888;font-size:11px;margin-top:4px">Puzzle complété !</div>` },
      () => EventBus.emit('game:restart')
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }

  destroy() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    this._canvas.removeEventListener('click', this._onClick);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('jp-styles')?.remove();
  }
}
