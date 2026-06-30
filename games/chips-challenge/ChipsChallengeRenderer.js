import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const CELL = 36;

export default class ChipsChallengeRenderer {
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
    if (document.getElementById('cc-styles')) return;
    const s = document.createElement('style');
    s.id = 'cc-styles';
    s.textContent = `
      .cc-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 8px;
        box-sizing: border-box; gap: 6px;
        font-family: Orbitron, monospace;
        background: #05080f; overflow: hidden; color: #ccc;
      }
      .cc-info {
        flex: 0 0 auto; display: flex; gap: 16px; font-size: 11px;
        color: rgba(255,255,255,0.5); letter-spacing: 0.06em;
      }
      .cc-info strong { color: #ffd700; }
      .cc-level-name { color: #00ffe1; font-size: 12px; font-weight: bold; }
      .cc-canvas-area {
        flex: 1; overflow: auto; display: flex;
        align-items: center; justify-content: center; width: 100%;
      }
      .cc-canvas { display: block; }
      .cc-hint { flex: 0 0 auto; font-size: 9px; color: rgba(255,255,255,0.25); letter-spacing: 0.06em; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'cc-wrapper';
    this._wrapper.innerHTML = `
      <div class="cc-info">
        <span class="cc-level-name" id="cc-lvl">Niveau 1</span>
        <span>🔑 <strong id="cc-chips">0/0</strong></span>
        <span>Coups : <strong id="cc-moves">0</strong></span>
        <span>Score : <strong id="cc-score">0</strong></span>
      </div>
      <div class="cc-canvas-area"><canvas class="cc-canvas"></canvas></div>
      <div class="cc-hint">↑↓←→ / WASD : se déplacer · P pause · R restart</div>
    `;
    this._viewport.appendChild(this._wrapper);
    this._canvas = this._wrapper.querySelector('.cc-canvas');
    this._ctx    = this._canvas.getContext('2d');
    this._els = {
      lvl:   this._wrapper.querySelector('#cc-lvl'),
      chips: this._wrapper.querySelector('#cc-chips'),
      moves: this._wrapper.querySelector('#cc-moves'),
      score: this._wrapper.querySelector('#cc-score'),
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
    if (!s || s.status === 'idle' || !s.grid.length) return;
    this._render(s);
  }

  _render(s) {
    const rows = s.grid.length;
    const cols = s.grid[0].length;
    this._canvas.width  = cols * CELL;
    this._canvas.height = rows * CELL;
    const ctx = this._ctx;
    const doorOpen = s.chipsCollected >= s.chipsTotal;

    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = s.grid[r][c];
        const x = c * CELL, y = r * CELL;

        if (ch === '#') {
          ctx.fillStyle = '#1a2840';
          ctx.fillRect(x, y, CELL, CELL);
          ctx.strokeStyle = 'rgba(0,255,225,0.1)';
          ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
        } else if (ch === 'c') {
          ctx.fillStyle = '#ffd700';
          ctx.beginPath();
          ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.22, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff3aa';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (ch === 'D') {
          ctx.fillStyle = doorOpen ? 'rgba(68,255,136,0.25)' : 'rgba(255,68,68,0.25)';
          ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
          ctx.strokeStyle = doorOpen ? '#44ff88' : '#ff4444';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
        }
      }
    }

    // Player
    const px = s.player.c * CELL + CELL / 2;
    const py = s.player.r * CELL + CELL / 2;
    ctx.fillStyle = '#00ffe1';
    ctx.beginPath();
    ctx.arc(px, py, CELL * 0.3, 0, Math.PI * 2);
    ctx.fill();

    this._els.lvl.textContent   = `${s.levelIndex + 1}/${this._config.levels.length} — ${s.levelName}`;
    this._els.chips.textContent = `${s.chipsCollected}/${s.chipsTotal}`;
    this._els.moves.textContent = s.moves;
    this._els.score.textContent = s.score;
  }

  _onWon(e) {
    this._overlay.showGameOver(
      { result: 'win', icon: '🔑', title: 'TOUTES LES PUCES RÉCUPÉRÉES !', score: e.score, isRecord: e.isRecord,
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
    document.getElementById('cc-styles')?.remove();
  }
}
