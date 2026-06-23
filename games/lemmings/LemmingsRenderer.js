import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const GW = 150, GH = 60;

const SKILLS = ['blocker', 'digger', 'builder', 'basher', 'floater', 'climber'];
const SKILL_ICON  = { blocker:'✋', digger:'⬇', builder:'🪜', basher:'➡', floater:'☂', climber:'🧗' };
const SKILL_LABEL = { blocker:'BLOC', digger:'CREU', builder:'CONS', basher:'BASH', floater:'PARA', climber:'GRIM' };
const ACTION_COLOR = {
  walk:'#4488ff', fall:'#88aaff', blocker:'#ff4444',
  digger:'#ffaa00', builder:'#00ff88', basher:'#ff8800',
  floater:'#00ccff', climber:'#ff44ff'
};

// Level spawn/exit positions (mirrors Lemmings.js LEVELS)
const LEVEL_META = [
  { spawn: { col: 5, row: 20 }, exit: { col: 138, row: 54, w: 8, h: 4 } },
  { spawn: { col: 5, row: 15 }, exit: { col: 138, row: 54, w: 8, h: 4 } },
  { spawn: { col: 5, row: 10 }, exit: { col: 138, row: 54, w: 8, h: 4 } },
  { spawn: { col: 5, row:  5 }, exit: { col: 138, row: 54, w: 8, h: 4 } },
  { spawn: { col: 5, row:  5 }, exit: { col: 138, row: 54, w: 8, h: 4 } },
];

export default class LemmingsRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._scale   = 1;
    this._lastLevelIdx = -1;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onClick   = this._onClick.bind(this);
    this._onToolbar = this._onToolbar.bind(this);
  }

  init() { this._injectStyles(); this._buildLayout(); this._bindEvents(); }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('lm-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('lm-styles')) return;
    const s = document.createElement('style');
    s.id = 'lm-styles';
    s.textContent = `
      .lm-wrapper { position:absolute; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; background:#0a0020;
        font-family:Orbitron,monospace; overflow:hidden; gap:3px; }
      .lm-info { font-size:10px; color:rgba(255,255,255,0.5); display:flex; gap:12px; padding:0 4px; }
      .lm-canvas { display:block; cursor:crosshair; }
      .lm-toolbar { display:flex; gap:5px; flex-wrap:wrap; justify-content:center; }
      .lm-btn { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15);
        color:#bbb; padding:4px 8px; border-radius:4px; cursor:pointer;
        font-size:9px; font-family:Orbitron,monospace; transition:all .12s; white-space:nowrap; }
      .lm-btn:hover:not(:disabled) { background:rgba(255,255,255,0.12); }
      .lm-btn.active { background:rgba(255,200,0,0.2); border-color:#ffc800; color:#ffc800; }
      .lm-btn:disabled { opacity:.28; cursor:default; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'lm-wrapper';

    const cfg = this.config.gameplay;
    const W   = cfg.width, H = cfg.height;
    const vw  = this.viewport.clientWidth  || W;
    const vh  = (this.viewport.clientHeight || H + 90) - 90;
    this._scale = Math.min(vw / W, vh / H, 2.0);
    const sc  = this._scale;

    this._info = document.createElement('div');
    this._info.className = 'lm-info';
    this._info.innerHTML = `
      <span>NIVEAU <b id="lm-lvl">1</b></span>
      <span id="lm-name" style="color:#7bbfff">-</span>
      <span>✅ <b id="lm-saved">0</b></span>
      <span>💀 <b id="lm-dead">0</b></span>
      <span>Objectif <b id="lm-goal">-</b>%</span>`;

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'lm-canvas';
    this._canvas.width  = W;
    this._canvas.height = H;
    this._canvas.style.width  = Math.floor(W * sc) + 'px';
    this._canvas.style.height = Math.floor(H * sc) + 'px';
    this._ctx = this._canvas.getContext('2d');

    this._toolbar = document.createElement('div');
    this._toolbar.className = 'lm-toolbar';

    this._overlay = new GameOverlay(this._wrapper);
    this._showStart();

    this._wrapper.appendChild(this._info);
    this._wrapper.appendChild(this._canvas);
    this._wrapper.appendChild(this._toolbar);
    this.viewport.appendChild(this._wrapper);
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique',
         options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this.game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.45);font-size:10px;text-align:center;line-height:1.8;margin-bottom:4px">
          Les lemmings marchent seuls — <b>clique sur eux</b> pour assigner une compétence<br>
          Sélectionne d'abord une compétence dans la barre d'outils<br>
          Sauve le pourcentage d'objectif pour passer au niveau suivant
        </div>` }
    );
  }

  _buildToolbarButtons(state) {
    this._toolbar.innerHTML = '';
    this._lastLevelIdx = state.levelIdx;
    SKILLS.forEach(sk => {
      if (!(sk in state.available)) return;
      const btn = document.createElement('button');
      btn.className   = 'lm-btn';
      btn.dataset.skill = sk;
      this._toolbar.appendChild(btn);
    });
    this._updateToolbarCounts(state);
  }

  _updateToolbarCounts(state) {
    this._toolbar.querySelectorAll('.lm-btn').forEach(btn => {
      const sk  = btn.dataset.skill;
      const cnt = state.available[sk] ?? 0;
      btn.textContent = `${SKILL_ICON[sk]} ${SKILL_LABEL[sk]} ×${cnt}`;
      btn.disabled    = cnt <= 0;
      btn.classList.toggle('active', state.selectedSkill === sk);
    });
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
    this._canvas.addEventListener('click',      this._onClick);
    this._canvas.addEventListener('touchstart', this._onClick, { passive: true });
    this._toolbar.addEventListener('click',     this._onToolbar);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
    this._canvas.removeEventListener('click',      this._onClick);
    this._canvas.removeEventListener('touchstart', this._onClick);
    this._toolbar.removeEventListener('click',     this._onToolbar);
  }

  _onKeyDown(e) {
    const kb = this.config.controls?.keyboard ?? {};
    if ((kb.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); return; }
    if ((kb.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); return; }
  }

  _onClick(e) {
    if (this.game.state?.status !== 'playing') return;
    const rect = this._canvas.getBoundingClientRect();
    const cx   = ((e.clientX ?? e.touches?.[0]?.clientX) - rect.left) / this._scale;
    const cy   = ((e.clientY ?? e.touches?.[0]?.clientY) - rect.top)  / this._scale;
    this.game.assignSkill(cx, cy);
  }

  _onToolbar(e) {
    const btn = e.target.closest('.lm-btn');
    if (!btn || btn.disabled) return;
    const sk = btn.dataset.skill;
    if (!sk) return;
    this.game.selectSkill(sk);
    // Assign immédiatement au premier lemming disponible (1 clic suffit)
    const assigned = this.game.assignSkillToNearest();
    // Feedback visuel
    this._toolbar.querySelectorAll('.lm-btn').forEach(b => b.classList.remove('active'));
    if (!assigned && (this.game.state?.available?.[sk] ?? 0) > 0) {
      // Skill sélectionné mais aucun lemming cible pour l'instant — reste actif pour clic canvas
      btn.classList.add('active');
    }
    if (this.game.state) this._updateToolbarCounts(this.game.state);
  }

  _onTick({ state }) {
    if (state.status === 'idle') return;

    // Info strip
    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setEl('lm-lvl',   state.levelIdx + 1);
    setEl('lm-name',  state.levelName ?? '');
    setEl('lm-saved', state.saved ?? 0);
    setEl('lm-dead',  state.dead  ?? 0);
    setEl('lm-goal',  state.goal  ?? '-');

    // Toolbar: rebuild when level changes, otherwise just update counts
    if (state.levelIdx !== this._lastLevelIdx) this._buildToolbarButtons(state);
    else this._updateToolbarCounts(state);

    this._draw(state);
  }

  _onOver({ result, icon, title, score, best, extraInfo }) {
    const mode = this.game.state?.mode ?? 'basique';
    this._overlay.showGameOver(
      { result, icon, title, score, best, extraInfo },
      () => { this._overlay.hide(); this._lastLevelIdx = -1; this.game.start({ mode }); }
    );
  }

  _onWon({ result, icon, title, score, best, extraInfo }) {
    const mode = this.game.state?.mode ?? 'basique';
    this._overlay.showGameOver(
      { result, icon, title, score, best, extraInfo },
      () => { this._overlay.hide(); this._lastLevelIdx = -1; this.game.start({ mode }); }
    );
  }

  _onPaused()  { this._overlay.showPause(); }
  _onResumed() { this._overlay.hide(); }

  _onRestart() {
    this._lastLevelIdx = -1;
    this._toolbar.innerHTML = '';
    this._showStart();
  }

  // ── Dessin ───────────────────────────────────────────────────────────────

  _draw(state) {
    const ctx = this._ctx;
    const cfg = this.config.gameplay;
    const cs  = cfg.cellSize;
    const W   = cfg.width, H = cfg.height;

    // Sky
    ctx.fillStyle = '#0f0830';
    ctx.fillRect(0, 0, W, H);

    // Terrain
    const { terrain } = state;
    ctx.fillStyle = '#6b4c1e';
    for (let r = 0; r < terrain.length; r++) {
      const row = terrain[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        if (row[c]) ctx.fillRect(c * cs, r * cs, cs, cs);
      }
    }

    // Top edge highlight
    ctx.fillStyle = '#a07040';
    for (let r = 1; r < terrain.length; r++) {
      const row = terrain[r], above = terrain[r - 1];
      if (!row || !above) continue;
      for (let c = 0; c < row.length; c++) {
        if (row[c] && !above[c]) ctx.fillRect(c * cs, r * cs, cs, 1);
      }
    }

    const meta = LEVEL_META[state.levelIdx] ?? LEVEL_META[0];

    // Exit (green door)
    const ex = meta.exit;
    ctx.fillStyle   = '#00cc66';
    ctx.shadowColor = '#00cc66';
    ctx.shadowBlur  = 8;
    ctx.fillRect(ex.col * cs, ex.row * cs, ex.w * cs, ex.h * cs);
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#00ff88';
    ctx.font        = `${cs * 2.5}px sans-serif`;
    ctx.textAlign   = 'center';
    ctx.fillText('🚪', (ex.col + ex.w / 2) * cs, (ex.row - 0.5) * cs);
    ctx.textAlign   = 'left';

    // Spawn hatch
    const sp = meta.spawn;
    ctx.fillStyle   = '#4488ff';
    ctx.shadowColor = '#4488ff';
    ctx.shadowBlur  = 6;
    ctx.fillRect((sp.col - 1) * cs, (sp.row - 2) * cs, cs * 4, cs * 2);
    ctx.shadowBlur  = 0;

    // Lemmings
    state.lemmings.forEach(l => {
      if (!l.alive) return;
      this._drawLemming(ctx, l, cs);
    });

    // Selected skill indicator on canvas
    if (state.selectedSkill) {
      ctx.fillStyle = 'rgba(255,200,0,0.7)';
      ctx.font      = '9px Orbitron, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`▶ ${SKILL_LABEL[state.selectedSkill]}`, W - 4, H - 4);
      ctx.textAlign = 'left';
    }
  }

  _drawLemming(ctx, l, cs) {
    const x = l.col * cs, y = (l.row - 2) * cs;
    const col = ACTION_COLOR[l.action] ?? '#4488ff';

    ctx.fillStyle = col;

    // Head
    ctx.beginPath();
    ctx.arc(x + cs / 2, y + cs / 2, cs * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillRect(x, y + cs, cs, cs * 1.2);

    // Legs
    const step = Math.floor(l.stepT * 5) % 2;
    ctx.fillStyle = _darkenHex(col, 20);
    if (l.action === 'walk' || l.action === 'fall') {
      if (step === 0) {
        ctx.fillRect(x, y + cs * 2.2, cs * 0.45, cs * 0.8);
        ctx.fillRect(x + cs * 0.55, y + cs * 2.2 + cs * 0.3, cs * 0.45, cs * 0.5);
      } else {
        ctx.fillRect(x, y + cs * 2.2 + cs * 0.3, cs * 0.45, cs * 0.5);
        ctx.fillRect(x + cs * 0.55, y + cs * 2.2, cs * 0.45, cs * 0.8);
      }
    }

    // Blocker arms
    if (l.action === 'blocker') {
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(x - cs * 1.2, y + cs * 1.0, cs * 1.2, cs * 0.3);
      ctx.fillRect(x + cs,       y + cs * 1.0, cs * 1.2, cs * 0.3);
    }

    // Floater umbrella
    if (l.floater && l.action === 'fall') {
      ctx.strokeStyle = '#00ccff';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(x + cs / 2, y - cs * 0.5, cs * 1.4, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + cs / 2, y - cs * 0.5);
      ctx.lineTo(x + cs / 2, y + cs / 2);
      ctx.stroke();
    }
  }
}

function _darkenHex(hex, pct) {
  if (!hex.startsWith('#')) return hex;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - pct / 100;
  return `rgb(${r * f | 0},${g * f | 0},${b * f | 0})`;
}
