/**
 * SnakeRenderer.js — Rendu canvas du Snake
 * Emplacement : /games/snake/SnakeRenderer.js
 *
 * Responsabilités :
 *  - Créer et dimensionner le canvas dans le viewport GameShell
 *  - Écouter les events du Snake (tick, eat, gameover...)
 *  - Dessiner : grille, serpent néon, nourriture, obstacles, combo
 *  - Gérer le resize de la fenêtre
 *  - Animer : pulsation nourriture, flash eat, death shake
 *
 * NE contient aucune logique de jeu — lit uniquement this.game.state
 */

import EventBus    from '../../js/core/EventBus.js';
import GameOverlay  from '../../js/ui/components/GameOverlay.js';

export default class SnakeRenderer {

  /**
   * @param {Snake}       game      — instance logique
   * @param {HTMLElement} viewport  — conteneur fourni par GameShell
   * @param {Object}      config    — snake.config.json
   */
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    // Canvas
    this.canvas  = null;
    this.ctx     = null;
    this.cellSize = 0;

    // Animation
    this._rafId        = null;
    this._pulsePhase   = 0;
    this._flashAlpha   = 0;      // flash vert au moment de manger
    this._shakeFrames  = 0;      // secousse à la mort
    this._eatParticles = [];     // particules au moment de manger

    // Suivi de transition pour ne (re)construire l'overlay qu'au changement de statut
    this._lastOverlayStatus = 'idle';

    // Bind des handlers EventBus pour pouvoir les détacher
    this._onTick        = this._onTick.bind(this);
    this._onEat         = this._onEat.bind(this);
    this._onGameOver    = this._onGameOver.bind(this);
    this._onReady       = this._onReady.bind(this);
    this._onResize      = this._onResize.bind(this);
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init() {
    this._createCanvas();
    this._bindEvents();
    this._startRenderLoop();

    // Dessiner l'écran d'attente immédiatement
    this._drawIdleScreen();

    this._overlay = new GameOverlay(this.viewport);
    this._showStartScreen();
  }

  destroy() {
    this._stopRenderLoop();
    this._unbindEvents();
    this._overlay?.destroy();
    if (this._canvasWrap) this._canvasWrap.remove();
    window.removeEventListener('resize', this._onResize);
  }

  _showStartScreen() {
    const optionGroups = [
      { key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] },
    ];
    this._overlay.showStart(optionGroups, () => this.game.start());
  }

  /* ============================================================
     CANVAS — CRÉATION & RESIZE
     ============================================================ */

  _createCanvas() {
    this._canvasWrap = document.createElement('div');
    this._canvasWrap.style.cssText = 'position:relative;display:inline-block;line-height:0;';

    this.canvas = document.createElement('canvas');
    this.canvas.style.display     = 'block';
    this.canvas.style.imageRendering = 'pixelated';
    this._canvasWrap.appendChild(this.canvas);
    this.viewport.appendChild(this._canvasWrap);

    this.ctx = this.canvas.getContext('2d');
    this._resize();

    window.addEventListener('resize', this._onResize);
  }

  _resize() {
    const vw = this.viewport.clientWidth  || 500;
    const vh = this.viewport.clientHeight || 500;
    const size = Math.min(vw, vh);

    const gridSize = this.config.gameplay.gridSize;
    this.cellSize  = Math.floor(size / gridSize);

    const canvasSize = this.cellSize * gridSize;
    this.canvas.width  = canvasSize;
    this.canvas.height = canvasSize;
    this.canvas.style.width  = canvasSize + 'px';
    this.canvas.style.height = canvasSize + 'px';
  }

  _onResize() {
    this._resize();
    // Redessiner immédiatement après resize
    this._draw();
  }

  /* ============================================================
     EVENTS
     ============================================================ */

  _bindEvents() {
    EventBus.on('game:tick',     this._onTick);
    EventBus.on('game:eat',      this._onEat);
    EventBus.on('game:over',     this._onGameOver);
    EventBus.on('game:ready',    this._onReady);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:eat',     this._onEat);
    EventBus.off('game:over',    this._onGameOver);
    EventBus.off('game:ready',   this._onReady);
    window.removeEventListener('resize', this._onResize);
  }

  _onReady()              { this._drawIdleScreen(); }
  _onTick({ ate })        { /* le render loop dessine en continu */ }
  _onGameOver()           { this._shakeFrames = 18; }

  _onEat({ points, multiplier, combo }) {
    // Flash vert
    this._flashAlpha = 0.18;

    // Particules à la position de la nourriture
    const food     = this.game.state.food;
    const cx       = food.x * this.cellSize + this.cellSize / 2;
    const cy       = food.y * this.cellSize + this.cellSize / 2;
    this._spawnParticles(cx, cy, points, combo);
  }

  /* ============================================================
     RENDER LOOP
     ============================================================ */

  _startRenderLoop() {
    const loop = (timestamp) => {
      this._pulsePhase = timestamp;
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
    this._syncOverlay(state);

    if (state.status === 'idle') {
      this._drawIdleScreen();
      return;
    }

    const ctx    = this.ctx;
    const canvas = this.canvas;

    // Shake effet mort
    ctx.save();
    if (this._shakeFrames > 0) {
      const intensity = this._shakeFrames * 0.4;
      ctx.translate(
        (Math.random() - 0.5) * intensity,
        (Math.random() - 0.5) * intensity
      );
      this._shakeFrames--;
    }

    // Fond
    this._drawBackground();

    // Grille
    this._drawGrid();

    // Obstacles
    this._drawObstacles(state.obstacles);

    // Nourriture
    this._drawFood(state.food, state.foodEmoji);

    // Serpent
    this._drawSnake(state.snake, state.direction);

    // Flash eat
    if (this._flashAlpha > 0) {
      ctx.fillStyle = `rgba(0,255,136,${this._flashAlpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      this._flashAlpha = Math.max(0, this._flashAlpha - 0.012);
    }

    // Particules
    this._drawParticles();

    // Combo HUD
    if (state.status === 'playing' && state.combo > 0) {
      this._drawComboHUD(state.combo);
    }

    ctx.restore();
  }

  /* ============================================================
     DRAW — FOND & GRILLE
     ============================================================ */

  _drawBackground() {
    const canvasTheme = this.config.theme.canvas;
    this.ctx.fillStyle = canvasTheme.backgroundColor || '#05080f';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _drawGrid() {
    const canvasTheme = this.config.theme.canvas;
    if (!canvasTheme.gridVisible) return;

    const ctx  = this.ctx;
    const cs   = this.cellSize;
    const size = this.game.state.gridSize;

    ctx.strokeStyle = canvasTheme.gridColor || 'rgba(0,255,225,0.04)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();

    for (let i = 0; i <= size; i++) {
      ctx.moveTo(i * cs, 0);
      ctx.lineTo(i * cs, size * cs);
      ctx.moveTo(0, i * cs);
      ctx.lineTo(size * cs, i * cs);
    }
    ctx.stroke();

    // Bordure extérieure
    if (canvasTheme.borderGlow) {
      ctx.strokeStyle = canvasTheme.borderColor || 'rgba(0,255,225,0.2)';
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = this.config.theme.snake.neon?.glowColor || 'rgba(0,255,225,0.4)';
      ctx.shadowBlur  = 8;
      ctx.strokeRect(0.75, 0.75, this.canvas.width - 1.5, this.canvas.height - 1.5);
      ctx.shadowBlur  = 0;
    }
  }

  /* ============================================================
     DRAW — SERPENT
     ============================================================ */

  _drawSnake(snake, direction) {
    if (!snake || snake.length === 0) return;

    const snakeCfg  = this._getSnakeTheme();
    const cs        = this.cellSize;
    const ctx       = this.ctx;
    const pad       = 1; // padding interne cellule

    snake.forEach((seg, idx) => {
      const isHead = idx === 0;
      const t      = idx / (snake.length - 1 || 1); // 0 = tête, 1 = queue

      // Couleur interpolée tête → queue
      const color  = isHead ? snakeCfg.headColor
                   : this._lerpColor(snakeCfg.bodyColor, snakeCfg.tailColor, t);

      const x = seg.x * cs + pad;
      const y = seg.y * cs + pad;
      const w = cs - pad * 2;
      const h = cs - pad * 2;
      const r = snakeCfg.borderRadius || 3;

      // Glow
      if (snakeCfg.glowColor) {
        ctx.shadowColor = snakeCfg.glowColor;
        ctx.shadowBlur  = isHead
          ? snakeCfg.glowBlur * 1.5
          : snakeCfg.glowBlur * (1 - t * 0.7);
      }

      // Bloc
      ctx.fillStyle = color;
      this._roundRect(ctx, x, y, w, h, r);
      ctx.fill();

      // Stroke néon
      if (snakeCfg.strokeWidth) {
        ctx.strokeStyle = isHead ? snakeCfg.headColor : snakeCfg.bodyColor;
        ctx.lineWidth   = snakeCfg.strokeWidth * (isHead ? 1 : 0.5);
        this._roundRect(ctx, x, y, w, h, r);
        ctx.stroke();
      }

      ctx.shadowBlur = 0;

      // Yeux sur la tête
      if (isHead) this._drawEyes(seg, direction, snakeCfg, cs);
    });
  }

  _drawEyes(head, direction, snakeCfg, cs) {
    const ctx      = this.ctx;
    const eyeSize  = Math.max(2, cs * 0.12);
    const eyeOffset = cs * 0.25;
    const cx       = head.x * cs + cs / 2;
    const cy       = head.y * cs + cs / 2;

    let positions;
    switch (direction) {
      case 'RIGHT': positions = [{ x: cx + eyeOffset, y: cy - eyeOffset }, { x: cx + eyeOffset, y: cy + eyeOffset }]; break;
      case 'LEFT':  positions = [{ x: cx - eyeOffset, y: cy - eyeOffset }, { x: cx - eyeOffset, y: cy + eyeOffset }]; break;
      case 'UP':    positions = [{ x: cx - eyeOffset, y: cy - eyeOffset }, { x: cx + eyeOffset, y: cy - eyeOffset }]; break;
      case 'DOWN':  positions = [{ x: cx - eyeOffset, y: cy + eyeOffset }, { x: cx + eyeOffset, y: cy + eyeOffset }]; break;
      default:      positions = [];
    }

    positions.forEach(pos => {
      if (snakeCfg.eyeGlow) {
        ctx.shadowColor = snakeCfg.eyeGlow;
        ctx.shadowBlur  = 6;
      }
      ctx.fillStyle = snakeCfg.eyeColor || '#ffffff';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, eyeSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  /* ============================================================
     DRAW — NOURRITURE
     ============================================================ */

  _drawFood(food, foodEmoji) {
    if (!food) return;

    const foodCfg  = this._getFoodTheme();
    const cs       = this.cellSize;
    const ctx      = this.ctx;
    const cx       = food.x * cs + cs / 2;
    const cy       = food.y * cs + cs / 2;

    // Pulsation
    const pulse = foodCfg.pulseSpeed > 0
      ? 0.85 + 0.15 * Math.sin((this._pulsePhase / foodCfg.pulseSpeed) * Math.PI * 2)
      : 1;

    if (foodCfg.type === 'emoji' && (foodEmoji || foodCfg.emoji?.[0])) {
      // Rendu emoji
      const emoji    = foodEmoji || foodCfg.emoji[0];
      const fontSize = Math.round(cs * 0.75 * pulse);
      ctx.font        = `${fontSize}px serif`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha  = 0.9 + 0.1 * pulse;
      ctx.fillText(emoji, cx, cy);
      ctx.globalAlpha  = 1;
      ctx.textBaseline = 'alphabetic';

    } else if (foodCfg.type === 'circle' || foodCfg.type === 'neon') {
      // Cercle néon
      const radius = (cs / 2 - 3) * pulse;
      if (foodCfg.glowColor) {
        ctx.shadowColor = foodCfg.glowColor;
        ctx.shadowBlur  = foodCfg.glowBlur * pulse;
      }
      ctx.fillStyle = foodCfg.color || '#ff2d78';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Reflet
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(cx - radius * 0.25, cy - radius * 0.25, radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

    } else {
      // Carré classique
      const s = (cs - 4) * pulse;
      ctx.fillStyle = foodCfg.color || '#ff0000';
      ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
    }
  }

  /* ============================================================
     DRAW — OBSTACLES
     ============================================================ */

  _drawObstacles(obstacles) {
    if (!obstacles || obstacles.length === 0) return;

    const ctx = this.ctx;
    const cs  = this.cellSize;
    const pad = 2;

    obstacles.forEach(obs => {
      const x = obs.x * cs + pad;
      const y = obs.y * cs + pad;
      const s = cs - pad * 2;

      ctx.shadowColor = 'rgba(255,45,120,0.5)';
      ctx.shadowBlur  = 8;
      ctx.fillStyle   = '#3a0015';
      this._roundRect(ctx, x, y, s, s, 3);
      ctx.fill();

      ctx.strokeStyle = '#ff2d78';
      ctx.lineWidth   = 1.5;
      this._roundRect(ctx, x, y, s, s, 3);
      ctx.stroke();

      // Croix intérieure
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = 'rgba(255,45,120,0.6)';
      ctx.lineWidth   = 1;
      const m = pad * 2;
      ctx.beginPath();
      ctx.moveTo(obs.x * cs + m, obs.y * cs + m);
      ctx.lineTo((obs.x + 1) * cs - m, (obs.y + 1) * cs - m);
      ctx.moveTo((obs.x + 1) * cs - m, obs.y * cs + m);
      ctx.lineTo(obs.x * cs + m, (obs.y + 1) * cs - m);
      ctx.stroke();
    });
  }

  /* ============================================================
     DRAW — COMBO HUD
     ============================================================ */

  _drawComboHUD(combo) {
    const ctx      = this.ctx;
    const uiCfg    = this.config.theme.ui;
    const label    = `COMBO ×${combo + 1}`;
    const fontSize = Math.max(10, this.cellSize * 0.7);

    ctx.font        = `700 ${fontSize}px ${uiCfg.fontFamily || 'Orbitron, monospace'}`;
    ctx.textAlign   = 'right';
    ctx.fillStyle   = uiCfg.comboColor || '#ffe600';
    ctx.shadowColor = 'rgba(255,230,0,0.7)';
    ctx.shadowBlur  = 10;
    ctx.fillText(label, this.canvas.width - 8, fontSize + 8);
    ctx.shadowBlur  = 0;
    ctx.textAlign   = 'left';
  }

  /* ============================================================
     DRAW — ÉCRAN IDLE (attente du premier input)
     ============================================================ */

  _drawIdleScreen() {
    this._drawBackground();
    this._drawGrid();

    // Serpent démo statique — décor derrière l'écran de démarrage (GameOverlay)
    const mid  = Math.floor(this.game.state.gridSize / 2);
    const demo = [
      { x: mid, y: mid }, { x: mid - 1, y: mid },
      { x: mid - 2, y: mid }, { x: mid - 3, y: mid }
    ];
    this._drawSnake(demo, 'RIGHT');
  }

  /* ============================================================
     OVERLAY (démarrage)
     ============================================================ */

  _syncOverlay(state) {
    if (state.status === this._lastOverlayStatus) return;
    this._lastOverlayStatus = state.status;

    if (state.status === 'idle')    this._showStartScreen();
    if (state.status === 'playing') this._overlay.hide();
    // 'paused' et 'gameover' restent gérés par l'overlay générique de GameShell
  }

  /* ============================================================
     PARTICULES
     ============================================================ */

  _spawnParticles(cx, cy, points, combo) {
    const count = 6 + combo * 2;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i;
      const speed = 1.5 + Math.random() * 2;
      this._eatParticles.push({
        x:     cx,
        y:     cy,
        vx:    Math.cos(angle) * speed,
        vy:    Math.sin(angle) * speed,
        life:  1,
        decay: 0.04 + Math.random() * 0.03,
        size:  2 + Math.random() * 3,
        color: combo > 1 ? '#ffe600' : '#00ffe1'
      });
    }
  }

  _drawParticles() {
    const ctx = this.ctx;
    this._eatParticles = this._eatParticles.filter(p => p.life > 0);

    this._eatParticles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();

      p.x    += p.vx;
      p.y    += p.vy;
      p.life -= p.decay;
    });

    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
  }

  /* ============================================================
     UTILITAIRES CANVAS
     ============================================================ */

  /**
   * Rectangle arrondi compatible tous navigateurs
   */
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

  /**
   * Interpolation linéaire entre deux couleurs hex
   */
  _lerpColor(hex1, hex2, t) {
    const a = this._hexToRgb(hex1);
    const b = this._hexToRgb(hex2);
    if (!a || !b) return hex1;
    const r = Math.round(a.r + (b.r - a.r) * t);
    const g = Math.round(a.g + (b.g - a.g) * t);
    const bl = Math.round(a.b + (b.b - a.b) * t);
    return `rgb(${r},${g},${bl})`;
  }

  _hexToRgb(hex) {
    const m = hex.match(/^#([0-9a-f]{6})$/i);
    if (!m) return null;
    return {
      r: parseInt(m[1].slice(0,2), 16),
      g: parseInt(m[1].slice(2,4), 16),
      b: parseInt(m[1].slice(4,6), 16)
    };
  }

  /**
   * Lire le thème actif du serpent depuis la config
   */
  _getSnakeTheme() {
    const snakeCfg = this.config.theme.snake;
    const style    = snakeCfg.style || snakeCfg.theme || 'neon';
    return snakeCfg[style] || snakeCfg.neon;
  }

  /**
   * Lire le thème actif de la nourriture depuis la config
   */
  _getFoodTheme() {
    const foodCfg = this.config.theme.food;
    const style   = foodCfg.style || foodCfg.theme || 'neon';
    return foodCfg[style] || foodCfg.neon;
  }
}