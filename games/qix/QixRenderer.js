import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID = 'qix';

export default class QixRenderer {
  constructor(game, viewport, config) {
    this._game    = game;
    this._vp      = viewport;
    this._cfg     = config;
    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._animId  = null;
    this._lastState = null;
    this._pctEl   = null;

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
    if (this._animId) cancelAnimationFrame(this._animId);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById(`${ID}-styles`)?.remove();
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = `${ID}-wrapper`;

    this._pctEl = document.createElement('div');
    this._pctEl.className = `${ID}-hud`;
    this._pctEl.textContent = 'Capturé : 0%  |  Objectif : 75%';

    this._canvas = document.createElement('canvas');
    this._canvas.className = `${ID}-canvas`;
    this._ctx = this._canvas.getContext('2d');

    const hint = document.createElement('div');
    hint.className = `${ID}-hint`;
    hint.innerHTML = 'ESPACE = lent (×2 pts) &nbsp;|&nbsp; ↑↓←→ ou WASD';

    this._wrapper.appendChild(this._pctEl);
    this._wrapper.appendChild(this._canvas);
    this._wrapper.appendChild(hint);
    this._vp.appendChild(this._wrapper);
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique',
         options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this._game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.8;margin-bottom:4px">
          Trace des lignes pour capturer ≥75% du terrain<br>
          Le Qix 🟠 détruit ton tracé · Les Sparx 🟡 patrouillent le bord<br>
          ESPACE = lent (double les points)
        </div>` }
    );
  }

  // ── Draw ─────────────────────────────────────────────────────────────────

  _startRender() {
    if (this._animId) return;
    const loop = () => {
      if (this._lastState) this._draw(this._lastState);
      this._animId = requestAnimationFrame(loop);
    };
    this._animId = requestAnimationFrame(loop);
  }

  _stopRender() {
    if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
  }

  _draw(s) {
    if (!s.W) return;
    const cvs = this._canvas;
    const ctx = this._ctx;
    const W = s.W, H = s.H;

    if (cvs.width !== W || cvs.height !== H) { cvs.width = W; cvs.height = H; }

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, W, H);

    // Claimed area (imagedata for perf)
    const img = ctx.createImageData(W, H);
    const d = img.data;
    for (let i = 0; i < s.W * s.H; i++) {
      if (s.claimed[i] === 1) {
        d[i*4]=0; d[i*4+1]=160; d[i*4+2]=80; d[i*4+3]=110;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Border
    ctx.strokeStyle = '#00e87a'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W-2, H-2);

    // Drawing trail
    if (s.isDrawing && s.drawingTrail.length > 1) {
      ctx.strokeStyle = s.isSlow ? '#ffcc00' : '#00cfff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.drawingTrail[0].x, s.drawingTrail[0].y);
      for (let i = 1; i < s.drawingTrail.length; i++) ctx.lineTo(s.drawingTrail[i].x, s.drawingTrail[i].y);
      ctx.stroke();
    }

    // Qixes
    for (const q of s.qixes) {
      if (q.tail.length > 1) {
        ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(q.tail[0].x, q.tail[0].y);
        for (let i = 1; i < q.tail.length; i++) ctx.lineTo(q.tail[i].x, q.tail[i].y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      ctx.fillStyle = '#ff8800';
      ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, Math.PI*2); ctx.fill();
    }

    // Sparxes
    for (const sp of s.sparxes) {
      if (sp.x == null) continue;
      ctx.fillStyle = '#ffe033';
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 4, 0, Math.PI*2); ctx.fill();
    }

    // Player
    ctx.fillStyle = s.isDrawing ? (s.isSlow ? '#ffcc00' : '#00cfff') : '#ffffff';
    ctx.beginPath(); ctx.arc(s.player.x, s.player.y, 5, 0, Math.PI*2); ctx.fill();

    // HUD
    if (this._pctEl) this._pctEl.textContent = `Capturé : ${s.claimedPct}%  |  Score : ${s.score}  |  Objectif : 75%`;
  }

  // ── Events ────────────────────────────────────────────────────────────────

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
    this._lastState = state;
    if (state.status === 'playing') this._startRender();
  }

  _onOver({ result, icon, title, score, best, isRecord }) {
    this._stopRender();
    const mode = this._game.state?.mode;
    this._overlay.showGameOver(
      { result, icon, title, score, best, isRecord },
      () => { this._overlay.hide(); this._game.start({ mode }); }
    );
  }

  _onWon({ result, icon, title, score, best, isRecord }) {
    this._stopRender();
    const mode = this._game.state?.mode;
    this._overlay.showGameOver(
      { result, icon, title, score, best, isRecord },
      () => { this._overlay.hide(); this._game.start({ mode }); }
    );
  }

  _onPaused()  { this._stopRender(); this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); this._startRender(); }
  _onRestart() { this._stopRender(); this._showStart(); }

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
        background: #05080f; gap: 6px; padding: 8px; box-sizing: border-box;
        font-family: Orbitron, monospace; overflow: hidden;
      }
      .${ID}-hud  { font-size: 11px; color: #00e87a; letter-spacing: 1px; }
      .${ID}-hint { font-size: 9px; color: #445; letter-spacing: 1px; }
      .${ID}-canvas { display: block; max-width: 100%; max-height: calc(100% - 60px); image-rendering: pixelated; }
    `;
    document.head.appendChild(s);
  }
}
