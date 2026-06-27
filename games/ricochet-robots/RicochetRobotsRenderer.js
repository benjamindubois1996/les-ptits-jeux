import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID = 'ricochet-robots';

const COLORS = { red:'#ff3333', blue:'#4488ff', green:'#44cc44', yellow:'#ffdd00' };
const FR     = { red:'ROUGE', blue:'BLEU', green:'VERT', yellow:'JAUNE' };

export default class RicochetRobotsRenderer {
  constructor(game, viewport, config) {
    this._game    = game;
    this._vp      = viewport;
    this._cfg     = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._state   = null;
    this._notifEl = null;
    this._notifTimer = null;

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._overlay = new GameOverlay(this._vp);
    this._showStart();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById(`${ID}-styles`)?.remove();
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = `${ID}-wrapper`;

    this._info = document.createElement('div');
    this._info.className = `${ID}-info`;

    this._objective = document.createElement('div');
    this._objective.className = `${ID}-objective`;

    this._canvas = document.createElement('canvas');
    this._canvas.className = `${ID}-canvas`;
    this._ctx = this._canvas.getContext('2d');

    this._robotBtns = document.createElement('div');
    this._robotBtns.className = `${ID}-robot-btns`;

    this._notifEl = document.createElement('div');
    this._notifEl.className = `${ID}-notif ${ID}-notif--hidden`;

    this._wrapper.appendChild(this._info);
    this._wrapper.appendChild(this._objective);
    this._wrapper.appendChild(this._canvas);
    this._wrapper.appendChild(this._robotBtns);
    this._wrapper.appendChild(this._notifEl);
    this._vp.appendChild(this._wrapper);
    this._bindCanvasEvents();
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique',
         options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this._game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.8;margin-bottom:4px">
          Amenez le robot de la bonne couleur sur la case ★<br>
          Les robots glissent jusqu'à un mur ou un autre robot<br>
          Cliquez un robot pour le sélectionner · ↑↓←→ pour le déplacer<br>
          Utilisez les autres robots comme blocs pour stopper le vôtre !
        </div>` }
    );
  }

  // ── Robot buttons ─────────────────────────────────────────────────────────

  _buildRobotBtns(state) {
    const el = this._robotBtns;
    el.innerHTML = '';
    for (const robot of state.robots) {
      const btn = document.createElement('button');
      btn.className = `${ID}-robot-btn`;
      const isTarget = state.target?.color === robot.color;
      const isSelected = state.selected === robot.color;
      btn.style.borderColor = COLORS[robot.color];
      btn.style.color       = isSelected ? COLORS[robot.color] : '#8899bb';
      btn.style.background  = isSelected ? COLORS[robot.color]+'33' : 'transparent';
      btn.textContent = FR[robot.color] ?? robot.color;
      if (isTarget) btn.textContent += ' ★';
      btn.addEventListener('click', () => this._game.selectRobot(robot.color));
      el.appendChild(btn);
    }
    // Undo
    const undo = document.createElement('button');
    undo.className = `${ID}-robot-btn`;
    undo.style.borderColor = '#556'; undo.style.color = '#8899bb';
    undo.textContent = '↩ Annuler';
    undo.addEventListener('click', () => this._game.undoMove());
    el.appendChild(undo);
  }

  // ── Canvas events ─────────────────────────────────────────────────────────

  _bindCanvasEvents() {
    const cvs = this._canvas;
    const hitCell = (cx, cy) => {
      const rect  = cvs.getBoundingClientRect();
      const cellPx = rect.width / this._cfg.gameplay.size;
      return {
        c: Math.floor((cx - rect.left) / cellPx),
        r: Math.floor((cy - rect.top)  / cellPx)
      };
    };

    cvs.addEventListener('click', e => {
      if (!this._state || this._state.status !== 'playing') return;
      const { r, c } = hitCell(e.clientX, e.clientY);
      // Click on a robot → select it
      const robot = this._state.robots.find(rb => rb.r === r && rb.c === c);
      if (robot) { this._game.selectRobot(robot.color); return; }
      // Click on a reachable cell → move selected robot there
      const sel = this._state.selected;
      if (!sel) return;
      const reachable = this._game.getReachable(sel);
      const target    = reachable.find(rc => rc.r === r && rc.c === c);
      if (target) this._game.moveRobot(sel, target.dir);
    });

    cvs.addEventListener('touchend', e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      cvs.dispatchEvent(new MouseEvent('click', { clientX: t.clientX, clientY: t.clientY, bubbles: true }));
    }, { passive: false });
  }

  // ── Draw ─────────────────────────────────────────────────────────────────

  _draw(s) {
    const n    = this._cfg.gameplay.size;
    const ctx  = this._ctx;
    const sz   = this._canvas.width;
    const cell = sz / n;
    const wt   = 4;

    ctx.clearRect(0, 0, sz, sz);
    ctx.fillStyle = '#080f18';
    ctx.fillRect(0, 0, sz, sz);

    // Grille
    ctx.strokeStyle = '#1a2540'; ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i*cell, 0); ctx.lineTo(i*cell, sz); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i*cell); ctx.lineTo(sz, i*cell); ctx.stroke();
    }

    // Bordure extérieure
    ctx.strokeStyle = '#3a4a60'; ctx.lineWidth = wt;
    ctx.strokeRect(wt/2, wt/2, sz-wt, sz-wt);

    // Cases atteignables (si robot sélectionné)
    if (s.selected) {
      const reachable = this._game.getReachable(s.selected);
      const robot = s.robots.find(rb => rb.color === s.selected);
      if (robot) {
        for (const rc of reachable) {
          ctx.fillStyle = COLORS[s.selected] + '22';
          ctx.fillRect(rc.c*cell+1, rc.r*cell+1, cell-2, cell-2);
          // Cercle cible
          ctx.beginPath(); ctx.arc((rc.c+0.5)*cell, (rc.r+0.5)*cell, cell*0.2, 0, Math.PI*2);
          ctx.strokeStyle = COLORS[s.selected] + '88'; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    }

    // Cible ★
    if (s.target) {
      const t  = s.target;
      ctx.fillStyle = COLORS[t.color] + '44';
      ctx.fillRect(t.c*cell+2, t.r*cell+2, cell-4, cell-4);
      ctx.strokeStyle = COLORS[t.color]; ctx.lineWidth = 2;
      ctx.strokeRect(t.c*cell+4, t.r*cell+4, cell-8, cell-8);
      ctx.fillStyle = COLORS[t.color];
      ctx.font = `bold ${cell*0.45}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('★', (t.c+0.5)*cell, (t.r+0.5)*cell);
    }

    // Murs
    if (s.walls) {
      ctx.fillStyle = '#aac';
      for (const wall of s.walls) {
        const [pos, side] = wall.split(':');
        const [wr, wc] = pos.split(',').map(Number);
        const x = wc*cell, y = wr*cell;
        if (side==='N') ctx.fillRect(x,        y - wt/2, cell, wt);
        if (side==='S') ctx.fillRect(x,        y+cell - wt/2, cell, wt);
        if (side==='E') ctx.fillRect(x+cell - wt/2, y, wt, cell);
        if (side==='W') ctx.fillRect(x - wt/2, y, wt, cell);
      }
    }

    // Robots
    for (const robot of s.robots) {
      const isSelected = s.selected === robot.color;
      const rx = (robot.c+0.5)*cell, ry = (robot.r+0.5)*cell, rad = cell*0.36;
      ctx.beginPath(); ctx.arc(rx, ry, rad, 0, Math.PI*2);
      ctx.fillStyle = COLORS[robot.color] + (isSelected ? 'ff' : 'bb');
      ctx.fill();
      if (isSelected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${cell*0.28}px Orbitron, monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(FR[robot.color]?.[0] ?? robot.color[0].toUpperCase(), rx, ry);
    }
  }

  _showNotif(text) {
    if (this._notifTimer) clearTimeout(this._notifTimer);
    this._notifEl.textContent = text;
    this._notifEl.classList.remove(`${ID}-notif--hidden`);
    this._notifTimer = setTimeout(() => this._notifEl.classList.add(`${ID}-notif--hidden`), 1500);
  }

  _resize() {
    const size = Math.min(this._vp.clientWidth - 32, this._vp.clientHeight - 130, 400);
    if (this._canvas.width !== size) { this._canvas.width = size; this._canvas.height = size; }
  }

  // ── Events ────────────────────────────────────────────────────────────────

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
  }

  _onTick({ state, action }) {
    this._state = state;
    if (state.status !== 'playing') return;

    if (action === 'next-puzzle') this._showNotif(`✓ Puzzle ${state.puzzleNum - 1} résolu !`);

    this._info.textContent = `Puzzle ${state.puzzleNum}/5 — Coups : ${state.moves}`;

    const t = state.target;
    if (t) {
      this._objective.innerHTML = `Objectif : amener le robot <span style="color:${COLORS[t.color]};font-weight:bold">${FR[t.color]}</span> sur la case ★`;
    }

    this._resize();
    this._buildRobotBtns(state);
    this._draw(state);
  }

  _onWon({ result, icon, title, score, best, isRecord, extraInfo }) {
    const mode = this._game.state?.mode;
    this._overlay.showGameOver(
      { result, icon, title, score, best, isRecord, extraInfo },
      () => { this._overlay.hide(); this._game.start({ mode }); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() {
    this._overlay.hide();
    if (this._state) { this._buildRobotBtns(this._state); this._draw(this._state); }
  }
  _onRestart() { this._showStart(); }

  // ── Styles ────────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;
    const s = document.createElement('style');
    s.id = `${ID}-styles`;
    s.textContent = `
      .${ID}-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        background: #05080f; gap: 6px; padding: 10px; box-sizing: border-box;
        font-family: Orbitron, monospace;
      }
      .${ID}-info      { color: #8899bb; font-size: 0.72rem; letter-spacing: 1px; }
      .${ID}-objective { font-size: 0.72rem; color: #ccd; letter-spacing: 0.5px; }
      .${ID}-canvas    { display: block; cursor: pointer; border: 2px solid #1a2540; }
      .${ID}-robot-btns { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
      .${ID}-robot-btn {
        padding: 4px 10px; border-radius: 4px; border: 2px solid;
        background: transparent; font-family: Orbitron, monospace;
        font-size: 0.65rem; font-weight: bold; cursor: pointer; transition: all 0.1s;
      }
      .${ID}-robot-btn:hover { filter: brightness(1.3); }
      .${ID}-notif  { font-size: 0.78rem; color: #00e87a; letter-spacing: 2px; transition: opacity 0.3s; }
      .${ID}-notif--hidden { opacity: 0; }
    `;
    document.head.appendChild(s);
  }
}
