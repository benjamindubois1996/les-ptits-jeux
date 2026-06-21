import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';
import { EMPTY, BLACK, WHITE } from './Reversi.js';

const CELL  = 54;
const PAD   = 12;

export default class ReversiRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._hover   = null;

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onClick   = this._onClick.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
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
    document.getElementById('rv-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('rv-styles')) return;
    const el = document.createElement('style');
    el.id = 'rv-styles';
    el.textContent = `
      .rv-wrapper {
        position:absolute; inset:0;
        display:flex; flex-direction:column;
        background:#050810; font-family:Orbitron,monospace;
        overflow:hidden; color:#fff; align-items:center;
      }
      .rv-info {
        flex:0 0 auto; padding:6px 16px; width:100%; box-sizing:border-box;
        display:flex; justify-content:space-between; align-items:center;
        border-bottom:1px solid rgba(0,255,225,0.12); font-size:11px;
        letter-spacing:0.1em;
      }
      .rv-turn { color:#00ffe1; font-weight:bold; }
      .rv-canvas-area {
        flex:1; overflow:auto; display:flex;
        align-items:center; justify-content:center; padding:8px; box-sizing:border-box;
      }
      .rv-canvas { display:block; cursor:pointer; }
      .rv-hint {
        flex:0 0 auto; padding:5px; font-size:9px;
        color:rgba(255,255,255,0.2); letter-spacing:0.08em; text-align:center;
      }
    `;
    document.head.appendChild(el);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'rv-wrapper';

    this._infoEl = document.createElement('div');
    this._infoEl.className = 'rv-info';
    this._infoEl.innerHTML = `
      <span id="rv-scores">⚫ 2 — ⚪ 2</span>
      <span class="rv-turn" id="rv-turn">À vous de jouer</span>
    `;

    const area = document.createElement('div');
    area.className = 'rv-canvas-area';

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'rv-canvas';
    this._ctx = this._canvas.getContext('2d');
    area.appendChild(this._canvas);

    const hint = document.createElement('div');
    hint.className = 'rv-hint';
    hint.textContent = 'Clic : poser une pièce noire · IA joue en blanc';

    this._wrapper.appendChild(this._infoEl);
    this._wrapper.appendChild(area);
    this._wrapper.appendChild(hint);

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();
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
    this._canvas.addEventListener('mouseleave', () => { this._hover = null; this._drawFrame(); });
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
  }

  _onKeyDown(e) {
    const keys = this.config.controls?.keyboard ?? {};
    if ((keys.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if ((keys.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
  }

  _onClick(e) {
    const cell = this._hitCell(e);
    if (cell) this.game.placeAt(cell.r, cell.c);
  }

  _onMouseMove(e) {
    this._hover = this._hitCell(e);
    if (this.game.state.status === 'playing') this._drawFrame();
  }

  _hitCell(e) {
    const rect = this._canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - PAD;
    const y = e.clientY - rect.top  - PAD;
    const size = this.game.state.size ?? 8;
    const c = Math.floor(x / CELL);
    const r = Math.floor(y / CELL);
    if (r < 0 || c < 0 || r >= size || c >= size) return null;
    return { r, c };
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    this._drawFrame();
    this._updateInfo(state);
  }

  _onWon(data)  { this._showEndScreen(data); }
  _onOver(data) { this._showEndScreen(data); }

  _showEndScreen(data) {
    const best = data.best ?? 0;
    this._overlay.showGameOver(
      { result: data.result, icon: data.icon, title: data.title,
        score: data.score, isRecord: data.score >= best,
        extraInfo: data.extraInfo ?? '' },
      () => this._showStartScreen(),
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStartScreen(); }

  _updateInfo(state) {
    let black = 0, white = 0;
    state.grid.forEach(row => row.forEach(c => { if (c === BLACK) black++; if (c === WHITE) white++; }));

    const scoresEl = document.getElementById('rv-scores');
    const turnEl   = document.getElementById('rv-turn');
    if (scoresEl) scoresEl.textContent = `⚫ ${black} — ⚪ ${white}`;
    if (turnEl) {
      if (state.status !== 'playing') { turnEl.textContent = ''; return; }
      turnEl.textContent = state.turn === BLACK ? 'Votre tour ⚫' : 'IA réfléchit... ⚪';
      turnEl.style.color = state.turn === BLACK ? '#00ffe1' : 'rgba(255,255,255,0.4)';
    }
  }

  _drawFrame() {
    const state = this.game.state;
    if (!state.size) return;

    const size = state.size;
    const W    = PAD * 2 + size * CELL;
    const H    = PAD * 2 + size * CELL;

    this._canvas.width  = W;
    this._canvas.height = H;
    const ctx = this._ctx;

    // Background
    ctx.fillStyle = '#0a1428';
    ctx.fillRect(0, 0, W, H);

    // Board green felt
    ctx.fillStyle = '#0d3320';
    ctx.fillRect(PAD, PAD, size * CELL, size * CELL);

    // Grid lines
    ctx.strokeStyle = 'rgba(0,255,100,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i++) {
      ctx.beginPath();
      ctx.moveTo(PAD + i * CELL, PAD);
      ctx.lineTo(PAD + i * CELL, PAD + size * CELL);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(PAD, PAD + i * CELL);
      ctx.lineTo(PAD + size * CELL, PAD + i * CELL);
      ctx.stroke();
    }

    // Star points (classic Othello board markers)
    const stars = [[2,2],[2,6],[6,2],[6,6],[4,4]];
    ctx.fillStyle = 'rgba(0,200,80,0.4)';
    for (const [sr, sc] of stars) {
      if (sr < size && sc < size) {
        ctx.beginPath();
        ctx.arc(PAD + sc * CELL + CELL/2, PAD + sr * CELL + CELL/2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Valid move hints
    const validSet = new Set(state.validMoves?.map(m => `${m.r},${m.c}`) ?? []);

    // Pieces + valid hints
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const x  = PAD + c * CELL + CELL / 2;
        const y  = PAD + r * CELL + CELL / 2;
        const cr = CELL / 2 - 5;
        const cell = state.grid[r]?.[c] ?? EMPTY;

        if (cell === BLACK) {
          const g = ctx.createRadialGradient(x - cr*0.3, y - cr*0.3, 1, x, y, cr);
          g.addColorStop(0, '#555'); g.addColorStop(1, '#111');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2); ctx.fill();
        } else if (cell === WHITE) {
          const g = ctx.createRadialGradient(x - cr*0.3, y - cr*0.3, 1, x, y, cr);
          g.addColorStop(0, '#fff'); g.addColorStop(1, '#bbb');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#888'; ctx.lineWidth = 1; ctx.stroke();
        } else if (state.turn === BLACK && validSet.has(`${r},${c}`)) {
          const isHover = this._hover?.r === r && this._hover?.c === c;
          ctx.fillStyle = isHover ? 'rgba(0,255,136,0.35)' : 'rgba(0,255,136,0.12)';
          ctx.beginPath(); ctx.arc(x, y, cr * 0.4, 0, Math.PI * 2); ctx.fill();
          if (isHover) {
            ctx.strokeStyle = 'rgba(0,255,136,0.7)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2); ctx.stroke();
          }
        }
      }
    }
  }
}
