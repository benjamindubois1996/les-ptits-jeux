/**
 * SpaceInvadersRenderer.js — Rendu canvas de Space Invaders
 * Emplacement : /games/space-invaders/SpaceInvadersRenderer.js
 *
 * Responsabilités :
 *  - Boucle RAF : appelle game.update(dt) puis dessine
 *  - Mise à l'échelle du monde logique (660×720) → viewport
 *  - Fond étoilé animé, HUD, aliens animés, boucliers, effets
 *  - Overlays (démarrage/pause/niveau/fin) via GameOverlay (module partagé)
 *
 * NE contient aucune logique de jeu.
 */

import EventBus    from '../../js/core/EventBus.js';
import GameOverlay  from '../../js/ui/components/GameOverlay.js';

export default class SpaceInvadersRenderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    this._canvas   = null;
    this._ctx      = null;
    this._wrapper  = null;
    this._rafId    = null;
    this._scale    = 1;
    this._lastTime = 0;

    // Étoiles (positions dans le monde logique)
    this._stars = Array.from({ length: 90 }, () => ({
      x:       Math.random() * 660,
      y:       Math.random() * 720,
      r:       Math.random() * 1.4 + 0.3,
      opacity: Math.random() * 0.5 + 0.25,
    }));

    // Animation des aliens : bascule entre frame 0 et 1 toutes les ~0.5s
    this._alienFrame      = 0;
    this._alienFrameTimer = 0;

    // Suivi de transition pour ne (re)construire l'overlay qu'au changement de statut
    this._lastOverlayStatus = null;

    // Bindings
    this._render   = this._render.bind(this);
    this._onResize = this._onResize.bind(this);
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init() {
    this._buildLayout();
    this._resize();
    window.addEventListener('resize', this._onResize);
    this._startRenderLoop();
  }

  destroy() {
    this._stopRenderLoop();
    window.removeEventListener('resize', this._onResize);
    this._overlay?.destroy();
    if (this._wrapper) this._wrapper.remove();
  }

  /* ============================================================
     LAYOUT
     ============================================================ */

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.style.cssText = `
      display:         flex;
      align-items:     center;
      justify-content: center;
      width:           100%;
      height:          100%;
      background:      ${this.config.theme.canvas.backgroundColor};
      overflow:        hidden;
    `;

    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = `
      display:          block;
      image-rendering:  pixelated;
      user-select:      none;
      -webkit-user-select: none;
    `;
    this._ctx = this._canvas.getContext('2d');

    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'position:relative;display:inline-block;line-height:0;';
    canvasWrap.appendChild(this._canvas);
    this._wrapper.appendChild(canvasWrap);
    this.viewport.appendChild(this._wrapper);

    this._overlay = new GameOverlay(this.viewport);
    this._showStartScreen();
  }

  _showStartScreen() {
    const optionGroups = [
      { key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] },
    ];
    this._overlay.showStart(optionGroups, () => this.game.start(1), {
      extraHtml: '<div class="overlay-score">← → pour bouger · ESPACE pour tirer</div>',
    });
  }

  _onResize() { this._resize(); }

  _resize() {
    const vw = this.viewport.clientWidth  || window.innerWidth;
    const vh = this.viewport.clientHeight || window.innerHeight;
    const W  = this.config.world.W;
    const H  = this.config.world.H;

    this._scale = Math.min(vw / W, vh / H) * 0.97;

    this._canvas.width  = Math.floor(W * this._scale);
    this._canvas.height = Math.floor(H * this._scale);
    this._canvas.style.width  = `${this._canvas.width}px`;
    this._canvas.style.height = `${this._canvas.height}px`;
  }

  /* ============================================================
     BOUCLE DE RENDU
     ============================================================ */

  _startRenderLoop() {
    const loop = (now) => {
      const dt = Math.min((now - (this._lastTime || now)) / 1000, 0.05);
      this._lastTime = now;

      // Basculer le frame d'animation des aliens
      this._alienFrameTimer += dt;
      if (this._alienFrameTimer >= 0.5) {
        this._alienFrame      = 1 - this._alienFrame;
        this._alienFrameTimer = 0;
      }

      this.game.update(dt);
      this._render();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _stopRenderLoop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  /* ============================================================
     RENDU PRINCIPAL
     ============================================================ */

  _render() {
    const ctx   = this._ctx;
    const state = this.game.state;
    const sc    = this._scale;
    const W     = this.config.world.W;
    const H     = this.config.world.H;
    const theme = this.config.theme;

    ctx.save();
    ctx.scale(sc, sc);

    // Fond
    ctx.fillStyle = theme.canvas.backgroundColor;
    ctx.fillRect(0, 0, W, H);

    // Étoiles
    this._drawStars(ctx);

    // Ligne de sol
    const groundY = this.config.world.playerY + this.config.world.playerH + 8;
    ctx.strokeStyle = theme.ui.mutedColor;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();

    // HUD toujours visible
    this._drawHUD(ctx, state);

    // Éléments de jeu selon le statut
    const showAliens  = true;
    const showShields = true;
    const showPlayer  = state.status !== 'gameover';
    const showBullets = state.status === 'playing';

    if (showAliens)  this._drawAlienGrid(ctx, state);
    if (showShields) this._drawShields(ctx, state);
    if (showPlayer)  this._drawPlayer(ctx, state);
    if (showBullets) {
      this._drawPlayerBullet(ctx, state);
      this._drawAlienBullets(ctx, state);
    }

    this._drawMystery(ctx, state);
    this._drawExplosions(ctx, state);

    this._syncOverlay(state);

    ctx.restore();
  }

  /* ============================================================
     OVERLAY (démarrage / pause / niveau / fin de partie)
     ============================================================ */

  _syncOverlay(state) {
    if (state.status === this._lastOverlayStatus) return;
    this._lastOverlayStatus = state.status;

    switch (state.status) {
      case 'playing':
        this._overlay.hide();
        break;
      case 'paused':
        this._overlay.showPause(() => EventBus.emit('game:pause-toggle'));
        break;
      case 'levelup':
        this._overlay.el.innerHTML = `
          <div class="overlay-icon">🚀</div>
          <div class="overlay-title">NIVEAU ${state.level} !</div>
          <div class="overlay-score">+1 vie · Prépare-toi…</div>
        `;
        this._overlay.show();
        break;
      case 'gameover':
        this._overlay.showGameOver(
          { result: 'lose', score: state.score, isRecord: state.score > 0 && state.score >= state.best },
          () => EventBus.emit('game:restart'),
        );
        break;
    }
  }

  /* ============================================================
     ÉTOILES
     ============================================================ */

  _drawStars(ctx) {
    for (const s of this._stars) {
      ctx.fillStyle = `rgba(255,255,255,${s.opacity})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ============================================================
     HUD
     ============================================================ */

  _drawHUD(ctx, state) {
    const ui = this.config.theme.ui;
    const W  = this.config.world.W;

    ctx.textBaseline = 'top';
    ctx.shadowBlur   = 0;

    // — Score (gauche)
    ctx.font      = `bold 11px ${ui.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = ui.mutedColor;
    ctx.fillText('SCORE', 20, 10);

    ctx.font        = `bold 17px ${ui.fontFamily}`;
    ctx.fillStyle   = ui.primaryColor;
    ctx.shadowColor = ui.primaryColor;
    ctx.shadowBlur  = 8;
    ctx.fillText(state.score.toString(), 20, 24);
    ctx.shadowBlur = 0;

    // — Best (centre)
    ctx.font      = `bold 11px ${ui.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = ui.mutedColor;
    ctx.fillText('BEST', W / 2, 10);

    ctx.font        = `bold 17px ${ui.fontFamily}`;
    ctx.fillStyle   = ui.primaryColor;
    ctx.shadowColor = ui.primaryColor;
    ctx.shadowBlur  = 6;
    ctx.fillText(state.best.toString(), W / 2, 24);
    ctx.shadowBlur = 0;

    // — Level (droite)
    ctx.font      = `bold 11px ${ui.fontFamily}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = ui.mutedColor;
    ctx.fillText('LEVEL', W - 20, 10);

    ctx.font        = `bold 17px ${ui.fontFamily}`;
    ctx.fillStyle   = ui.accentColor;
    ctx.shadowColor = ui.accentColor;
    ctx.shadowBlur  = 8;
    ctx.fillText(state.level.toString(), W - 20, 24);
    ctx.shadowBlur = 0;

    // — Vies (icônes vaisseaux en bas)
    this._drawLivesIcons(ctx, state);
  }

  _drawLivesIcons(ctx, state) {
    const w  = this.config.world;
    const ui = this.config.theme.ui;

    ctx.fillStyle   = ui.primaryColor;
    ctx.shadowColor = ui.primaryColor;
    ctx.shadowBlur  = 6;

    for (let i = 0; i < state.lives; i++) {
      const cx = 24 + i * 26;
      const cy = w.playerY + w.playerH + 18;
      this._drawShipShape(ctx, cx, cy, 14, 10);
    }
    ctx.shadowBlur = 0;
  }

  /* ============================================================
     ALIENS
     ============================================================ */

  _drawAlienGrid(ctx, state) {
    const w = this.config.world;

    for (const alien of state.aliens) {
      if (!alien.alive) continue;

      const ax = w.alienX0 + alien.col * w.alienColGap + state.groupOffsetX;
      const ay = w.alienY0 + alien.row * w.alienRowGap + state.groupOffsetY;

      ctx.save();
      this._drawAlien(ctx, ax, ay, w.alienW, w.alienH, alien.type, this._alienFrame);
      ctx.restore();
    }
  }

  _drawAlien(ctx, x, y, aw, ah, type, frame) {
    const cx = x + aw / 2;
    const cy = y + ah / 2;
    const bg = this.config.theme.canvas.backgroundColor;

    let color;
    if (type === 'top')     color = '#00ffcc';
    else if (type === 'mid') color = '#00ffe1';
    else                     color = '#33ffaa';

    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 10;

    if (type === 'top') {
      // Squid — corps fin + antennes + tentacules animées
      ctx.fillRect(cx - 4,  y + 2,  8,  ah - 6);
      ctx.fillRect(cx - 9,  cy - 3, 18, 6);
      ctx.fillRect(cx - 7,  y,      4,  3);   // antenne gauche
      ctx.fillRect(cx + 3,  y,      4,  3);   // antenne droite
      if (frame === 0) {
        ctx.fillRect(cx - 10, y + ah - 6, 4, 6);
        ctx.fillRect(cx + 6,  y + ah - 6, 4, 6);
      } else {
        ctx.fillRect(cx - 8,  y + ah - 5, 4, 5);
        ctx.fillRect(cx + 4,  y + ah - 5, 4, 5);
      }

    } else if (type === 'mid') {
      // Crab — large corps + pattes latérales + yeux
      ctx.fillRect(cx - 13, cy - 4, 26, 8);
      ctx.fillRect(cx - 8,  y + 2,  16, ah - 4);
      // yeux (négatif)
      ctx.fillStyle = bg;
      ctx.fillRect(cx - 7, cy - 3, 4, 4);
      ctx.fillRect(cx + 3, cy - 3, 4, 4);
      ctx.fillStyle = color;
      // pattes
      if (frame === 0) {
        ctx.fillRect(cx - 15, y + ah - 8, 4, 8);
        ctx.fillRect(cx + 11, y + ah - 8, 4, 8);
      } else {
        ctx.fillRect(cx - 13, y + ah - 6, 4, 6);
        ctx.fillRect(cx + 9,  y + ah - 6, 4, 6);
      }

    } else {
      // Octopus — corps rond + tentacules + yeux
      ctx.fillRect(cx - 10, y + 2,  20, ah - 4);
      ctx.fillRect(cx - 12, cy - 2, 24, 8);
      // yeux
      ctx.fillStyle = bg;
      ctx.fillRect(cx - 6, cy - 2, 3, 4);
      ctx.fillRect(cx + 3, cy - 2, 3, 4);
      ctx.fillStyle = color;
      // tentacules
      if (frame === 0) {
        ctx.fillRect(cx - 12, y + ah - 4, 3, 4);
        ctx.fillRect(cx - 4,  y + ah - 4, 3, 4);
        ctx.fillRect(cx + 1,  y + ah - 4, 3, 4);
        ctx.fillRect(cx + 9,  y + ah - 4, 3, 4);
      } else {
        ctx.fillRect(cx - 10, y + ah - 4, 3, 4);
        ctx.fillRect(cx - 2,  y + ah - 4, 3, 4);
        ctx.fillRect(cx + 3,  y + ah - 4, 3, 4);
        ctx.fillRect(cx + 7,  y + ah - 4, 3, 4);
      }
    }
  }

  /* ============================================================
     JOUEUR
     ============================================================ */

  _drawPlayer(ctx, state) {
    const w  = this.config.world;
    const p  = state.player;
    const ui = this.config.theme.ui;

    // Clignotement pendant l'invincibilité
    if (p.invincible && Math.floor(p.invTimer / 140) % 2 === 0) return;

    ctx.fillStyle   = ui.primaryColor;
    ctx.shadowColor = ui.primaryColor;
    ctx.shadowBlur  = 16;

    this._drawShipShape(ctx, p.x + w.playerW / 2, w.playerY + w.playerH / 2, w.playerW, w.playerH);
    ctx.shadowBlur = 0;
  }

  _drawShipShape(ctx, cx, cy, w, h) {
    // Triangle pointant vers le haut
    ctx.beginPath();
    ctx.moveTo(cx, cy - h / 2);
    ctx.lineTo(cx + w / 2, cy + h / 2);
    ctx.lineTo(cx - w / 2, cy + h / 2);
    ctx.closePath();
    ctx.fill();
    // Canon
    ctx.fillRect(cx - 2, cy - h / 2 - 5, 4, 6);
  }

  /* ============================================================
     TIRS
     ============================================================ */

  _drawPlayerBullet(ctx, state) {
    const b  = state.playerBullet;
    if (!b.active) return;
    const w  = this.config.world;

    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur  = 10;
    ctx.fillRect(b.x, b.y, w.bulletW, w.playerBulletH);
    ctx.shadowBlur = 0;
  }

  _drawAlienBullets(ctx, state) {
    const w = this.config.world;

    ctx.fillStyle   = '#ff4040';
    ctx.shadowColor = '#ff2020';
    ctx.shadowBlur  = 10;

    for (const b of state.alienBullets) {
      if (b.dead) continue;
      const bw = w.bulletW;
      const bh = w.alienBulletH;
      // Forme zigzag (classique Space Invaders)
      ctx.fillRect(b.x,        b.y,              bw,      bh * 0.35);
      ctx.fillRect(b.x + bw,   b.y + bh * 0.25,  bw,      bh * 0.35);
      ctx.fillRect(b.x,        b.y + bh * 0.5,   bw,      bh * 0.35);
      ctx.fillRect(b.x + bw,   b.y + bh * 0.75,  bw,      bh * 0.25);
    }
    ctx.shadowBlur = 0;
  }

  /* ============================================================
     VAISSEAU MYSTÈRE
     ============================================================ */

  _drawMystery(ctx, state) {
    const m  = state.mystery;
    const w  = this.config.world;
    const ui = this.config.theme.ui;

    if (!m.active && !m.showPoints) return;

    // Affichage des points après destruction
    if (m.showPoints) {
      ctx.font         = `bold 14px ${ui.fontFamily}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = ui.dangerColor;
      ctx.shadowColor  = ui.dangerColor;
      ctx.shadowBlur   = 12;
      ctx.fillText(`+${m.points}`, m.lastX + w.mysteryW / 2, w.mysteryY + w.mysteryH / 2);
      ctx.shadowBlur = 0;
      return;
    }

    // Dessin du vaisseau mystère
    const mx = m.x;
    const my = m.y;
    const mw = w.mysteryW;
    const mh = w.mysteryH;
    const mcx = mx + mw / 2;

    ctx.fillStyle   = '#ff2d78';
    ctx.shadowColor = '#ff2d78';
    ctx.shadowBlur  = 18;

    // Corps
    ctx.fillRect(mx + 6, my + mh * 0.45, mw - 12, mh * 0.55);
    ctx.fillRect(mx + 2, my + mh * 0.2,  mw - 4,  mh * 0.5);
    ctx.fillRect(mcx - 9, my,            18,       mh * 0.45);

    // Hublots
    ctx.fillStyle = '#ff88bb';
    ctx.fillRect(mcx - 14, my + mh * 0.45, 4, 4);
    ctx.fillRect(mcx - 2,  my + mh * 0.45, 4, 4);
    ctx.fillRect(mcx + 10, my + mh * 0.45, 4, 4);

    ctx.shadowBlur = 0;
  }

  /* ============================================================
     BOUCLIERS
     ============================================================ */

  _drawShields(ctx, state) {
    const w  = this.config.world;
    const cs = w.shieldCellSize;

    for (const shield of state.shields) {
      const rows = shield.cells.length;
      const cols = shield.cells[0].length;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!shield.cells[r][c]) continue;

          // Couleur selon la rangée : haut = vert, bas = rouge
          const ratio = 1 - r / rows;
          if (ratio > 0.6) {
            ctx.fillStyle   = '#00ff88';
            ctx.shadowColor = '#00ff88';
          } else if (ratio > 0.3) {
            ctx.fillStyle   = '#ffaa00';
            ctx.shadowColor = '#ffaa00';
          } else {
            ctx.fillStyle   = '#ff4444';
            ctx.shadowColor = '#ff4444';
          }
          ctx.shadowBlur = 4;
          ctx.fillRect(
            shield.x + c * cs,
            shield.y + r * cs,
            cs - 1,
            cs - 1
          );
        }
      }
    }
    ctx.shadowBlur = 0;
  }

  /* ============================================================
     EXPLOSIONS
     ============================================================ */

  _drawExplosions(ctx, state) {
    for (const exp of state.explosions) {
      const progress = 1 - exp.timer / exp.maxTimer;
      const radius   = 4 + progress * 22;
      const alpha    = 1 - progress;

      ctx.strokeStyle = `rgba(255, 190, 0, ${alpha})`;
      ctx.lineWidth   = 2;
      ctx.shadowColor = `rgba(255, 130, 0, ${alpha})`;
      ctx.shadowBlur  = 12;

      ctx.beginPath();
      ctx.arc(exp.x, exp.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Particules radiales
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + progress;
        const pr    = radius * 0.75;
        ctx.fillStyle = `rgba(255, 180, 0, ${alpha * 0.8})`;
        ctx.beginPath();
        ctx.arc(
          exp.x + Math.cos(angle) * pr,
          exp.y + Math.sin(angle) * pr,
          2, 0, Math.PI * 2
        );
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
    ctx.lineWidth  = 1;
  }

}
