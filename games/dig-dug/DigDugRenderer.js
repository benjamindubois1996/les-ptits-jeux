import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const COLS = 15, ROWS = 13;

export default class DigDugRenderer {
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
    this._onWon     = this._onWon.bind(this);
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
    document.getElementById('dd-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('dd-styles')) return;
    const s = document.createElement('style');
    s.id = 'dd-styles';
    s.textContent = `
      .dd-wrapper { position:absolute; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; background:#0d0826;
        font-family:Orbitron,monospace; overflow:hidden; gap:4px; }
      .dd-hud { font-size:10px; color:rgba(255,255,255,0.4); letter-spacing:.08em; display:flex; gap:16px; }
      .dd-canvas { display:block; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'dd-wrapper';

    const ts = this.config.gameplay.tileSize;
    const W  = COLS * ts, H = ROWS * ts;
    const vw = this.viewport.clientWidth  || W;
    const vh = (this.viewport.clientHeight || H + 50) - 50;
    this._scale = Math.min(vw / W, vh / H, 1.8);
    const sc = this._scale;

    this._hud = document.createElement('div');
    this._hud.className = 'dd-hud';
    this._hud.innerHTML = `NIVEAU <span id="dd-lvl">1</span>
      &nbsp;·&nbsp; <span style="color:#ffd060">⛏️ ESPACE = pompe</span>
      &nbsp;·&nbsp; <span style="color:#60dfff">Tue tous les ennemis pour gagner</span>`;

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'dd-canvas';
    this._canvas.width  = W;
    this._canvas.height = H;
    this._canvas.style.width  = Math.floor(W * sc) + 'px';
    this._canvas.style.height = Math.floor(H * sc) + 'px';
    this._ctx = this._canvas.getContext('2d');

    this._overlay = new GameOverlay(this._wrapper);
    this._showStart();

    this._wrapper.appendChild(this._hud);
    this._wrapper.appendChild(this._canvas);
    this.viewport.appendChild(this._wrapper);
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique',
         options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this.game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.7;margin-bottom:4px">
          Creuse avec ↑↓←→ • Maintiens <b>ESPACE</b> pour pomper un ennemi<br>
          3 pompes = mort • Laisse tomber des rochers sur eux pour du bonus<br>
          Élimine tous les ennemis pour passer au niveau suivant
        </div>` }
    );
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
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
    if (e.code === 'Space') { e.preventDefault(); this.game.setPumping(true); }
  }

  _onKeyUp(e) {
    this.game.pressKey(e.code, false);
    if (e.code === 'Space') this.game.setPumping(false);
  }

  _onTick({ state }) {
    if (state.status === 'idle') return;
    const lvlEl = document.getElementById('dd-lvl');
    if (lvlEl) lvlEl.textContent = state.level;
    this._draw(state);
  }

  _onOver({ result, icon, title, score, best, extraInfo }) {
    const mode = this.game.state?.mode ?? 'basique';
    this._overlay.showGameOver(
      { result, icon, title, score, best, extraInfo },
      () => { this._overlay.hide(); this.game.start({ mode }); }
    );
  }

  _onWon({ result, icon, title, score, best, extraInfo }) {
    const mode = this.game.state?.mode ?? 'basique';
    this._overlay.showGameOver(
      { result, icon, title, score, best, extraInfo },
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
    const ts  = cfg.tileSize;
    const W   = COLS * ts, H = ROWS * ts;

    ctx.fillStyle = '#1a0a00';
    ctx.fillRect(0, 0, W, H);

    // Terrain
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (state.terrain[r][c] === 'dirt') this._drawDirt(ctx, c * ts, r * ts, ts);
      }
    }

    // Rocks
    state.rocks.forEach(rock => this._drawRock(ctx, (rock.col + 0.5) * ts, rock.py, ts));

    // Enemies
    state.enemies.forEach(e => this._drawEnemy(ctx, e, ts));

    // Player
    this._drawPlayer(ctx, state.player, ts);

    // Enemy count indicator (top-right)
    const alive = state.enemies.filter(e => e.state !== 'dead').length;
    ctx.fillStyle = alive > 0 ? '#ff6060' : '#00ff88';
    ctx.font      = '10px Orbitron, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${alive} ennemi${alive !== 1 ? 's' : ''}`, W - 4, 14);
    ctx.textAlign = 'left';
  }

  _drawDirt(ctx, x, y, ts) {
    ctx.fillStyle = '#7a3f10';
    ctx.fillRect(x, y, ts, ts);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y, ts, 1);
    ctx.fillRect(x, y, 1, ts);
    ctx.fillStyle = 'rgba(255,200,80,0.07)';
    ctx.fillRect(x + 4, y + 4, 6, 3);
    ctx.fillRect(x + 14, y + 10, 5, 3);
  }

  _drawRock(ctx, cx, cy, ts) {
    const r = ts * 0.44;
    ctx.fillStyle   = '#c47a20';
    ctx.shadowColor = '#c47a20';
    ctx.shadowBlur  = 3;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.2, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#d4a040';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.2, cy - r * 0.2, r * 0.5, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  }

  _drawEnemy(ctx, e, ts) {
    const { px, py, type, state: es, inflated, face } = e;

    if (es === 'dead') {
      const a = Math.max(0, (e.deadT ?? 0.8) / 0.8);
      ctx.globalAlpha = a;
      ctx.fillStyle   = type === 'pooka' ? '#ff6060' : '#60ff90';
      ctx.beginPath(); ctx.arc(px, py, ts * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }

    const r    = ts * (0.36 + (inflated || 0) * 0.055);
    const base = type === 'pooka' ? '#e03030' : '#20c060';
    ctx.fillStyle   = base;
    ctx.shadowColor = base;
    ctx.shadowBlur  = es === 'inflated' ? 8 : 3;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur  = 0;

    // Type indicator
    if (type === 'pooka') {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath(); ctx.moveTo(px - r * 0.4, py - r * 0.3); ctx.lineTo(px - r * 0.4, py + r * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + r * 0.4, py - r * 0.3); ctx.lineTo(px + r * 0.4, py + r * 0.3); ctx.stroke();
    } else {
      // Fygar: small horn
      ctx.fillStyle = '#20c060';
      ctx.fillRect(px - 3, py - r - 5, 6, 5);
    }

    // Eyes
    const ex = face === 'left' ? -0.28 : face === 'right' ? 0.28 : 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px + ex * r - r * 0.16, py - r * 0.18, r * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + ex * r + r * 0.16, py - r * 0.18, r * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(px + ex * r - r * 0.12, py - r * 0.2,  r * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + ex * r + r * 0.2,  py - r * 0.2,  r * 0.09, 0, Math.PI * 2); ctx.fill();

    // Inflation rings
    if (es === 'inflated' && (inflated || 0) > 0) {
      ctx.strokeStyle = '#ffe060';
      ctx.lineWidth   = 2;
      for (let i = 0; i < (inflated || 0); i++) {
        ctx.globalAlpha = 0.6 - i * 0.1;
        ctx.beginPath(); ctx.arc(px, py, r + 5 + i * 4, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  _drawPlayer(ctx, p, ts) {
    if (!p) return;
    const inv = (p.invincible ?? 0);
    if (inv > 0 && inv < 1.5) ctx.globalAlpha = Math.floor(inv * 8) % 2 === 0 ? 1 : 0.25;
    if (p.dying)              ctx.globalAlpha = Math.max(0, p.deathT / 1.0) * (Math.floor(p.deathT * 8) % 2 === 0 ? 1 : 0.25);

    const x = p.px, y = p.py, s = ts * 0.38;

    // Body — yellow goggle character
    ctx.fillStyle   = '#ffd060';
    ctx.shadowColor = '#ffd060';
    ctx.shadowBlur  = 4;
    ctx.fillRect(x - s, y - s, s * 2, s * 2);
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#c09010';
    ctx.fillRect(x - s * 0.8, y - s * 0.8, s * 1.6, s * 0.65); // visor band
    ctx.fillStyle   = '#fffaaa';
    ctx.fillRect(x - s * 0.7, y - s * 0.75, s * 1.4, s * 0.5); // screen

    // Pump beam
    if (p.pumpDist > 0) {
      const d   = p.pumpDist;
      const end = p.face === 'right' ? { x: x + d, y }
                : p.face === 'left'  ? { x: x - d, y }
                : p.face === 'down'  ? { x, y: y + d }
                :                      { x, y: y - d };
      ctx.strokeStyle = '#ffd060';
      ctx.lineWidth   = 3;
      ctx.shadowColor = '#ffd060';
      ctx.shadowBlur  = 6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(end.x, end.y); ctx.stroke();
      ctx.fillStyle   = '#ff8800';
      ctx.shadowColor = '#ff8800';
      ctx.beginPath(); ctx.arc(end.x, end.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur  = 0;
    }

    ctx.globalAlpha = 1;
  }
}
