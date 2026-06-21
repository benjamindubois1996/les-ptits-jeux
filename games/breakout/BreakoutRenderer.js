/**
 * BreakoutRenderer — Rendu canvas du jeu Breakout
 *
 * Responsabilités :
 *   - Construire le DOM (HUD + canvas + status)
 *   - Dessiner chaque frame via game:frame
 *   - Gérer les contrôles souris (paddle)
 *   - Gérer les clics tactiles (canvas)
 *   - Injecter ses styles CSS
 */

import EventBus    from '../../js/core/EventBus.js';
import GameOverlay  from '../../js/ui/components/GameOverlay.js';

/* Couleur par rangée (rang 0 = haut = plus de points) */
const BRICK_COLORS = [
  { fill: '#ff2d78', glow: 'rgba(255,45,120,0.55)'  }, // magenta  — 70 pts
  { fill: '#ff6b00', glow: 'rgba(255,107,0,0.55)'   }, // orange   — 60 pts
  { fill: '#ffd600', glow: 'rgba(255,214,0,0.55)'   }, // jaune    — 50 pts
  { fill: '#00e676', glow: 'rgba(0,230,118,0.55)'   }, // vert     — 40 pts
  { fill: '#00e5ff', glow: 'rgba(0,229,255,0.55)'   }, // cyan     — 30 pts
  { fill: '#2979ff', glow: 'rgba(41,121,255,0.55)'  }, // bleu     — 20 pts
  { fill: '#9c27b0', glow: 'rgba(156,39,176,0.55)'  }, // violet   — 10 pts
];

export default class BreakoutRenderer {

  constructor(game, container, config) {
    this.game      = game;
    this.container = container;
    this.config    = config;
    this._handlers = {};
    this._canvas   = null;
    this._ctx      = null;
    this._flash    = null; // { row, col, ttl } flash brique touchée
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
      this._canvas.removeEventListener('mousemove', this._onMouseMove);
      this._canvas.removeEventListener('click',     this._onClick);
      this._canvas.removeEventListener('touchmove', this._onTouchMove);
      this._canvas.removeEventListener('touchstart',this._onTouchStart);
    }
    this._overlay?.destroy();
    const style = document.getElementById('breakout-styles');
    if (style) style.remove();
  }

  /* ============================================================
     DOM
     ============================================================ */

  _build() {
    const { width, height } = this.config.gameplay.canvas;

    this.container.innerHTML = `
      <div class="bk-wrapper">
        <div class="bk-canvas-wrap" id="bk-canvas-wrap">
          <canvas id="bk-canvas" width="${width}" height="${height}"></canvas>
        </div>
        <div class="bk-status" id="bk-status"></div>
      </div>
    `;

    this._canvas = document.getElementById('bk-canvas');
    this._ctx    = this._canvas.getContext('2d');

    /* Contrôles souris */
    this._onMouseMove = (e) => this._movePaddleFromEvent(e.clientX);
    this._onClick     = ()  => this._handlePointerAction();

    /* Contrôles tactiles */
    this._onTouchMove  = (e) => {
      e.preventDefault();
      this._movePaddleFromEvent(e.touches[0].clientX);
    };
    this._onTouchStart = (e) => {
      e.preventDefault();
      this._movePaddleFromEvent(e.touches[0].clientX);
      this._handlePointerAction();
    };

    this._canvas.addEventListener('mousemove',  this._onMouseMove);
    this._canvas.addEventListener('click',      this._onClick);
    this._canvas.addEventListener('touchmove',  this._onTouchMove,  { passive: false });
    this._canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });

    this._overlay = new GameOverlay(this.container);
    this._showStartScreen();

    /* Premier dessin */
    this._drawFrame(this.game.state);
  }

  _showStartScreen() {
    const optionGroups = [
      { key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] },
    ];
    this._overlay.showStart(optionGroups, () => this.game.start(), {
      extraHtml: '<div class="overlay-score">ESPACE ou CLIC pour jouer</div>',
    });
  }

  _movePaddleFromEvent(clientX) {
    const rect   = this._canvas.getBoundingClientRect();
    const scaleX = this._canvas.width / rect.width;
    const mouseX = (clientX - rect.left) * scaleX;
    const padW   = this.config.gameplay.paddle.width;
    const canW   = this.config.gameplay.canvas.width;
    this.game.state.paddle.x = Math.max(0, Math.min(canW - padW, mouseX - padW / 2));
  }

  _handlePointerAction() {
    const s = this.game.state.status;
    if (s === 'idle' || s === 'gameover') this.game.start();
    else if (s === 'ready')              this.game.launch();
  }

  /* ============================================================
     ÉVÉNEMENTS JEUX
     ============================================================ */

  _bindEvents() {
    this._handlers.frame    = (d) => this._onFrame(d.state);
    this._handlers.tick     = (d) => this._onTick(d.state, d.action);
    this._handlers.brickHit = (d) => this._onBrickHit(d);
    this._handlers.lifeLost = (d) => this._onLifeLost(d);
    this._handlers.levelUp  = (d) => this._onLevelUp(d);
    this._handlers.gameOver = (d) => this._onGameOver(d);

    EventBus.on('game:frame',     this._handlers.frame);
    EventBus.on('game:tick',      this._handlers.tick);
    EventBus.on('game:brick-hit', this._handlers.brickHit);
    EventBus.on('game:life-lost', this._handlers.lifeLost);
    EventBus.on('game:level-up',  this._handlers.levelUp);
    EventBus.on('game:over',      this._handlers.gameOver);
  }

  _unbindEvents() {
    EventBus.off('game:frame',     this._handlers.frame);
    EventBus.off('game:tick',      this._handlers.tick);
    EventBus.off('game:brick-hit', this._handlers.brickHit);
    EventBus.off('game:life-lost', this._handlers.lifeLost);
    EventBus.off('game:level-up',  this._handlers.levelUp);
    EventBus.off('game:over',      this._handlers.gameOver);
  }

  /* ============================================================
     HANDLERS
     ============================================================ */

  _onFrame(state) {
    this._updateHUD(state);
    this._drawFrame(state);
  }

  _onTick(state, action) {
    this._updateHUD(state);
    this._setStatus(state, action);
  }

  _onBrickHit({ row, col }) {
    this._flash = { row, col, ttl: 8 }; // 8 frames de flash blanc
  }

  _onLifeLost({ lives }) {
    EventBus.emit('game:score-update', { lives });
    this._screenFlash('rgba(255,0,80,0.25)');
  }

  _onLevelUp({ level }) {
    const el = document.getElementById('bk-status');
    if (el) el.textContent = `NIVEAU ${level} — ESPACE POUR LANCER`;
  }

  _onGameOver({ score, level, best }) {
    this._overlay.showGameOver({
      result: 'lose',
      score,
      isRecord: score > 0 && score >= best,
      extraInfo: `<div class="overlay-score">Niveau ${level}</div>`,
    }, () => EventBus.emit('game:restart'));
  }

  /* ============================================================
     HUD
     ============================================================ */

  _updateHUD(state) {
    EventBus.emit('game:score-update', {
      score: state.score,
      lives: state.lives,
    });
  }

  _setStatus(state, action) {
    const el = document.getElementById('bk-status');
    if (!el) return;

    switch (state.status) {
      case 'idle':
        this._overlay.show();
        el.textContent = '';
        break;
      case 'ready':
        this._overlay.hide();
        el.textContent = action === 'life-lost'
          ? 'VIE PERDUE ! ESPACE POUR RELANCER'
          : 'ESPACE POUR LANCER LA BALLE';
        break;
      case 'playing':
        this._overlay.hide();
        el.textContent = '';
        break;
      case 'paused':
        this._overlay.showPause(() => EventBus.emit('game:pause-toggle'));
        el.textContent = '';
        break;
      case 'gameover':
        break; // géré dans _onGameOver
    }
  }

  /* ============================================================
     RENDU CANVAS
     ============================================================ */

  _drawFrame(state) {
    if (!this._ctx) return;
    const { width, height } = this.config.gameplay.canvas;
    const ctx = this._ctx;

    // Fond
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, width, height);

    if (state.status === 'idle') {
      this._drawIdle(ctx, width, height, state);
      return;
    }

    this._drawBricks(ctx, state);
    this._drawBall(ctx, state.ball);
    this._drawPaddle(ctx, state.paddle);
    // Pause et fin de partie sont désormais affichés via GameOverlay (DOM partagé)
  }

  /* ─── Écran titre ─── */
  _drawIdle(ctx, W, H, state) {
    // Briques en décor (semi-transparentes, derrière l'écran de démarrage)
    ctx.globalAlpha = 0.35;
    this._drawBricks(ctx, state);
    this._drawPaddle(ctx, state.paddle);
    ctx.globalAlpha = 1;
  }

  /* ─── Briques ─── */
  _drawBricks(ctx, state) {
    const { bricks: bCfg, canvas } = this.config.gameplay;
    const brickW = (canvas.width - bCfg.offsetLeft * 2 - bCfg.padding * (bCfg.cols - 1)) / bCfg.cols;
    const brickH = bCfg.height;

    for (let row = 0; row < bCfg.rows; row++) {
      const color = BRICK_COLORS[row] ?? BRICK_COLORS.at(-1);

      for (let col = 0; col < bCfg.cols; col++) {
        if (!state.bricks[row][col]) continue;

        const bx = bCfg.offsetLeft + col * (brickW + bCfg.padding);
        const by = bCfg.offsetTop  + row * (brickH + bCfg.padding);

        const isFlash = this._flash
          && this._flash.row === row
          && this._flash.col === col
          && this._flash.ttl > 0;

        if (isFlash) {
          this._flash.ttl--;
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur  = 20;
          ctx.fillStyle   = '#ffffff';
        } else {
          ctx.shadowColor = color.glow;
          ctx.shadowBlur  = 7;
          ctx.fillStyle   = color.fill;
        }

        ctx.fillRect(bx, by, brickW, brickH);

        // Reflet haut (effet 3D léger)
        ctx.shadowBlur  = 0;
        ctx.fillStyle   = 'rgba(255,255,255,0.22)';
        ctx.fillRect(bx, by, brickW, 3);
        ctx.fillRect(bx, by, 2, brickH);
      }
    }
    ctx.shadowBlur = 0;
  }

  /* ─── Balle ─── */
  _drawBall(ctx, ball) {
    const r = this.config.gameplay.ball.radius;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur  = 14;
    ctx.fill();
    ctx.shadowBlur  = 0;
  }

  /* ─── Raquette ─── */
  _drawPaddle(ctx, paddle) {
    const { width: pw, height: ph } = this.config.gameplay.paddle;
    const { height: CH } = this.config.gameplay.canvas;
    const x  = paddle.x;
    const y  = CH - 35 - ph;
    const rx = ph / 2; // rayon des coins

    ctx.shadowColor = 'rgba(0,229,255,0.75)';
    ctx.shadowBlur  = 16;

    ctx.beginPath();
    ctx.moveTo(x + rx, y);
    ctx.arcTo(x + pw, y,     x + pw, y + ph, rx);
    ctx.arcTo(x + pw, y + ph, x,     y + ph, rx);
    ctx.arcTo(x,      y + ph, x,     y,      rx);
    ctx.arcTo(x,      y,      x + pw, y,     rx);
    ctx.closePath();

    const grad = ctx.createLinearGradient(x, y, x, y + ph);
    grad.addColorStop(0, '#00e5ff');
    grad.addColorStop(1, '#007a8a');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.shadowBlur = 0;
  }

  /* ─── Flash écran ─── */
  _screenFlash(color) {
    if (!this._ctx) return;
    const { width, height } = this.config.gameplay.canvas;
    this._ctx.fillStyle = color;
    this._ctx.fillRect(0, 0, width, height);
    // écrasé par la prochaine frame
  }

  /* ============================================================
     STYLES
     ============================================================ */

  _injectStyles() {
    if (document.getElementById('breakout-styles')) return;
    const style = document.createElement('style');
    style.id = 'breakout-styles';
    style.textContent = `
      /* ── Wrapper ── */
      .bk-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        width: 100%;
        height: 100%;
        user-select: none;
      }

      /* ── Canvas ── */
      .bk-canvas-wrap {
        position: relative;
        display: inline-block;
        line-height: 0;
      }
      #bk-canvas {
        display: block;
        max-width: 100%;
        border: 1px solid var(--color-border, #1e2a38);
        border-radius: 4px;
        cursor: none;
        box-shadow: 0 0 30px rgba(0,229,255,0.06);
      }

      /* ── Status ── */
      .bk-status {
        font-family: var(--font-display);
        font-size: var(--text-sm, 0.75rem);
        letter-spacing: 0.12em;
        color: var(--text-secondary, #aaa);
        text-align: center;
        min-height: 1.4em;
      }

      /* ── Responsive ── */
      @media (max-width: 520px) {
        .bk-hud { gap: 1.2rem; }
        .bk-value { font-size: 1.3rem; }
      }
    `;
    document.head.appendChild(style);
  }
}
