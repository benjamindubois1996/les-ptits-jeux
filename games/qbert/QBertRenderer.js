import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const PALETTES = [
  { base: '#2a3566', target: '#ff6b35', top: '#4a55a0', name: 'Orange' },
  { base: '#1a4a1a', target: '#ffdd00', top: '#2a7a2a', name: 'Jaune'  },
  { base: '#4a1a1a', target: '#00ddff', top: '#8a2a2a', name: 'Cyan'   },
  { base: '#3a2a4a', target: '#ff4da6', top: '#6a4a8a', name: 'Rose'   },
  { base: '#1a3a3a', target: '#ff9900', top: '#2a6a6a', name: 'Ambre'  },
];

export default class QBertRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  init() { this._injectStyles(); this._buildLayout(); this._bindEvents(); }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('qb-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('qb-styles')) return;
    const s = document.createElement('style');
    s.id = 'qb-styles';
    s.textContent = `
      .qb-wrapper { position:absolute; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; background:#0a0520;
        font-family:Orbitron,monospace; overflow:hidden; gap:4px; }
      .qb-hud { font-size:10px; color:rgba(255,255,255,0.45); letter-spacing:.07em;
        display:flex; align-items:center; gap:14px; }
      .qb-target-box { display:inline-flex; align-items:center; gap:5px;
        background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:4px; }
      .qb-target-swatch { width:12px; height:12px; border-radius:2px; display:inline-block; }
      .qb-canvas { display:block; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'qb-wrapper';

    const cfg  = this.config.gameplay;
    const W    = cfg.canvasW, H = cfg.canvasH;
    const vw   = this.viewport.clientWidth  || W;
    const vh   = (this.viewport.clientHeight || H + 50) - 50;
    this._scale = Math.min(vw / W, vh / H, 1.6);
    const sc   = this._scale;

    this._hud = document.createElement('div');
    this._hud.className = 'qb-hud';
    this._hud.innerHTML = `
      <span>NIVEAU <b id="qb-lvl">1</b></span>
      <span>ROUND <b id="qb-round">1</b>/2</span>
      <span class="qb-target-box">
        Objectif : <span class="qb-target-swatch" id="qb-swatch"></span>
        <span id="qb-progress">0/28</span>
      </span>`;

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'qb-canvas';
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
      { extraHtml: `<div style="color:rgba(255,255,255,0.45);font-size:10px;text-align:center;line-height:1.8;margin-bottom:4px">
          Saute sur <b>tous les cubes</b> pour les changer de couleur<br>
          ↖ <b>Q</b> · ↗ <b>E</b> · ↙ <b>Z</b> · ↘ <b>X</b> (ou flèches)<br>
          Évite Coily le serpent violet • 2 rounds par niveau
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
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    const kb = this.config.controls?.keyboard ?? {};
    if ((kb.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); return; }
    if ((kb.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); return; }
    const map = {
      ArrowUp: 'UR', KeyE: 'UR',
      ArrowLeft: 'UL', KeyQ: 'UL',
      ArrowDown: 'DL', KeyZ: 'DL',
      ArrowRight: 'DR', KeyX: 'DR',
    };
    if (map[e.code]) { e.preventDefault(); this.game.move(map[e.code]); }
  }

  _onTick({ state }) {
    if (state.status === 'idle') return;
    const pidx = Math.min((state.level - 1) % PALETTES.length, PALETTES.length - 1);
    const pal  = PALETTES[pidx];

    const lvlEl = document.getElementById('qb-lvl');
    const rndEl = document.getElementById('qb-round');
    const swEl  = document.getElementById('qb-swatch');
    const prEl  = document.getElementById('qb-progress');
    if (lvlEl) lvlEl.textContent = state.level;
    if (rndEl) rndEl.textContent = state.round ?? 1;
    if (swEl)  swEl.style.background = pal.target;
    if (prEl) {
      const flipped = state.cubes.filter(c => c.flipped).length;
      prEl.textContent = `${flipped}/${state.cubes.length}`;
      prEl.style.color = flipped === state.cubes.length ? '#00ff88' : '#fff';
    }

    this._draw(state, pal);
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

  // ── ISO ───────────────────────────────────────────────────────────────────

  _isoPos(row, col, cfg) {
    const cx = cfg.canvasW / 2;
    const cw = cfg.cellW, ch = cfg.cellH;
    return {
      cx: cx + (col - row / 2) * cw,
      cy: cfg.topY + row * ch * 0.75
    };
  }

  _drawCube(ctx, row, col, cfg, pal, flipped) {
    const { cx, cy } = this._isoPos(row, col, cfg);
    const hw = cfg.cellW / 2, hh = cfg.cellH / 2;
    const fh = cfg.cellH * 0.55;

    const fill = flipped ? pal.target : pal.base;
    const top  = flipped ? _lighten(pal.target, 30) : pal.top;
    const dark = _darken(fill, 30);
    const lft  = _darken(fill, 15);

    // Top
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fillStyle = top; ctx.fill();

    // Left
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy); ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx, cy + hh + fh); ctx.lineTo(cx - hw, cy + fh);
    ctx.closePath();
    ctx.fillStyle = lft; ctx.fill();

    // Right
    ctx.beginPath();
    ctx.moveTo(cx + hw, cy); ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx, cy + hh + fh); ctx.lineTo(cx + hw, cy + fh);
    ctx.closePath();
    ctx.fillStyle = dark; ctx.fill();

    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.closePath(); ctx.stroke();
  }

  _draw(state, pal) {
    const ctx = this._ctx;
    const cfg = this.config.gameplay;
    const W   = cfg.canvasW, H = cfg.canvasH;

    ctx.fillStyle = '#0a0520';
    ctx.fillRect(0, 0, W, H);

    // Cubes (bottom-to-top painter's order)
    [...state.cubes].sort((a, b) => a.row - b.row || a.col - b.col)
      .forEach(c => this._drawCube(ctx, c.row, c.col, cfg, pal, c.flipped));

    // Enemies
    state.enemies.forEach(e => {
      if (e.dying) return;
      const { cx, cy } = this._isoPos(e.row, e.col, cfg);
      this._drawCoily(ctx, cx, cy - cfg.cellH * 0.5, cfg);
    });

    // Player
    this._drawQbert(ctx, state.player, cfg);

    // Key hint
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font      = '9px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Q↖  E↗  Z↙  X↘', W / 2, H - 8);
    ctx.textAlign = 'left';
  }

  _drawQbert(ctx, p, cfg) {
    if (!p) return;
    let row = p.row, col = p.col, yOff = 0;

    if (p.jumping && p.jumpT < 1) {
      const t  = p.jumpT;
      row = p.row + (p.targetRow - p.row) * t;
      col = p.col + (p.targetCol - p.col) * t;
      yOff = -Math.sin(t * Math.PI) * cfg.cellH * 0.85;
    }

    const { cx, cy } = this._isoPos(row, col, cfg);
    const bx = cx, by = cy - cfg.cellH * 0.48 + yOff;

    if (p.dying) ctx.globalAlpha = Math.max(0, p.deathT / 0.9);

    // Body
    ctx.fillStyle   = '#ff6b20';
    ctx.shadowColor = '#ff6b20';
    ctx.shadowBlur  = 6;
    ctx.beginPath(); ctx.arc(bx, by - 5, 10, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur  = 0;

    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(bx - 4, by - 8, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx + 4, by - 8, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(bx - 3, by - 8, 2,   0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx + 5, by - 8, 2,   0, Math.PI * 2); ctx.fill();

    // Nose (!)
    ctx.fillStyle   = '#cc3300';
    ctx.shadowColor = '#cc3300';
    ctx.shadowBlur  = 4;
    ctx.beginPath(); ctx.arc(bx, by - 4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur  = 0;

    // Legs
    ctx.fillStyle = '#ff6b20';
    ctx.fillRect(bx - 7, by, 5, 5);
    ctx.fillRect(bx + 2, by, 5, 5);

    ctx.globalAlpha = 1;
  }

  _drawCoily(ctx, x, y) {
    // Body
    ctx.fillStyle   = '#9920cc';
    ctx.shadowColor = '#9920cc';
    ctx.shadowBlur  = 6;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle   = '#c040ee';
    ctx.beginPath(); ctx.arc(x, y - 13, 7, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur  = 0;
    // Eyes
    ctx.fillStyle = '#ff0';
    ctx.beginPath(); ctx.arc(x - 3, y - 15, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3, y - 15, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(x - 2, y - 15, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 4, y - 15, 1.2, 0, Math.PI * 2); ctx.fill();
  }
}

function _lighten(hex, pct) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const f = pct / 100;
  return `rgb(${Math.min(255, r + (255 - r) * f) | 0},${Math.min(255, g + (255 - g) * f) | 0},${Math.min(255, b + (255 - b) * f) | 0})`;
}

function _darken(hex, pct) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - pct / 100;
  return `rgb(${r * f | 0},${g * f | 0},${b * f | 0})`;
}
