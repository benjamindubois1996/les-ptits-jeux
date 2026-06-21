/**
 * 2048Renderer.js — Rendu canvas du 2048
 * Emplacement : /games/2048/2048Renderer.js
 *
 * Responsabilités :
 *  - Construire le layout (barre de score + canvas)
 *  - Dessiner la grille et les tuiles colorées
 *  - Animer l'apparition (scale-in) et la fusion (pop) des tuiles
 *  - Afficher les overlays : idle, paused, won, gameover
 *  - Gérer le swipe tactile → moves
 *  - Gérer le resize de la fenêtre
 *
 * NE contient aucune logique de jeu.
 */

import EventBus    from '../../js/core/EventBus.js';
import GameOverlay  from '../../js/ui/components/GameOverlay.js';

export default class Game2048Renderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    this._canvas     = null;
    this._ctx        = null;
    this._wrapper    = null;
    this._bestEl     = null;
    this._rafId      = null;

    // Dimensions calculées
    this._tileSize = 0;
    this._gap      = 0;
    this._offsetX  = 0;
    this._offsetY  = 0;

    // Animations : { row, col, value, type: 'appear'|'merge', startTime }
    this._animations = [];

    // Swipe tactile
    this._touchStart = null;

    // Suivi de transition pour ne (re)construire l'overlay qu'au changement de statut
    this._lastOverlayStatus = 'idle';
    this._winShown          = false;

    // Bindings
    this._onTick    = this._onTick.bind(this);
    this._onResize  = this._onResize.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = () => this._overlay.showPause(() => EventBus.emit('game:pause-toggle'));
    this._onResumed = () => this._overlay.hide();
    this._render    = this._render.bind(this);
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init() {
    this._buildLayout();
    this._bindEvents();
    this._resize();
    this._startRenderLoop();
  }

  destroy() {
    this._stopRenderLoop();
    EventBus.off('game:tick',   this._onTick);
    EventBus.off('game:won',    this._onWon);
    EventBus.off('game:over',   this._onOver);
    EventBus.off('game:paused', this._onPaused);
    EventBus.off('game:resumed',this._onResumed);
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
      justify-content: center;
      padding: 12px;
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      gap: 10px;
    `;

    // --- Barre de scores (BEST uniquement — score dans le header GameShell) ---
    const scoreBar = document.createElement('div');
    scoreBar.style.cssText = `
      display: flex;
      justify-content: flex-end;
      align-items: center;
      width: 100%;
      max-width: 480px;
      flex-shrink: 0;
    `;

    this._bestEl = this._makeScoreBox('BEST', '0', ui);

    scoreBar.appendChild(this._bestEl.container);

    // --- Canvas ---
    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = `
      display: block;
      border-radius: 6px;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    `;
    this._ctx = this._canvas.getContext('2d');

    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'position:relative;display:inline-block;line-height:0;';
    canvasWrap.appendChild(this._canvas);

    // Swipe tactile
    this._canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: false });

    this._canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (!this._touchStart) return;
      const dx = e.changedTouches[0].clientX - this._touchStart.x;
      const dy = e.changedTouches[0].clientY - this._touchStart.y;
      this._touchStart = null;

      const threshold = 30;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        this.game.move(dx > 0 ? 'right' : 'left');
      } else {
        this.game.move(dy > 0 ? 'down' : 'up');
      }
    }, { passive: false });

    this._wrapper.appendChild(scoreBar);
    this._wrapper.appendChild(canvasWrap);
    this.viewport.appendChild(this._wrapper);

    this._overlay = new GameOverlay(this.viewport);
    this._showStartScreen();
  }

  _showStartScreen() {
    const optionGroups = [
      { key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] },
    ];
    this._overlay.showStart(optionGroups, () => this.game.start());
  }

  _makeScoreBox(label, value, ui) {
    const container = document.createElement('div');
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      min-width: 80px;
    `;

    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      font-family: ${ui.fontFamily};
      font-size: 9px;
      color: ${ui.mutedColor};
      letter-spacing: 0.15em;
    `;

    const valueEl = document.createElement('div');
    valueEl.textContent = value;
    valueEl.style.cssText = `
      font-family: ${ui.fontFamily};
      font-size: 18px;
      font-weight: bold;
      color: ${ui.primaryColor};
      text-shadow: 0 0 10px ${ui.primaryColor}80;
      transition: transform 0.1s ease;
    `;

    container.appendChild(labelEl);
    container.appendChild(valueEl);
    return { container, valueEl };
  }

  /* ============================================================
     ÉVÉNEMENTS
     ============================================================ */

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:won',    this._onWon);
    EventBus.on('game:over',   this._onOver);
    EventBus.on('game:paused', this._onPaused);
    EventBus.on('game:resumed',this._onResumed);
    window.addEventListener('resize', this._onResize);
  }

  _onTick({ state, newTile, merged }) {
    EventBus.emit('game:score-update', { score: state.score });
    this._bestEl.valueEl.textContent = state.best.toLocaleString('fr-FR');

    // Animation pop sur les cases fusionnées
    if (merged && merged.length > 0) {
      merged.forEach(({ row, col, value }) => {
        this._animations.push({ row, col, value, type: 'merge', startTime: performance.now() });
      });
    }

    // Animation apparition sur la nouvelle tuile
    if (newTile) {
      this._animations.push({
        row: newTile.row, col: newTile.col, value: newTile.value,
        type: 'appear', startTime: performance.now()
      });
    }
  }

  _onWon() {
    // Le rendu de l'interstitiel "2048 !" est géré dans _render() (_syncOverlay)
  }

  _onOver({ score, isRecord }) {
    this._overlay.showGameOver(
      { result: 'lose', score, isRecord },
      () => EventBus.emit('game:restart'),
    );
  }

  _onResize() { this._resize(); }

  /* ============================================================
     DIMENSIONS
     ============================================================ */

  _resize() {
    const rect = this._canvas.parentElement
      ? this._canvas.parentElement.getBoundingClientRect()
      : null;

    // Taille disponible : 90% du plus petit côté du viewport, max 460px
    const vw   = window.innerWidth;
    const vh   = window.innerHeight - 100; // réserver la barre de scores
    const side = Math.min(Math.min(vw, vh) * 0.90, 460);

    this._canvas.width  = side;
    this._canvas.height = side;
    this._canvas.style.width  = `${side}px`;
    this._canvas.style.height = `${side}px`;

    const n = 4;
    this._gap      = Math.round(side * 0.018);
    this._tileSize = (side - this._gap * (n + 1)) / n;
    this._offsetX  = this._gap;
    this._offsetY  = this._gap;
  }

  /* ============================================================
     BOUCLE DE RENDU
     ============================================================ */

  _startRenderLoop() {
    const loop = () => {
      this._render();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _stopRenderLoop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  _render() {
    const ctx   = this._ctx;
    const state = this.game.state;
    const now   = performance.now();

    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

    // Fond général
    ctx.fillStyle = this.config.theme.canvas.backgroundColor;
    this._roundRect(ctx, 0, 0, this._canvas.width, this._canvas.height, 8);
    ctx.fill();

    // Cellules vides
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        this._drawTileBg(ctx, r, c);

    // Tuiles avec valeur (hors animations)
    const animatedCells = new Set(this._animations.map(a => `${a.row},${a.col}`));
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        const val = state.grid[r][c];
        if (val > 0 && !animatedCells.has(`${r},${c}`))
          this._drawTile(ctx, r, c, val, 1.0);
      }

    // Animations
    this._animations = this._animations.filter(anim => {
      const elapsed  = now - anim.startTime;
      const duration = anim.type === 'appear' ? 150 : 200;
      const t        = Math.min(elapsed / duration, 1);
      let scale;

      if (anim.type === 'appear') {
        scale = this._easeOut(t);
      } else {
        // pop : 1 → 1.2 → 1
        scale = t < 0.5
          ? 1 + 0.2 * (t / 0.5)
          : 1.2 - 0.2 * ((t - 0.5) / 0.5);
      }

      this._drawTile(ctx, anim.row, anim.col, anim.value, scale);
      return t < 1;
    });

    this._syncOverlay(state);
  }

  /* ============================================================
     OVERLAY (démarrage / pause / fin de partie / interstitiel 2048)
     ============================================================ */

  _syncOverlay(state) {
    // Interstitiel "2048 atteint" — indépendant du statut (reste 'playing')
    const shouldShowWin = state.status === 'playing' && state.won && !state.wonAcknowledged;
    if (shouldShowWin && !this._winShown) {
      this._winShown = true;
      this._showWinInterstitial();
      return;
    }
    if (!shouldShowWin) this._winShown = false;

    if (state.status === this._lastOverlayStatus) return;
    this._lastOverlayStatus = state.status;

    switch (state.status) {
      case 'idle':    this._showStartScreen(); break;
      case 'playing': this._overlay.hide();    break;
      // 'paused' et 'gameover' sont gérés par les events game:paused / game:over
    }
  }

  _showWinInterstitial() {
    this._overlay.el.innerHTML = `
      <div class="overlay-icon">🎉</div>
      <div class="overlay-title" style="color:var(--neon-yellow)">2048 !</div>
      <div class="overlay-score">Tu as réussi ! Continue ?</div>
      <div class="overlay-actions">
        <button class="ov-play-btn" id="ov-continue-btn">CONTINUER</button>
        <button class="btn btn-ghost" id="ov-newgame-btn">NOUVEAU JEU</button>
      </div>
    `;
    this._overlay.el.querySelector('#ov-continue-btn')?.addEventListener('click', () => {
      this.game.continueAfterWin();
      this._overlay.hide();
    });
    this._overlay.el.querySelector('#ov-newgame-btn')?.addEventListener('click', () => {
      EventBus.emit('game:restart');
    });
    this._overlay.show();
  }

  /* ============================================================
     DESSIN DES TUILES
     ============================================================ */

  _drawTileBg(ctx, r, c) {
    const { x, y, s } = this._tileRect(r, c);
    ctx.fillStyle = this.config.theme.tiles.emptyColor;
    this._roundRect(ctx, x, y, s, s, this.config.theme.tiles.cornerRadius);
    ctx.fill();
  }

  _drawTile(ctx, r, c, value, scale) {
    const { x, y, s } = this._tileRect(r, c);
    const colors = this.config.theme.tiles.colors;
    const key    = String(value);
    const col    = colors[key] || colors['2048'];
    const ui     = this.config.theme.ui;

    const cx = x + s / 2;
    const cy = y + s / 2;
    const ss = s * scale;

    ctx.save();
    ctx.translate(cx, cy);

    // Fond
    ctx.fillStyle = col.bg;
    if (col.glow) {
      ctx.shadowColor = col.glow;
      ctx.shadowBlur  = 20;
    }
    this._roundRect(ctx, -ss/2, -ss/2, ss, ss, this.config.theme.tiles.cornerRadius);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Texte
    if (col.text !== 'transparent') {
      const fontSize = value <= 64   ? ss * 0.42
                     : value <= 512  ? ss * 0.36
                     : value <= 4096 ? ss * 0.28
                     :                 ss * 0.22;

      ctx.fillStyle    = col.text;
      ctx.font         = `bold ${fontSize}px ${ui.fontFamily}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';

      if (col.glow) {
        ctx.shadowColor = col.glow;
        ctx.shadowBlur  = 12;
      }
      ctx.fillText(String(value), 0, 0);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  /* Les écrans démarrage / pause / fin de partie / interstitiel 2048 sont
     gérés par GameOverlay (js/ui/components/GameOverlay.js) — voir _syncOverlay(). */

  /* ============================================================
     UTILITAIRES GÉOMÉTRIQUES
     ============================================================ */

  _tileRect(r, c) {
    const s = this._tileSize;
    const g = this._gap;
    return {
      x: this._offsetX + c * (s + g),
      y: this._offsetY + r * (s + g),
      s,
    };
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }
}
