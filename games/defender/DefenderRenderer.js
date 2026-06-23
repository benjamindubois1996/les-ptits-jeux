import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const WORLD_W  = 6400;
const GROUND_Y = 280;

export default class DefenderRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._hud     = null;

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
    document.getElementById('df-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('df-styles')) return;
    const s = document.createElement('style');
    s.id = 'df-styles';
    s.textContent = `
      .df-wrapper { position:absolute; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; background:#000008;
        font-family:Orbitron,monospace; overflow:hidden; gap:4px; }
      .df-hud { font-size:10px; color:rgba(255,255,255,0.4); letter-spacing:.08em; display:flex; gap:16px; }
      .df-canvas { display:block; }
      .df-tips { font-size:9px; color:rgba(255,255,255,0.25); text-align:center; letter-spacing:.05em; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'df-wrapper';

    const cfg = this.config.gameplay;
    const W   = cfg.viewW, H = cfg.viewH + cfg.radarH;
    const vw  = this.viewport.clientWidth  || W;
    const vh  = (this.viewport.clientHeight || H + 60) - 60;
    this._scale = Math.min(vw / W, vh / H, 1.5);
    const sc  = this._scale;

    this._hud = document.createElement('div');
    this._hud.className = 'df-hud';
    this._hud.innerHTML = `
      VAGUE <span id="df-wave">1</span>
      &nbsp;·&nbsp; BOMBES <span id="df-bombs">3</span>
      &nbsp;·&nbsp; 🟢 HUMANOÏDES <span id="df-humans">10</span>/10
      &nbsp;·&nbsp; 🔴 LANDERS <span id="df-landers">4</span>`;

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'df-canvas';
    this._canvas.width  = W;
    this._canvas.height = H;
    this._canvas.style.width  = Math.floor(W * sc) + 'px';
    this._canvas.style.height = Math.floor(H * sc) + 'px';
    this._ctx = this._canvas.getContext('2d');

    this._tips = document.createElement('div');
    this._tips.className = 'df-tips';
    this._tips.textContent = '← → : Déplacer  ↑ ↓ : Altitude  ESPACE : Tirer  B : Bombe  H : Hyperespace';

    this._overlay = new GameOverlay(this._wrapper);
    this._showStart();

    this._wrapper.appendChild(this._hud);
    this._wrapper.appendChild(this._canvas);
    this._wrapper.appendChild(this._tips);
    this.viewport.appendChild(this._wrapper);
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
  }

  _onKeyDown(e) {
    const kb = this.config.controls?.keyboard ?? {};
    if ((kb.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); return; }
    if ((kb.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); return; }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS'].includes(e.code)) e.preventDefault();
    this.game.pressKey(e.code, true);
    if (e.code === 'Space') { e.preventDefault(); this.game.fire(); }
    if (e.code === 'KeyB')  { e.preventDefault(); this.game.smartBomb(); }
    if (e.code === 'KeyH')  { e.preventDefault(); this.game.hyperspace(); }
  }

  _onKeyUp(e) { this.game.pressKey(e.code, false); }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique',
         options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this.game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.45);font-size:10px;text-align:center;line-height:1.8;margin-bottom:4px">
          <b>Objectif</b> : Protège les humanoïdes verts des Landers rouges<br>
          Si un Lander emporte un humain jusqu'en haut → il devient Mutant<br>
          ← → Déplacer &nbsp; ↑ ↓ Altitude &nbsp; ESPACE Tirer &nbsp; B Bombe &nbsp; H Hyperespace
        </div>` }
    );
  }

  _onTick({ state }) {
    if (state.status === 'idle') return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('df-wave',    state.wave ?? 1);
    set('df-bombs',   state.smartBombs ?? 0);
    set('df-humans',  (state.humanoids ?? []).filter(h => h.alive).length);
    set('df-landers', (state.enemies ?? []).filter(e => !e.dead && e.type === 'lander').length);
    // Color humanoids count
    const hEl = document.getElementById('df-humans');
    if (hEl) hEl.style.color = ((state.humanoids ?? []).filter(h => h.alive).length) <= 3 ? '#ff4444' : '#00ff88';
    this._draw(state);
  }

  _onOver({ result, icon, title, score, best, extraInfo }) {
    const mode = this.game.state?.mode ?? 'basique';
    this._overlay.showGameOver(
      { result, icon, title, score, best, extraInfo },
      () => { this._overlay.hide(); this.game.start({ mode }); }
    );
  }

  _onPaused()  { this._overlay.showPause(); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStart(); }

  // World-x → screen-x given camera
  _wx(wx, camera, viewW) {
    let dx = wx - camera + viewW / 2;
    // Wrap
    if (dx < -100) dx += WORLD_W;
    if (dx > viewW + 100) dx -= WORLD_W;
    return dx;
  }

  _draw(state) {
    const ctx  = this._ctx;
    const cfg  = this.config.gameplay;
    const { viewW, viewH, radarH } = cfg;
    const cam  = state.camera;
    const TH   = viewH; // total play area height

    // ── BG flash on smart bomb ──
    if (state.bombFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, state.bombFlash * 4)})`;
      ctx.fillRect(0, 0, viewW, TH);
      return;
    }

    // ── Sky ──
    ctx.fillStyle = '#000018';
    ctx.fillRect(0, 0, viewW, TH);

    // Stars (static, world-based)
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 80; i++) {
      const sx = ((i * 137.5 + cam * 0.04) % viewW + viewW) % viewW;
      const sy = (i * 53.3) % (TH - 40);
      ctx.fillRect(sx | 0, sy | 0, 1, 1);
    }

    // ── Ground ──
    ctx.fillStyle = '#0a3a0a';
    ctx.fillRect(0, GROUND_Y, viewW, TH - GROUND_Y);
    ctx.fillStyle = '#1a6a1a';
    ctx.fillRect(0, GROUND_Y, viewW, 3);

    // ── Mountains in BG ──
    ctx.fillStyle = '#081808';
    for (let i = 0; i < 12; i++) {
      const mx = ((i * 600 - cam * 0.15) % viewW + viewW) % viewW;
      const mh = 40 + (i % 3) * 30;
      ctx.beginPath(); ctx.moveTo(mx, GROUND_Y); ctx.lineTo(mx + 60, GROUND_Y - mh); ctx.lineTo(mx + 120, GROUND_Y); ctx.fill();
    }

    // ── Humanoids ──
    state.humanoids.forEach(h => {
      if (!h.alive) return;
      const sx = this._wx(h.x, cam, viewW);
      if (sx < -10 || sx > viewW + 10) return;
      ctx.fillStyle = h.carried ? '#ff8800' : '#00ff88';
      ctx.fillRect(sx - 3, h.y - 14, 6, 14);
      ctx.beginPath(); ctx.arc(sx, h.y - 18, 5, 0, Math.PI * 2); ctx.fill();
    });

    // ── Enemies ──
    state.enemies.forEach(e => {
      const sx = this._wx(e.x, cam, viewW);
      if (sx < -20 || sx > viewW + 20) return;
      if (e.dead) {
        const a = Math.max(0, (e.deathT ?? 0.4) / 0.4);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ff8844';
        ctx.beginPath(); ctx.arc(sx, e.y, 14, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        return;
      }
      if (e.type === 'lander') this._drawLander(ctx, sx, e.y, e.carrying !== null);
      else                     this._drawMutant(ctx, sx, e.y);
    });

    // ── Bullets ──
    ctx.fillStyle = '#ffff44';
    state.bullets.forEach(b => {
      const sx = this._wx(b.x, cam, viewW);
      ctx.fillRect(sx - 4, b.y - 1, 8, 3);
    });

    // ── Ship ──
    this._drawShip(ctx, state.ship, cam, viewW);

    // ── Radar strip ──
    this._drawRadar(ctx, state, cfg);
  }

  _drawShip(ctx, s, cam, viewW) {
    const sx = this._wx(s.x, cam, viewW);
    const sy = s.y;
    const f  = s.facing;

    if (s.invincible > 0 && Math.floor(s.invincible * 10) % 2 === 0) return;

    ctx.fillStyle = '#00ccff';
    // Body
    ctx.beginPath();
    ctx.moveTo(sx + f * 20, sy);
    ctx.lineTo(sx - f * 12, sy - 8);
    ctx.lineTo(sx - f * 12, sy + 8);
    ctx.closePath();
    ctx.fill();

    // Cockpit
    ctx.fillStyle = '#88eeff';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Engine glow
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.moveTo(sx - f * 12, sy - 4);
    ctx.lineTo(sx - f * 20, sy);
    ctx.lineTo(sx - f * 12, sy + 4);
    ctx.fill();
  }

  _drawLander(ctx, x, y, carrying) {
    ctx.fillStyle = carrying ? '#ff6600' : '#cc2200';
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x + 12, y + 4);
    ctx.lineTo(x - 12, y + 4);
    ctx.closePath();
    ctx.fill();
    // Legs
    ctx.strokeStyle = '#ff4400';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 8, y + 4); ctx.lineTo(x - 14, y + 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 8, y + 4); ctx.lineTo(x + 14, y + 14); ctx.stroke();
    // Eye
    ctx.fillStyle = '#ffff00';
    ctx.beginPath(); ctx.arc(x, y - 4, 4, 0, Math.PI * 2); ctx.fill();
  }

  _drawMutant(ctx, x, y) {
    ctx.fillStyle = '#ff00ff';
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff88ff';
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    // Spikes
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
      ctx.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18);
      ctx.stroke();
    }
  }

  _drawRadar(ctx, state, cfg) {
    const { viewW, viewH, radarH } = cfg;
    const ry = viewH;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, ry, viewW, radarH);
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth   = 1;
    ctx.strokeRect(0, ry, viewW, radarH);

    const scaleX = viewW / WORLD_W;
    const scaleY = radarH / GROUND_Y;

    // Ground line on radar
    ctx.strokeStyle = '#0a4a0a';
    ctx.beginPath();
    ctx.moveTo(0, ry + radarH - 2);
    ctx.lineTo(viewW, ry + radarH - 2);
    ctx.stroke();

    // Enemies on radar
    state.enemies.forEach(e => {
      if (e.dead) return;
      const rx = e.x * scaleX;
      const ry2 = ry + e.y * scaleY;
      ctx.fillStyle = e.type === 'mutant' ? '#ff00ff' : '#ff2200';
      ctx.fillRect(rx - 1, ry2, 2, 2);
    });

    // Humanoids on radar
    state.humanoids.forEach(h => {
      if (!h.alive) return;
      const rx = h.x * scaleX;
      ctx.fillStyle = '#00ff88';
      ctx.fillRect(rx - 1, ry + radarH - 4, 2, 3);
    });

    // Ship on radar
    const sx = state.ship.x * scaleX;
    const sy = ry + state.ship.y * scaleY;
    ctx.fillStyle = '#00ccff';
    ctx.fillRect(sx - 2, sy - 2, 4, 4);

    // Viewport indicator
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth   = 1;
    const vl = ((state.camera - cfg.viewW / 2) / WORLD_W * viewW + viewW) % viewW;
    const vr = ((state.camera + cfg.viewW / 2) / WORLD_W * viewW + viewW) % viewW;
    ctx.strokeRect(vl, ry + 1, vr - vl, radarH - 2);
  }
}
