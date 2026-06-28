import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID = 'air-hockey';
const W = 380, H = 580, GOAL_W = 120;

export default class AirHockeyRenderer {
  constructor(game, viewport, config) {
    this._game = game; this._vp = viewport;
    this._wrapper = null; this._canvas = null; this._ctx = null;
    this._overlay = null; this._state = null; this._lastSel = null;
    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
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

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = `${ID}-wrapper`;

    this._canvas = document.createElement('canvas');
    this._canvas.width  = W;
    this._canvas.height = H;
    this._ctx = this._canvas.getContext('2d');
    this._game.setCanvas(this._canvas);

    this._scaleCanvas();
    this._wrapper.appendChild(this._canvas);
    this._vp.appendChild(this._wrapper);
  }

  _scaleCanvas() {
    const vw = this._vp.clientWidth  - 16;
    const vh = this._vp.clientHeight - 16;
    const sc = Math.min(vw / W, vh / H, 1.5);
    this._canvas.style.width  = `${W * sc}px`;
    this._canvas.style.height = `${H * sc}px`;
  }

  _showStart() {
    this._overlay.showStart(
      [
        { key: 'mode',  label: 'MODE',  default: 'basique',   options: [{ value: 'basique', label: 'BASIQUE' }] },
        { key: 'limit', label: 'BUTS',  default: '7',         options: [
            { value: '3', label: '3' },
            { value: '5', label: '5' },
            { value: '7', label: '7' },
            { value: '9', label: '9' },
          ]
        },
        { key: 'diff',  label: 'IA',    default: 'normale',   options: [
            { value: 'facile',    label: 'FACILE' },
            { value: 'normale',   label: 'NORMALE' },
            { value: 'difficile', label: 'DIFFICILE' },
          ]
        },
      ],
      sel => { this._lastSel = sel; this._overlay.hide(); this._game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;margin-bottom:4px">
        Déplace ta souris pour contrôler la raquette (bas)
      </div>` }
    );
  }

  _draw(s) {
    const ctx = this._ctx;
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, W, H);

    // Rink
    ctx.strokeStyle = '#1e3a6a';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, W-4, H-4);

    // Center line
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();
    ctx.setLineDash([]);

    // Center circle
    ctx.strokeStyle = '#1e3a6a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(W/2, H/2, 50, 0, Math.PI*2); ctx.stroke();

    // Goals
    const gx1 = (W - GOAL_W) / 2, gx2 = (W + GOAL_W) / 2;
    ctx.strokeStyle = '#3388ff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(gx1, 2); ctx.lineTo(gx2, 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx1, H-2); ctx.lineTo(gx2, H-2); ctx.stroke();

    // Scores
    const lim = s.scoreLimit ?? 7;
    ctx.fillStyle = '#3388ff'; ctx.font = 'bold 22px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${s.aiScore} / ${lim}`,     W/2, H/2 - 20);
    ctx.fillText(`${s.playerScore} / ${lim}`, W/2, H/2 + 38);

    // Paddles
    this._drawPaddle(ctx, s.ai,     '#ff4466', 'IA');
    this._drawPaddle(ctx, s.player, '#44aaff', 'TOI');

    // Puck
    const p = s.puck;
    const grad = ctx.createRadialGradient(p.x-3, p.y-3, 2, p.x, p.y, s.PUCK_R);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#aabbcc');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(p.x, p.y, s.PUCK_R, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    ctx.stroke();
  }

  _drawPaddle(ctx, paddle, color, label) {
    const R = 28;
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(paddle.x, paddle.y, R, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Orbitron, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, paddle.x, paddle.y);
    ctx.textBaseline = 'alphabetic';
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
  }

  _onTick({ state }) {
    this._state = state;
    if (state.status === 'playing') this._draw(state);
  }

  _onOver(data) {
    this._overlay.showGameOver(data, () => { this._overlay.hide(); this._game.start(this._lastSel ?? {}); });
  }
  _onWon(data) {
    this._overlay.showGameOver(data, () => { this._overlay.hide(); this._game.start(this._lastSel ?? {}); });
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._lastSel = null; this._showStart(); }

  _injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;
    const s = document.createElement('style');
    s.id = `${ID}-styles`;
    s.textContent = `
      .${ID}-wrapper {
        position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
        background:#05080f;
      }
      .${ID}-wrapper canvas { display:block; }
    `;
    document.head.appendChild(s);
  }
}
