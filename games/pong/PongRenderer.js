/**
 * PongRenderer — Rendu canvas + overlay de sélection (v2)
 *
 * En état idle  : overlay de sélection superposé au canvas (terrain, points, adversaire)
 * En jeu        : canvas classique Pong avec HUD scores
 */

import EventBus from '../../js/core/EventBus.js';

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

        <div class="pg-canvas-wrap">
          <canvas id="pg-canvas" width="${width}" height="${height}"></canvas>

          <div class="pg-overlay" id="pg-overlay">
            <div class="pg-overlay-title">PONG</div>

            <div class="pg-opt-group">
              <div class="pg-opt-label">MODE</div>
              <div class="pg-chips" data-opt="mode">
                <button class="pg-chip pg-chip--on" data-val="basique">BASIQUE</button>
              </div>
            </div>

            <div class="pg-opt-group">
              <div class="pg-opt-label">TERRAIN</div>
              <div class="pg-chips" data-opt="size">
                <button class="pg-chip" data-val="S">S</button>
                <button class="pg-chip" data-val="M">M</button>
                <button class="pg-chip pg-chip--on" data-val="L">L</button>
                <button class="pg-chip" data-val="XL">XL</button>
                <button class="pg-chip" data-val="XXL">XXL</button>
              </div>
            </div>

            <div class="pg-opt-group">
              <div class="pg-opt-label">POINTS</div>
              <div class="pg-chips" data-opt="maxScore">
                <button class="pg-chip" data-val="3">3</button>
                <button class="pg-chip" data-val="5">5</button>
                <button class="pg-chip pg-chip--on" data-val="7">7</button>
                <button class="pg-chip" data-val="9">9</button>
              </div>
            </div>

            <div class="pg-opt-group">
              <div class="pg-opt-label">ADVERSAIRE</div>
              <div class="pg-chips" data-opt="opponent">
                <button class="pg-chip pg-chip--on" data-val="ai">IA</button>
                <button class="pg-chip" data-val="j2-keys">J2 Clavier</button>
                <button class="pg-chip" data-val="j2-mouse">J2 Souris</button>
              </div>
            </div>

            <button class="pg-play-btn" id="pg-play-btn">JOUER</button>
          </div>
        </div>

        <div class="pg-status" id="pg-status"></div>

        <div class="pg-keys" id="pg-keys">
          ${this._keysHtml('ai')}
        </div>

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

    // Chips de sélection
    this.container.querySelectorAll('.pg-chips .pg-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const opt = btn.closest('[data-opt]').dataset.opt;
        btn.closest('[data-opt]').querySelectorAll('.pg-chip')
           .forEach(b => b.classList.remove('pg-chip--on'));
        btn.classList.add('pg-chip--on');
        this._sel[opt] = opt === 'maxScore' ? parseInt(btn.dataset.val) : btn.dataset.val;
      });
    });

    document.getElementById('pg-play-btn')
      ?.addEventListener('click', () => this._startGame());

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
    this._handlers.startReq  = ()  => this._startGame();

    EventBus.on('game:frame',           this._handlers.frame);
    EventBus.on('game:tick',            this._handlers.tick);
    EventBus.on('game:start',           this._handlers.start);
    EventBus.on('game:point',           this._handlers.point);
    EventBus.on('game:over',            this._handlers.gameOver);
    EventBus.on('pong:start-requested', this._handlers.startReq);
  }

  _unbindEvents() {
    EventBus.off('game:frame',           this._handlers.frame);
    EventBus.off('game:tick',            this._handlers.tick);
    EventBus.off('game:start',           this._handlers.start);
    EventBus.off('game:point',           this._handlers.point);
    EventBus.off('game:over',            this._handlers.gameOver);
    EventBus.off('pong:start-requested', this._handlers.startReq);
  }

  /* ============================================================
     HANDLERS
     ============================================================ */

  _onTick(state, action) {
    this._updateScores(state.scoreLeft, state.scoreRight);
    this._setOverlayVisible(state.status === 'idle');
    this._setStatus(state, action);

    if (action === 'init' || action === 'restart') {
      this._resetCanvasSize();
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

    // Touches d'aide
    const keysEl = document.getElementById('pg-keys');
    if (keysEl) keysEl.innerHTML = this._keysHtml(opponent);

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
    const isAI = this.game.state.opponent === 'ai';
    const label = isAI
      ? (winner === 'player' ? 'VICTOIRE !'     : 'DÉFAITE')
      : (winner === 'player' ? 'VICTOIRE J1 !'  : 'VICTOIRE J2 !');
    this._setText(`${label} ${scoreLeft}–${scoreRight} — R pour rejouer`);
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

  _setOverlayVisible(show) {
    const el = document.getElementById('pg-overlay');
    if (el) el.style.display = show ? 'flex' : 'none';
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
    const keysEl = document.getElementById('pg-keys');
    if (keysEl) keysEl.innerHTML = this._keysHtml('ai');
    const maxEl = document.getElementById('pg-max-score');
    if (maxEl) maxEl.textContent = 'PREMIER À 7';
  }

  _keysHtml(opponent) {
    const common = `
      <span class="pg-key-chip">Espace&nbsp; Servir / Pause</span>
      <span class="pg-key-chip">R&nbsp; Restart</span>
    `;
    if (opponent === 'ai') {
      return `<span class="pg-key-chip">W S / ↑ ↓&nbsp; Raquette</span>${common}`;
    } else if (opponent === 'j2-keys') {
      return `<span class="pg-key-chip">W S&nbsp; J1</span><span class="pg-key-chip">↑ ↓&nbsp; J2</span>${common}`;
    } else {
      return `<span class="pg-key-chip">W S&nbsp; J1</span><span class="pg-key-chip">Souris&nbsp; J2</span>${common}`;
    }
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

    if (state.status === 'paused')   this._drawPauseOverlay(ctx, W, H);
    if (state.status === 'gameover') this._drawGameOverOverlay(ctx, W, H, state);
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

  _drawPauseOverlay(ctx, W, H) {
    ctx.fillStyle = 'rgba(5,8,15,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign   = 'center';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = '#00e5ff';
    ctx.font        = 'bold 34px var(--font-display, monospace)';
    ctx.fillText('PAUSE', W / 2, H / 2);
    ctx.shadowBlur  = 0;
  }

  _drawGameOverOverlay(ctx, W, H, state) {
    ctx.fillStyle = 'rgba(5,8,15,0.7)';
    ctx.fillRect(0, 0, W, H);

    const won   = state.scoreLeft > state.scoreRight;
    const color = won ? '#00e5ff' : '#ff2d78';
    const isAI  = state.opponent === 'ai';

    ctx.textAlign   = 'center';
    ctx.shadowColor = color;
    ctx.shadowBlur  = 22;
    ctx.fillStyle   = color;
    ctx.font        = 'bold 38px var(--font-display, monospace)';
    ctx.fillText(
      isAI ? (won ? 'VICTOIRE !' : 'DÉFAITE') : (won ? 'VICTOIRE J1 !' : 'VICTOIRE J2 !'),
      W / 2, H / 2 - 28
    );

    ctx.shadowBlur = 0;
    ctx.fillStyle  = '#ffffff';
    ctx.font       = '22px var(--font-display, monospace)';
    ctx.fillText(`${state.scoreLeft}  –  ${state.scoreRight}`, W / 2, H / 2 + 14);

    ctx.fillStyle = 'rgba(200,200,220,0.6)';
    ctx.font      = '14px var(--font-display, monospace)';
    ctx.fillText('R pour rejouer', W / 2, H / 2 + 46);
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

      /* ── Overlay de sélection ── */
      .pg-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1.4rem;
        background: rgba(5,8,15,0.93);
        border-radius: 4px;
        padding: 1.5rem;
      }
      .pg-overlay-title {
        font-family: var(--font-display);
        font-size: 2.6rem;
        font-weight: 900;
        color: #00e5ff;
        text-shadow: 0 0 24px rgba(0,229,255,0.7);
        letter-spacing: 0.2em;
      }

      /* ── Groupes d'options ── */
      .pg-opt-group {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.45rem;
        width: 100%;
      }
      .pg-opt-label {
        font-family: var(--font-display);
        font-size: 0.6rem;
        letter-spacing: 0.22em;
        color: var(--text-muted, #555);
      }
      .pg-chips {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
        justify-content: center;
      }
      .pg-chip {
        font-family: var(--font-display);
        font-size: 0.72rem;
        letter-spacing: 0.08em;
        color: var(--text-secondary, #888);
        background: transparent;
        border: 1px solid var(--color-border, #1e2a38);
        border-radius: 4px;
        padding: 4px 12px;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s, background 0.15s;
      }
      .pg-chip:hover {
        color: #00e5ff;
        border-color: #00e5ff44;
      }
      .pg-chip--on {
        color: #00e5ff;
        border-color: #00e5ff;
        background: rgba(0,229,255,0.08);
        text-shadow: 0 0 8px rgba(0,229,255,0.5);
      }

      /* ── Bouton JOUER ── */
      .pg-play-btn {
        font-family: var(--font-display);
        font-size: 0.9rem;
        font-weight: 700;
        letter-spacing: 0.18em;
        color: #05080f;
        background: #00e5ff;
        border: none;
        border-radius: 4px;
        padding: 8px 32px;
        cursor: pointer;
        margin-top: 0.4rem;
        box-shadow: 0 0 18px rgba(0,229,255,0.45);
        transition: opacity 0.15s;
      }
      .pg-play-btn:hover { opacity: 0.85; }

      /* ── Status ── */
      .pg-status {
        font-family: var(--font-display);
        font-size: var(--text-sm, 0.75rem);
        letter-spacing: 0.12em;
        color: var(--text-secondary, #aaa);
        text-align: center;
        min-height: 1.4em;
      }

      /* ── Chips raccourcis ── */
      .pg-keys {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        justify-content: center;
      }
      .pg-key-chip {
        font-family: var(--font-display);
        font-size: 0.62rem;
        letter-spacing: 0.09em;
        color: var(--text-muted, #555);
        background: var(--color-bg-panel, #0d1117);
        border: 1px solid var(--color-border, #1e2a38);
        border-radius: 4px;
        padding: 2px 8px;
      }

      @media (max-width: 640px) {
        .pg-score { font-size: 1.8rem; }
        .pg-overlay-title { font-size: 1.8rem; }
      }
    `;
    document.head.appendChild(style);
  }
}
