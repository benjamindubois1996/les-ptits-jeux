/**
 * TetrisRenderer.js — Rendu canvas du Tetris
 * Emplacement : /games/tetris/TetrisRenderer.js
 *
 * Responsabilités :
 *  - Construire le layout (plateau + panneau d'info)
 *  - Dessiner : plateau, pièce active, pièce fantôme, preview suivante
 *  - Animer : flash à la suppression de lignes, écran idle/gameover
 *  - Gérer le resize de la fenêtre
 *
 * NE contient aucune logique de jeu.
 */

import EventBus    from '../../js/core/EventBus.js';
import GameOverlay  from '../../js/ui/components/GameOverlay.js';

export default class TetrisRenderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    this.cellSize    = 0;
    this._rafId      = null;
    this._flashAlpha = 0; // flash blanc sur suppression de ligne

    // Suivi de transition pour ne (re)construire l'overlay qu'au changement de statut
    this._lastOverlayStatus = 'idle';

    // Éléments DOM
    this._wrapper     = null;
    this._boardCanvas = null;
    this._boardCtx    = null;
    this._nextCanvas  = null;
    this._nextCtx     = null;
    this._levelEl     = null;
    this._linesEl     = null;

    // Binding
    this._onTick         = this._onTick.bind(this);
    this._onLinesCleared = this._onLinesCleared.bind(this);
    this._onReady        = this._onReady.bind(this);
    this._onResize       = this._onResize.bind(this);
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init() {
    this._buildLayout();
    this._bindEvents();
    this._startRenderLoop();
  }

  destroy() {
    this._stopRenderLoop();
    this._unbindEvents();
    this._overlay?.destroy();
    if (this._wrapper) this._wrapper.remove();
    window.removeEventListener('resize', this._onResize);
  }

  /* ============================================================
     LAYOUT
     ============================================================ */

  _buildLayout() {
    const ui = this.config.theme.ui;

    this._wrapper = document.createElement('div');
    this._wrapper.style.cssText = `
      display: flex;
      gap: 14px;
      align-items: flex-start;
      padding: 12px;
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      justify-content: center;
    `;

    // --- Plateau principal ---
    this._boardCanvas = document.createElement('canvas');
    this._boardCanvas.style.imageRendering = 'pixelated';
    this._boardCtx = this._boardCanvas.getContext('2d');

    // --- Panneau d'info ---
    const panel = document.createElement('div');
    panel.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 20px;
      font-family: ${ui.fontFamily};
      min-width: 110px;
      padding-top: 4px;
    `;

    // Preview pièce suivante
    const nextSection = document.createElement('div');

    const nextLabel = document.createElement('div');
    nextLabel.textContent = 'SUIVANT';
    nextLabel.style.cssText = `
      font-size: 10px;
      letter-spacing: 0.12em;
      color: ${ui.mutedColor};
      margin-bottom: 8px;
    `;

    this._nextCanvas = document.createElement('canvas');
    this._nextCanvas.width  = 80;
    this._nextCanvas.height = 80;
    this._nextCanvas.style.cssText = `
      background: rgba(0,0,0,0.4);
      border: 1px solid ${ui.mutedColor};
      border-radius: 4px;
      display: block;
    `;
    this._nextCtx = this._nextCanvas.getContext('2d');

    nextSection.appendChild(nextLabel);
    nextSection.appendChild(this._nextCanvas);

    // Stats : niveau et lignes
    this._levelEl = this._makeStatBlock('NIVEAU', '1', ui);
    this._linesEl = this._makeStatBlock('LIGNES', '0', ui);

    panel.appendChild(nextSection);
    panel.appendChild(this._levelEl.container);
    panel.appendChild(this._linesEl.container);

    const boardWrap = document.createElement('div');
    boardWrap.style.cssText = 'position:relative;display:inline-block;line-height:0;';
    boardWrap.appendChild(this._boardCanvas);

    this._wrapper.appendChild(boardWrap);
    this._wrapper.appendChild(panel);
    this.viewport.appendChild(this._wrapper);

    this._resize();
    window.addEventListener('resize', this._onResize);

    this._overlay = new GameOverlay(this.viewport);
    this._showStartScreen();
  }

  _showStartScreen() {
    const optionGroups = [
      { key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] },
    ];
    this._overlay.showStart(optionGroups, () => this.game.start(), {
      extraHtml: '<div class="overlay-score">← → ↑ ↓ · Espace pour hard drop</div>',
    });
  }

  _makeStatBlock(label, value, ui) {
    const container = document.createElement('div');

    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      font-size: 10px;
      letter-spacing: 0.12em;
      color: ${ui.mutedColor};
      margin-bottom: 4px;
    `;

    const valueEl = document.createElement('div');
    valueEl.textContent = value;
    valueEl.style.cssText = `
      font-size: 22px;
      font-weight: 700;
      color: ${ui.primaryColor};
      text-shadow: 0 0 10px rgba(0,255,225,0.4);
    `;

    container.appendChild(labelEl);
    container.appendChild(valueEl);
    return { container, valueEl };
  }

  /* ============================================================
     RESIZE
     ============================================================ */

  _resize() {
    const vw = this.viewport.clientWidth  || 700;
    const vh = this.viewport.clientHeight || 500;

    const panelW  = 130;
    const padding = 12 * 2 + 14; // padding × 2 + gap
    const availW  = vw - panelW - padding;
    const availH  = vh - 24;

    const { rows, cols } = this.config.gameplay;
    this.cellSize = Math.max(10, Math.floor(Math.min(availH / rows, availW / cols)));

    const boardW = this.cellSize * cols;
    const boardH = this.cellSize * rows;

    this._boardCanvas.width  = boardW;
    this._boardCanvas.height = boardH;
    this._boardCanvas.style.width  = boardW + 'px';
    this._boardCanvas.style.height = boardH + 'px';
  }

  _onResize() {
    this._resize();
  }

  /* ============================================================
     EVENTS
     ============================================================ */

  _bindEvents() {
    EventBus.on('game:tick',          this._onTick);
    EventBus.on('game:lines-cleared', this._onLinesCleared);
    EventBus.on('game:ready',         this._onReady);
  }

  _unbindEvents() {
    EventBus.off('game:tick',          this._onTick);
    EventBus.off('game:lines-cleared', this._onLinesCleared);
    EventBus.off('game:ready',         this._onReady);
  }

  _onReady() { /* render loop gère l'idle */ }
  _onTick()  { /* render loop continu */ }

  _onLinesCleared({ cleared }) {
    // Flash plus fort pour un Tetris (4 lignes)
    this._flashAlpha = cleared >= 4 ? 0.5 : 0.28;
  }

  /* ============================================================
     RENDER LOOP
     ============================================================ */

  _startRenderLoop() {
    const loop = (ts) => {
      this._timestamp = ts;
      this._draw();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _stopRenderLoop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /* ============================================================
     DRAW — ORCHESTRATEUR
     ============================================================ */

  _draw() {
    const state = this.game.state;

    this._drawBackground();
    this._drawGrid();
    this._drawBoard(state.board);

    if (state.current) {
      this._drawGhost(state.current);
      this._drawPiece(state.current);
    }

    // Flash ligne supprimée
    if (this._flashAlpha > 0) {
      const ctx = this._boardCtx;
      ctx.fillStyle = `rgba(255,255,255,${this._flashAlpha})`;
      ctx.fillRect(0, 0, this._boardCanvas.width, this._boardCanvas.height);
      this._flashAlpha = Math.max(0, this._flashAlpha - 0.025);
    }

    this._drawBorder();
    this._syncOverlay(state);

    // Mise à jour panneau
    this._updatePanel(state);
    this._drawNextPiece(state.next);
  }

  /* ============================================================
     DRAW — FOND & GRILLE
     ============================================================ */

  _drawBackground() {
    const ctx = this._boardCtx;
    ctx.fillStyle = this.config.theme.canvas.backgroundColor || '#05080f';
    ctx.fillRect(0, 0, this._boardCanvas.width, this._boardCanvas.height);
  }

  _drawGrid() {
    const { gridColor } = this.config.theme.canvas;
    const { rows, cols } = this.config.gameplay;
    const cs  = this.cellSize;
    const ctx = this._boardCtx;

    ctx.strokeStyle = gridColor || 'rgba(0,255,225,0.04)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();

    for (let c = 0; c <= cols; c++) {
      ctx.moveTo(c * cs, 0);
      ctx.lineTo(c * cs, rows * cs);
    }
    for (let r = 0; r <= rows; r++) {
      ctx.moveTo(0, r * cs);
      ctx.lineTo(cols * cs, r * cs);
    }
    ctx.stroke();
  }

  _drawBorder() {
    const cfg = this.config.theme.canvas;
    if (!cfg.borderGlow) return;
    const ctx = this._boardCtx;
    ctx.strokeStyle = cfg.borderColor || 'rgba(0,255,225,0.2)';
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = 'rgba(0,255,225,0.4)';
    ctx.shadowBlur  = 8;
    ctx.strokeRect(0.75, 0.75,
      this._boardCanvas.width  - 1.5,
      this._boardCanvas.height - 1.5
    );
    ctx.shadowBlur = 0;
  }

  /* ============================================================
     DRAW — PLATEAU (pièces verrouillées)
     ============================================================ */

  _drawBoard(board) {
    if (!board) return;
    board.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell) this._drawCell(this._boardCtx, c, r, cell, 1);
      });
    });
  }

  /* ============================================================
     DRAW — PIÈCE ACTIVE & FANTÔME
     ============================================================ */

  _drawPiece({ matrix, x, y, colorIdx }) {
    matrix.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell) this._drawCell(this._boardCtx, x + c, y + r, colorIdx, 1);
      });
    });
  }

  _drawGhost({ matrix, x, y, colorIdx }) {
    let ghostY = y;
    while (!this.game._collides(matrix, x, ghostY + 1)) ghostY++;
    if (ghostY === y) return; // pièce déjà posée

    const alpha = this.config.theme.ghost.alpha || 0.18;
    matrix.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell) this._drawCell(this._boardCtx, x + c, ghostY + r, colorIdx, alpha);
      });
    });
  }

  /* ============================================================
     DRAW — PREVIEW PIÈCE SUIVANTE
     ============================================================ */

  _drawNextPiece(next) {
    const ctx = this._nextCtx;
    const w   = this._nextCanvas.width;
    const h   = this._nextCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, w, h);

    if (!next) return;

    const { matrix, colorIdx } = next;
    const pieceW  = matrix[0].length;
    const pieceH  = matrix.length;
    const cellPx  = Math.floor(Math.min(w / (pieceW + 2), h / (pieceH + 2)));
    const offsetX = Math.floor((w - pieceW * cellPx) / 2);
    const offsetY = Math.floor((h - pieceH * cellPx) / 2);

    matrix.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (!cell) return;
        this._drawCellAt(
          ctx,
          offsetX + c * cellPx,
          offsetY + r * cellPx,
          cellPx,
          colorIdx,
          1
        );
      });
    });
  }

  /* ============================================================
     DRAW — CELLULE
     ============================================================ */

  _drawCell(ctx, col, row, colorIdx, alpha) {
    const cs  = this.cellSize;
    const pad = 1;
    this._drawCellAt(
      ctx,
      col * cs + pad,
      row * cs + pad,
      cs - pad * 2,
      colorIdx,
      alpha
    );
  }

  _drawCellAt(ctx, x, y, size, colorIdx, alpha) {
    const cfg    = this.config.theme.pieces;
    const color  = cfg.colors[colorIdx] || '#ffffff';
    const radius = cfg.borderRadius || 2;

    ctx.globalAlpha = alpha;

    // Glow
    ctx.shadowColor = color;
    ctx.shadowBlur  = alpha >= 1 ? (cfg.glowBlur || 10) : 0;

    // Corps
    ctx.fillStyle = color;
    this._roundRect(ctx, x, y, size, size, radius);
    ctx.fill();

    // Reflet
    if (alpha >= 1) {
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = 'rgba(255,255,255,0.2)';
      this._roundRect(ctx, x + 1, y + 1, size * 0.45, size * 0.35, 1);
      ctx.fill();

      // Contour légèrement plus clair
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth   = 0.8;
      this._roundRect(ctx, x, y, size, size, radius);
      ctx.stroke();
    }

    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }

  /* ============================================================
     DRAW — ÉCRAN IDLE
     ============================================================ */

  _syncOverlay(state) {
    if (state.status === this._lastOverlayStatus) return;
    this._lastOverlayStatus = state.status;

    if (state.status === 'idle')    this._showStartScreen();
    if (state.status === 'playing') this._overlay.hide();
    // 'paused' et 'gameover' restent gérés par l'overlay générique de GameShell
  }

  /* ============================================================
     PANEL — mise à jour niveau et lignes
     ============================================================ */

  _updatePanel(state) {
    if (this._levelEl) this._levelEl.valueEl.textContent = state.level;
    if (this._linesEl) this._linesEl.valueEl.textContent = state.lines;
  }

  /* ============================================================
     UTILITAIRES CANVAS
     ============================================================ */

  _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x,     y + r);
    ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
  }
}
