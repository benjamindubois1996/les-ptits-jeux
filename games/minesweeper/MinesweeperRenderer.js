/**
 * MinesweeperRenderer.js — Rendu canvas du Minesweeper
 * Emplacement : /games/minesweeper/MinesweeperRenderer.js
 *
 * Responsabilités :
 *  - Construire le layout (barre de statut + plateau canvas)
 *  - Gérer les clics souris sur le canvas → appels logique jeu
 *  - Dessiner la grille (cases cachées, révélées, drapeaux, mines, chiffres)
 *  - Afficher les écrans idle / pause / game over / victoire
 *  - Gérer le resize de la fenêtre
 *
 * NE contient aucune logique de jeu.
 */

import EventBus    from '../../js/core/EventBus.js';
import GameOverlay  from '../../js/ui/components/GameOverlay.js';

export default class MinesweeperRenderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    this.cellSize = 0;
    this._rafId   = null;

    this._wrapper      = null;
    this._canvas       = null;
    this._ctx          = null;
    this._mineCountEl  = null;
    this._timerEl      = null;

    // Binding
    this._onTick               = this._onTick.bind(this);
    this._onResize             = this._onResize.bind(this);
    this._onDifficultyChanged  = this._onDifficultyChanged.bind(this);

    // Suivi de transition pour ne (re)construire l'overlay qu'au changement de statut
    this._lastOverlayStatus = 'idle';
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
    if (this._canvas) {
      this._canvas.removeEventListener('click',       this._onCanvasClick);
      this._canvas.removeEventListener('contextmenu', this._onCanvasContext);
      this._canvas.removeEventListener('dblclick',    this._onCanvasDblClick);
    }
    window.removeEventListener('resize', this._onResize);
    this._overlay?.destroy();
    if (this._wrapper) this._wrapper.remove();
  }

  /* ============================================================
     LAYOUT
     ============================================================ */

  _buildLayout() {
    const ui = this.config.theme.ui;

    this._wrapper = document.createElement('div');
    this._wrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px;
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      gap: 10px;
    `;

    // --- Barre de statut ---
    const statusBar = document.createElement('div');
    statusBar.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      max-width: 700px;
      font-family: ${ui.fontFamily};
      flex-shrink: 0;
    `;

    // Mines restantes
    const mineBlock = this._makeStatusBlock('💣', ui.dangerColor, '0 0 10px rgba(255,45,120,0.5)');
    this._mineCountEl = mineBlock.valueEl;

    // Timer
    const timerBlock = this._makeStatusBlock('⏱', ui.primaryColor, '0 0 10px rgba(0,255,225,0.4)');
    this._timerEl = timerBlock.valueEl;

    // Aide contextuelle
    const hintEl = document.createElement('div');
    hintEl.style.cssText = `
      font-size: 9px;
      color: ${ui.mutedColor};
      letter-spacing: 0.05em;
      text-align: center;
    `;
    hintEl.innerHTML = '← clic : révéler &nbsp;|&nbsp; clic → : drapeau &nbsp;|&nbsp; R : restart';

    statusBar.appendChild(mineBlock.container);
    statusBar.appendChild(hintEl);
    statusBar.appendChild(timerBlock.container);

    // --- Canvas ---
    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = `
      cursor: pointer;
      image-rendering: pixelated;
      border-radius: 4px;
      display: block;
      user-select: none;
      -webkit-user-select: none;
    `;
    this._ctx = this._canvas.getContext('2d');

    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'position:relative;display:inline-block;line-height:0;';
    canvasWrap.appendChild(this._canvas);

    // Clic gauche → révéler
    this._onCanvasClick = (e) => {
      const [col, row] = this._getCellAt(e.clientX, e.clientY);
      if (col < 0) return;
      this.game.reveal(col, row);
    };

    // Clic droit → drapeau (ou chord si case révélée)
    this._onCanvasContext = (e) => {
      e.preventDefault();
      const [col, row] = this._getCellAt(e.clientX, e.clientY);
      if (col < 0) return;
      const cell = this.game.state.grid[row][col];
      if (cell.isRevealed) {
        this.game.chord(col, row);
      } else {
        this.game.toggleFlag(col, row);
      }
    };

    // Double-clic gauche → chord sur une case révélée
    this._onCanvasDblClick = (e) => {
      const [col, row] = this._getCellAt(e.clientX, e.clientY);
      if (col < 0) return;
      this.game.chord(col, row);
    };

    this._canvas.addEventListener('click',       this._onCanvasClick);
    this._canvas.addEventListener('contextmenu', this._onCanvasContext);
    this._canvas.addEventListener('dblclick',    this._onCanvasDblClick);

    this._wrapper.appendChild(statusBar);
    this._wrapper.appendChild(canvasWrap);
    this.viewport.appendChild(this._wrapper);

    this._resize();
    window.addEventListener('resize', this._onResize);

    this._overlay = new GameOverlay(this.viewport);
    this._showStartScreen();
  }

  _optionGroups() {
    const diffs = [
      { key: 'easy',   label: 'Facile',    detail: '9×9 · 10 💣' },
      { key: 'medium', label: 'Normal',    detail: '16×16 · 40 💣' },
      { key: 'hard',   label: 'Difficile', detail: '30×16 · 99 💣' },
    ];
    return [
      { key: 'mode',       label: 'MODE',       default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] },
      { key: 'difficulty', label: 'DIFFICULTÉ', default: this.config.gameplay.difficulty,
        options: diffs.map(d => ({ value: d.key, label: d.label })) },
    ];
  }

  _showStartScreen() {
    this._overlay.showStart(this._optionGroups(), (selections) => {
      if (selections.difficulty !== this.config.gameplay.difficulty) {
        this.game.setDifficulty(selections.difficulty);
      }
      this._overlay.hide();
    }, { extraHtml: '<div class="overlay-score">Clique une case pour commencer</div>' });
  }

  _makeStatusBlock(icon, color, shadow) {
    const container = document.createElement('div');
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const iconEl = document.createElement('span');
    iconEl.textContent = icon;
    iconEl.style.fontSize = '18px';

    const valueEl = document.createElement('span');
    valueEl.style.cssText = `
      font-size: 20px;
      font-weight: 700;
      color: ${color};
      text-shadow: ${shadow};
      min-width: 40px;
      font-family: ${this.config.theme.ui.fontFamily};
    `;
    valueEl.textContent = '0';

    container.appendChild(iconEl);
    container.appendChild(valueEl);
    return { container, valueEl };
  }

  _getCellAt(clientX, clientY) {
    const rect = this._canvas.getBoundingClientRect();
    const x    = clientX - rect.left;
    const y    = clientY - rect.top;
    const col  = Math.floor(x / this.cellSize);
    const row  = Math.floor(y / this.cellSize);
    const { cols, rows } = this.game.state;
    if (col < 0 || col >= cols || row < 0 || row >= rows) return [-1, -1];
    return [col, row];
  }

  /* ============================================================
     RESIZE
     ============================================================ */

  _resize() {
    const vw = this.viewport.clientWidth  || 700;
    const vh = this.viewport.clientHeight || 500;

    const { cols, rows } = this.game.state;
    const availW = vw - 24;
    const availH = vh - 70; // status bar + padding

    this.cellSize = Math.max(10, Math.floor(Math.min(availW / cols, availH / rows)));

    const w = this.cellSize * cols;
    const h = this.cellSize * rows;

    this._canvas.width  = w;
    this._canvas.height = h;
    this._canvas.style.width  = w + 'px';
    this._canvas.style.height = h + 'px';
  }

  _onResize() {
    this._resize();
  }

  /* ============================================================
     EVENTS
     ============================================================ */

  _bindEvents() {
    EventBus.on('game:tick',               this._onTick);
    EventBus.on('game:timer',              this._onTick);
    EventBus.on('game:difficulty-changed', this._onDifficultyChanged);
  }

  _unbindEvents() {
    EventBus.off('game:tick',               this._onTick);
    EventBus.off('game:timer',              this._onTick);
    EventBus.off('game:difficulty-changed', this._onDifficultyChanged);
  }

  _onTick() { /* le render loop continu gère l'affichage */ }

  _onDifficultyChanged() {
    // Redimensionner le canvas (la grille a peut-être changé de taille)
    this._resize();
  }

  /* ============================================================
     RENDER LOOP
     ============================================================ */

  _startRenderLoop() {
    const loop = () => {
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
    this._drawCells(state);
    this._drawBorder();
    this._updatePanel(state);

    this._syncOverlay(state);
  }

  /* ============================================================
     OVERLAY (démarrage / pause / fin de partie)
     ============================================================ */

  _syncOverlay(state) {
    if (state.status === this._lastOverlayStatus) return;
    this._lastOverlayStatus = state.status;

    switch (state.status) {
      case 'idle':
        this._showStartScreen();
        break;
      case 'playing':
        this._overlay.hide();
        break;
      case 'paused':
        this._overlay.showPause(() => EventBus.emit('game:pause-toggle'));
        break;
      case 'gameover': {
        const found    = state.correctFlags ?? 0;
        const foundTxt = found > 0
          ? `🚩 ${found} mine${found > 1 ? 's' : ''} trouvée${found > 1 ? 's' : ''}`
          : 'Aucune mine trouvée';
        this._overlay.showGameOver({
          result: 'lose',
          title:  'BOOM !',
          score:  state.score,
          extraInfo: `<div class="overlay-score">${foundTxt} · ⏱ ${state.time}s</div>`,
        }, () => EventBus.emit('game:restart'));
        break;
      }
      case 'won': {
        const hasBonus = (state.timeBonus ?? 0) > 0;
        const bonusTxt = hasBonus ? `+${state.timeBonus} pts bonus` : 'pas de bonus temps';
        this._overlay.showGameOver({
          result: 'win',
          score:  state.score,
          extraInfo: `<div class="overlay-score">💣 × ${state.mineCount} = +${state.minePoints ?? 0} pts</div>
                      <div class="overlay-score">⏱ ${state.time}s → ${bonusTxt}</div>`,
        }, () => EventBus.emit('game:restart'));
        break;
      }
    }
  }

  /* ============================================================
     DRAW — FOND & BORDURE
     ============================================================ */

  _drawBackground() {
    const ctx = this._ctx;
    ctx.fillStyle = this.config.theme.canvas.backgroundColor || '#05080f';
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);
  }

  _drawBorder() {
    const cfg = this.config.theme.canvas;
    if (!cfg.borderGlow) return;
    const ctx = this._ctx;
    ctx.strokeStyle = cfg.borderColor || 'rgba(0,255,225,0.2)';
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = 'rgba(0,255,225,0.4)';
    ctx.shadowBlur  = 8;
    ctx.strokeRect(0.75, 0.75,
      this._canvas.width  - 1.5,
      this._canvas.height - 1.5
    );
    ctx.shadowBlur = 0;
  }

  /* ============================================================
     DRAW — GRILLE DE CASES
     ============================================================ */

  _drawCells(state) {
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        this._drawCell(c, r, state.grid[r][c], state);
      }
    }
  }

  _drawCell(col, row, cell, state) {
    const ctx   = this._ctx;
    const cs    = this.cellSize;
    const cells = this.config.theme.cells;
    const ui    = this.config.theme.ui;

    const x   = col * cs;
    const y   = row * cs;
    const pad = 1;
    const sz  = cs - pad * 2;
    const r   = Math.max(1, Math.floor(cs * 0.12));

    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;

    if (cell.isRevealed && cell.isMine) {
      // Mine déclenchée ou révélée au game over
      const isTrigger = state.triggerMine &&
        state.triggerMine.col === col && state.triggerMine.row === row;

      ctx.fillStyle = isTrigger ? '#3a000e' : '#16040a';
      this._roundRect(ctx, x + pad, y + pad, sz, sz, r);
      ctx.fill();

      if (isTrigger) {
        ctx.shadowColor = cells.mineColor;
        ctx.shadowBlur  = cells.glowBlur || 8;
      }

      this._drawEmoji(ctx, '💣', x + cs / 2, y + cs / 2, Math.max(8, Math.floor(cs * 0.62)));
      ctx.shadowBlur = 0;

    } else if (cell.isRevealed) {
      // Case révélée (vide ou chiffre)
      ctx.fillStyle = cells.revealedColor;
      this._roundRect(ctx, x + pad, y + pad, sz, sz, r);
      ctx.fill();

      ctx.strokeStyle = cells.revealedBorder;
      ctx.lineWidth   = 0.5;
      this._roundRect(ctx, x + pad, y + pad, sz, sz, r);
      ctx.stroke();

      if (cell.adjacentMines > 0) {
        const color = cells.numberColors[cell.adjacentMines] || '#ffffff';
        const fs    = Math.max(7, Math.floor(cs * 0.62));
        ctx.font        = `700 ${fs}px ${ui.fontFamily}`;
        ctx.fillStyle   = color;
        ctx.shadowColor = color;
        ctx.shadowBlur  = 4;
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cell.adjacentMines, x + cs / 2, y + cs / 2);
        ctx.shadowBlur   = 0;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
      }

    } else if (cell.wrongFlag) {
      // Faux drapeau (case non-mine flagguée, révélée au game over)
      ctx.fillStyle = '#2a0010';
      this._roundRect(ctx, x + pad, y + pad, sz, sz, r);
      ctx.fill();

      this._drawEmoji(ctx, '❌', x + cs / 2, y + cs / 2, Math.max(8, Math.floor(cs * 0.55)));

    } else if (cell.isFlagged) {
      // Drapeau
      ctx.fillStyle = cells.hiddenColor;
      this._roundRect(ctx, x + pad, y + pad, sz, sz, r);
      ctx.fill();

      ctx.strokeStyle = cells.hiddenBorder;
      ctx.lineWidth   = 0.5;
      this._roundRect(ctx, x + pad, y + pad, sz, sz, r);
      ctx.stroke();

      this._drawEmoji(ctx, '🚩', x + cs / 2, y + cs / 2, Math.max(8, Math.floor(cs * 0.55)));

    } else {
      // Case cachée normale
      ctx.fillStyle = cells.hiddenColor;
      this._roundRect(ctx, x + pad, y + pad, sz, sz, r);
      ctx.fill();

      ctx.strokeStyle = cells.hiddenBorder;
      ctx.lineWidth   = 0.5;
      this._roundRect(ctx, x + pad, y + pad, sz, sz, r);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  _drawEmoji(ctx, emoji, cx, cy, size) {
    ctx.font         = `${size}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx, cy);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /* Les écrans démarrage / pause / fin de partie sont gérés par GameOverlay
     (js/ui/components/GameOverlay.js) — voir _syncOverlay() plus haut. */

  /* ============================================================
     PANEL — mise à jour compteurs
     ============================================================ */

  _updatePanel(state) {
    if (this._mineCountEl) {
      this._mineCountEl.textContent = state.mineCount - state.flagCount;
    }
    if (this._timerEl) {
      const m = Math.floor(state.time / 60);
      const s = state.time % 60;
      this._timerEl.textContent = m > 0
        ? `${m}:${String(s).padStart(2, '0')}`
        : `${s}s`;
    }
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
