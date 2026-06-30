import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

export default class LabyrintheRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._config   = config;
    this._wrapper  = null;
    this._canvas   = null;
    this._ctx      = null;
    this._overlay  = null;

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._overlay = new GameOverlay(this._wrapper);
    this._showStart();
    this._bindEvents();
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      () => { this._overlay.hide(); this._game.start(); }
    );
  }

  _injectStyles() {
    if (document.getElementById('lab-styles')) return;
    const s = document.createElement('style');
    s.id = 'lab-styles';
    s.textContent = `
      .lab-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 8px;
        box-sizing: border-box; gap: 6px;
        font-family: Orbitron, monospace;
        background: #05080f; overflow: hidden; color: #ccc;
      }
      .lab-info {
        flex: 0 0 auto; display: flex; gap: 16px; font-size: 11px;
        color: rgba(255,255,255,0.5); letter-spacing: 0.08em;
      }
      .lab-info strong { color: #9d7bff; }
      .lab-canvas-area {
        flex: 1; overflow: auto; display: flex;
        align-items: center; justify-content: center; width: 100%;
      }
      .lab-canvas { display: block; }
      .lab-hint {
        flex: 0 0 auto; font-size: 9px; color: rgba(255,255,255,0.25);
        letter-spacing: 0.08em; text-align: center;
      }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'lab-wrapper';
    this._wrapper.innerHTML = `
      <div class="lab-info">
        <span>Niveau <strong id="lab-level">1</strong>/8</span>
        <span>Coups : <strong id="lab-moves">0</strong></span>
        <span>Score : <strong id="lab-score">0</strong></span>
      </div>
      <div class="lab-canvas-area"><canvas class="lab-canvas"></canvas></div>
      <div class="lab-hint">↑↓←→ / WASD : se déplacer · P pause · R restart</div>
    `;
    this._viewport.appendChild(this._wrapper);
    this._canvas = this._wrapper.querySelector('.lab-canvas');
    this._ctx    = this._canvas.getContext('2d');
    this._els = {
      level: this._wrapper.querySelector('#lab-level'),
      moves: this._wrapper.querySelector('#lab-moves'),
      score: this._wrapper.querySelector('#lab-score'),
    };
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
  }

  _onTick(e) {
    if (e.action === 'restart') { this._showStart(); return; }
    if (e.action === 'play')    { this._overlay.hide(); }
    const s = e.state;
    if (!s || s.status === 'idle' || !s.cells) return;
    this._render(s);
  }

  _render(s) {
    const cell = Math.max(14, Math.min(32, Math.floor(440 / s.size)));
    const wall = 3;
    const W = s.size * cell + wall;
    const H = s.size * cell + wall;

    this._canvas.width  = W;
    this._canvas.height = H;
    const ctx = this._ctx;

    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#9d7bff';
    ctx.lineCap = 'round';
    ctx.lineWidth = wall;

    for (let r = 0; r < s.size; r++) {
      for (let c = 0; c < s.size; c++) {
        const x = c * cell + wall / 2;
        const y = r * cell + wall / 2;
        const cl = s.cells[r][c];
        ctx.beginPath();
        if (cl.top)    { ctx.moveTo(x, y);        ctx.lineTo(x + cell, y); }
        if (cl.left)   { ctx.moveTo(x, y);        ctx.lineTo(x, y + cell); }
        if (cl.right)  { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
        if (cl.bottom) { ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell); }
        ctx.stroke();
      }
    }

    // Exit
    const ex = s.exit.c * cell + wall / 2 + cell / 2;
    const ey = s.exit.r * cell + wall / 2 + cell / 2;
    ctx.fillStyle = '#44ff88';
    ctx.beginPath();
    ctx.arc(ex, ey, cell * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Player
    const px = s.player.c * cell + wall / 2 + cell / 2;
    const py = s.player.r * cell + wall / 2 + cell / 2;
    ctx.fillStyle = '#00ffe1';
    ctx.beginPath();
    ctx.arc(px, py, cell * 0.32, 0, Math.PI * 2);
    ctx.fill();

    this._els.level.textContent = s.levelIndex + 1;
    this._els.moves.textContent = s.moves;
    this._els.score.textContent = s.score;
  }

  _onWon(e) {
    this._overlay.showGameOver(
      { result: 'win', icon: '🌀', title: 'LABYRINTHE COMPLÉTÉ !', score: e.score, isRecord: e.isRecord,
        extraInfo: `<div class="overlay-score">Meilleur : ${e.best}</div>` },
      () => EventBus.emit('game:restart')
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }

  destroy() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('lab-styles')?.remove();
  }
}
