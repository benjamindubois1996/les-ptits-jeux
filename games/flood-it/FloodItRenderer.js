import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const COLORS = ['#ff4d8b','#00ffe1','#7b61ff','#ffe030','#ff6b35','#00d4ff'];

export default class FloodItRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._overlay = null;
    this._canvas  = null;
    this._ctx     = null;

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
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
    document.getElementById('fi-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('fi-styles')) return;
    const s = document.createElement('style');
    s.id = 'fi-styles';
    s.textContent = `
      .fi-wrapper {
        position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
        background:#050810; font-family:Orbitron,monospace; color:#fff; overflow:hidden; gap:10px; padding:10px;
      }
      .fi-info { font-size:11px; color:rgba(255,255,255,0.4); letter-spacing:.1em; display:flex; gap:20px; }
      .fi-info span { color:#fff; }
      .fi-moves-bar { width:280px; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden; }
      .fi-moves-fill { height:100%; background:linear-gradient(90deg,#00ffe1,#7b61ff); border-radius:3px; transition:width .2s; }
      .fi-canvas { display:block; border-radius:6px; box-shadow:0 0 24px rgba(0,0,0,0.5); }
      .fi-colors { display:flex; gap:8px; justify-content:center; }
      .fi-color-btn {
        width:44px; height:44px; border-radius:50%; border:3px solid rgba(255,255,255,0.15);
        cursor:pointer; transition:transform .1s,border-color .15s,box-shadow .15s;
      }
      .fi-color-btn:hover { transform:scale(1.12); border-color:rgba(255,255,255,0.5); }
      .fi-color-btn.active { border-color:#fff; box-shadow:0 0 12px currentColor; transform:scale(1.1); }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'fi-wrapper';

    this._infoEl = document.createElement('div');
    this._infoEl.className = 'fi-info';
    this._infoEl.innerHTML = `COUPS <span id="fi-moves">0/25</span>`;

    const movesBarWrap = document.createElement('div');
    movesBarWrap.className = 'fi-moves-bar';
    this._movesFill = document.createElement('div');
    this._movesFill.className = 'fi-moves-fill';
    this._movesFill.style.width = '100%';
    movesBarWrap.appendChild(this._movesFill);

    const size = this.config.gameplay.size;
    // Calculate cell size to fit in reasonable space
    const maxSize = Math.min(380, window.innerWidth - 40, window.innerHeight - 200);
    this._cs = Math.floor(maxSize / size);

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'fi-canvas';
    this._canvas.width  = size * this._cs;
    this._canvas.height = size * this._cs;
    this._ctx = this._canvas.getContext('2d');

    // Color buttons
    const colorsEl = document.createElement('div');
    colorsEl.className = 'fi-colors';
    this._colorBtns = [];
    for (let i = 0; i < this.config.gameplay.colors; i++) {
      const btn = document.createElement('button');
      btn.className = 'fi-color-btn';
      btn.style.backgroundColor = COLORS[i];
      btn.style.color = COLORS[i];
      const idx = i;
      btn.addEventListener('click', () => this.game.flood(idx));
      this._colorBtns.push(btn);
      colorsEl.appendChild(btn);
    }

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this._wrapper.appendChild(this._infoEl);
    this._wrapper.appendChild(movesBarWrap);
    this._wrapper.appendChild(this._canvas);
    this._wrapper.appendChild(colorsEl);
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
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    const k = this.config.controls?.keyboard ?? {};
    if ((k.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if ((k.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
    // Number keys 1-6 select color
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= this.config.gameplay.colors) {
      e.preventDefault();
      this.game.flood(num - 1);
    }
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    const max = state.maxMoves;
    document.getElementById('fi-moves') && (document.getElementById('fi-moves').textContent = `${state.moves}/${max}`);
    this._movesFill.style.width = `${((max - state.moves) / max) * 100}%`;
    if (state.moves / max > 0.7) this._movesFill.style.background = 'linear-gradient(90deg,#ff4040,#ff8020)';
    else if (state.moves / max > 0.4) this._movesFill.style.background = 'linear-gradient(90deg,#ff8020,#ffe030)';
    else this._movesFill.style.background = 'linear-gradient(90deg,#00ffe1,#7b61ff)';

    // Highlight current base color
    const baseColor = state.grid[0]?.[0] ?? -1;
    this._colorBtns.forEach((b, i) => b.classList.toggle('active', i === baseColor));

    this._draw(state);
  }

  _draw(state) {
    const ctx  = this._ctx;
    const CS   = this._cs;
    const size = state.size;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const v = state.grid[r]?.[c] ?? 0;
        ctx.fillStyle = COLORS[v % COLORS.length];
        ctx.fillRect(c * CS, r * CS, CS, CS);
        if (CS >= 8) {
          ctx.strokeStyle = 'rgba(0,0,0,0.2)';
          ctx.lineWidth = 1;
          ctx.strokeRect(c * CS, r * CS, CS, CS);
        }
      }
    }
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
  _onRestart() { this._showStartScreen(); }
}
