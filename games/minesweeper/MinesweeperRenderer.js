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

import EventBus from '../../js/core/EventBus.js';

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
    this._diffButtons  = {};   // { easy, medium, hard } → boutons DOM

    // Binding
    this._onTick               = this._onTick.bind(this);
    this._onResize             = this._onResize.bind(this);
    this._onDifficultyChanged  = this._onDifficultyChanged.bind(this);
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

    // --- Sélecteur de difficulté ---
    const diffBar = this._buildDiffSelector(ui);

    this._wrapper.appendChild(statusBar);
    this._wrapper.appendChild(diffBar);
    this._wrapper.appendChild(this._canvas);
    this.viewport.appendChild(this._wrapper);

    this._resize();
    window.addEventListener('resize', this._onResize);
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

  _buildDiffSelector(ui) {
    const diffs = [
      { key: 'easy',   label: 'Facile',  detail: '9×9 · 10 💣' },
      { key: 'medium', label: 'Normal',  detail: '16×16 · 40 💣' },
      { key: 'hard',   label: 'Difficile', detail: '30×16 · 99 💣' }
    ];
    const current = this.config.gameplay.difficulty;

    const bar = document.createElement('div');
    bar.style.cssText = `
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    `;

    diffs.forEach(({ key, label, detail }) => {
      const btn = document.createElement('button');
      btn.title = detail;
      btn.textContent = label;
      this._styleDiffButton(btn, key === current);

      btn.addEventListener('click', () => {
        this.game.setDifficulty(key);
      });

      this._diffButtons[key] = btn;
      bar.appendChild(btn);
    });

    return bar;
  }

  _styleDiffButton(btn, active) {
    const ui = this.config.theme.ui;
    btn.style.cssText = `
      font-family: ${ui.fontFamily};
      font-size: 10px;
      letter-spacing: 0.08em;
      padding: 5px 14px;
      border-radius: 4px;
      border: 1px solid ${active ? ui.primaryColor : 'rgba(0,255,225,0.18)'};
      background: ${active ? 'rgba(0,255,225,0.12)' : 'transparent'};
      color: ${active ? ui.primaryColor : ui.mutedColor};
      cursor: pointer;
      transition: all 0.15s;
      text-shadow: ${active ? '0 0 8px rgba(0,255,225,0.6)' : 'none'};
    `;
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
    // Empêcher l'overlay GameShell de se superposer — Minesweeper gère ses propres écrans
    EventBus.on('game:over',  this._suppressShellOverlay);
    EventBus.on('game:won',   this._suppressShellOverlay);
    EventBus.on('game:paused', this._suppressShellOverlay);
  }

  _unbindEvents() {
    EventBus.off('game:tick',               this._onTick);
    EventBus.off('game:timer',              this._onTick);
    EventBus.off('game:difficulty-changed', this._onDifficultyChanged);
    EventBus.off('game:over',  this._suppressShellOverlay);
    EventBus.off('game:won',   this._suppressShellOverlay);
    EventBus.off('game:paused', this._suppressShellOverlay);
  }

  // Masque l'overlay DOM de la GameShell (le canvas a ses propres écrans)
  _suppressShellOverlay = () => {
    const overlay = document.getElementById('gs-overlay');
    if (overlay) overlay.classList.add('hidden');
  };

  _onTick() { /* le render loop continu gère l'affichage */ }

  _onDifficultyChanged({ difficulty }) {
    // Mettre à jour l'état actif des boutons
    Object.entries(this._diffButtons).forEach(([key, btn]) => {
      this._styleDiffButton(btn, key === difficulty);
    });
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

    if (state.status === 'idle')     this._drawOverlay('MINESWEEPER',
      'CLIQUE POUR COMMENCER',
      'Clic gauche : révéler  •  Clic droit : drapeau',
      this.config.theme.ui.primaryColor, 'rgba(0,255,225,0.7)');

    if (state.status === 'paused')   this._drawSimpleOverlay('PAUSE',
      this.config.theme.ui.accentColor, 'rgba(255,230,0,0.7)');

    if (state.status === 'gameover') this._drawGameOverOverlay(state);

    if (state.status === 'won')      this._drawWinOverlay(state);
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

  /* ============================================================
     DRAW — OVERLAYS
     ============================================================ */

  _drawOverlay(title, subtitle, hint, color, glowColor) {
    const ctx  = this._ctx;
    const w    = this._canvas.width;
    const h    = this._canvas.height;
    const font = this.config.theme.ui.fontFamily;

    ctx.fillStyle = 'rgba(5,8,15,0.82)';
    ctx.fillRect(0, 0, w, h);

    const fs1 = Math.max(12, Math.floor(Math.min(w, h) * 0.09));
    ctx.font        = `900 ${fs1}px ${font}`;
    ctx.textAlign   = 'center';
    ctx.fillStyle   = color;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur  = 18;
    ctx.fillText(title, w / 2, h * 0.42);

    const fs2 = Math.max(8, Math.floor(fs1 * 0.48));
    ctx.font      = `700 ${fs2}px ${font}`;
    ctx.shadowBlur = 10;
    ctx.fillText(subtitle, w / 2, h * 0.58);

    ctx.font      = `400 ${Math.round(fs2 * 0.82)}px ${font}`;
    ctx.fillStyle = 'rgba(0,255,225,0.35)';
    ctx.shadowBlur = 0;
    ctx.fillText(hint, w / 2, h * 0.68);

    ctx.textAlign = 'left';
  }

  _drawSimpleOverlay(title, color, glowColor) {
    const ctx  = this._ctx;
    const w    = this._canvas.width;
    const h    = this._canvas.height;
    const font = this.config.theme.ui.fontFamily;

    ctx.fillStyle = 'rgba(5,8,15,0.85)';
    ctx.fillRect(0, 0, w, h);

    const fs = Math.max(12, Math.floor(Math.min(w, h) * 0.09));
    ctx.font        = `900 ${fs}px ${font}`;
    ctx.textAlign   = 'center';
    ctx.fillStyle   = color;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur  = 18;
    ctx.fillText(title, w / 2, h / 2);

    ctx.shadowBlur = 0;
    ctx.textAlign  = 'left';
  }

  _drawGameOverOverlay(state) {
    const ctx  = this._ctx;
    const w    = this._canvas.width;
    const h    = this._canvas.height;
    const ui   = this.config.theme.ui;
    const font = ui.fontFamily;

    ctx.fillStyle = 'rgba(5,8,15,0.78)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';

    // Titre
    const fs1 = Math.max(12, Math.floor(Math.min(w, h) * 0.09));
    ctx.font        = `900 ${fs1}px ${font}`;
    ctx.fillStyle   = ui.dangerColor;
    ctx.shadowColor = 'rgba(255,45,120,0.8)';
    ctx.shadowBlur  = 22;
    ctx.fillText('BOOM !', w / 2, h * 0.33);

    const fs2 = Math.max(7, Math.floor(fs1 * 0.44));

    // Mines correctement trouvées
    const found    = state.correctFlags ?? 0;
    const hasFound = found > 0;
    ctx.font        = `700 ${fs2}px ${font}`;
    ctx.fillStyle   = hasFound ? ui.primaryColor : ui.mutedColor;
    ctx.shadowColor = hasFound ? 'rgba(0,255,225,0.4)' : 'transparent';
    ctx.shadowBlur  = hasFound ? 6 : 0;
    ctx.fillText(
      hasFound
        ? `🚩 ${found} mine${found > 1 ? 's' : ''} trouvée${found > 1 ? 's' : ''}  =  +${state.score} pts`
        : `Aucune mine trouvée  —  0 pt`,
      w / 2, h * 0.50
    );

    // Pas de bonus temps
    ctx.font      = `400 ${Math.round(fs2 * 0.85)}px ${font}`;
    ctx.fillStyle = ui.mutedColor;
    ctx.shadowBlur = 0;
    ctx.fillText(`⏱ ${state.time}s  —  pas de bonus temps`, w / 2, h * 0.61);

    // Total
    ctx.font        = `900 ${Math.round(fs2 * 1.1)}px ${font}`;
    ctx.fillStyle   = ui.dangerColor;
    ctx.shadowColor = 'rgba(255,45,120,0.5)';
    ctx.shadowBlur  = 8;
    ctx.fillText(`TOTAL : ${state.score} pts`, w / 2, h * 0.73);

    // Rejouer
    ctx.font      = `400 ${Math.round(fs2 * 0.85)}px ${font}`;
    ctx.fillStyle = 'rgba(0,255,225,0.45)';
    ctx.shadowBlur = 0;
    ctx.fillText('R pour rejouer', w / 2, h * 0.84);

    ctx.shadowBlur = 0;
    ctx.textAlign  = 'left';
  }

  _drawWinOverlay(state) {
    const ctx  = this._ctx;
    const w    = this._canvas.width;
    const h    = this._canvas.height;
    const ui   = this.config.theme.ui;
    const font = ui.fontFamily;

    ctx.fillStyle = 'rgba(5,8,15,0.78)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';

    // Titre
    const fs1 = Math.max(12, Math.floor(Math.min(w, h) * 0.09));
    ctx.font        = `900 ${fs1}px ${font}`;
    ctx.fillStyle   = '#00ff88';
    ctx.shadowColor = 'rgba(0,255,136,0.8)';
    ctx.shadowBlur  = 22;
    ctx.fillText('VICTOIRE !', w / 2, h * 0.35);

    const fs2 = Math.max(7, Math.floor(fs1 * 0.44));

    // Détail : mines
    ctx.font        = `700 ${fs2}px ${font}`;
    ctx.fillStyle   = ui.dangerColor;
    ctx.shadowColor = 'rgba(255,45,120,0.5)';
    ctx.shadowBlur  = 6;
    ctx.fillText(
      `\u{1F4A3} × ${state.mineCount}  =  +${state.minePoints ?? 0} pts`,
      w / 2, h * 0.50
    );

    // Détail : bonus temps
    const hasBonus = (state.timeBonus ?? 0) > 0;
    ctx.font        = `700 ${fs2}px ${font}`;
    ctx.fillStyle   = hasBonus ? ui.accentColor : ui.mutedColor;
    ctx.shadowColor = hasBonus ? 'rgba(255,230,0,0.5)' : 'transparent';
    ctx.shadowBlur  = hasBonus ? 6 : 0;
    const bonusLabel = hasBonus
      ? `⏱ ${state.time}s  →  +${state.timeBonus} pts bonus`
      : `⏱ ${state.time}s  →  pas de bonus temps`;
    ctx.fillText(bonusLabel, w / 2, h * 0.60);

    // Score total
    ctx.font        = `900 ${Math.round(fs2 * 1.15)}px ${font}`;
    ctx.fillStyle   = '#00ff88';
    ctx.shadowColor = 'rgba(0,255,136,0.6)';
    ctx.shadowBlur  = 10;
    ctx.fillText(`TOTAL : ${state.score} pts`, w / 2, h * 0.72);

    // Rejouer
    ctx.font      = `400 ${Math.round(fs2 * 0.85)}px ${font}`;
    ctx.fillStyle = 'rgba(0,255,225,0.45)';
    ctx.shadowBlur = 0;
    ctx.fillText('R pour rejouer', w / 2, h * 0.83);

    ctx.shadowBlur = 0;
    ctx.textAlign  = 'left';
  }

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
