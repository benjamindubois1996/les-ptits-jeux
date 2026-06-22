import EventBus    from '../../js/core/EventBus.js';
import GameOverlay  from '../../js/ui/components/GameOverlay.js';
import TowerDefense from './TowerDefense.js';

const CELL = 36;
const PATH_SET = TowerDefense.PATH_SET;

export default class TowerDefenseRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._overlay = null;
    this._canvas  = null;
    this._ctx     = null;
    this._hoverCell = null;

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onClick   = this._onClick.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('td-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('td-styles')) return;
    const s = document.createElement('style');
    s.id = 'td-styles';
    s.textContent = `
      .td-wrapper {
        position:absolute; inset:0; display:flex; flex-direction:column;
        background:#050810; font-family:Orbitron,monospace; color:#fff; overflow:hidden;
      }
      .td-hud {
        flex:0 0 auto; display:flex; align-items:center; gap:16px; padding:6px 14px;
        background:rgba(0,0,0,0.5); border-bottom:1px solid rgba(0,255,225,0.1); font-size:11px;
        flex-wrap:wrap;
      }
      .td-hud-item { color:rgba(255,255,255,0.5); }
      .td-hud-item span { color:#fff; font-weight:bold; }
      .td-main { flex:1; display:flex; overflow:hidden; }
      .td-canvas-area { flex:1; overflow:auto; display:flex; align-items:center; justify-content:center; }
      .td-canvas { display:block; cursor:crosshair; }
      .td-sidebar {
        flex:0 0 120px; background:rgba(0,0,0,0.4); border-left:1px solid rgba(0,255,225,0.1);
        display:flex; flex-direction:column; gap:8px; padding:8px;
      }
      .td-sidebar-title { font-size:9px; color:rgba(255,255,255,0.3); letter-spacing:.1em; text-align:center; margin-bottom:2px; }
      .td-tower-btn {
        background:rgba(0,255,225,0.06); border:2px solid rgba(0,255,225,0.2);
        color:#fff; font-family:Orbitron,monospace; font-size:9px; letter-spacing:.05em;
        padding:8px 4px; border-radius:6px; cursor:pointer; text-align:center;
        transition:background .15s,border-color .15s;
      }
      .td-tower-btn:hover { background:rgba(0,255,225,0.12); }
      .td-tower-btn.active { border-color:#00ffe1; background:rgba(0,255,225,0.18); }
      .td-tower-btn .cost { display:block; font-size:8px; color:#ffe030; margin-top:2px; }
      .td-wave-banner {
        position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
        background:rgba(5,8,15,0.9); border:2px solid #7b61ff; border-radius:10px;
        padding:12px 24px; font-size:13px; color:#7b61ff; letter-spacing:.15em;
        pointer-events:none; display:none;
      }
      .td-wave-banner.show { display:block; animation:td-banner-anim 1s ease; }
      @keyframes td-banner-anim {
        0% { opacity:0; transform:translate(-50%,-60%); }
        20% { opacity:1; transform:translate(-50%,-50%); }
        80% { opacity:1; }
        100% { opacity:0; }
      }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'td-wrapper';

    // HUD
    this._hudEl = document.createElement('div');
    this._hudEl.className = 'td-hud';
    this._hudEl.innerHTML = `
      <div class="td-hud-item">🪙 <span id="td-gold">150</span></div>
      <div class="td-hud-item">❤️ <span id="td-lives">20</span></div>
      <div class="td-hud-item">🌊 VAGUE <span id="td-wave">0/7</span></div>
    `;

    const main = document.createElement('div');
    main.className = 'td-main';

    const canvasArea = document.createElement('div');
    canvasArea.className = 'td-canvas-area';

    const rows = this.config.gameplay.rows;
    const cols = this.config.gameplay.cols;
    this._canvas = document.createElement('canvas');
    this._canvas.className = 'td-canvas';
    this._canvas.width  = cols * CELL;
    this._canvas.height = rows * CELL;
    this._ctx = this._canvas.getContext('2d');
    canvasArea.appendChild(this._canvas);

    // Wave banner
    this._banner = document.createElement('div');
    this._banner.className = 'td-wave-banner';
    canvasArea.style.position = 'relative';
    canvasArea.appendChild(this._banner);

    // Sidebar
    const sidebar = document.createElement('div');
    sidebar.className = 'td-sidebar';
    const title = document.createElement('div');
    title.className = 'td-sidebar-title';
    title.textContent = 'TOURELLES';
    sidebar.appendChild(title);

    this._towerBtns = {};
    for (const [type, cfg] of Object.entries(this.config.towers)) {
      const btn = document.createElement('button');
      btn.className = 'td-tower-btn' + (type === 'gun' ? ' active' : '');
      btn.innerHTML = `${cfg.label}<span class="cost">💰 ${cfg.cost}</span>`;
      btn.style.borderColor = cfg.color + '66';
      btn.addEventListener('click', () => {
        this.game.selectTower(type);
        Object.values(this._towerBtns).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      this._towerBtns[type] = btn;
      sidebar.appendChild(btn);
    }

    main.appendChild(canvasArea);
    main.appendChild(sidebar);

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this._wrapper.appendChild(this._hudEl);
    this._wrapper.appendChild(main);
    this.viewport.appendChild(this._wrapper);
  }

  _showStartScreen() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this.game.start(sel); },
    );
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
    this._canvas.addEventListener('click',     this._onClick);
    this._canvas.addEventListener('mousemove', this._onMouseMove);
    this._canvas.addEventListener('mouseleave', this._onMouseLeave);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
    this._canvas.removeEventListener('click',     this._onClick);
    this._canvas.removeEventListener('mousemove', this._onMouseMove);
    this._canvas.removeEventListener('mouseleave', this._onMouseLeave);
  }

  _onKeyDown(e) {
    const k = this.config.controls?.keyboard ?? {};
    if ((k.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if ((k.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
  }

  _cellAt(e) {
    const rect = this._canvas.getBoundingClientRect();
    const scaleX = this._canvas.width  / rect.width;
    const scaleY = this._canvas.height / rect.height;
    const c = Math.floor((e.clientX - rect.left) * scaleX / CELL);
    const r = Math.floor((e.clientY - rect.top)  * scaleY / CELL);
    const rows = this.config.gameplay.rows, cols = this.config.gameplay.cols;
    if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
    return { r, c };
  }

  _onClick(e) {
    const cell = this._cellAt(e);
    if (cell) this.game.placeTower(cell.r, cell.c);
  }

  _onMouseMove(e) { this._hoverCell = this._cellAt(e); }
  _onMouseLeave()  { this._hoverCell = null; }

  _onTick({ state, action }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    if (action === 'wave-incoming') this._showBanner(`VAGUE ${state.wave + 1} ARRIVE !`);
    const goldEl = document.getElementById('td-gold'); if (goldEl) goldEl.textContent = state.gold;
    const livesEl = document.getElementById('td-lives'); if (livesEl) livesEl.textContent = state.lives;
    document.getElementById('td-wave')  && (document.getElementById('td-wave').textContent  = `${state.wave}/${7}`);
    this._draw(state);
  }

  _showBanner(text) {
    this._banner.textContent = text;
    this._banner.classList.remove('show');
    void this._banner.offsetWidth;
    this._banner.classList.add('show');
    setTimeout(() => this._banner.classList.remove('show'), 1000);
  }

  _draw(state) {
    const ctx = this._ctx;
    const rows = this.config.gameplay.rows;
    const cols = this.config.gameplay.cols;

    // Grid
    ctx.fillStyle = '#0a0f1e';
    ctx.fillRect(0, 0, cols * CELL, rows * CELL);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isPath = PATH_SET.has(`${r},${c}`);
        ctx.fillStyle = isPath ? '#1a1208' : '#0d1428';
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        ctx.strokeRect(c * CELL, r * CELL, CELL, CELL);
      }
    }

    // Path arrow hints
    const path = TowerDefense.PATH;
    ctx.strokeStyle = 'rgba(255,200,50,0.15)';
    ctx.lineWidth   = 2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    path.forEach(([r, c], i) => {
      const x = c * CELL + CELL / 2, y = r * CELL + CELL / 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Entry / exit markers
    const start = path[0], end = path[path.length - 1];
    ctx.fillStyle = 'rgba(0,255,136,0.3)';
    ctx.fillRect(start[1] * CELL + 4, start[0] * CELL + 4, CELL - 8, CELL - 8);
    ctx.fillStyle = 'rgba(255,40,40,0.3)';
    ctx.fillRect(end[1] * CELL + 4, end[0] * CELL + 4, CELL - 8, CELL - 8);

    // Hover
    if (this._hoverCell && !PATH_SET.has(`${this._hoverCell.r},${this._hoverCell.c}`)) {
      const { r, c } = this._hoverCell;
      const hasTower = state.towers.find(t => t.r === r && t.c === c);
      const towerCfg = this.config.towers[state.selectedTower];
      if (!hasTower && towerCfg) {
        ctx.fillStyle = state.gold >= towerCfg.cost ? 'rgba(0,255,225,0.15)' : 'rgba(255,40,40,0.15)';
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
        // Range circle
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(c * CELL + CELL/2, r * CELL + CELL/2, towerCfg.range * CELL, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Towers
    for (const t of state.towers) {
      const x = t.c * CELL + CELL / 2, y = t.r * CELL + CELL / 2;
      ctx.fillStyle = t.color + 'cc';
      ctx.beginPath(); ctx.arc(x, y, CELL * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `${CELL * 0.4}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.type === 'gun' ? '🔫' : t.type === 'sniper' ? '🎯' : '💣', x, y);
      ctx.textBaseline = 'alphabetic';
    }

    // Enemies
    for (const e of state.enemies) {
      const x = e.x * CELL, y = e.y * CELL;
      const r = CELL * 0.32;
      // Body
      ctx.fillStyle = '#ff4040';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      // HP bar
      const bw = CELL * 0.8;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - bw/2, y - r - 7, bw, 4);
      ctx.fillStyle = '#00ff88';
      ctx.fillRect(x - bw/2, y - r - 7, bw * (e.hp / e.maxHp), 4);
    }

    // Projectiles
    for (const p of state.projectiles) {
      const x = p.x * CELL, y = p.y * CELL;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }

    ctx.textAlign = 'left';
  }

  _onWon(data)  { this._showEndScreen(data); }
  _onOver(data) { this._showEndScreen(data); }

  _showEndScreen(data) {
    this._overlay.showGameOver(
      { result: data.result, icon: data.icon, title: data.title,
        score: data.score, isRecord: data.score >= (data.best ?? 0), extraInfo: data.extraInfo ?? '' },
      () => this._showStartScreen(),
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStartScreen(); }
}
