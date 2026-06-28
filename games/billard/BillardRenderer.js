import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID = 'billard';
const TW = 640, TH = 360;

export default class BillardRenderer {
  constructor(game, viewport, config) {
    this._game = game; this._vp = viewport;
    this._wrapper = null; this._canvas = null; this._ctx = null;
    this._overlay = null; this._state = null;
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
    this._canvas.width  = TW;
    this._canvas.height = TH;
    this._ctx = this._canvas.getContext('2d');
    this._game.setCanvas(this._canvas);
    this._scaleCanvas();

    this._info = document.createElement('div');
    this._info.className = `${ID}-info`;

    this._wrapper.append(this._canvas, this._info);
    this._vp.appendChild(this._wrapper);
  }

  _scaleCanvas() {
    const vw = this._vp.clientWidth  - 16;
    const vh = this._vp.clientHeight - 60;
    const sc = Math.min(vw / TW, vh / TH, 1.5);
    this._canvas.style.width  = `${TW * sc}px`;
    this._canvas.style.height = `${TH * sc}px`;
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this._game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.8;margin-bottom:4px">
        Clique-glisse sur la table pour viser et frapper<br>
        Empoche les 14 billes colorées puis la 8 noire !<br>
        3 fautes autorisées · P pause · R restart
      </div>` }
    );
  }

  _draw(s) {
    const ctx = this._ctx;

    // Rail bois
    ctx.fillStyle = '#5a2d00';
    ctx.fillRect(0, 0, TW, TH);

    // Feutre
    ctx.fillStyle = '#1a5c2a';
    ctx.fillRect(22, 22, TW - 44, TH - 44);

    // Ligne de tête
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(TW * 0.25, 22); ctx.lineTo(TW * 0.25, TH - 22); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Poches
    for (const pk of s.POCKETS) {
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath(); ctx.arc(pk.x, pk.y, s.POCKET_R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Ligne de visée + queue de billard
    if (s.aim && s.aimCur) {
      const cue = s.balls[0];
      if (!cue?.pocketed) {
        const dx = cue.x - s.aimCur.x, dy = cue.y - s.aimCur.y;
        const len = Math.hypot(dx, dy) || 1;
        const power = Math.min(Math.hypot(dx, dy) * 0.25, 18);
        const pullback = Math.max(s.BALL_R + 4, Math.min(power * 2.5, 36));

        // Ligne de direction
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,180,0.38)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(cue.x, cue.y);
        ctx.lineTo(cue.x + (dx / len) * 100, cue.y + (dy / len) * 100);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Queue — pointe à BALL_R + gap derrière la bille blanche
        ctx.save();
        ctx.lineCap = 'round';
        const qx1 = cue.x - (dx / len) * (s.BALL_R + 4 + pullback);
        const qy1 = cue.y - (dy / len) * (s.BALL_R + 4 + pullback);
        const qx2 = qx1 - (dx / len) * 90;
        const qy2 = qy1 - (dy / len) * 90;

        const qGrad = ctx.createLinearGradient(qx1, qy1, qx2, qy2);
        qGrad.addColorStop(0, '#e0d080');
        qGrad.addColorStop(1, '#8B4513');
        ctx.strokeStyle = qGrad;
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(qx1, qy1); ctx.lineTo(qx2, qy2); ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(qx1, qy1); ctx.lineTo(qx1 - (dx / len) * 8, qy1 - (dy / len) * 8); ctx.stroke();
        ctx.restore();
      }
    }

    // Billes
    for (const b of s.balls) {
      if (b.pocketed) continue;
      this._drawBall(ctx, b, s.BALL_R);
    }

    // HUD
    this._info.innerHTML =
      `<span style="color:#ffe033">Score : <b>${s.score}</b></span>` +
      `<span style="color:#ff6644">Fautes : <b>${s.fouls}/3</b></span>` +
      `<span style="color:#88ffcc">Billes : <b>${s.pocketed}/14</b></span>` +
      (s.canSinkEight ? `<span style="color:#ee88ff">⬛ Pochez la 8 noire !</span>` : '');
  }

  _drawBall(ctx, b, R) {
    const isStripe = b.id > 8;
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
    ctx.clip();

    if (isStripe) {
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(b.x - R, b.y - R, R * 2, R * 2);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - R, b.y - R * 0.42, R * 2, R * 0.84);
    } else {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - R, b.y - R, R * 2, R * 2);
    }

    // Cercle blanc pour le numéro
    if (b.id !== 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, R * 0.44, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = `bold ${Math.round(R * 0.72)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.id, b.x, b.y + 1);
    }

    ctx.restore();

    // Brillance
    const g = ctx.createRadialGradient(b.x - R * 0.3, b.y - R * 0.35, R * 0.05, b.x, b.y, R);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.beginPath();
    ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
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

  _onOver(data) { this._overlay.showGameOver(data, () => { this._overlay.hide(); this._game.start({}); }); }
  _onWon(data)  { this._overlay.showGameOver(data, () => { this._overlay.hide(); this._game.start({}); }); }
  _onPaused()   { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed()  { this._overlay.hide(); }
  _onRestart()  { this._showStart(); }

  _injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;
    const s = document.createElement('style');
    s.id = `${ID}-styles`;
    s.textContent = `
      .${ID}-wrapper {
        position:absolute;inset:0;display:flex;flex-direction:column;
        align-items:center;justify-content:center;gap:8px;background:#05080f;
      }
      .${ID}-wrapper canvas { display:block; cursor:crosshair; }
      .${ID}-info {
        display:flex;gap:16px;font-family:Orbitron,monospace;
        font-size:0.68rem;letter-spacing:1px;flex-wrap:wrap;
        justify-content:center;color:#cce4ff;
      }
    `;
    document.head.appendChild(s);
  }
}
