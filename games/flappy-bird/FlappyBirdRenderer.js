import EventBus from '../../js/core/EventBus.js';

/* Étoiles fixes générées une seule fois */
const STARS = Array.from({ length: 40 }, (_, i) => ({
  x: (i * 137.508 % 380),
  y: (i * 73.13  % 420),
  r: i % 5 === 0 ? 1.5 : i % 3 === 0 ? 1.2 : 0.7,
  a: 0.4 + (i % 4) * 0.15,
}));

export default class FlappyBirdRenderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    this._wrapper   = null;
    this._canvas    = null;
    this._ctx       = null;
    this._overlayEl = null;

    this._idleAngle = 0;

    this._sel = {
      mode:  'basique',
      gap:   'normal',
      speed: 'normale',
    };

    this._onFrame   = this._onFrame.bind(this);
    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init() {
    this._injectStyles();
    this._buildLayout();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    if (this._wrapper) this._wrapper.remove();
    const s = document.getElementById('fb-styles');
    if (s) s.remove();
  }

  /* ============================================================
     STYLES
     ============================================================ */

  _injectStyles() {
    if (document.getElementById('fb-styles')) return;
    const el = document.createElement('style');
    el.id = 'fb-styles';
    el.textContent = `
      @keyframes fb-fadein { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

      .fb-wrapper {
        position:absolute; inset:0;
        display:flex; align-items:center; justify-content:center;
        background:#050810; overflow:hidden;
        font-family:Orbitron,monospace;
      }
      .fb-canvas {
        display:block;
        max-width:100%; max-height:100%;
        image-rendering:pixelated;
      }

      .fb-overlay {
        position:absolute; inset:0;
        background:rgba(5,8,15,0.92); backdrop-filter:blur(4px);
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap:10px; z-index:20;
        animation:fb-fadein 0.2s ease;
      }
      .fb-overlay.fb-overlay--hidden { display:none; }

      .fb-ov-title {
        font-size:clamp(22px,5vw,38px); font-weight:900;
        letter-spacing:0.2em; color:rgba(0,255,225,0.95);
        text-shadow:0 0 24px rgba(0,255,225,0.4);
      }
      .fb-ov-sub {
        font-size:clamp(14px,3vw,20px); font-weight:700; letter-spacing:0.1em;
      }
      .fb-ov-info {
        font-size:10px; letter-spacing:0.12em; color:rgba(0,255,225,0.45);
      }
      .fb-ov-actions { display:flex; gap:12px; margin-top:6px; }

      .fb-opt-group { display:flex; flex-direction:column; align-items:center; gap:6px; }
      .fb-opt-label { font-size:8px; letter-spacing:0.22em; color:rgba(0,255,225,0.4); }
      .fb-chips     { display:flex; gap:5px; }
      .fb-chip {
        font-family:Orbitron,monospace; font-size:10px; font-weight:700;
        letter-spacing:0.07em; padding:5px 11px; border-radius:4px;
        border:1px solid rgba(0,255,225,0.22); background:#0a1520;
        color:rgba(0,255,225,0.55); cursor:pointer; transition:all 0.14s;
      }
      .fb-chip:hover { border-color:rgba(0,255,225,0.5); color:rgba(0,255,225,0.85); }
      .fb-chip--on {
        background:rgba(0,255,225,0.11); border-color:rgba(0,255,225,0.6);
        color:rgba(0,255,225,1); box-shadow:0 0 8px rgba(0,255,225,0.18);
      }
      .fb-play-btn {
        font-family:Orbitron,monospace; font-size:13px; font-weight:900;
        letter-spacing:0.22em; padding:11px 38px; border-radius:6px;
        border:2px solid rgba(0,255,225,0.55); background:rgba(0,255,225,0.07);
        color:rgba(0,255,225,0.95); cursor:pointer; transition:all 0.2s; margin-top:4px;
      }
      .fb-play-btn:hover {
        background:rgba(0,255,225,0.15); border-color:rgba(0,255,225,0.9);
        box-shadow:0 0 16px rgba(0,255,225,0.28);
      }
    `;
    document.head.appendChild(el);
  }

  /* ============================================================
     LAYOUT
     ============================================================ */

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'fb-wrapper';

    const { width, height } = this.config.canvas;
    this._canvas = document.createElement('canvas');
    this._canvas.className = 'fb-canvas';
    this._canvas.width  = width;
    this._canvas.height = height;
    this._ctx = this._canvas.getContext('2d');
    this._wrapper.appendChild(this._canvas);

    this._canvas.addEventListener('click', () => {
      const s = this.game.state.status;
      if (s === 'playing')  { this.game.flap(); return; }
      if (s === 'gameover') { EventBus.emit('game:restart'); }
    });

    this._overlayEl = document.createElement('div');
    this._overlayEl.className = 'fb-overlay';
    this._showStartScreen();
    this._wrapper.appendChild(this._overlayEl);

    this.viewport.appendChild(this._wrapper);
  }

  /* ============================================================
     OVERLAYS
     ============================================================ */

  _showStartScreen() {
    const { gapOptions, speedOptions } = this.config.gameplay;

    this._overlayEl.innerHTML = `
      <div class="fb-ov-title">FLAPPY BIRD</div>
      <div class="fb-ov-info" style="color:rgba(0,255,225,0.65)">ESPACE · CLIC · ↑ pour battre des ailes</div>

      <div class="fb-opt-group">
        <div class="fb-opt-label">MODE</div>
        <div class="fb-chips" data-opt="mode">
          <button class="fb-chip fb-chip--on" data-val="basique">BASIQUE</button>
        </div>
      </div>

      <div class="fb-opt-group">
        <div class="fb-opt-label">ÉCARTEMENT</div>
        <div class="fb-chips" data-opt="gap">
          ${gapOptions.map(g =>
            `<button class="fb-chip${g === this._sel.gap ? ' fb-chip--on' : ''}" data-val="${g}">${g.toUpperCase()}</button>`
          ).join('')}
        </div>
      </div>

      <div class="fb-opt-group">
        <div class="fb-opt-label">VITESSE</div>
        <div class="fb-chips" data-opt="speed">
          ${speedOptions.map(s =>
            `<button class="fb-chip${s === this._sel.speed ? ' fb-chip--on' : ''}" data-val="${s}">${s.toUpperCase()}</button>`
          ).join('')}
        </div>
      </div>

      <button class="fb-play-btn" id="fb-play-btn">JOUER</button>
    `;

    this._overlayEl.querySelectorAll('.fb-chips').forEach(group => {
      group.addEventListener('click', e => {
        const btn = e.target.closest('.fb-chip');
        if (!btn) return;
        this._sel[group.dataset.opt] = btn.dataset.val;
        group.querySelectorAll('.fb-chip').forEach(b => b.classList.remove('fb-chip--on'));
        btn.classList.add('fb-chip--on');
      });
    });

    this._overlayEl.querySelector('#fb-play-btn')
      ?.addEventListener('click', () => {
        this._overlayEl.classList.add('fb-overlay--hidden');
        this.game.start(this._sel);
      });
  }

  _showGameOverScreen({ score, best }) {
    const isRecord = score > 0 && score >= best;
    this._overlayEl.innerHTML = `
      <div style="font-size:42px">💀</div>
      <div class="fb-ov-sub" style="color:#ff4455">GAME OVER</div>
      <div class="fb-ov-info" style="font-size:13px;color:rgba(255,255,255,0.7)">Score : <strong style="color:#fff">${score}</strong></div>
      <div class="fb-ov-info">Meilleur : ${best}</div>
      ${isRecord ? '<div class="fb-ov-info" style="color:#ffe600">🏆 Nouveau record !</div>' : ''}
      <div class="fb-ov-actions">
        <button class="fb-play-btn" id="fb-ov-replay">REJOUER</button>
      </div>
      <div class="fb-ov-info" style="opacity:0.5">ESPACE · CLIC · R pour rejouer</div>
    `;
    this._overlayEl.classList.remove('fb-overlay--hidden');
    this._overlayEl.querySelector('#fb-ov-replay')
      ?.addEventListener('click', () => this._goToStartScreen());
  }

  _goToStartScreen() {
    this._overlayEl.classList.remove('fb-overlay--hidden');
    this._showStartScreen();
  }

  /* ============================================================
     ÉVÉNEMENTS
     ============================================================ */

  _bindEvents() {
    EventBus.on('game:frame',   this._onFrame);
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindEvents() {
    EventBus.off('game:frame',   this._onFrame);
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    if (this.game.state.status !== 'idle') return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') {
      e.preventDefault();
      this._overlayEl.classList.add('fb-overlay--hidden');
      this.game.start(this._sel);
    }
  }

  _onFrame({ state }) {
    this._draw(state);
  }

  _onTick({ state }) {
    if (state.status === 'idle') {
      this._overlayEl.classList.remove('fb-overlay--hidden');
      this._draw(state);
    }
  }

  _onOver(data) {
    this._draw(this.game.state);
    this._showGameOverScreen(data);
    const gs = document.getElementById('gs-overlay');
    if (gs) gs.classList.add('hidden');
  }

  _onPaused() {
    this._overlayEl.innerHTML = `
      <div style="font-size:34px">⏸</div>
      <div class="fb-ov-sub">PAUSE</div>
      <button class="fb-play-btn" id="fb-ov-resume">REPRENDRE</button>
    `;
    this._overlayEl.classList.remove('fb-overlay--hidden');
    this._overlayEl.querySelector('#fb-ov-resume')
      ?.addEventListener('click', () => EventBus.emit('game:pause-toggle'));
    const gs = document.getElementById('gs-overlay');
    if (gs) gs.classList.add('hidden');
  }

  _onResumed() {
    this._overlayEl.classList.add('fb-overlay--hidden');
    const gs = document.getElementById('gs-overlay');
    if (gs) gs.classList.add('hidden');
  }

  _onRestart() {
    this._goToStartScreen();
  }

  /* ============================================================
     DESSIN
     ============================================================ */

  _draw(state) {
    const ctx = this._ctx;
    const { width: W, height: H } = this.config.canvas;
    const cfg = this.config.gameplay;

    /* ---- Ciel ---- */
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H - cfg.groundHeight);
    skyGrad.addColorStop(0,   '#030810');
    skyGrad.addColorStop(0.5, '#061220');
    skyGrad.addColorStop(1,   '#091828');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H - cfg.groundHeight);

    /* ---- Étoiles ---- */
    for (const s of STARS) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle   = '#fff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* ---- Tuyaux ---- */
    for (const p of state.pipes) {
      const topH  = p.gapY;
      const botY  = p.gapY + state.gapSize;
      const botH  = H - cfg.groundHeight - botY;
      if (topH > 0) this._drawPipe(ctx, p.x, 0,    cfg.pipeWidth, topH, true);
      if (botH > 0) this._drawPipe(ctx, p.x, botY,  cfg.pipeWidth, botH, false);
    }

    /* ---- Sol ---- */
    const groundY = H - cfg.groundHeight;
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, H);
    groundGrad.addColorStop(0,   '#17380d');
    groundGrad.addColorStop(0.25,'#102608');
    groundGrad.addColorStop(1,   '#040c02');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, groundY, W, cfg.groundHeight);

    ctx.strokeStyle = 'rgba(0,255,80,0.35)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();

    /* ---- Oiseau ---- */
    const bx = cfg.birdX;
    const by = state.status === 'idle'
      ? H / 2 - 20 + Math.sin(this._idleAngle) * 8
      : state.bird.y;

    if (state.status === 'idle') this._idleAngle += 0.06;

    const angle = state.status === 'playing' || state.status === 'gameover'
      ? Math.max(-0.5, Math.min(1.1, state.bird.vy * 0.075))
      : 0;

    this._drawBird(ctx, bx, by, cfg.birdRadius, angle, state.bird.flapAnim > 0);

    /* ---- Score ---- */
    if (state.status === 'playing') {
      ctx.fillStyle    = 'rgba(255,255,255,0.95)';
      ctx.font         = 'bold 32px Orbitron, monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowColor  = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur   = 8;
      ctx.fillText(state.score, W / 2, 18);
      ctx.shadowBlur   = 0;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  _drawPipe(ctx, x, y, w, h, isTop) {
    if (h <= 0) return;

    const capH = 20;
    const capW = w + 12;
    const capX = x - 6;
    const capY = isTop ? y + h - capH : y;

    /* Corps */
    const bodyG = ctx.createLinearGradient(x, 0, x + w, 0);
    bodyG.addColorStop(0,   '#174d17');
    bodyG.addColorStop(0.25,'#268026');
    bodyG.addColorStop(0.5, '#31a331');
    bodyG.addColorStop(0.75,'#268026');
    bodyG.addColorStop(1,   '#0f330f');
    ctx.fillStyle = bodyG;
    ctx.fillRect(x, y, w, h);

    /* Chapeau */
    const capG = ctx.createLinearGradient(capX, 0, capX + capW, 0);
    capG.addColorStop(0,   '#174d17');
    capG.addColorStop(0.2, '#31a331');
    capG.addColorStop(0.5, '#44c044');
    capG.addColorStop(0.8, '#31a331');
    capG.addColorStop(1,   '#0f330f');
    ctx.fillStyle = capG;
    ctx.fillRect(capX, capY, capW, capH);

    /* Reflet */
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(x + 3,    y,    6, h);
    ctx.fillRect(capX + 3, capY, 8, capH);

    /* Bordure sombre */
    ctx.strokeStyle = 'rgba(0,60,0,0.55)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(x,    y,    w,    h);
    ctx.strokeRect(capX, capY, capW, capH);
  }

  _drawBird(ctx, x, y, r, angle, isFlapping) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    /* Ombre */
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur  = 6;

    /* Corps */
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.88, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe033';
    ctx.fill();
    ctx.strokeStyle = '#c8a000';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.shadowBlur = 0;

    /* Aile */
    const wingOffY = isFlapping ? -r * 0.45 : r * 0.28;
    ctx.beginPath();
    ctx.ellipse(-r * 0.1, wingOffY, r * 0.52, r * 0.26, isFlapping ? -0.3 : 0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#f0c200';
    ctx.fill();

    /* Blanc de l'œil */
    ctx.beginPath();
    ctx.arc(r * 0.28, -r * 0.22, r * 0.33, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    /* Pupille */
    ctx.beginPath();
    ctx.arc(r * 0.36, -r * 0.19, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = '#111111';
    ctx.fill();

    /* Bec */
    ctx.beginPath();
    ctx.moveTo(r * 0.72,  -r * 0.08);
    ctx.lineTo(r * 1.22,  r * 0.10);
    ctx.lineTo(r * 0.72,  r * 0.24);
    ctx.closePath();
    ctx.fillStyle = '#ff8800';
    ctx.fill();
    ctx.strokeStyle = '#c05000';
    ctx.lineWidth   = 0.8;
    ctx.stroke();

    ctx.restore();
  }
}
