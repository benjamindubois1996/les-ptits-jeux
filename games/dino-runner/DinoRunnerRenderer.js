import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

export default class DinoRunnerRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._scale   = 1;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
  }

  init() { this._injectStyles(); this._buildLayout(); this._bindEvents(); }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('dr-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('dr-styles')) return;
    const s = document.createElement('style');
    s.id = 'dr-styles';
    s.textContent = `
      .dr-wrapper { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
        justify-content:center; background:#050810; font-family:Orbitron,monospace; overflow:hidden; }
      .dr-canvas { display:block; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'dr-wrapper';

    const { width, height } = this.config.gameplay;
    const vw = this.viewport.clientWidth  || width;
    const vh = (this.viewport.clientHeight || height + 40) - 40;
    this._scale = Math.min(vw / width, vh / height, 2.2);
    const sc = this._scale;

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'dr-canvas';
    this._canvas.width  = width;
    this._canvas.height = height;
    this._canvas.style.width  = Math.floor(width  * sc) + 'px';
    this._canvas.style.height = Math.floor(height * sc) + 'px';
    this._ctx = this._canvas.getContext('2d');

    this._overlay = new GameOverlay(this._wrapper);
    this._showStart();

    this._wrapper.appendChild(this._canvas);
    this.viewport.appendChild(this._wrapper);
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique',
         options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this.game.start(sel); }
    );
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
    this._canvas.addEventListener('touchstart', this._onTouchStart = (e) => {
      e.preventDefault(); this.game.jump();
    }, { passive: false });
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
    if (this._onTouchStart) this._canvas.removeEventListener('touchstart', this._onTouchStart);
  }

  _onKeyDown(e) {
    const kb = this.config.controls?.keyboard ?? {};
    if ((kb.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); return; }
    if ((kb.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); return; }
    if (['Space','ArrowUp','KeyW'].includes(e.code))   { e.preventDefault(); this.game.jump(); }
    if (['ArrowDown','KeyS'].includes(e.code))          { e.preventDefault(); this.game.duck(true); }
  }

  _onKeyUp(e) {
    if (['ArrowDown','KeyS'].includes(e.code)) this.game.duck(false);
  }

  _onTick({ state }) {
    if (state.status === 'idle') return;
    this._draw(state);
  }

  _onOver({ result, icon, title, score, best }) {
    const mode = this.game.state?.mode ?? 'basique';
    this._overlay.showGameOver(
      { result, icon, title, score, best },
      () => { this._overlay.hide(); this.game.start({ mode }); }
    );
  }

  _onPaused()  { this._overlay.showPause(); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStart(); }

  // ── Dessin ───────────────────────────────────────────────────────────────

  _draw(state) {
    const ctx = this._ctx;
    const cfg = this.config.gameplay;
    const { width, height, groundY, dinoX, dinoW, dinoH, dinoDuckH } = cfg;

    // Background
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, width, height);

    // Stars (static pattern)
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 40; i++) {
      const sx = (i * 137.5 + 7) % width;
      const sy = (i * 53.3 + 11) % (groundY - 20);
      ctx.fillRect(sx | 0, sy | 0, 1, 1);
    }

    // Night mode extra glow
    if (state.night) {
      ctx.fillStyle = 'rgba(100,80,200,0.06)';
      ctx.fillRect(0, 0, width, height);
    }

    // Clouds
    const cloudCol = state.night ? 'rgba(120,100,220,0.25)' : 'rgba(0,220,255,0.08)';
    ctx.fillStyle = cloudCol;
    state.clouds.forEach(c => {
      ctx.beginPath(); ctx.ellipse(c.x, c.y, c.w * 0.46, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(c.x - c.w * 0.15, c.y + 5, c.w * 0.3, 8, 0, 0, Math.PI * 2); ctx.fill();
    });

    // Ground — neon line
    const groundColor = state.night ? '#7b61ff' : '#00e5ff';
    ctx.strokeStyle = groundColor;
    ctx.lineWidth   = 2;
    ctx.shadowColor  = groundColor;
    ctx.shadowBlur   = 6;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(width, groundY); ctx.stroke();
    ctx.shadowBlur = 0;

    // Obstacles
    state.obstacles.forEach(o => {
      if (o.type === 'cactus') this._drawCactus(ctx, o);
      else                     this._drawPtero(ctx, o);
    });

    // Dino
    this._drawDino(ctx, state.dino, cfg, state.step);

    // Score (neon green)
    ctx.fillStyle   = state.night ? '#a080ff' : '#00ff88';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur  = 4;
    ctx.font        = 'bold 13px Orbitron, monospace';
    ctx.textAlign   = 'right';
    ctx.fillText(String(state.score).padStart(5, '0'), width - 10, 22);
    ctx.shadowBlur  = 0;
    ctx.textAlign   = 'left';

    // Controls hint when just started
    if (state.score < 5) {
      ctx.fillStyle = 'rgba(0,229,255,0.35)';
      ctx.font      = '9px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ESPACE/↑ Sauter   ↓ Se baisser', width / 2, height - 8);
      ctx.textAlign = 'left';
    }

    // Night indicator
    if (state.night) {
      ctx.fillStyle = 'rgba(160,128,255,0.5)';
      ctx.font      = '9px Orbitron, monospace';
      ctx.fillText('NUIT', 10, 22);
    }
  }

  _drawDino(ctx, dino, cfg, step) {
    const { dinoX, dinoH, dinoDuckH, dinoW, groundY } = cfg;
    const h = dino.ducking ? dinoDuckH : dinoH;
    const x = dinoX, y = dino.y;
    const w = dino.ducking ? dinoW + 8 : dinoW;
    const col = dino.dead ? '#ff3366' : '#00e5ff';

    ctx.fillStyle  = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = dino.dead ? 0 : 5;

    if (dino.ducking) {
      ctx.fillRect(x + 2, y + 2, w - 6, h - 4);
      ctx.fillRect(x + w - 14, y - 2, 14, 12);   // head
      ctx.fillRect(x, y + 4, 8, 7);               // tail
      if (step === 0) { ctx.fillRect(x + 10, y + h - 9, 7, 9); ctx.fillRect(x + 22, y + h - 5, 7, 5); }
      else            { ctx.fillRect(x + 10, y + h - 5, 7, 5); ctx.fillRect(x + 22, y + h - 9, 7, 9); }
    } else {
      ctx.fillRect(x + 4, y + 12, w - 10, h - 22);  // body
      ctx.fillRect(x + w - 18, y, 18, 20);            // head
      ctx.fillStyle  = '#050810';
      ctx.shadowBlur = 0;
      ctx.fillRect(x + w - 10, y + 4, 5, 5);          // eye
      ctx.fillStyle  = col;
      ctx.shadowColor = col;
      ctx.shadowBlur  = dino.dead ? 0 : 5;
      ctx.fillRect(x, y + 14, 10, 8);                 // tail
      ctx.fillRect(x + 2, y + 22, 6, 7);
      ctx.fillRect(x + w - 16, y + 20, 8, 5);         // arm
      if (dino.grounded) {
        if (step === 0) { ctx.fillRect(x + 8, y + h - 13, 8, 13); ctx.fillRect(x + 20, y + h - 7, 8, 7); }
        else            { ctx.fillRect(x + 8, y + h - 7, 8, 7); ctx.fillRect(x + 20, y + h - 13, 8, 13); }
      } else {
        ctx.fillRect(x + 8,  y + h - 11, 8, 11);
        ctx.fillRect(x + 20, y + h - 9,  8, 9);
      }
    }
    ctx.shadowBlur = 0;
  }

  _drawCactus(ctx, o) {
    const col = '#ff2d6b';
    ctx.fillStyle  = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 5;
    const mid = o.x + (o.w - 7) / 2;
    ctx.fillRect(mid, o.y, 7, o.h);
    ctx.fillRect(o.x, o.y + Math.floor(o.h * 0.3), 7, Math.floor(o.h * 0.36));
    ctx.fillRect(o.x, o.y + Math.floor(o.h * 0.18), mid - o.x + 7, 6);
    ctx.fillRect(o.x + o.w - 7, o.y + Math.floor(o.h * 0.38), 7, Math.floor(o.h * 0.28));
    ctx.fillRect(mid, o.y + Math.floor(o.h * 0.26), o.x + o.w - 7 - mid + 7, 6);
    ctx.shadowBlur = 0;
  }

  _drawPtero(ctx, o) {
    const col = '#b020ff';
    ctx.fillStyle  = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 5;
    const { x, y, w, h, flapF } = o;
    ctx.fillRect(x + 13, y + 9, w - 24, h - 12);   // body
    ctx.fillRect(x + w - 17, y + 4, 15, 14);        // head
    ctx.fillRect(x + w - 2,  y + 8, 8, 4);          // beak
    if (flapF === 0) { ctx.fillRect(x, y + 2, 16, 6); ctx.fillRect(x + w - 16, y + 2, 16, 6); }
    else             { ctx.fillRect(x, y + 13, 16, 6); ctx.fillRect(x + w - 16, y + 13, 16, 6); }
    ctx.shadowBlur = 0;
  }
}
