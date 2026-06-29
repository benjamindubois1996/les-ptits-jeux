import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const PHASE_COLORS = ['#44aaff', '#ff8822', '#ff2266'];
const PHASE_NAMES  = ['Phase 1 — Visée', 'Phase 2 — Spirale', 'Phase 3 — Déluge'];

export default class BulletHellRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._canvas   = null;
    this._ctx      = null;
    this._wrapper  = null;
    this._overlay  = null;
    this._state    = null;
    this._raf      = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._overlay = new GameOverlay(this._viewport);
    this._showStart();
    this._bindEvents();
    this._startLoop();
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      () => { this._overlay.hide(); this._game.start(); },
      { extraHtml: '<div style="color:#888;font-size:9px;text-align:center">WASD / ↑↓←→ pour bouger · Tir automatique</div>' }
    );
  }

  _injectStyles() {
    if (document.getElementById('bh-styles')) return;
    const s = document.createElement('style');
    s.id = 'bh-styles';
    s.textContent = `
      .bh-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 4px;
        box-sizing: border-box; gap: 4px;
        font-family: Orbitron, monospace;
        background: #050810; overflow: hidden;
      }
      .bh-hud {
        width: 100%; display: flex; gap: 10px;
        align-items: center; justify-content: center;
        font-size: 10px; color: #a0c4ff;
      }
      .bh-score-val { color: #ffd700; font-weight: bold; }
      .bh-bar-wrap {
        width: 85%; height: 8px;
        background: rgba(255,255,255,0.08);
        border-radius: 4px; overflow: hidden;
        border: 1px solid rgba(255,255,255,0.15);
      }
      .bh-bar { height: 100%; border-radius: 4px; transition: width 0.1s; }
      .bh-canvas-wrap {
        flex: 1; width: 100%;
        display: flex; align-items: center; justify-content: center;
      }
      #bh-canvas { display: block; }
      .bh-phase { color: #a0c4ff; font-size: 9px; text-align: center; }
      .bh-msg { color: #ff8888; font-size: 10px; text-align: center; min-height: 14px; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'bh-wrapper';
    this._wrapper.innerHTML = `
      <div class="bh-hud">
        Score : <span class="bh-score-val" id="bh-score">0</span>
        &nbsp;|&nbsp; Vies : <span id="bh-lives">❤️❤️❤️</span>
        &nbsp;|&nbsp; <span id="bh-phase-name"></span>
      </div>
      <div class="bh-bar-wrap"><div class="bh-bar" id="bh-bar" style="width:100%;background:#ff4444"></div></div>
      <div class="bh-canvas-wrap">
        <canvas id="bh-canvas"></canvas>
      </div>
      <div class="bh-msg" id="bh-msg"></div>
    `;
    this._viewport.appendChild(this._wrapper);

    this._canvas = document.getElementById('bh-canvas');
    this._ctx    = this._canvas.getContext('2d');
    this._resizeCanvas();
  }

  _resizeCanvas() {
    const wrap = this._canvas.parentElement;
    const W = Math.min(wrap.clientWidth  || 360, 440);
    const H = Math.min(wrap.clientHeight || 380, 520);
    this._canvas.width  = W;
    this._canvas.height = H;
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
  }

  _startLoop() {
    const render = () => {
      this._raf = requestAnimationFrame(render);
      if (this._state?.status === 'playing') this._draw(this._state);
    };
    this._raf = requestAnimationFrame(render);
  }

  _onTick({ state }) {
    this._state = state;
    this._updateHUD(state);
  }

  _onOver({ score }) {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this._overlay.showGameOver(
      { result: 'lose', score, title: 'VAINCU PAR LE BOSS' },
      () => { this._overlay.hide(); this._game.restart(); this._startLoop(); }
    );
  }

  _onWon({ score }) {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this._overlay.showGameOver(
      { result: 'win', score, title: 'BOSS VAINCU !' },
      () => { this._overlay.hide(); this._game.restart(); this._startLoop(); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStart(); }

  _draw(state) {
    const c = this._canvas, ctx = this._ctx;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    // BG
    ctx.fillStyle = '#050810'; ctx.fillRect(0, 0, W, H);
    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 137 + 11) % 100) / 100 * W;
      const sy = ((i * 71  + 31) % 100) / 100 * H;
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Phase flash on transition
    if (state.phaseTransition) {
      ctx.fillStyle = 'rgba(100,200,255,0.12)'; ctx.fillRect(0, 0, W, H);
    }

    // Boss
    const bx = state.bossX * W, by = state.bossY * H;
    const bW  = 0.28 * W, bH = 0.13 * H;
    const col = PHASE_COLORS[state.phase - 1];
    this._drawBoss(ctx, bx, by, bW, bH, col, state.phase);

    // Player (flash when invincible)
    const inv = state.player.invincible > 0 && Math.floor(Date.now() / 80) % 2 === 0;
    if (!inv) this._drawPlayer(ctx, state.player.x * W, state.player.y * H);

    // Hitbox
    if (state.player.invincible <= 0) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(state.player.x*W, state.player.y*H, 2, 0, Math.PI*2); ctx.fill();
    }

    // Player bullets
    ctx.fillStyle = '#88ffff';
    for (const b of state.playerBullets) {
      ctx.fillRect(b.x * W - 2, b.y * H - 5, 4, 9);
    }

    // Boss bullets
    const bCol = state.phase === 1 ? '#ff4444' : state.phase === 2 ? '#ffaa00' : '#ff22aa';
    for (const b of state.bossBullets) {
      const bxp = b.x * W, byp = b.y * H;
      ctx.beginPath(); ctx.arc(bxp, byp, 4, 0, Math.PI * 2);
      ctx.fillStyle = bCol; ctx.fill();
      ctx.beginPath(); ctx.arc(bxp, byp, 7, 0, Math.PI * 2);
      ctx.fillStyle = bCol.replace(')', ', 0.2)').replace('rgb', 'rgba'); ctx.fill();
    }
  }

  _drawBoss(ctx, cx, cy, bW, bH, color, phase) {
    ctx.save();
    const g = ctx.createLinearGradient(cx - bW/2, cy - bH/2, cx + bW/2, cy + bH/2);
    g.addColorStop(0, color); g.addColorStop(1, '#110');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy - bH/2);
    ctx.lineTo(cx + bW/2, cy);
    ctx.lineTo(cx + bW*0.35, cy + bH/2);
    ctx.lineTo(cx - bW*0.35, cy + bH/2);
    ctx.lineTo(cx - bW/2, cy);
    ctx.closePath();
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx - bW*0.15, cy - bH*0.05, bW*0.055, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + bW*0.15, cy - bH*0.05, bW*0.055, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#f00';
    ctx.beginPath(); ctx.arc(cx - bW*0.15, cy - bH*0.05, bW*0.025, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + bW*0.15, cy - bH*0.05, bW*0.025, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(bH*0.38)}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`P${phase}`, cx, cy + bH*0.22);

    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 300) * 0.5;
    ctx.stroke(); ctx.restore();
  }

  _drawPlayer(ctx, px, py) {
    const s = 11;
    ctx.save(); ctx.translate(px, py);
    ctx.fillStyle = '#44bbff';
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(-s*0.55, s*0.55);
    ctx.lineTo(0, s*0.18);
    ctx.lineTo(s*0.55, s*0.55);
    ctx.closePath(); ctx.fill();
    // Engine trail
    const gy = s*0.45;
    const gh = s*0.35 + Math.random()*s*0.25;
    const grad = ctx.createLinearGradient(0, gy, 0, gy + gh);
    grad.addColorStop(0, '#88ffff'); grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad; ctx.fillRect(-s*0.18, gy, s*0.36, gh);
    ctx.restore();
  }

  _updateHUD(state) {
    const $ = (id) => document.getElementById(id);
    if ($('bh-score')) $('bh-score').textContent = state.score;
    if ($('bh-lives')) $('bh-lives').innerHTML = '❤️'.repeat(state.lives) + '🖤'.repeat(Math.max(0, 3 - state.lives));
    const bar = $('bh-bar');
    if (bar) {
      const pct = Math.max(0, state.bossHp / state.bossMaxHp * 100);
      bar.style.width = `${pct}%`;
      bar.style.background = PHASE_COLORS[state.phase - 1];
    }
    if ($('bh-phase-name')) $('bh-phase-name').textContent = PHASE_NAMES[state.phase - 1] ?? '';
    if ($('bh-msg')) $('bh-msg').textContent = state.message;
  }

  destroy() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('bh-styles')?.remove();
  }
}
