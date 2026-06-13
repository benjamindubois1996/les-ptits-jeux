import EventBus from '../../js/core/EventBus.js';

/* Étoiles fixes */
const STARS = Array.from({ length: 50 }, (_, i) => ({
  x: (i * 139.5 % 480),
  y: (i * 67.3  % 320),
  r: i % 7 === 0 ? 1.5 : i % 3 === 0 ? 1.0 : 0.6,
  a: 0.3 + (i % 5) * 0.12,
}));

export default class Platformer2DRenderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    this._wrapper      = null;
    this._canvas       = null;
    this._ctx          = null;
    this._overlayEl    = null;

    this._tick         = 0;
    this._levelBanner  = null; // { text, ttl }
    this._sel          = { mode: 'basique' };

    this._onFrame      = this._onFrame.bind(this);
    this._onTick       = this._onTick.bind(this);
    this._onOver       = this._onOver.bind(this);
    this._onWin        = this._onWin.bind(this);
    this._onLevelUp    = this._onLevelUp.bind(this);
    this._onPaused     = this._onPaused.bind(this);
    this._onResumed    = this._onResumed.bind(this);
    this._onRestart    = this._onRestart.bind(this);
    this._onKeyDown    = this._onKeyDown.bind(this);
  }

  /* ── Cycle de vie ──────────────────────────────────────────── */

  init() {
    this._injectStyles();
    this._buildLayout();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    this._wrapper?.remove();
    document.getElementById('p2d-styles')?.remove();
  }

  /* ── Styles ────────────────────────────────────────────────── */

  _injectStyles() {
    if (document.getElementById('p2d-styles')) return;
    const el = document.createElement('style');
    el.id = 'p2d-styles';
    el.textContent = `
      @keyframes p2d-fadein { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

      .p2d-wrapper {
        position:absolute; inset:0;
        display:flex; align-items:center; justify-content:center;
        background:#050810; overflow:hidden;
        font-family:Orbitron,monospace;
      }
      .p2d-canvas { display:block; max-width:100%; max-height:100%; image-rendering:pixelated; }

      .p2d-overlay {
        position:absolute; inset:0;
        background:rgba(5,8,15,0.93); backdrop-filter:blur(5px);
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap:10px; z-index:20;
        animation:p2d-fadein 0.2s ease;
      }
      .p2d-overlay.p2d-overlay--hidden { display:none; }

      .p2d-ov-title {
        font-size:clamp(20px,5vw,36px); font-weight:900;
        letter-spacing:0.18em; color:rgba(0,255,225,0.95);
        text-shadow:0 0 24px rgba(0,255,225,0.4);
      }
      .p2d-ov-sub  { font-size:clamp(13px,3vw,18px); font-weight:700; letter-spacing:0.1em; }
      .p2d-ov-info { font-size:10px; letter-spacing:0.12em; color:rgba(0,255,225,0.45); }
      .p2d-ov-actions { display:flex; gap:12px; margin-top:6px; }

      .p2d-opt-group { display:flex; flex-direction:column; align-items:center; gap:6px; }
      .p2d-opt-label { font-size:8px; letter-spacing:0.22em; color:rgba(0,255,225,0.4); }
      .p2d-chips     { display:flex; gap:5px; }
      .p2d-chip {
        font-family:Orbitron,monospace; font-size:10px; font-weight:700;
        letter-spacing:0.07em; padding:5px 12px; border-radius:4px;
        border:1px solid rgba(0,255,225,0.22); background:#0a1520;
        color:rgba(0,255,225,0.55); cursor:pointer; transition:all 0.14s;
      }
      .p2d-chip:hover { border-color:rgba(0,255,225,0.5); color:rgba(0,255,225,0.85); }
      .p2d-chip--on {
        background:rgba(0,255,225,0.11); border-color:rgba(0,255,225,0.6);
        color:rgba(0,255,225,1); box-shadow:0 0 8px rgba(0,255,225,0.18);
      }
      .p2d-play-btn {
        font-family:Orbitron,monospace; font-size:13px; font-weight:900;
        letter-spacing:0.22em; padding:11px 38px; border-radius:6px;
        border:2px solid rgba(0,255,225,0.55); background:rgba(0,255,225,0.07);
        color:rgba(0,255,225,0.95); cursor:pointer; transition:all 0.2s; margin-top:4px;
      }
      .p2d-play-btn:hover {
        background:rgba(0,255,225,0.15); border-color:rgba(0,255,225,0.9);
        box-shadow:0 0 16px rgba(0,255,225,0.28);
      }
    `;
    document.head.appendChild(el);
  }

  /* ── Layout ────────────────────────────────────────────────── */

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'p2d-wrapper';

    const { width, height } = this.config.canvas;
    this._canvas = document.createElement('canvas');
    this._canvas.className = 'p2d-canvas';
    this._canvas.width  = width;
    this._canvas.height = height;
    this._ctx = this._canvas.getContext('2d');
    this._wrapper.appendChild(this._canvas);

    this._overlayEl = document.createElement('div');
    this._overlayEl.className = 'p2d-overlay';
    this._showStartScreen();
    this._wrapper.appendChild(this._overlayEl);

    this.viewport.appendChild(this._wrapper);
  }

  /* ── Overlays ──────────────────────────────────────────────── */

  _showStartScreen() {
    this._overlayEl.innerHTML = `
      <div class="p2d-ov-title">PLATFORMER</div>
      <div class="p2d-ov-info" style="color:rgba(0,255,225,0.65)">← → / A D : courir · ESPACE / ↑ : sauter</div>

      <div class="p2d-opt-group">
        <div class="p2d-opt-label">MODE</div>
        <div class="p2d-chips" data-opt="mode">
          <button class="p2d-chip p2d-chip--on" data-val="basique">BASIQUE</button>
        </div>
      </div>

      <div class="p2d-ov-info" style="color:rgba(255,220,0,0.7);margin-top:2px">
        🪙 Collecte les pièces · Évite les ennemis · Atteins l'étoile
      </div>
      <div class="p2d-ov-info">3 niveaux · 3 vies</div>

      <button class="p2d-play-btn" id="p2d-play-btn">JOUER</button>
      <div class="p2d-ov-info" style="opacity:0.45">ENTRÉE pour lancer</div>
    `;

    this._overlayEl.querySelectorAll('.p2d-chips').forEach(group => {
      group.addEventListener('click', e => {
        const btn = e.target.closest('.p2d-chip');
        if (!btn) return;
        this._sel[group.dataset.opt] = btn.dataset.val;
        group.querySelectorAll('.p2d-chip').forEach(b => b.classList.remove('p2d-chip--on'));
        btn.classList.add('p2d-chip--on');
      });
    });

    this._overlayEl.querySelector('#p2d-play-btn')
      ?.addEventListener('click', () => {
        this._overlayEl.classList.add('p2d-overlay--hidden');
        this.game.start(this._sel);
      });
  }

  _showGameOverScreen({ score, best }) {
    const isRecord = score > 0 && score >= best;
    this._overlayEl.innerHTML = `
      <div style="font-size:42px">💀</div>
      <div class="p2d-ov-sub" style="color:#ff4455">GAME OVER</div>
      <div class="p2d-ov-info" style="font-size:13px;color:rgba(255,255,255,0.7)">Score : <strong style="color:#fff">${score}</strong></div>
      <div class="p2d-ov-info">Meilleur : ${best}</div>
      ${isRecord ? '<div class="p2d-ov-info" style="color:#ffe600">🏆 Nouveau record !</div>' : ''}
      <div class="p2d-ov-actions">
        <button class="p2d-play-btn" id="p2d-ov-replay">REJOUER</button>
      </div>
      <div class="p2d-ov-info" style="opacity:0.5">R pour rejouer</div>
    `;
    this._overlayEl.classList.remove('p2d-overlay--hidden');
    this._overlayEl.querySelector('#p2d-ov-replay')
      ?.addEventListener('click', () => this._goToStartScreen());
  }

  _showWinScreen({ score, best }) {
    const isRecord = score > 0 && score >= best;
    this._overlayEl.innerHTML = `
      <div style="font-size:42px">🏆</div>
      <div class="p2d-ov-sub" style="color:#ffe600">VICTOIRE !</div>
      <div class="p2d-ov-info" style="color:rgba(0,255,225,0.7)">Les 3 niveaux complétés !</div>
      <div class="p2d-ov-info" style="font-size:13px;color:rgba(255,255,255,0.7)">Score : <strong style="color:#fff">${score}</strong></div>
      <div class="p2d-ov-info">Meilleur : ${best}</div>
      ${isRecord ? '<div class="p2d-ov-info" style="color:#ffe600">🏆 Nouveau record !</div>' : ''}
      <div class="p2d-ov-actions">
        <button class="p2d-play-btn" id="p2d-ov-replay">REJOUER</button>
      </div>
    `;
    this._overlayEl.classList.remove('p2d-overlay--hidden');
    this._overlayEl.querySelector('#p2d-ov-replay')
      ?.addEventListener('click', () => this._goToStartScreen());
  }

  _goToStartScreen() {
    this._overlayEl.classList.remove('p2d-overlay--hidden');
    this._showStartScreen();
  }

  /* ── Événements ────────────────────────────────────────────── */

  _bindEvents() {
    EventBus.on('game:frame',    this._onFrame);
    EventBus.on('game:tick',     this._onTick);
    EventBus.on('game:over',     this._onOver);
    EventBus.on('game:win',      this._onWin);
    EventBus.on('game:level-up', this._onLevelUp);
    EventBus.on('game:paused',   this._onPaused);
    EventBus.on('game:resumed',  this._onResumed);
    EventBus.on('game:restart',  this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindEvents() {
    EventBus.off('game:frame',    this._onFrame);
    EventBus.off('game:tick',     this._onTick);
    EventBus.off('game:over',     this._onOver);
    EventBus.off('game:win',      this._onWin);
    EventBus.off('game:level-up', this._onLevelUp);
    EventBus.off('game:paused',   this._onPaused);
    EventBus.off('game:resumed',  this._onResumed);
    EventBus.off('game:restart',  this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    if (this.game.state.status === 'idle') {
      if (['Space','ArrowUp','KeyW','Enter'].includes(e.code)) {
        e.preventDefault();
        this._overlayEl.classList.add('p2d-overlay--hidden');
        this.game.start(this._sel);
      }
    }
  }

  _onFrame({ state }) {
    this._tick++;
    this._draw(state);
  }

  _onTick({ state, action }) {
    if (state.status === 'idle') {
      this._overlayEl.classList.remove('p2d-overlay--hidden');
      this._draw(state);
    }
    if (action === 'new-game' || action === 'level-start') {
      this._overlayEl.classList.add('p2d-overlay--hidden');
    }
  }

  _onOver(data) {
    this._showGameOverScreen(data);
    document.getElementById('gs-overlay')?.classList.add('hidden');
  }

  _onWin(data) {
    this._showWinScreen(data);
    document.getElementById('gs-overlay')?.classList.add('hidden');
  }

  _onLevelUp({ level }) {
    this._levelBanner = { text: `NIVEAU ${level}`, ttl: 108 }; // ~1.8s à 60fps
  }

  _onPaused() {
    this._overlayEl.innerHTML = `
      <div style="font-size:34px">⏸</div>
      <div class="p2d-ov-sub">PAUSE</div>
      <button class="p2d-play-btn" id="p2d-ov-resume">REPRENDRE</button>
    `;
    this._overlayEl.classList.remove('p2d-overlay--hidden');
    this._overlayEl.querySelector('#p2d-ov-resume')
      ?.addEventListener('click', () => EventBus.emit('game:pause-toggle'));
    document.getElementById('gs-overlay')?.classList.add('hidden');
  }

  _onResumed() {
    this._overlayEl.classList.add('p2d-overlay--hidden');
    document.getElementById('gs-overlay')?.classList.add('hidden');
  }

  _onRestart() {
    this._goToStartScreen();
  }

  /* ── Dessin ────────────────────────────────────────────────── */

  _draw(state) {
    const ctx = this._ctx;
    const { width: W, height: H } = this.config.canvas;
    const camX = this._camX(state, W);

    /* Fond */
    this._drawBackground(ctx, W, H, camX);

    ctx.save();
    ctx.translate(-camX, 0);

    /* Plateformes */
    this._drawPlatforms(ctx, state.platforms);

    /* Objectif */
    if (state.goalX) this._drawGoal(ctx, state.goalX, state);

    /* Pièces */
    this._drawCoins(ctx, state.coins);

    /* Ennemis */
    this._drawEnemies(ctx, state.enemies, state);

    /* Joueur */
    if (state.status === 'playing' || state.status === 'gameover') {
      this._drawPlayer(ctx, state.player);
    }

    ctx.restore();

    /* HUD */
    this._drawHUD(ctx, state, W, H);

    /* Bannière de niveau */
    if (this._levelBanner && this._levelBanner.ttl > 0) {
      this._drawLevelBanner(ctx, W, H, this._levelBanner);
      this._levelBanner.ttl--;
    }
  }

  _camX(state, W) {
    const cfg = this.config.gameplay;
    const cx  = state.player.x + cfg.playerW / 2 - W / 2;
    return Math.max(0, Math.min(cx, state.worldWidth - W));
  }

  _drawBackground(ctx, W, H, camX) {
    /* Ciel */
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0,   '#020612');
    skyGrad.addColorStop(0.6, '#060f22');
    skyGrad.addColorStop(1,   '#0a1830');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    /* Étoiles (parallaxe légère) */
    const px = camX * 0.08;
    for (const s of STARS) {
      const sx = ((s.x - px % W) + W * 2) % W;
      ctx.globalAlpha = s.a;
      ctx.fillStyle   = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawPlatforms(ctx, platforms) {
    for (const p of platforms) {
      const isGround = p.h >= 32;

      if (isGround) {
        /* Sol : gradient vert foncé */
        const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        g.addColorStop(0,   '#1a4a1a');
        g.addColorStop(0.3, '#112e11');
        g.addColorStop(1,   '#050e05');
        ctx.fillStyle = g;
        ctx.fillRect(p.x, p.y, p.w, p.h);

        /* Bordure top */
        ctx.strokeStyle = 'rgba(0,255,80,0.5)';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + 1);
        ctx.lineTo(p.x + p.w, p.y + 1);
        ctx.stroke();

        /* Herbe */
        ctx.fillStyle = '#2a7a2a';
        ctx.fillRect(p.x, p.y, p.w, 4);

        /* Lignes de texture */
        ctx.strokeStyle = 'rgba(0,80,0,0.2)';
        ctx.lineWidth   = 1;
        for (let tx = p.x + 16; tx < p.x + p.w; tx += 32) {
          ctx.beginPath();
          ctx.moveTo(tx, p.y + 4);
          ctx.lineTo(tx, p.y + p.h);
          ctx.stroke();
        }
      } else {
        /* Plateforme flottante */
        const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        g.addColorStop(0, '#5c3a1e');
        g.addColorStop(1, '#3a2010');
        ctx.fillStyle = g;
        ctx.fillRect(p.x, p.y, p.w, p.h);

        /* Brillance top */
        ctx.fillStyle = 'rgba(255,180,80,0.22)';
        ctx.fillRect(p.x, p.y, p.w, 3);

        /* Bordure */
        ctx.strokeStyle = 'rgba(255,140,40,0.5)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
      }
    }
  }

  _drawGoal(ctx, goalX, state) {
    const cfg  = this.config.gameplay;
    const gx   = goalX;
    const gy   = cfg.groundY - 40;
    const t    = this._tick * 0.06;
    const glow = 0.6 + 0.4 * Math.sin(t);

    /* Poteau */
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(gx - 2, gy, 4, 40);

    /* Étoile animée */
    ctx.save();
    ctx.translate(gx, gy - 4);
    ctx.rotate(t * 0.5);
    ctx.globalAlpha = glow;
    this._drawStar(ctx, 0, 0, 14, 6, '#ffe600');
    ctx.globalAlpha = 1;
    ctx.restore();

    /* Halo */
    const halo = ctx.createRadialGradient(gx, gy - 4, 2, gx, gy - 4, 28);
    halo.addColorStop(0,   `rgba(255,230,0,${0.25 * glow})`);
    halo.addColorStop(1,   'rgba(255,230,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(gx, gy - 4, 28, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawStar(ctx, cx, cy, outerR, innerR, color) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      else         ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _drawCoins(ctx, coins) {
    const r = this.config.gameplay.coinRadius;
    const t = this._tick * 0.08;

    for (const c of coins) {
      if (c.collected) continue;

      const bob = Math.sin(t + c.x * 0.02) * 2;

      /* Glow */
      const glow = ctx.createRadialGradient(c.x, c.y + bob, 1, c.x, c.y + bob, r + 4);
      glow.addColorStop(0,   'rgba(255,220,0,0.35)');
      glow.addColorStop(1,   'rgba(255,200,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(c.x, c.y + bob, r + 4, 0, Math.PI * 2);
      ctx.fill();

      /* Corps */
      const coinG = ctx.createRadialGradient(c.x - 2, c.y + bob - 2, 1, c.x, c.y + bob, r);
      coinG.addColorStop(0,   '#fff8a0');
      coinG.addColorStop(0.5, '#ffd700');
      coinG.addColorStop(1,   '#c8900a');
      ctx.fillStyle = coinG;
      ctx.beginPath();
      ctx.arc(c.x, c.y + bob, r, 0, Math.PI * 2);
      ctx.fill();

      /* Contour */
      ctx.strokeStyle = 'rgba(180,120,0,0.6)';
      ctx.lineWidth   = 1;
      ctx.stroke();
    }
  }

  _drawEnemies(ctx, enemies, state) {
    const cfg = this.config.gameplay;
    const t   = this._tick * 0.1;

    for (const e of enemies) {
      const ex = e.x, ey = e.y;
      const ew = cfg.enemyW, eh = cfg.enemyH;
      const bounce = Math.abs(Math.sin(t + e.x * 0.01)) * 2;

      /* Corps */
      const g = ctx.createLinearGradient(ex, ey - bounce, ex, ey + eh - bounce);
      g.addColorStop(0, '#ff4466');
      g.addColorStop(1, '#aa1133');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(ex, ey - bounce, ew, eh, 4);
      ctx.fill();

      /* Yeux */
      const eyeY = ey + 6 - bounce;
      const eyeOffX = e.dir > 0 ? 6 : 4;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ex + eyeOffX,      eyeY, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + ew - eyeOffX, eyeY, 4, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#000';
      const pupilOff = e.dir * 1.5;
      ctx.beginPath(); ctx.arc(ex + eyeOffX      + pupilOff, eyeY, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + ew - eyeOffX + pupilOff, eyeY, 2, 0, Math.PI * 2); ctx.fill();

      /* Contour */
      ctx.strokeStyle = '#660022';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.roundRect(ex, ey - bounce, ew, eh, 4);
      ctx.stroke();
    }
  }

  _drawPlayer(ctx, player) {
    const cfg = this.config.gameplay;
    const { x, y, dir, invincible, grounded, vy } = player;
    const pw = cfg.playerW, ph = cfg.playerH;

    /* Clignotement si invincible */
    if (invincible > 0 && Math.floor(invincible / 5) % 2 === 0) return;

    const isJumping = !grounded && vy < 0;
    const isFalling = !grounded && vy > 0;

    /* Ombre au sol */
    if (grounded) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(x + pw / 2, y + ph + 2, pw / 2, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    /* Corps */
    const bodyG = ctx.createLinearGradient(x, y, x, y + ph);
    bodyG.addColorStop(0, '#44ffee');
    bodyG.addColorStop(1, '#0099bb');
    ctx.fillStyle = bodyG;
    ctx.shadowColor = 'rgba(0,255,225,0.4)';
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.roundRect(x, y, pw, ph, [4, 4, 2, 2]);
    ctx.fill();
    ctx.shadowBlur = 0;

    /* Reflet */
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 3, y + 2, pw - 6, ph / 2);

    /* Yeux */
    const eyeX = dir > 0 ? x + pw - 8 : x + 4;
    const eyeY = y + 7;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(eyeX + 2, eyeY, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#001122';
    ctx.beginPath(); ctx.arc(eyeX + 2 + dir * 1.5, eyeY, 2.5, 0, Math.PI * 2); ctx.fill();

    /* Bouche (sourire si au sol, neutrale si en l'air) */
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    if (isJumping) {
      ctx.arc(x + pw / 2, y + ph - 8, 4, 0, Math.PI); // arc vers le haut (excitation)
    } else if (isFalling) {
      ctx.arc(x + pw / 2, y + ph - 5, 4, Math.PI, 0); // arc vers le bas (inquiétude)
    } else {
      ctx.arc(x + pw / 2, y + ph - 8, 4, 0, Math.PI); // sourire
    }
    ctx.stroke();

    /* Jambes (animation marche) */
    const legAnim = grounded ? Math.sin(this._tick * 0.3) * 4 : 0;
    ctx.fillStyle = '#007799';
    ctx.fillRect(x + 3,        y + ph - 4, pw / 2 - 4, 5 - legAnim);
    ctx.fillRect(x + pw / 2,   y + ph - 4, pw / 2 - 3, 5 + legAnim);

    /* Contour */
    ctx.strokeStyle = 'rgba(0,180,200,0.7)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, pw, ph, [4, 4, 2, 2]);
    ctx.stroke();
  }

  _drawHUD(ctx, state, W, H) {
    if (state.status !== 'playing' && !state.levelTransition) return;
    const cfg = this.config.gameplay;

    ctx.font         = '700 11px Orbitron, monospace';
    ctx.textBaseline = 'top';

    /* Score */
    ctx.fillStyle = 'rgba(0,255,225,0.9)';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE', 10, 10);
    ctx.font      = '900 16px Orbitron, monospace';
    ctx.fillText(state.score, 10, 24);

    /* Niveau */
    ctx.font      = '700 11px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,255,225,0.7)';
    ctx.fillText(`NIVEAU ${state.levelIndex + 1} / ${cfg.levelCount}`, W / 2, 10);

    /* Pièces */
    const totalCoins = state.coins.length;
    const collected  = totalCoins - state.coinsLeft;
    ctx.fillStyle = 'rgba(255,220,0,0.85)';
    ctx.fillText(`🪙 ${collected} / ${totalCoins}`, W / 2, 24);

    /* Vies */
    ctx.textAlign = 'right';
    ctx.font      = '700 11px Orbitron, monospace';
    ctx.fillStyle = 'rgba(0,255,225,0.7)';
    ctx.fillText('VIES', W - 10, 10);
    let hearts = '';
    for (let i = 0; i < cfg.lives; i++) hearts += i < state.lives ? '❤️' : '🖤';
    ctx.font    = '14px serif';
    ctx.fillText(hearts, W - 6, 24);

    /* Bannière de transition */
    if (state.levelTransition) {
      ctx.fillStyle = 'rgba(5,8,15,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.font      = '900 28px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,255,225,0.95)';
      ctx.shadowColor = 'rgba(0,255,225,0.4)';
      ctx.shadowBlur  = 20;
      ctx.fillText(`NIVEAU ${state.levelIndex + 1}`, W / 2, H / 2 - 14);
      ctx.shadowBlur  = 0;
      ctx.font        = '700 13px Orbitron, monospace';
      ctx.fillStyle   = 'rgba(0,255,225,0.55)';
      ctx.fillText('PRÊT ?', W / 2, H / 2 + 18);
      ctx.textAlign   = 'left';
    }
  }

  _drawLevelBanner(ctx, W, H, banner) {
    const alpha = Math.min(1, banner.ttl / 20) * Math.min(1, (banner.ttl - 0) / 20);
    ctx.globalAlpha = alpha;
    ctx.font        = '900 24px Orbitron, monospace';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle   = '#ffe600';
    ctx.shadowColor = 'rgba(255,230,0,0.5)';
    ctx.shadowBlur  = 16;
    ctx.fillText(banner.text, W / 2, H / 2);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign   = 'left';
  }
}
