/**
 * ConnectFourRenderer.js — Rendu canvas du Connect Four
 * Emplacement : /games/connect-four/ConnectFourRenderer.js
 *
 * Responsabilités :
 *  - Canvas adaptatif selon la taille de grille choisie
 *  - Écrans démarrage / fin de partie via GameOverlay (module partagé)
 *  - Animation de chute avec ease-in gravitaire
 *  - Pulse sur les 4 cellules gagnantes
 *  - Indicateur "IA réfléchit…"
 *
 * NE contient aucune logique de jeu.
 */

import EventBus    from '../../js/core/EventBus.js';
import GameOverlay  from '../../js/ui/components/GameOverlay.js';

export default class ConnectFourRenderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    this._canvas   = null;
    this._ctx      = null;
    this._cs       = 0;
    this._rafId    = null;
    this._dropAnim = null;

    this._onTick        = this._onTick.bind(this);
    this._onGameOver    = this._onGameOver.bind(this);
    this._onDropAnim    = this._onDropAnim.bind(this);
    this._onGridChanged = this._onGridChanged.bind(this);
    this._onResize      = this._onResize.bind(this);
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
    cancelAnimationFrame(this._rafId);
    EventBus.off('game:tick',                this._onTick);
    EventBus.off('game:over',                this._onGameOver);
    EventBus.off('connectfour:drop-anim',    this._onDropAnim);
    EventBus.off('connectfour:grid-changed', this._onGridChanged);
    window.removeEventListener('resize',     this._onResize);
    this._overlay?.destroy();
  }

  /* ============================================================
     LAYOUT
     ============================================================ */

  _buildLayout() {
    this.viewport.innerHTML = '';
    this.viewport.style.cssText =
      'display:flex;align-items:center;justify-content:center;height:100%;padding:8px;box-sizing:border-box;';

    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'position:relative;display:inline-block;line-height:0;';

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'cursor:pointer;touch-action:manipulation;';
    canvasWrap.appendChild(canvas);
    this.viewport.appendChild(canvasWrap);

    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
    this._resize();

    this._overlay = new GameOverlay(this.viewport);
    this._showStartScreen();
  }

  _optionGroups() {
    const sizes = this.config.gameplay.gridSizes || [];
    return [
      { key: 'mode', label: 'MODE', default: this.game.mode, options: [
          { value: 'pvp',    label: '2 JOUEURS' },
          { value: 'vs-cpu', label: 'vs IA' },
        ] },
      { key: 'size', label: 'GRILLE', default: this.game.gridSizeId, options: sizes.map(s => ({ value: s.id, label: s.label })) },
    ];
  }

  _showStartScreen() {
    this._overlay.showStart(this._optionGroups(), (selections) => {
      this.game.setGridSize(selections.size);
      this.game.start(selections.mode);
    });
  }

  _resize() {
    const { rows, cols } = this.config.gameplay;
    const vw = this.viewport.clientWidth  || 640;
    const vh = this.viewport.clientHeight || 520;

    // rangées : 1 indicateur + plateau + 1.4 barre score
    const totalRows = rows + 2.4;
    const maxCellW  = Math.floor((vw - 24) / cols);
    const maxCellH  = Math.floor((vh - 24) / totalRows);
    this._cs = Math.min(maxCellW, maxCellH, 88);

    const cw = cols * this._cs;
    const ch = Math.ceil(totalRows * this._cs);
    this._canvas.width  = cw;
    this._canvas.height = ch;
    this._canvas.style.width  = cw + 'px';
    this._canvas.style.height = ch + 'px';
  }

  /* ============================================================
     ÉVÉNEMENTS
     ============================================================ */

  _bindEvents() {
    EventBus.on('game:tick',                this._onTick);
    EventBus.on('game:over',                this._onGameOver);
    EventBus.on('connectfour:drop-anim',    this._onDropAnim);
    EventBus.on('connectfour:grid-changed', this._onGridChanged);
    window.addEventListener('resize',       this._onResize);

    this._canvas.addEventListener('mousemove', e => {
      if (!this.game.state.aiThinking) this.game.setHoveredCol(this._colFromX(e.offsetX));
    });
    this._canvas.addEventListener('mouseleave', () => {
      this.game.setHoveredCol(-1);
    });
    this._canvas.addEventListener('click', e => {
      this._handleClick(e.offsetX, e.offsetY);
    });
    this._canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      const rect   = this._canvas.getBoundingClientRect();
      const scaleX = this._canvas.width  / rect.width;
      const scaleY = this._canvas.height / rect.height;
      this._handleClick(
        (e.touches[0].clientX - rect.left) * scaleX,
        (e.touches[0].clientY - rect.top)  * scaleY,
      );
    }, { passive: false });
  }

  _handleClick(x, y) {
    const { status } = this.game.state;

    // Clic sur le plateau en jeu
    if (status === 'playing' && !this.game.state.aiThinking) {
      const col = this._colFromX(x);
      if (col >= 0) EventBus.emit('connectfour:drop', { col });
    }
  }

  _colFromX(x) {
    const { cols } = this.config.gameplay;
    const c = Math.floor(x / this._cs);
    return (c >= 0 && c < cols) ? c : -1;
  }

  _onTick({ state }) {
    if (state.status === 'playing') this._overlay.hide();
  }

  _onGameOver({ winner, score, isRecord, state }) {
    let title, result, extraInfo = '';
    if (winner === 'draw') {
      title  = 'MATCH NUL';
      result = 'lose';
    } else {
      const isAiWin = this.game.mode === 'vs-cpu' && winner === 2;
      title  = isAiWin ? "L'IA GAGNE !" : `JOUEUR ${winner} GAGNE !`;
      result = isAiWin ? 'lose' : 'win';

      const { baseScore, penaltyPerMove } = this.config.scoring;
      const maxMoves = Math.floor(baseScore / penaltyPerMove);
      const comment  = state.moveCount <= maxMoves * 0.35 ? 'Victoire éclair !'
                      : state.moveCount <= maxMoves * 0.6  ? 'Bien joué !'
                      : 'Victoire arrachée…';
      extraInfo = `<div class="overlay-score">${comment} (${state.moveCount} coups)</div>`;
    }
    this._overlay.showGameOver(
      { result, title, score: winner !== 'draw' ? score : undefined, isRecord, extraInfo },
      () => EventBus.emit('game:restart'),
    );
  }

  _onDropAnim({ row, col, player })  { this._dropAnim = { col, finalRow: row, player, startTime: null }; }
  _onGridChanged()                   { this._resize(); }
  _onResize()                        { this._resize(); }

  /* ============================================================
     BOUCLE DE RENDU
     ============================================================ */

  _startRenderLoop() {
    const loop = ts => { this._draw(ts); this._rafId = requestAnimationFrame(loop); };
    this._rafId = requestAnimationFrame(loop);
  }

  _draw(ts) {
    const { state }      = this.game;
    const ctx            = this._ctx;
    const cs             = this._cs;
    const { rows, cols } = this.config.gameplay;
    const theme          = this.config.theme;
    const cw             = this._canvas.width;
    const ch             = this._canvas.height;

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = theme.canvas.backgroundColor;
    ctx.fillRect(0, 0, cw, ch);

    if (state.status === 'idle') return;

    // ── Animation de chute ──────────────────────────────────
    let anim = null;
    if (this._dropAnim) {
      if (!this._dropAnim.startTime) this._dropAnim.startTime = ts;
      const elapsed  = ts - this._dropAnim.startTime;
      const duration = 80 + this._dropAnim.finalRow * 55;
      const t        = Math.min(elapsed / duration, 1);
      anim = { ...this._dropAnim, ease: t * t };
      if (t >= 1) this._dropAnim = null;
    }

    // ── Plateau ─────────────────────────────────────────────
    const boardY = cs * 1.2;
    this._roundRect(ctx, 0, boardY - cs * 0.1, cols * cs, rows * cs + cs * 0.2, 10);
    ctx.fillStyle = theme.board.color;
    ctx.fill();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx      = c * cs + cs / 2;
        const cy      = boardY + r * cs + cs / 2;
        const val     = state.board[r][c];
        const masking = anim && anim.col === c && anim.finalRow === r;
        const isWin   = state.winningCells.some(w => w.row === r && w.col === c);
        this._drawSlot(ctx, cx, cy, cs * 0.42, masking ? 0 : val, isWin, ts);
      }
    }

    // ── Pièce en animation ──────────────────────────────────
    if (anim) {
      const cx     = anim.col * cs + cs / 2;
      const startY = boardY - cs * 0.5;
      const endY   = boardY + anim.finalRow * cs + cs / 2;
      this._drawPiece(ctx, cx, startY + (endY - startY) * anim.ease, cs * 0.40, anim.player, false, ts);
    }

    // ── Indicateur de colonne (haut) ────────────────────────
    this._drawDropIndicator(ctx, state, cs, boardY);

    // ── Barre de score (bas) ────────────────────────────────
    this._drawScoreBar(ctx, state, cs, boardY + rows * cs + cs * 0.3, cw, theme);

    // Pause et fin de partie sont désormais affichés via GameOverlay (DOM partagé) :
    // pause → overlay générique de GameShell, gameover → this._overlay (_onGameOver)
  }

  /* ============================================================
     ÉLÉMENTS DE BASE
     ============================================================ */

  _drawSlot(ctx, cx, cy, r, cell, isWin, ts) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = this.config.theme.canvas.backgroundColor;
    ctx.fill();
    if (cell === 0) return;
    this._drawPiece(ctx, cx, cy, r * 0.92, cell, isWin, ts);
  }

  _drawPiece(ctx, cx, cy, r, player, isWin, ts) {
    const color  = player === 1 ? this.config.theme.players.p1 : this.config.theme.players.p2;
    const pulse  = isWin ? 0.5 + 0.5 * Math.sin(ts / 180) : 0;
    const glow   = isWin ? 18 + pulse * 22 : 8;
    const pieceR = isWin ? r * (1 + pulse * 0.09) : r;

    ctx.shadowColor = color;
    ctx.shadowBlur  = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, pieceR, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  _drawDropIndicator(ctx, state, cs, boardY) {
    if (state.status !== 'playing' || state.aiThinking || state.hoveredCol < 0) return;
    const color = state.currentPlayer === 1
      ? this.config.theme.players.p1
      : this.config.theme.players.p2;
    const cx = state.hoveredCol * cs + cs / 2;

    ctx.shadowColor  = color;
    ctx.shadowBlur   = 14;
    ctx.globalAlpha  = 0.75;
    ctx.beginPath();
    ctx.arc(cx, cs * 0.58, cs * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;

    ctx.fillStyle = color;
    ctx.font      = `${Math.floor(cs * 0.28)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('▼', cx, boardY - cs * 0.08);
  }

  _drawScoreBar(ctx, state, cs, y, cw, theme) {
    const { p1, p2 }          = state.scores;
    const { p1: c1, p2: c2 } = theme.players;
    const font = theme.ui.fontFamily;
    const size = Math.floor(cs * 0.27);

    ctx.font      = `bold ${size}px ${font}`;
    ctx.textAlign = 'center';

    ctx.fillStyle   = c1;
    ctx.shadowColor = c1;
    ctx.shadowBlur  = 8;
    ctx.fillText(`J1  ${p1}`, cw * 0.22, y + cs * 0.38);
    ctx.shadowBlur = 0;

    if (state.status === 'playing') {
      if (state.aiThinking) {
        ctx.fillStyle = theme.ui.mutedColor;
        ctx.font      = `${Math.floor(size * 0.78)}px ${font}`;
        ctx.fillText('IA…', cw * 0.5, y + cs * 0.38);
      } else {
        const turnColor = state.currentPlayer === 1 ? c1 : c2;
        ctx.fillStyle   = turnColor;
        ctx.shadowColor = turnColor;
        ctx.shadowBlur  = 6;
        ctx.font        = `${Math.floor(size * 0.82)}px ${font}`;
        ctx.fillText(`J${state.currentPlayer}`, cw * 0.5, y + cs * 0.38);
        ctx.shadowBlur = 0;
      }
    }

    ctx.fillStyle   = c2;
    ctx.shadowColor = c2;
    ctx.shadowBlur  = 8;
    ctx.font        = `bold ${size}px ${font}`;
    ctx.fillText(`${p2}  J2`, cw * 0.78, y + cs * 0.38);
    ctx.shadowBlur = 0;
  }

  /* ============================================================
     UTILITAIRE
     ============================================================ */

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y,         x + r, y);
    ctx.closePath();
  }
}
