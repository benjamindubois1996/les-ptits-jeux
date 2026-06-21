/**
 * PongRenderer — Rendu canvas + overlay de sélection (v2)
 *
 * En état idle  : overlay de sélection superposé au canvas (terrain, points, adversaire)
 * En jeu        : canvas classique Pong avec HUD scores
 */

import EventBus     from '../../js/core/EventBus.js';
import GameOverlay   from '../../js/ui/components/GameOverlay.js';

const OPTION_GROUPS = [
  { key: 'mode',     label: 'MODE',       default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] },
  { key: 'size',     label: 'TERRAIN',    default: 'L',  options: ['S','M','L','XL','XXL'].map(v => ({ value: v, label: v })) },
  { key: 'maxScore', label: 'POINTS',     default: 7,    options: [3,5,7,9].map(v => ({ value: v, label: String(v) })) },
  { key: 'opponent', label: 'ADVERSAIRE', default: 'ai', options: [
      { value: 'ai',        label: 'IA' },
      { value: 'j2-keys',   label: 'J2 Clavier' },
      { value: 'j2-mouse',  label: 'J2 Souris' },
    ] },
];

export default class PongRenderer {

  constructor(game, container, config) {
    this.game      = game;
    this.container = container;
    this.config    = config;
    this._handlers = {};
    this._canvas   = null;
    this._ctx      = null;
    // Sélections par défaut (synchronisées avec Pong._buildState)
    this._sel = { size: 'L', maxScore: 7, opponent: 'ai' };
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init() {
    this._injectStyles();
    this._build();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    if (this._canvas) {
      this._canvas.removeEventListener('click',     this._onClick);
      this._canvas.removeEventListener('mousemove', this._onMouseMove);
    }
    this._overlay?.destroy();
    const style = document.getElementById('pong-styles');
    if (style) style.remove();
  }

  /* ============================================================
     DOM
     ============================================================ */

  _build() {
    const { canvasSizes, defaultSize } = this.config.gameplay;
    const { width, height } = canvasSizes[defaultSize];

    this.container.innerHTML = `
      <div class="pg-wrapper">

        <div class="pg-hud">
          <div class="pg-score-block">
            <div class="pg-label" id="pg-label-left">JOUEUR</div>
            <div class="pg-score pg-score--player" id="pg-score-left">0</div>
          </div>
          <div class="pg-hud-center">
            <span class="pg-label" id="pg-max-score">PREMIER À 7</span>
          </div>
          <div class="pg-score-block">
            <div class="pg-label" id="pg-label-right">IA</div>
            <div class="pg-score pg-score--ai" id="pg-score-right">0</div>
          </div>
        </div>

        <div class="pg-canvas-wrap" id="pg-canvas-wrap">
          <canvas id="pg-canvas" width="${width}" height="${height}"></canvas>
        </div>

        <div class="pg-status" id="pg-status"></div>

      </div>
    `;

    this._canvas = document.getElementById('pg-canvas');
    this._ctx    = this._canvas.getContext('2d');

    // Souris J2 (activée uniquement quand opponent === 'j2-mouse')
    this._onMouseMove = (e) => {
      const rect   = this._canvas.getBoundingClientRect();
      const scaleY = this._canvas.height / rect.height;
      this.game.setJ2MouseY((e.clientY - rect.top) * scaleY);
    };

    // Clic canvas → servir / restart
    this._onClick = () => this._handleCanvasClick();
    this._canvas.addEventListener('click', this._onClick);

    // Écran de démarrage — module partagé, monté sur le wrapper du canvas
    this._overlay = new GameOverlay(this.container);
    this._overlay.showStart(OPTION_GROUPS, (selections) => {
      this._sel = selections;
      this._startGame();
    });

    this._drawFrame(this.game.state);
  }

  _handleCanvasClick() {
    const s = this.game.state.status;
    if (s === 'serving')  this.game.launch();
    if (s === 'gameover') this.game.restart();
  }

  _startGame() {
    this.game.start(this._sel);
  }

  /* ============================================================
     ÉVÉNEMENTS
     ============================================================ */

  _bindEvents() {
    this._handlers.frame     = (d) => this._drawFrame(d.state);
    this._handlers.tick      = (d) => this._onTick(d.state, d.action);
    this._handlers.start     = (d) => this._onGameStart(d);
    this._handlers.point     = (d) => this._onPoint(d);
    this._handlers.gameOver  = (d) => this._onGameOver(d);
    this._handlers.paused    = ()  => this._overlay.showPause(() => EventBus.emit('game:pause-toggle'));
    this._handlers.resumed   = ()  => this._overlay.hide();
    this._handlers.startReq  = ()  => this._startGame();

    EventBus.on('game:frame',           this._handlers.frame);
    EventBus.on('game:tick',            this._handlers.tick);
    EventBus.on('game:start',           this._handlers.start);
    EventBus.on('game:point',           this._handlers.point);
    EventBus.on('game:over',            this._handlers.gameOver);
    EventBus.on('game:paused',          this._handlers.paused);
    EventBus.on('game:resumed',         this._handlers.resumed);
    EventBus.on('pong:start-requested', this._handlers.startReq);
  }

  _unbindEvents() {
    EventBus.off('game:frame',           this._handlers.frame);
    EventBus.off('game:tick',            this._handlers.tick);
    EventBus.off('game:start',           this._handlers.start);
    EventBus.off('game:point',           this._handlers.point);
    EventBus.off('game:over',            this._handlers.gameOver);
    EventBus.off('game:paused',          this._handlers.paused);
    EventBus.off('game:resumed',         this._handlers.resumed);
    EventBus.off('pong:start-requested', this._handlers.startReq);
  }

  /* ============================================================
     HANDLERS
     ============================================================ */

  _onTick(state, action) {
    this._updateScores(state.scoreLeft, state.scoreRight);
    if (state.status === 'idle')          this._overlay.show();
    else if (state.status !== 'gameover') this._overlay.hide();
    this._setStatus(state, action);

    if (action === 'init' || action === 'restart') {
      this._resetCanvasSize();
      // Reconstruit l'écran de démarrage (les sélections par défaut redeviennent visibles)
      this._overlay.showStart(OPTION_GROUPS, (selections) => {
        this._sel = selections;
        this._startGame();
      });
    }
  }

  _onGameStart({ canvas, maxScore, opponent }) {
    // Redimensionner le canvas selon le terrain choisi
    this._canvas.width  = canvas.width;
    this._canvas.height = canvas.height;

    // HUD
    const maxEl = document.getElementById('pg-max-score');
    if (maxEl) maxEl.textContent = `PREMIER À ${maxScore}`;

    const labelR = document.getElementById('pg-label-right');
    if (labelR) labelR.textContent = (opponent === 'ai') ? 'IA' : 'J2';

    // Souris J2
    if (opponent === 'j2-mouse') {
      this._canvas.addEventListener('mousemove', this._onMouseMove);
      this._canvas.style.cursor = 'none';
    } else {
      this._canvas.removeEventListener('mousemove', this._onMouseMove);
      this._canvas.style.cursor = '';
    }
  }

  _onPoint({ scorer, scoreLeft, scoreRight }) {
    this._updateScores(scoreLeft, scoreRight);
    const isAI = this.game.state.opponent === 'ai';
    const label = isAI
      ? (scorer === 'player' ? 'POINT JOUEUR !' : 'POINT IA')
      : (scorer === 'player' ? 'POINT J1 !'    : 'POINT J2 !');
    this._setText(`${label} — ESPACE POUR SERVIR`);
  }

  _onGameOver({ winner, scoreLeft, scoreRight }) {
    this._updateScores(scoreLeft, scoreRight);
    const isAI   = this.game.state.opponent === 'ai';
    const result = winner === 'player' ? 'win' : (isAI ? 'lose' : 'win');
    const title  = isAI
      ? (winner === 'player' ? 'VICTOIRE !'     : 'DÉFAITE')
      : (winner === 'player' ? 'VICTOIRE J1 !'  : 'VICTOIRE J2 !');

    this._overlay.showGameOver(
      { result, title, extraInfo: `<div class="overlay-score">${scoreLeft} – ${scoreRight}</div>` },
      () => EventBus.emit('game:restart'),
    );
    this._setText('');
  }

  /* ============================================================
     HUD / STATUS
     ============================================================ */

  _updateScores(l, r) {
    const elL = document.getElementById('pg-score-left');
    const elR = document.getElementById('pg-score-right');
    if (elL) elL.textContent = l;
    if (elR) elR.textContent = r;
  }

  _setStatus(state, action) {
    switch (state.status) {
      case 'idle':    this._setText(''); break;
      case 'serving': if (action !== 'point') this._setText('ESPACE OU CLIC POUR SERVIR'); break;
      case 'playing': this._setText(''); break;
      case 'paused':  this._setText('PAUSE — ESPACE POUR REPRENDRE'); break;
      case 'gameover': break;
    }
  }

  _setText(txt) {
    const el = document.getElementById('pg-status');
    if (el) el.textContent = txt;
  }

  _resetCanvasSize() {
    const { canvasSizes, defaultSize } = this.config.gameplay;
    const { width, height } = canvasSizes[defaultSize];
    this._canvas.width  = width;
    this._canvas.height = height;
    this._canvas.removeEventListener('mousemove', this._onMouseMove);
    this._canvas.style.cursor = '';
    const labelR = document.getElementById('pg-label-right');
    if (labelR) labelR.textContent = 'IA';
    const maxEl = document.getElementById('pg-max-score');
    if (maxEl) maxEl.textContent = 'PREMIER À 7';
  }

  /* ============================================================
     RENDU CANVAS
     ============================================================ */

  _drawFrame(state) {
    if (!this._ctx) return;
    const { width: W, height: H } = state.canvas;
    const { paddle, ball: bCfg } = this.config.gameplay;
    const ctx = this._ctx;

    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, W, H);

    if (state.status === 'idle') {
      // Décor discret derrière l'overlay
      this._drawCenterLine(ctx, W, H);
      ctx.globalAlpha = 0.18;
      this._drawPaddle(ctx, paddle.offset, state.player.y, '#00e5ff');
      this._drawPaddle(ctx, W - paddle.offset - paddle.width, state.ai.y, '#ff2d78');
      ctx.globalAlpha = 1;
      return;
    }

    this._drawCenterLine(ctx, W, H);
    this._drawPaddle(ctx, paddle.offset, state.player.y, '#00e5ff');
    this._drawPaddle(ctx, W - paddle.offset - paddle.width, state.ai.y, '#ff2d78');
    this._drawBall(ctx, state.ball, bCfg.baseRadius);

    // Pause et fin de partie sont désormais affichés via GameOverlay (DOM partagé)
  }

  _drawCenterLine(ctx, W, H) {
    ctx.save();
    ctx.setLineDash([10, 12]);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.restore();
  }

  _drawPaddle(ctx, x, y, color) {
    const { width: pw, height: ph } = this.config.gameplay.paddle;
    const rx = 4;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 14;
    ctx.fillStyle   = color;
    ctx.beginPath();
    ctx.moveTo(x + rx, y);
    ctx.arcTo(x + pw, y,      x + pw, y + ph, rx);
    ctx.arcTo(x + pw, y + ph, x,      y + ph, rx);
    ctx.arcTo(x,      y + ph, x,      y,      rx);
    ctx.arcTo(x,      y,      x + pw, y,      rx);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  _drawBall(ctx, ball, r) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur  = 14;
    ctx.fill();
    ctx.shadowBlur  = 0;
  }

  /* ============================================================
     STYLES
     ============================================================ */

  _injectStyles() {
    if (document.getElementById('pong-styles')) return;
    const style = document.createElement('style');
    style.id    = 'pong-styles';
    style.textContent = `
      .pg-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        padding: 1.25rem 1rem 1rem;
        width: 100%;
        user-select: none;
      }

      /* ── HUD ── */
      .pg-hud {
        display: flex;
        align-items: flex-end;
        width: 100%;
        max-width: 900px;
        justify-content: space-between;
      }
      .pg-score-block {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        min-width: 80px;
      }
      .pg-hud-center {
        flex: 1;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .pg-label {
        font-family: var(--font-display);
        font-size: var(--text-xs, 0.65rem);
        letter-spacing: 0.18em;
        color: var(--text-muted, #666);
      }
      .pg-score {
        font-family: var(--font-display);
        font-size: 2.4rem;
        font-weight: 900;
        line-height: 1;
        min-width: 2ch;
        text-align: center;
      }
      .pg-score--player { color: #00e5ff; text-shadow: 0 0 14px rgba(0,229,255,0.7); }
      .pg-score--ai     { color: #ff2d78; text-shadow: 0 0 14px rgba(255,45,120,0.7); }

      /* ── Canvas wrap (permet l'overlay positionné) ── */
      .pg-canvas-wrap {
        position: relative;
        display: inline-block;
        max-width: 100%;
        line-height: 0;
      }
      #pg-canvas {
        display: block;
        max-width: 100%;
        border: 1px solid var(--color-border, #1e2a38);
        border-radius: 4px;
        box-shadow: 0 0 30px rgba(0,229,255,0.06);
      }

      /* Écrans démarrage / pause / fin de partie : entièrement gérés par
         GameOverlay (js/ui/components/GameOverlay.js), monté sur .pg-canvas-wrap.
         Voir .ov-* dans index.html pour le CSS associé. */

      /* ── Status ── */
      .pg-status {
        font-family: var(--font-display);
        font-size: var(--text-sm, 0.75rem);
        letter-spacing: 0.12em;
        color: var(--text-secondary, #aaa);
        text-align: center;
        min-height: 1.4em;
      }

      @media (max-width: 640px) {
        .pg-score { font-size: 1.8rem; }
      }
    `;
    document.head.appendChild(style);
  }
}
