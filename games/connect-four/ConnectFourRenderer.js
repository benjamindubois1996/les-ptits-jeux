/**
 * ConnectFourRenderer.js — Rendu canvas du Connect Four
 * Emplacement : /games/connect-four/ConnectFourRenderer.js
 *
 * Responsabilités :
 *  - Canvas adaptatif selon la taille de grille choisie
 *  - Sélection mode (2J / vs IA) + taille grille sur écran idle/gameover
 *  - Animation de chute avec ease-in gravitaire
 *  - Pulse sur les 4 cellules gagnantes
 *  - Indicateur "IA réfléchit…"
 *  - Affichage du score final sur l'écran game over
 *
 * NE contient aucune logique de jeu.
 */

import EventBus from '../../js/core/EventBus.js';

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
    this._buttons  = []; // { x, y, w, h, action, value }

    this._onTick        = this._onTick.bind(this);
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
    EventBus.off('connectfour:drop-anim',    this._onDropAnim);
    EventBus.off('connectfour:grid-changed', this._onGridChanged);
    window.removeEventListener('resize',     this._onResize);
  }

  /* ============================================================
     LAYOUT
     ============================================================ */

  _buildLayout() {
    this.viewport.innerHTML = '';
    this.viewport.style.cssText =
      'display:flex;align-items:center;justify-content:center;height:100%;padding:8px;box-sizing:border-box;';

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'cursor:pointer;touch-action:manipulation;';
    this.viewport.appendChild(canvas);

    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');
    this._resize();
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

    // Vérifier les boutons actifs (idle / gameover)
    for (const btn of this._buttons) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        if (btn.action === 'setMode')     this.game.start(btn.value);
        if (btn.action === 'setGridSize') this.game.setGridSize(btn.value);
        return;
      }
    }

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

  _onTick()                          { /* rendu via RAF */ }
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

    if (state.status === 'idle') {
      this._drawIdleScreen(ctx, cw, ch, theme);
      return;
    }

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

    // ── Overlays ────────────────────────────────────────────
    if (state.status === 'paused')   this._drawPaused(ctx, cw, ch, theme);
    if (state.status === 'gameover') this._drawGameOver(ctx, state, cw, ch, theme);
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
     ÉCRANS DE SÉLECTION (idle + gameover)
     ============================================================ */

  /**
   * Dessine les boutons de mode ET de taille de grille.
   * Remplit this._buttons pour la détection de clic.
   */
  _drawSelectionPanel(ctx, cw, ch, theme, startY) {
    this._buttons = [];
    const font = theme.ui.fontFamily;

    // ── Taille de grille ──────────────────────────────────
    const sizes   = this.config.gameplay.gridSizes || [];
    const szCount = sizes.length;
    const szBtnW  = Math.min(cw * 0.26, 90);
    const szBtnH  = ch * 0.10;
    const szGap   = (cw - szBtnW * szCount) / (szCount + 1);
    const szY     = startY;

    ctx.fillStyle = theme.ui.mutedColor;
    ctx.font      = `${Math.floor(ch * 0.038)}px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillText('Taille de grille', cw / 2, szY - ch * 0.02);

    sizes.forEach((sz, i) => {
      const x        = szGap + i * (szBtnW + szGap);
      const y        = szY;
      const isActive = this.game.gridSizeId === sz.id;
      const color    = theme.ui.accentColor;

      this._roundRect(ctx, x, y, szBtnW, szBtnH, 6);
      ctx.fillStyle = isActive ? color + '28' : 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.strokeStyle = isActive ? color : 'rgba(255,255,255,0.13)';
      ctx.lineWidth   = isActive ? 2 : 1;
      ctx.stroke();

      ctx.fillStyle   = isActive ? color : theme.ui.mutedColor;
      ctx.shadowColor = isActive ? color : 'transparent';
      ctx.shadowBlur  = isActive ? 8 : 0;
      ctx.font        = `bold ${Math.floor(szBtnH * 0.42)}px ${font}`;
      ctx.textAlign   = 'center';
      ctx.fillText(sz.label, x + szBtnW / 2, y + szBtnH * 0.64);
      ctx.shadowBlur = 0;

      this._buttons.push({ x, y, w: szBtnW, h: szBtnH, action: 'setGridSize', value: sz.id });
    });

    // ── Mode de jeu ───────────────────────────────────────
    const modes  = [
      { mode: 'pvp',    label: '2 JOUEURS', color: theme.players.p1 },
      { mode: 'vs-cpu', label: 'vs IA',     color: theme.players.p2 },
    ];
    const mdBtnW = Math.min(cw * 0.38, 150);
    const mdBtnH = ch * 0.11;
    const mdGap  = (cw - mdBtnW * 2) / 3;
    const mdY    = szY + szBtnH + ch * 0.07;

    modes.forEach(({ mode, label, color }, i) => {
      const x        = mdGap + i * (mdBtnW + mdGap);
      const y        = mdY;
      const isActive = this.game.mode === mode;

      this._roundRect(ctx, x, y, mdBtnW, mdBtnH, 8);
      ctx.fillStyle   = isActive ? color + '33' : 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.strokeStyle = isActive ? color : 'rgba(255,255,255,0.15)';
      ctx.lineWidth   = isActive ? 2 : 1;
      ctx.stroke();

      ctx.fillStyle   = isActive ? color : theme.ui.mutedColor;
      ctx.shadowColor = isActive ? color : 'transparent';
      ctx.shadowBlur  = isActive ? 10 : 0;
      ctx.font        = `bold ${Math.floor(mdBtnH * 0.38)}px ${font}`;
      ctx.textAlign   = 'center';
      ctx.fillText(label, x + mdBtnW / 2, y + mdBtnH * 0.62);
      ctx.shadowBlur = 0;

      this._buttons.push({ x, y, w: mdBtnW, h: mdBtnH, action: 'setMode', value: mode });
    });

    // hint
    ctx.fillStyle = theme.ui.mutedColor;
    ctx.font      = `${Math.floor(ch * 0.037)}px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillText('Cliquez un mode pour commencer', cw / 2, mdY + mdBtnH + ch * 0.06);
  }

  _drawIdleScreen(ctx, cw, ch, theme) {
    this._buttons = [];
    ctx.textAlign = 'center';

    ctx.fillStyle   = theme.ui.primaryColor;
    ctx.shadowColor = theme.ui.primaryColor;
    ctx.shadowBlur  = 16;
    ctx.font        = `bold ${Math.floor(ch * 0.09)}px ${theme.ui.fontFamily}`;
    ctx.fillText('CONNECT FOUR', cw / 2, ch * 0.22);
    ctx.shadowBlur = 0;

    this._drawSelectionPanel(ctx, cw, ch, theme, ch * 0.36);
  }

  _drawGameOver(ctx, state, cw, ch, theme) {
    this._buttons = [];
    ctx.fillStyle = 'rgba(5,8,15,0.80)';
    ctx.fillRect(0, 0, cw, ch);

    // Titre gagnant
    let msg, color;
    if (state.winner === 'draw') {
      msg   = 'MATCH NUL';
      color = theme.ui.mutedColor;
    } else {
      const isAiWin = this.game.mode === 'vs-cpu' && state.winner === 2;
      msg   = isAiWin ? "L'IA GAGNE !" : `JOUEUR ${state.winner} GAGNE !`;
      color = state.winner === 1 ? theme.players.p1 : theme.players.p2;
    }

    ctx.textAlign   = 'center';
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 26;
    ctx.font        = `bold ${Math.floor(ch * 0.088)}px ${theme.ui.fontFamily}`;
    ctx.fillText(msg, cw / 2, ch * 0.17);
    ctx.shadowBlur = 0;

    // Score de la partie (seulement si victoire)
    if (state.winner !== 'draw') {
      const scoreColor = state.winner === 1 ? theme.players.p1 : theme.players.p2;
      ctx.fillStyle   = scoreColor;
      ctx.shadowColor = scoreColor;
      ctx.shadowBlur  = 8;
      ctx.font        = `${Math.floor(ch * 0.052)}px ${theme.ui.fontFamily}`;
      ctx.fillText(`${state.finalScore} pts`, cw / 2, ch * 0.28);
      ctx.shadowBlur = 0;

      // Sous-texte selon la rapidité
      const { baseScore, penaltyPerMove } = this.config.scoring;
      const maxMoves = Math.floor(baseScore / penaltyPerMove);
      let comment;
      if (state.moveCount <= maxMoves * 0.35)     comment = 'Victoire éclair !';
      else if (state.moveCount <= maxMoves * 0.6) comment = 'Bien joué !';
      else                                         comment = 'Victoire arrachée…';

      ctx.fillStyle = theme.ui.mutedColor;
      ctx.font      = `${Math.floor(ch * 0.039)}px ${theme.ui.fontFamily}`;
      ctx.fillText(`${comment}  (${state.moveCount} coups)`, cw / 2, ch * 0.34);
    }

    this._drawSelectionPanel(ctx, cw, ch, theme, ch * 0.44);
  }

  _drawPaused(ctx, cw, ch, theme) {
    ctx.fillStyle = 'rgba(5,8,15,0.75)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.textAlign   = 'center';
    ctx.fillStyle   = theme.ui.primaryColor;
    ctx.shadowColor = theme.ui.primaryColor;
    ctx.shadowBlur  = 22;
    ctx.font        = `bold ${Math.floor(ch * 0.1)}px ${theme.ui.fontFamily}`;
    ctx.fillText('PAUSE', cw / 2, ch * 0.5);
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
