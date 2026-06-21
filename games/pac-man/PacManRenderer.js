/**
 * PacManRenderer — Rendu canvas pour Pac-Man (V1 BASIQUE)
 */

import EventBus    from '../../js/core/EventBus.js';
import GameOverlay  from '../../js/ui/components/GameOverlay.js';

const CELL = 16; // pixels par case

export default class PacManRenderer {

  constructor(game, container, config) {
    this.game      = game;
    this.container = container;
    this.config    = config;
    this._canvas   = null;
    this._ctx      = null;
    this._handlers = {};
  }

  // ─── CYCLE DE VIE ──────────────────────────────────────────────────

  init() {
    this._injectStyles();
    this._build();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    const style = document.getElementById('pm-styles');
    if (style) style.remove();
  }

  // ─── DOM ───────────────────────────────────────────────────────────

  _build() {
    const W = 28 * CELL;
    const H = 31 * CELL;

    this.container.innerHTML = `
      <div class="pm-wrapper">

        <div class="pm-hud">
          <div class="pm-level" id="pm-level">NIVEAU 1</div>
        </div>

        <div class="pm-canvas-wrap" id="pm-canvas-wrap">
          <canvas id="pm-canvas" width="${W}" height="${H}"></canvas>
        </div>

        <div class="pm-status" id="pm-status"></div>

      </div>
    `;

    this._canvas = document.getElementById('pm-canvas');
    this._ctx    = this._canvas.getContext('2d');

    this._canvas.addEventListener('click', () => {
      const s = this.game.state.status;
      if (s === 'gameover') this.game.restart();
    });

    this._overlay = new GameOverlay(this.container);
    this._showStartScreen();

    this._drawFrame(this.game.state);
  }

  _showStartScreen() {
    const optionGroups = [
      { key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] },
    ];
    this._overlay.showStart(optionGroups, () => this.game.start(), {
      extraHtml: '<div class="overlay-score">ESPACE ou ENTRÉE pour jouer</div>',
    });
  }

  // ─── ÉVÉNEMENTS ────────────────────────────────────────────────────

  _bindEvents() {
    this._handlers.frame   = (d) => this._drawFrame(d.state);
    this._handlers.tick    = (d) => this._onTick(d.state, d.action);
    this._handlers.over    = (d) => this._onGameOver(d);
    this._handlers.paused  = ()  => this._overlay.showPause(() => EventBus.emit('game:pause-toggle'));
    this._handlers.resumed = ()  => this._overlay.hide();
    this._handlers.death   = ()  => this._setText('');
    this._handlers.lvl     = ()  => this._setText('NIVEAU TERMINÉ !');

    EventBus.on('game:frame',           this._handlers.frame);
    EventBus.on('game:tick',            this._handlers.tick);
    EventBus.on('game:over',            this._handlers.over);
    EventBus.on('game:paused',          this._handlers.paused);
    EventBus.on('game:resumed',         this._handlers.resumed);
    EventBus.on('pacman:death',         this._handlers.death);
    EventBus.on('pacman:level-complete',this._handlers.lvl);
  }

  _unbindEvents() {
    EventBus.off('game:frame',           this._handlers.frame);
    EventBus.off('game:tick',            this._handlers.tick);
    EventBus.off('game:over',            this._handlers.over);
    EventBus.off('game:paused',          this._handlers.paused);
    EventBus.off('game:resumed',         this._handlers.resumed);
    EventBus.off('pacman:death',         this._handlers.death);
    EventBus.off('pacman:level-complete',this._handlers.lvl);
  }

  // ─── HANDLERS ──────────────────────────────────────────────────────

  _onTick(state, action) {
    if (state.status === 'idle') this._showStartScreen();
    else                          this._overlay.hide();

    if (action === 'ready' || action === 'start')  this._setText('PRÊT !');
    if (action === 'playing')                       this._setText('');
    if (action === 'restart')                       this._setText('');

    this._updateLevel(state.level);
  }

  _onGameOver({ score, isRecord }) {
    this._overlay.showGameOver(
      { result: 'lose', score, isRecord },
      () => EventBus.emit('game:restart'),
    );
  }

  // ─── HUD ───────────────────────────────────────────────────────────

  _updateLevel(level) {
    const el = document.getElementById('pm-level');
    if (el && level) el.textContent = `NIVEAU ${level}`;
  }

  _setText(txt) {
    const el = document.getElementById('pm-status');
    if (el) el.textContent = txt;
  }

  // ─── RENDU CANVAS ──────────────────────────────────────────────────

  _drawFrame(state) {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const W   = 28 * CELL;
    const H   = 31 * CELL;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    if (!state.maze) return; // écran idle : couvert par GameOverlay

    this._drawMaze(ctx, state);

    if (state.status !== 'dying') {
      this._drawGhosts(ctx, state);
    }

    if (state.status === 'dying') {
      this._drawDying(ctx, state);
    } else {
      this._drawPacman(ctx, state);
    }

    if (state.status === 'ready') {
      this._drawCenteredText(ctx, W, H, 'PRÊT !', '#ffff00');
    }
    // Pause et fin de partie sont désormais affichés via GameOverlay (DOM partagé)
  }

  // ─── LABYRINTHE ────────────────────────────────────────────────────

  _drawMaze(ctx, state) {
    const maze  = state.maze;
    const flash = state.levelFlash;

    for (let r = 0; r < 31; r++) {
      for (let c = 0; c < 28; c++) {
        const cell = maze[r][c];
        const x    = c * CELL;
        const y    = r * CELL;

        if (cell === 1) {
          // Mur
          const wallColor = flash ? '#ffffff' : '#1a4ccc';
          ctx.fillStyle   = wallColor;
          ctx.fillRect(x, y, CELL, CELL);
          // Bordure intérieure lumineuse
          ctx.strokeStyle = flash ? '#aaaaff' : '#3a6cec';
          ctx.lineWidth   = 1;
          ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
        } else if (cell === 2) {
          // Pastille
          ctx.beginPath();
          ctx.arc(x + CELL / 2, y + CELL / 2, 2, 0, Math.PI * 2);
          ctx.fillStyle = '#ffb8ae';
          ctx.fill();
        } else if (cell === 3) {
          // Super-pastille (clignotement)
          const visible = Math.floor(Date.now() / 300) % 2 === 0;
          if (visible) {
            ctx.beginPath();
            ctx.arc(x + CELL / 2, y + CELL / 2, 5, 0, Math.PI * 2);
            ctx.fillStyle   = '#ffffff';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur  = 10;
            ctx.fill();
            ctx.shadowBlur  = 0;
          }
        }
      }
    }
  }

  // ─── PAC-MAN ───────────────────────────────────────────────────────

  _drawPacman(ctx, state) {
    const pm  = state.pacman;
    if (!pm) return;

    const t  = Math.min(Math.max(pm.progress, 0), 1);
    const px = (pm.prevCol + (pm.col - pm.prevCol) * t) * CELL + CELL / 2;
    const py = (pm.prevRow + (pm.row - pm.prevRow) * t) * CELL + CELL / 2;
    const r  = CELL / 2 - 1;

    const mouthMax  = Math.PI / 3;
    const mouthSize = pm.mouthOpen * mouthMax;

    const dirAngle = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
    const angle    = dirAngle[pm.dir] ?? 0;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, mouthSize, Math.PI * 2 - mouthSize);
    ctx.closePath();
    ctx.fillStyle   = '#ffff00';
    ctx.shadowColor = '#ffff00';
    ctx.shadowBlur  = 8;
    ctx.fill();
    ctx.shadowBlur  = 0;

    ctx.restore();
  }

  _drawDying(ctx, state) {
    const pm    = state.pacman;
    if (!pm) return;
    const elapsed = this.config.gameplay.deathDuration - pm.deathTimer;
    const ratio   = Math.min(elapsed / this.config.gameplay.deathDuration, 1);

    const px = pm.col * CELL + CELL / 2;
    const py = pm.row * CELL + CELL / 2;
    const r  = CELL / 2 - 1;

    // Bouche s'ouvre de plus en plus (ratio 0→1 : bouche fermée → grand ouvert)
    const mouthSize = ratio * Math.PI;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-Math.PI / 2);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, mouthSize, Math.PI * 2 - mouthSize);
    ctx.closePath();
    ctx.fillStyle   = `rgba(255,255,0,${1 - ratio * 0.5})`;
    ctx.shadowColor = '#ffff00';
    ctx.shadowBlur  = 8;
    ctx.fill();
    ctx.shadowBlur  = 0;

    ctx.restore();
  }

  // ─── FANTÔMES ──────────────────────────────────────────────────────

  _drawGhosts(ctx, state) {
    for (const g of state.ghosts) {
      if (g.mode === 'house' || g.mode === 'leaving') {
        this._drawGhostAt(ctx, g, g.col * CELL + CELL / 2, g.row * CELL + CELL / 2, state);
        continue;
      }
      const t  = Math.min(Math.max(g.progress, 0), 1);
      const gx = (g.prevCol + (g.col - g.prevCol) * t) * CELL + CELL / 2;
      const gy = (g.prevRow + (g.row - g.prevRow) * t) * CELL + CELL / 2;
      this._drawGhostAt(ctx, g, gx, gy, state);
    }
  }

  _drawGhostAt(ctx, g, cx, cy, state) {
    const r = CELL / 2 - 1;

    let bodyColor;
    if (g.mode === 'eaten') {
      // Juste les yeux
      this._drawGhostEyes(ctx, cx, cy, r, '#ffffff');
      return;
    } else if (g.mode === 'frightened') {
      bodyColor = state.frightenFlash ? '#ffffff' : '#2121de';
    } else {
      bodyColor = g.color;
    }

    ctx.save();
    ctx.translate(cx, cy);

    // Corps — demi-cercle + bas dentelé
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI, 0, false);
    // Bas dentelé (3 dents)
    const steps  = 3;
    const dw     = (r * 2) / steps;
    ctx.lineTo(r, r);
    for (let i = 0; i <= steps; i++) {
      const bx  = r - i * dw;
      const by  = i % 2 === 0 ? r : r - 5;
      ctx.lineTo(bx, by);
    }
    ctx.lineTo(-r, 0);
    ctx.closePath();

    ctx.fillStyle   = bodyColor;
    ctx.shadowColor = bodyColor;
    ctx.shadowBlur  = 6;
    ctx.fill();
    ctx.shadowBlur  = 0;

    // Yeux
    if (g.mode !== 'frightened') {
      this._drawGhostEyes(ctx, 0, 0, r, '#ffffff');
    } else {
      // Yeux effrayés
      ctx.fillStyle = '#ffb852';
      ctx.fillRect(-r / 2 - 3, -r / 3, 6, 4);
      ctx.fillRect( r / 2 - 3, -r / 3, 6, 4);
      // Bouche
      ctx.strokeStyle = '#ffb852';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(-r / 2, r / 5);
      ctx.lineTo(-r / 4, -r / 8);
      ctx.lineTo(0,      r / 5);
      ctx.lineTo( r / 4, -r / 8);
      ctx.lineTo( r / 2, r / 5);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawGhostEyes(ctx, ox, oy, r, white) {
    const eyeR  = r * 0.28;
    const pupR  = eyeR * 0.55;
    const eyeLx = -r * 0.35;
    const eyeRx =  r * 0.35;
    const eyeY  = -r * 0.2;

    ctx.fillStyle = white;
    ctx.beginPath();
    ctx.arc(ox + eyeLx, oy + eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ox + eyeRx, oy + eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2121de';
    ctx.beginPath();
    ctx.arc(ox + eyeLx + 1, oy + eyeY + 1, pupR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ox + eyeRx + 1, oy + eyeY + 1, pupR, 0, Math.PI * 2);
    ctx.fill();
  }

  // ─── TEXTE CENTRÉ ──────────────────────────────────────────────────

  _drawCenteredText(ctx, W, H, txt, color) {
    ctx.fillStyle   = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, H / 2 - 30, W, 44);
    ctx.textAlign   = 'center';
    ctx.fillStyle   = color;
    ctx.font        = 'bold 22px monospace';
    ctx.shadowColor = color;
    ctx.shadowBlur  = 18;
    ctx.fillText(txt, W / 2, H / 2);
    ctx.shadowBlur  = 0;
  }

  // ─── STYLES ────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('pm-styles')) return;
    const style = document.createElement('style');
    style.id    = 'pm-styles';
    style.textContent = `
      .pm-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.6rem;
        padding: 1rem;
        user-select: none;
      }

      .pm-hud {
        display: flex;
        align-items: center;
        justify-content: center;
        width: ${28 * CELL}px;
        max-width: 100%;
      }
      .pm-level {
        font-family: var(--font-display);
        font-size: 0.65rem;
        letter-spacing: 0.15em;
        color: var(--text-muted, #555);
      }

      .pm-canvas-wrap {
        position: relative;
        display: inline-block;
        line-height: 0;
      }
      #pm-canvas {
        display: block;
        max-width: 100%;
        border: 1px solid var(--color-border, #1e2a38);
        border-radius: 4px;
      }

      /* Écrans démarrage / pause / fin de partie : entièrement gérés par
         GameOverlay (js/ui/components/GameOverlay.js), monté sur .pm-canvas-wrap.
         Voir .ov-* dans index.html pour le CSS associé. */

      .pm-status {
        font-family: var(--font-display);
        font-size: var(--text-sm, 0.75rem);
        letter-spacing: 0.12em;
        color: var(--text-secondary, #aaa);
        min-height: 1.4em;
        text-align: center;
      }

    `;
    document.head.appendChild(style);
  }
}
