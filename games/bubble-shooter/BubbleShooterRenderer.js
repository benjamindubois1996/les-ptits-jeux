import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

export default class BubbleShooterRenderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._sel     = { mode: 'basique' };

    /* Arrow-function bindings pour EventBus.off */
    this._onFrame   = ({ state })         => this._draw(state);
    this._onTick    = ({ state, action }) => this._handleTick(state, action);
    this._onOver    = (data)              => this._showGameOverScreen(data);
    this._onPaused  = ()                  => this._overlay.showPause(() => EventBus.emit('game:pause-toggle'));
    this._onResumed = ()                  => this._overlay.hide();
    this._onRestart = ()                  => this._showStartScreen();
    this._onPopped  = ({ popped, dropped }) => this._spawnParticles(popped, dropped);

    /* Particules d'animation */
    this._particles = [];  // { x, y, color, t, maxT, type }
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    this._canvas?.removeEventListener('mousemove', this._onMouseMove);
    this._canvas?.removeEventListener('click',     this._onClick);
    this._wrapper?.remove();
    document.getElementById('bbs-styles')?.remove();
  }

  /* ── Layout ── */

  _buildLayout() {
    const cfg = this.config.gameplay;

    this._wrapper = document.createElement('div');
    this._wrapper.className = 'bbs-wrapper';

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'bbs-canvas';
    this._canvas.width  = cfg.W;
    this._canvas.height = cfg.H;
    this._ctx = this._canvas.getContext('2d');
    this._wrapper.appendChild(this._canvas);

    this._nextEl = document.createElement('div');
    this._nextEl.className = 'bbs-next';
    this._nextEl.innerHTML = '<span>SUIVANTE</span><canvas class="bbs-next-canvas" width="40" height="40"></canvas>';
    this._wrapper.appendChild(this._nextEl);
    this._nextCanvas = this._nextEl.querySelector('.bbs-next-canvas');
    this._nextCtx    = this._nextCanvas.getContext('2d');

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();
    this.viewport.appendChild(this._wrapper);

    /* Mouse aim + shoot */
    this._onMouseMove = (e) => {
      if (this.game.state.status !== 'playing') return;
      const rect = this._canvas.getBoundingClientRect();
      const scaleX = this._canvas.width  / rect.width;
      const scaleY = this._canvas.height / rect.height;
      const mx  = (e.clientX - rect.left) * scaleX;
      const my  = (e.clientY - rect.top)  * scaleY;
      const cfg = this.config.gameplay;
      const dx  = mx - cfg.W / 2;
      const dy  = cfg.CANNON_Y - my;
      if (dy <= 0) return;
      this.game.setAimAngle(Math.atan2(dy, dx));
    };
    this._onClick = () => {
      const { state } = this.game;
      if (state.status !== 'playing' || state.bullet) return;
      this.game.shoot(state.aimAngle);
    };
    this._canvas.addEventListener('mousemove', this._onMouseMove);
    this._canvas.addEventListener('click',     this._onClick);
  }

  _optionGroups() {
    return [
      { key: 'mode', label: 'MODE', default: 'basique',
        options: [{ value: 'basique', label: 'BASIQUE' }] },
    ];
  }

  _showStartScreen() {
    this._overlay.showStart(
      this._optionGroups(),
      sel => { this._sel = sel; this._overlay.hide(); this.game.start(sel); },
      { extraHtml: '<div style="font-size:10px;color:rgba(0,255,225,0.6);letter-spacing:0.1em;margin-top:4px">SOURIS viser · CLIC / ESPACE tirer · ←/→ clavier</div>' }
    );
  }

  _showGameOverScreen({ score, best }) {
    this._overlay.showGameOver(
      { result: 'lose', score, isRecord: score > 0 && score >= best,
        extraInfo: `<div class="overlay-score">Meilleur : ${best}</div>` },
      () => this._showStartScreen(),
    );
  }

  /* ── Events ── */

  _bindEvents() {
    EventBus.on('game:frame',          this._onFrame);
    EventBus.on('game:tick',           this._onTick);
    EventBus.on('game:over',           this._onOver);
    EventBus.on('game:paused',         this._onPaused);
    EventBus.on('game:resumed',        this._onResumed);
    EventBus.on('game:restart',        this._onRestart);
    EventBus.on('game:bubbles-popped', this._onPopped);
  }

  _unbindEvents() {
    EventBus.off('game:frame',          this._onFrame);
    EventBus.off('game:tick',           this._onTick);
    EventBus.off('game:over',           this._onOver);
    EventBus.off('game:paused',         this._onPaused);
    EventBus.off('game:resumed',        this._onResumed);
    EventBus.off('game:restart',        this._onRestart);
    EventBus.off('game:bubbles-popped', this._onPopped);
  }

  _handleTick(state, action) {
    if (action === 'new-game' || action === 'level-up') {
      this._overlay.hide();
      this._particles = [];
    }
    this._draw(state);
    this._renderNext(state);
  }

  /* ── Particules ── */

  _spawnParticles(popped, dropped) {
    const now = Date.now();
    for (const b of popped) {
      this._particles.push({ x: b.x, y: b.y, color: b.color, startY: b.y, t: now, maxT: 380, type: 'pop' });
    }
    for (const b of dropped) {
      this._particles.push({ x: b.x, y: b.y, color: b.color, startY: b.y, t: now, maxT: 500, type: 'drop' });
    }
  }

  _drawParticles(ctx) {
    if (!this._particles.length) return;
    const now = Date.now();
    this._particles = this._particles.filter(p => now - p.t < p.maxT);

    for (const p of this._particles) {
      const progress = (now - p.t) / p.maxT;   // 0 → 1
      ctx.save();

      if (p.type === 'pop') {
        /* Expansion + fade */
        const r     = this.config.gameplay.BUBBLE_R * (1 + progress * 1.4);
        ctx.globalAlpha = (1 - progress) * 0.85;
        ctx.shadowColor = p.color;
        ctx.shadowBlur  = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = p.color;
        ctx.lineWidth   = 2.5 * (1 - progress);
        ctx.stroke();

        /* Petits éclats */
        const numSparks = 6;
        for (let i = 0; i < numSparks; i++) {
          const a   = (i / numSparks) * Math.PI * 2;
          const dist = progress * this.config.gameplay.BUBBLE_R * 2.2;
          const sx  = p.x + Math.cos(a) * dist;
          const sy  = p.y + Math.sin(a) * dist;
          const sr  = (1 - progress) * 4;
          ctx.globalAlpha = (1 - progress) * 0.7;
          ctx.beginPath();
          ctx.arc(sx, sy, sr, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
        }
      } else {
        /* Chute + fade */
        const fallY = p.startY + progress * progress * 180;
        const r     = this.config.gameplay.BUBBLE_R * (1 - progress * 0.4);
        ctx.globalAlpha = (1 - progress) * 0.75;
        this._drawBubble(ctx, p.x, fallY, r, p.color);
      }

      ctx.restore();
    }
  }

  /* ── Render ── */

  _draw(state) {
    const ctx = this._ctx;
    const cfg = this.config.gameplay;

    ctx.clearRect(0, 0, cfg.W, cfg.H);

    const bg = ctx.createLinearGradient(0, 0, 0, cfg.H);
    bg.addColorStop(0, '#050810');
    bg.addColorStop(1, '#0a1228');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cfg.W, cfg.H);

    /* Ligne de danger */
    if (state.status === 'playing') {
      const dangerY = cfg.maxRow * cfg.ROW_H + cfg.BUBBLE_R + 4;
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth   = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, dangerY);
      ctx.lineTo(cfg.W, dangerY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    /* Grille */
    for (let r = 0; r < state.grid.length; r++) {
      for (let c = 0; c < state.grid[r].length; c++) {
        const color = state.grid[r][c];
        if (!color) continue;
        const { x, y } = this.game._cellPos(r, c);
        this._drawBubble(ctx, x, y, cfg.BUBBLE_R, color);
      }
    }

    /* Particules (pop + chute) */
    this._drawParticles(ctx);

    /* Bulle en vol */
    if (state.bullet) {
      this._drawBubble(ctx, state.bullet.x, state.bullet.y, cfg.BUBBLE_R, state.bullet.color, true);
    }

    /* Canon */
    this._drawCannon(ctx, state, cfg);
  }

  _drawBubble(ctx, x, y, r, color, moving = false) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur  = moving ? 12 : 6;

    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    grad.addColorStop(0,   this._adjustColor(color,  60));
    grad.addColorStop(0.6, color);
    grad.addColorStop(1,   this._adjustColor(color, -40));

    ctx.beginPath();
    ctx.arc(x, y, r - 1, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    /* Reflet */
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(x - r * 0.25, y - r * 0.28, r * 0.35, r * 0.22, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.restore();
  }

  _drawCannon(ctx, state, cfg) {
    const cx    = cfg.W / 2;
    const cy    = cfg.CANNON_Y;
    const angle = state.aimAngle ?? Math.PI / 2;

    /* Ligne de visée */
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * 260, cy - Math.sin(angle) * 260);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    /* Canon (rectangle tourné) */
    const barrelLen = 44, barrelW = 12;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 2 - angle);
    ctx.fillStyle   = '#8090c0';
    ctx.strokeStyle = '#b0c0e0';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.rect(-barrelW / 2, -barrelLen, barrelW, barrelLen);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    /* Socle */
    const baseGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 22);
    baseGrad.addColorStop(0, '#6070a0');
    baseGrad.addColorStop(1, '#2a3050');
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fillStyle = baseGrad;
    ctx.fill();
    ctx.strokeStyle = '#7080b0';
    ctx.lineWidth = 2;
    ctx.stroke();

    /* Bulle chargée */
    if (state.currentBubble && !state.bullet) {
      this._drawBubble(ctx, cx, cy, cfg.BUBBLE_R - 4, state.currentBubble);
    }
  }

  _renderNext(state) {
    const ctx = this._nextCtx;
    ctx.clearRect(0, 0, 40, 40);
    if (state.nextBubble) this._drawBubble(ctx, 20, 20, 14, state.nextBubble);
  }

  /* ── Helpers couleur ── */

  _adjustColor(hex, amount) {
    const r = Math.min(255, Math.max(0, parseInt(hex.slice(1,3), 16) + amount));
    const g = Math.min(255, Math.max(0, parseInt(hex.slice(3,5), 16) + amount));
    const b = Math.min(255, Math.max(0, parseInt(hex.slice(5,7), 16) + amount));
    return `rgb(${r},${g},${b})`;
  }

  /* ── Styles ── */

  _injectStyles() {
    if (document.getElementById('bbs-styles')) return;
    const el = document.createElement('style');
    el.id = 'bbs-styles';
    el.textContent = `
      .bbs-wrapper {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 8px;
        box-sizing: border-box;
        gap: 6px;
        font-family: Orbitron, monospace;
        overflow: hidden;
      }
      .bbs-canvas {
        max-width: 100%;
        max-height: calc(100% - 48px);
        aspect-ratio: 440/560;
        object-fit: contain;
        cursor: crosshair;
        border: 1px solid rgba(120,140,200,0.3);
        border-radius: 4px;
      }
      .bbs-next {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 10px;
        color: #8090c0;
        letter-spacing: 1px;
      }
      .bbs-next-canvas {
        border-radius: 50%;
        background: rgba(10,18,40,0.6);
      }
    `;
    document.head.appendChild(el);
  }
}
