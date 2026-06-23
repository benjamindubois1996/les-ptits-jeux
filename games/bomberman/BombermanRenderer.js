import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const CELL_COLORS = {
  0: null,
  1: '#2a3a4a',   // hard wall
  2: '#7b5e3a',   // soft wall
  3: '#00ffe1',   // exit
};

const PU_COLORS = { bomb: '#ffe030', range: '#ff4d8b', speed: '#7b61ff' };
const PU_ICONS  = { bomb: '💣', range: '🔥', speed: '⚡' };

export default class BombermanRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._keys    = new Set();
    this._keyLoop = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    if (this._keyLoop) { cancelAnimationFrame(this._keyLoop); this._keyLoop = null; }
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('bm-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('bm-styles')) return;
    const s = document.createElement('style');
    s.id = 'bm-styles';
    s.textContent = `
      .bm-wrapper { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
        justify-content:center; background:#0a0f1a; font-family:Orbitron,monospace; overflow:hidden; gap:6px; }
      .bm-hud  { font-size:10px; color:rgba(255,255,255,0.4); letter-spacing:.1em; display:flex; gap:18px; }
      .bm-canvas { display:block; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'bm-wrapper';

    this._hud = document.createElement('div');
    this._hud.className = 'bm-hud';
    this._hud.innerHTML = `NIVEAU <span id="bm-lvl">1</span> &nbsp; BOMBES <span id="bm-bombs">1/1</span>`;

    const { cols, rows, cellSize } = this.config.gameplay;
    const canvasW = cols * cellSize;
    const canvasH = rows * cellSize;
    const vw = this.viewport.clientWidth  || canvasW;
    const vh = (this.viewport.clientHeight || canvasH) - 30;
    const scale = Math.min(vw / canvasW, vh / canvasH, 1);
    this._scale = scale;
    this._cs    = cellSize;

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'bm-canvas';
    this._canvas.width  = canvasW;
    this._canvas.height = canvasH;
    this._canvas.style.width  = Math.floor(canvasW * scale) + 'px';
    this._canvas.style.height = Math.floor(canvasH * scale) + 'px';
    this._ctx = this._canvas.getContext('2d');

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this._wrapper.appendChild(this._hud);
    this._wrapper.appendChild(this._canvas);
    this.viewport.appendChild(this._wrapper);
  }

  _showStartScreen() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique',
         options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this.game.start(sel); this._startKeyLoop(); },
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
    const k = this.config.controls?.keyboard ?? {};
    if ((k.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); return; }
    if ((k.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); return; }
    const dirs = { ArrowLeft:'l', KeyA:'l', ArrowRight:'r', KeyD:'r', ArrowUp:'u', KeyW:'u', ArrowDown:'d', KeyS:'d' };
    if (dirs[e.code]) { e.preventDefault(); this._keys.add(dirs[e.code]); }
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this._keys.add('bomb'); }
  }

  _onKeyUp(e) {
    const dirs = { ArrowLeft:'l', KeyA:'l', ArrowRight:'r', KeyD:'r', ArrowUp:'u', KeyW:'u', ArrowDown:'d', KeyS:'d' };
    if (dirs[e.code]) this._keys.delete(dirs[e.code]);
    if (e.code === 'Space' || e.code === 'Enter') {
      this._keys.delete('bomb');
      this._bombPlaced = false;
    }
  }

  _startKeyLoop() {
    this._bombPlaced = false;
    const loop = () => {
      if (this.game.state.status === 'playing') {
        const dx = (this._keys.has('r') ? 1 : 0) - (this._keys.has('l') ? 1 : 0);
        const dy = (this._keys.has('d') ? 1 : 0) - (this._keys.has('u') ? 1 : 0);
        if (dx || dy) this.game.move(dx, dy);
        if (this._keys.has('bomb') && !this._bombPlaced) {
          this.game.placeBomb();
          this._bombPlaced = true;
        }
      }
      this._keyLoop = requestAnimationFrame(loop);
    };
    this._keyLoop = requestAnimationFrame(loop);
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    this._updateHud(state);
    this._draw(state);
  }

  _updateHud(state) {
    const lvlEl   = document.getElementById('bm-lvl');
    const bombsEl = document.getElementById('bm-bombs');
    if (lvlEl)   lvlEl.textContent   = state.level;
    if (bombsEl) bombsEl.textContent = `${state.activeBombs}/${state.player.maxBombs}`;
  }

  _draw(state) {
    const ctx = this._ctx;
    const cs  = this._cs;
    const { cols, rows } = this.config.gameplay;

    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, cols * cs, rows * cs);

    // Grid
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = state.grid[r][c];
        if (!cell) {
          // Floor tile
          ctx.fillStyle = (r + c) % 2 === 0 ? '#12182a' : '#0d1220';
          ctx.fillRect(c * cs, r * cs, cs, cs);
          continue;
        }
        const color = CELL_COLORS[cell] || '#333';
        ctx.fillStyle = color;
        ctx.fillRect(c * cs, r * cs, cs, cs);
        if (cell === 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(c * cs, r * cs + cs - 4, cs, 4);
          ctx.fillRect(c * cs + cs - 4, r * cs, 4, cs);
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(c * cs, r * cs, cs, 4);
          ctx.fillRect(c * cs, r * cs, 4, cs);
        } else if (cell === 2) {
          // Brick pattern
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(c * cs + 1, r * cs + 1, cs - 2, cs - 2);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(c * cs + 2, r * cs + 2, cs/2 - 3, cs/2 - 3);
        } else if (cell === 3) {
          // Exit door
          ctx.fillStyle = 'rgba(0,255,225,0.2)';
          ctx.fillRect(c * cs, r * cs, cs, cs);
          ctx.strokeStyle = '#00ffe1';
          ctx.lineWidth = 2;
          ctx.strokeRect(c * cs + 3, r * cs + 3, cs - 6, cs - 6);
          ctx.fillStyle = '#00ffe1';
          ctx.font = `${cs * 0.5}px sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('🚪', c * cs + cs / 2, r * cs + cs / 2);
          ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        }
      }
    }

    // Power-ups (only visible when the wall above has been destroyed)
    Object.entries(state.powerUps).forEach(([key, type]) => {
      const [r, c] = key.split(',').map(Number);
      if (state.grid[r][c] !== 0) return; // hidden under wall
      ctx.fillStyle = PU_COLORS[type] || '#fff';
      ctx.globalAlpha = 0.85;
      ctx.fillRect(c * cs + 4, r * cs + 4, cs - 8, cs - 8);
      ctx.globalAlpha = 1;
      ctx.font = `${cs * 0.5}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(PU_ICONS[type] || '?', c * cs + cs / 2, r * cs + cs / 2);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    });

    // Explosions
    state.explosions.forEach(ex => {
      ex.cells.forEach(([er, ec]) => {
        ctx.fillStyle = 'rgba(255,180,0,0.85)';
        ctx.fillRect(ec * cs + 2, er * cs + 2, cs - 4, cs - 4);
        ctx.fillStyle = 'rgba(255,255,200,0.7)';
        ctx.fillRect(ec * cs + cs/2 - 4, er * cs + cs/2 - 4, 8, 8);
      });
    });

    // Bombs
    state.bombs.forEach(b => {
      if (b.exploding) return;
      const x = b.c * cs + cs / 2;
      const y = b.r * cs + cs / 2;
      const pct = b.timer / this.config.gameplay.bombTimer;
      ctx.fillStyle = pct > 0.5 ? '#333' : '#666';
      ctx.shadowColor = '#ff8020'; ctx.shadowBlur = 4 + (1 - pct) * 10;
      ctx.beginPath(); ctx.arc(x, y, cs * 0.36, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // Fuse
      ctx.strokeStyle = '#ffe030';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - cs * 0.36);
      ctx.quadraticCurveTo(x + cs * 0.2, y - cs * 0.5, x + cs * 0.1, y - cs * 0.6);
      ctx.stroke();
    });

    // Enemies
    state.enemies.forEach(e => {
      const ex = e.c * cs + cs / 2, ey = e.r * cs + cs / 2;
      ctx.fillStyle = '#ff4d8b';
      ctx.shadowColor = '#ff4d8b'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(ex, ey, cs * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(ex - 4, ey - 2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + 4, ey - 2, 2, 0, Math.PI * 2); ctx.fill();
    });

    // Player
    const px = state.player.c * cs + cs / 2;
    const py = state.player.r * cs + cs / 2;
    ctx.fillStyle = state._invincible && Math.floor(Date.now() / 150) % 2 ? 'rgba(123,97,255,0.4)' : '#7b61ff';
    ctx.shadowColor = '#7b61ff'; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(px, py - cs * 0.42);
    ctx.lineTo(px + cs * 0.36, py + cs * 0.3);
    ctx.lineTo(px - cs * 0.36, py + cs * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    // Range indicator (subtle)
    ctx.strokeStyle = 'rgba(255,100,0,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.arc(px, py, state.player.range * cs, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  _onOver(data)   { this._showEnd(data); }
  _onWon(data)    { this._showEnd(data); }
  _showEnd(data)  {
    this._overlay.showGameOver(
      { result: data.result, icon: data.icon, title: data.title,
        score: data.score, isRecord: data.score >= (data.best ?? 0), extraInfo: data.extraInfo ?? '' },
      () => this._showStartScreen(),
    );
  }
  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { if (this._keyLoop) { cancelAnimationFrame(this._keyLoop); this._keyLoop = null; } this._showStartScreen(); }
}
