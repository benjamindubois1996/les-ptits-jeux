import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const CELL = 90;
const GAP  = 4;

export default class TaquinRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._overlay = null;
    this._tileDivs = [];

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
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
    document.getElementById('tq-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('tq-styles')) return;
    const s = document.createElement('style');
    s.id = 'tq-styles';
    s.textContent = `
      .tq-wrapper {
        position:absolute; inset:0;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        background:#050810; font-family:Orbitron,monospace; color:#fff; overflow:hidden;
      }
      .tq-info {
        font-size:11px; color:rgba(255,255,255,0.4); letter-spacing:.1em; margin-bottom:10px;
      }
      .tq-board {
        position:relative; background:#0a1428; border-radius:8px;
        box-shadow:0 0 30px rgba(0,255,225,0.08), 0 4px 20px rgba(0,0,0,0.6);
        padding:${GAP}px;
      }
      .tq-tile {
        position:absolute; width:${CELL}px; height:${CELL}px; border-radius:6px;
        display:flex; align-items:center; justify-content:center;
        font-size:26px; font-weight:bold; letter-spacing:0; cursor:pointer;
        background:linear-gradient(135deg,#1a2a4a,#0d1c38);
        border:2px solid rgba(0,255,225,0.18);
        color:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.4);
        transition:left .12s ease, top .12s ease, background .15s;
        user-select:none;
      }
      .tq-tile:hover { background:linear-gradient(135deg,#233050,#162240); border-color:rgba(0,255,225,0.4); }
      .tq-tile.tq-correct { border-color:rgba(0,255,136,0.5); color:#00ff88; }
      .tq-tile.tq-empty { background:transparent; border:2px dashed rgba(255,255,255,0.06); cursor:default; pointer-events:none; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'tq-wrapper';

    this._infoEl = document.createElement('div');
    this._infoEl.className = 'tq-info';
    this._infoEl.textContent = 'COUPS : 0';

    const size  = this.config.gameplay.size;
    const bSize = size * CELL + (size + 1) * GAP;
    this._board = document.createElement('div');
    this._board.className = 'tq-board';
    this._board.style.width  = bSize + 'px';
    this._board.style.height = bSize + 'px';

    for (let i = 0; i < size * size; i++) {
      const tile = document.createElement('div');
      tile.className = 'tq-tile';
      const idx = i;
      tile.addEventListener('click', () => {
        const r = Math.floor(idx / size);
        const c = idx % size;
        this.game.slideAt(r, c);
      });
      this._tileDivs.push(tile);
      this._board.appendChild(tile);
    }

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this._wrapper.appendChild(this._infoEl);
    this._wrapper.appendChild(this._board);
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
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    const k    = this.config.controls?.keyboard ?? {};
    const { state } = this.game;
    if ((k.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if ((k.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }

    if (state.status !== 'playing') return;
    const emptyIdx  = state.tiles.indexOf(0);
    const er        = Math.floor(emptyIdx / state.size);
    const ec        = emptyIdx % state.size;
    let targetR = er, targetC = ec;
    if ((k.up    ?? []).includes(e.code)) { e.preventDefault(); targetR = er + 1; }
    if ((k.down  ?? []).includes(e.code)) { e.preventDefault(); targetR = er - 1; }
    if ((k.left  ?? []).includes(e.code)) { e.preventDefault(); targetC = ec + 1; }
    if ((k.right ?? []).includes(e.code)) { e.preventDefault(); targetC = ec - 1; }
    if (targetR !== er || targetC !== ec) {
      if (targetR >= 0 && targetR < state.size && targetC >= 0 && targetC < state.size) {
        this.game.slideAt(targetR, targetC);
      }
    }
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    this._infoEl.textContent = `COUPS : ${state.moves}`;
    this._renderTiles(state);
  }

  _renderTiles(state) {
    const size = state.size;
    state.tiles.forEach((val, pos) => {
      const tile = this._tileDivs[pos];
      const r    = Math.floor(pos / size);
      const c    = pos % size;
      tile.style.left = (GAP + c * (CELL + GAP)) + 'px';
      tile.style.top  = (GAP + r * (CELL + GAP)) + 'px';
      if (val === 0) {
        tile.textContent = '';
        tile.className = 'tq-tile tq-empty';
      } else {
        tile.textContent = val;
        const correct = val === pos + 1 || (val === size * size && pos === size * size - 1);
        tile.className = 'tq-tile' + (correct ? ' tq-correct' : '');
      }
    });
  }

  _onWon(data) {
    this._overlay.showGameOver(
      { result: 'win', icon: data.icon, title: data.title, score: data.score,
        isRecord: data.score >= (data.best ?? 0), extraInfo: data.extraInfo ?? '' },
      () => this._showStartScreen(),
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStartScreen(); }
}
