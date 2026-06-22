import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const FOUND_COLORS = ['rgba(0,255,136,0.35)','rgba(0,212,255,0.35)','rgba(123,97,255,0.35)','rgba(255,107,53,0.35)','rgba(255,224,48,0.35)','rgba(255,77,139,0.35)'];

export default class WordSearchRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._overlay = null;
    this._canvas  = null;
    this._ctx     = null;
    this._cs      = 32;
    this._dragging = false;
    this._lastHover = null;

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onMouseDown  = this._onMouseDown.bind(this);
    this._onMouseMove  = this._onMouseMove.bind(this);
    this._onMouseUp    = this._onMouseUp.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove  = this._onTouchMove.bind(this);
    this._onTouchEnd   = this._onTouchEnd.bind(this);
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
    document.getElementById('ws-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('ws-styles')) return;
    const s = document.createElement('style');
    s.id = 'ws-styles';
    s.textContent = `
      .ws-wrapper {
        position:absolute; inset:0; display:flex; overflow:hidden;
        background:#050810; font-family:Orbitron,monospace; color:#fff;
      }
      .ws-main { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; overflow:hidden; padding:8px; }
      .ws-info { font-size:10px; color:rgba(255,255,255,0.4); letter-spacing:.1em; display:flex; gap:16px; }
      .ws-info span { color:#fff; }
      .ws-canvas { display:block; cursor:crosshair; border-radius:6px; box-shadow:0 0 20px rgba(0,0,0,0.5); }
      .ws-sidebar {
        flex:0 0 130px; background:rgba(0,0,0,0.35); border-left:1px solid rgba(0,255,225,0.08);
        display:flex; flex-direction:column; gap:4px; padding:10px 8px; overflow-y:auto;
      }
      .ws-sidebar-title { font-size:9px; color:rgba(255,255,255,0.3); letter-spacing:.12em; margin-bottom:6px; }
      .ws-word {
        font-size:10px; letter-spacing:.06em; color:rgba(255,255,255,0.5);
        padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.05);
      }
      .ws-word.found { color:#00ff88; text-decoration:line-through; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'ws-wrapper';

    const main = document.createElement('div');
    main.className = 'ws-main';

    this._infoEl = document.createElement('div');
    this._infoEl.className = 'ws-info';
    this._infoEl.innerHTML = `TEMPS <span id="ws-time">180s</span> &nbsp; SCORE <span id="ws-score">0</span>`;

    const size = this.config.gameplay.gridSize;
    const maxBoard = Math.min(380, window.innerHeight - 100);
    this._cs = Math.floor(maxBoard / size);

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'ws-canvas';
    this._canvas.width  = size * this._cs;
    this._canvas.height = size * this._cs;
    this._ctx = this._canvas.getContext('2d');

    // Word list sidebar
    this._sidebar = document.createElement('div');
    this._sidebar.className = 'ws-sidebar';
    const sTitle = document.createElement('div');
    sTitle.className = 'ws-sidebar-title';
    sTitle.textContent = 'MOTS À TROUVER';
    this._sidebar.appendChild(sTitle);
    this._wordEls = {};

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    main.appendChild(this._infoEl);
    main.appendChild(this._canvas);
    this._wrapper.appendChild(main);
    this._wrapper.appendChild(this._sidebar);
    this.viewport.appendChild(this._wrapper);
  }

  _rebuildWordList(words) {
    // Remove old word elements
    Object.values(this._wordEls).forEach(el => el.remove());
    this._wordEls = {};
    for (const w of words) {
      const el = document.createElement('div');
      el.className = 'ws-word' + (w.found ? ' found' : '');
      el.textContent = w.word;
      this._wordEls[w.word] = el;
      this._sidebar.appendChild(el);
    }
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
    this._canvas.addEventListener('mousedown',  this._onMouseDown);
    this._canvas.addEventListener('mousemove',  this._onMouseMove);
    this._canvas.addEventListener('mouseup',    this._onMouseUp);
    this._canvas.addEventListener('mouseleave', this._onMouseUp);
    this._canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this._canvas.addEventListener('touchmove',  this._onTouchMove,  { passive: false });
    this._canvas.addEventListener('touchend',   this._onTouchEnd);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
    this._canvas.removeEventListener('mousedown',  this._onMouseDown);
    this._canvas.removeEventListener('mousemove',  this._onMouseMove);
    this._canvas.removeEventListener('mouseup',    this._onMouseUp);
    this._canvas.removeEventListener('mouseleave', this._onMouseUp);
    this._canvas.removeEventListener('touchstart', this._onTouchStart);
    this._canvas.removeEventListener('touchmove',  this._onTouchMove);
    this._canvas.removeEventListener('touchend',   this._onTouchEnd);
  }

  _onKeyDown(e) {
    const k = this.config.controls?.keyboard ?? {};
    if ((k.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if ((k.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
  }

  _cellAt(clientX, clientY) {
    const rect = this._canvas.getBoundingClientRect();
    const cs   = this._cs;
    const c = Math.floor((clientX - rect.left) / cs);
    const r = Math.floor((clientY - rect.top)  / cs);
    const size = this.config.gameplay.gridSize;
    if (r < 0 || r >= size || c < 0 || c >= size) return null;
    return { r, c };
  }

  _onMouseDown(e)  { const cell = this._cellAt(e.clientX, e.clientY); if (cell) { this._dragging = true; this.game.startSelect(cell.r, cell.c); } }
  _onMouseMove(e)  { if (!this._dragging) return; const cell = this._cellAt(e.clientX, e.clientY); if (cell) this.game.hoverSelect(cell.r, cell.c); }
  _onMouseUp(e)    { if (!this._dragging) return; this._dragging = false; const cell = this._cellAt(e.clientX, e.clientY); this.game.endSelect(cell?.r ?? -1, cell?.c ?? -1); }
  _onTouchStart(e) { e.preventDefault(); const t = e.touches[0]; const cell = this._cellAt(t.clientX, t.clientY); if (cell) { this._dragging = true; this.game.startSelect(cell.r, cell.c); } }
  _onTouchMove(e)  { e.preventDefault(); if (!this._dragging) return; const t = e.touches[0]; const cell = this._cellAt(t.clientX, t.clientY); if (cell) this.game.hoverSelect(cell.r, cell.c); }
  _onTouchEnd(e)   { if (!this._dragging) return; this._dragging = false; const t = e.changedTouches[0]; const cell = this._cellAt(t.clientX, t.clientY); this.game.endSelect(cell?.r ?? -1, cell?.c ?? -1); }

  _onTick({ state, action }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    if (action === 'new-game') this._rebuildWordList(state.words);
    if (action === 'found') {
      const word = state.words.find(w => w.found && this._wordEls[w.word]);
      if (word) this._wordEls[word.word].className = 'ws-word found';
    }
    document.getElementById('ws-time')  && (document.getElementById('ws-time').textContent  = state.timeLeft + 's');
    document.getElementById('ws-score') && (document.getElementById('ws-score').textContent = state.score);
    this._draw(state);
  }

  _draw(state) {
    const ctx  = this._ctx;
    const CS   = this._cs;
    const size = state.gridSize;
    if (!size || !state.grid.length) return;

    // Background
    ctx.fillStyle = '#0a0f1e';
    ctx.fillRect(0, 0, size * CS, size * CS);

    // Grid cells
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        ctx.strokeRect(c * CS, r * CS, CS, CS);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `bold ${Math.floor(CS * 0.55)}px Orbitron, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(state.grid[r]?.[c] ?? '', c * CS + CS/2, r * CS + CS/2);
      }
    }

    // Found words — highlight
    state.found.forEach((f, i) => {
      const color = FOUND_COLORS[i % FOUND_COLORS.length];
      for (const [cr, cc] of f.cells) {
        ctx.fillStyle = color;
        ctx.fillRect(cc * CS + 1, cr * CS + 1, CS - 2, CS - 2);
      }
    });

    // Current selection preview
    if (state.selecting && state.hoverCell) {
      const { r: sr, c: sc } = state.selecting;
      const { r: er, c: ec } = state.hoverCell;
      const cells = this.game._getCellsBetween(sr, sc, er, ec, size);
      if (cells) {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        for (const [cr, cc] of cells) ctx.fillRect(cc * CS + 1, cr * CS + 1, CS - 2, CS - 2);
      }
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  _onWon(data)  { this._showEnd(data); }
  _onOver(data) { this._showEnd(data); }

  _showEnd(data) {
    this._overlay.showGameOver(
      { result: data.result, icon: data.icon, title: data.title,
        score: data.score, isRecord: data.score >= (data.best ?? 0), extraInfo: data.extraInfo ?? '' },
      () => this._showStartScreen(),
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() {
    Object.values(this._wordEls).forEach(el => el.remove());
    this._wordEls = {};
    this._showStartScreen();
  }
}
