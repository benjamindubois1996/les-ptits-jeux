import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';
import { BOARD_R } from './Flechettes.js';

const ID = 'flechettes';
const CW = 560, CH = 420;
const BX  = 190, BY = CH / 2; // board center
const SECTORS = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];

export default class FlechettesRenderer {
  constructor(game, viewport, config) {
    this._game = game; this._vp = viewport;
    this._wrapper = null; this._canvas = null; this._ctx = null;
    this._overlay = null; this._state = null;
    this._lastThrow = null;
    this._flashTimer = null;

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
    clearTimeout(this._flashTimer);
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById(`${ID}-styles`)?.remove();
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = `${ID}-wrapper`;

    this._canvas = document.createElement('canvas');
    this._canvas.width  = CW;
    this._canvas.height = CH;
    this._ctx = this._canvas.getContext('2d');
    this._scaleCanvas();

    this._wrapper.appendChild(this._canvas);
    this._vp.appendChild(this._wrapper);
  }

  _scaleCanvas() {
    const vw = this._vp.clientWidth  - 8;
    const vh = this._vp.clientHeight - 8;
    const sc = Math.min(vw / CW, vh / CH, 1.4);
    this._canvas.style.width  = `${CW * sc}px`;
    this._canvas.style.height = `${CH * sc}px`;
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this._game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.8;margin-bottom:4px">
        501 → 0 · Clique sur la cible pour viser<br>
        3 fléchettes par tour · Tu affontes l'IA<br>
        Premier à atteindre 0 gagne !
      </div>` }
    );
  }

  _draw(s) {
    const ctx = this._ctx;
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, CW, CH);

    this._drawBoard(ctx);
    this._drawDarts(ctx, s);
    this._drawScoreboard(ctx, s);
    this._drawHint(ctx, s);
  }

  _drawBoard(ctx) {
    const cx = BX, cy = BY, R = BOARD_R;
    const startAngle = -Math.PI / 2 - Math.PI / 20;
    const sectorAngle = Math.PI * 2 / 20;

    const R_D  = R * 0.92;
    const R_DI = R * 0.83;
    const R_T  = R * 0.56;
    const R_TI = R * 0.49;
    const R_BO = R * 0.19;
    const R_BI = R * 0.075;

    // Cadre bois
    ctx.fillStyle = '#2a1500';
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.08, 0, Math.PI * 2); ctx.fill();

    // Anneau noir extérieur
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    for (let i = 0; i < 20; i++) {
      const a1 = startAngle + i * sectorAngle;
      const a2 = a1 + sectorAngle;
      const isEven = i % 2 === 0;
      const red = '#c8201a', green = '#1a7a2a';
      const dark = '#1a1a1a', light = '#c8b878';

      const _sector = (r1, r2, color) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, r1, a1, a2);
        ctx.arc(cx, cy, r2, a2, a1, true);
        ctx.closePath();
        ctx.fill();
      };

      _sector(R_D,  R_DI, isEven ? red   : green);
      _sector(R_DI, R_T,  isEven ? dark  : light);
      _sector(R_T,  R_TI, isEven ? red   : green);
      _sector(R_TI, R_BO, isEven ? dark  : light);
    }

    // Bull
    ctx.fillStyle = '#1a7a2a';
    ctx.beginPath(); ctx.arc(cx, cy, R_BO, 0, Math.PI * 2); ctx.fill();
    // Bullseye
    ctx.fillStyle = '#c8201a';
    ctx.beginPath(); ctx.arc(cx, cy, R_BI, 0, Math.PI * 2); ctx.fill();

    // Fils métalliques entre secteurs
    ctx.strokeStyle = 'rgba(180,180,180,0.5)';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 20; i++) {
      const angle = startAngle + i * sectorAngle;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * R_BO, cy + Math.sin(angle) * R_BO);
      ctx.lineTo(cx + Math.cos(angle) * R_D,  cy + Math.sin(angle) * R_D);
      ctx.stroke();
    }
    // Rings
    for (const r of [R_D, R_DI, R_T, R_TI, R_BO, R_BI]) {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }

    // Numéros de secteurs
    ctx.fillStyle = '#eee';
    ctx.font = `bold ${Math.round(R * 0.115)}px Orbitron, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 20; i++) {
      const angle = startAngle + (i + 0.5) * sectorAngle;
      const numR  = R * 0.965;
      ctx.fillText(SECTORS[i], cx + Math.cos(angle) * numR, cy + Math.sin(angle) * numR);
    }
  }

  _drawDarts(ctx, s) {
    const recent = s.throws.slice(-6);
    for (const t of recent) {
      const ox = BX + t.hitX;
      const oy = BY + t.hitY;
      const color = t.side === 'player' ? '#44aaff' : '#ff4466';

      // Ombre
      ctx.beginPath(); ctx.arc(ox + 1, oy + 1, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();

      // Fléchette
      ctx.beginPath(); ctx.arc(ox, oy, 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();

      // Tige
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + (t.side === 'player' ? 10 : -10), oy - 16);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawScoreboard(ctx, s) {
    const sx = BX + BOARD_R + 20, sy = 30, w = CW - sx - 10;

    ctx.fillStyle = 'rgba(10,15,30,0.9)';
    ctx.beginPath();
    ctx.roundRect(sx, sy, w, CH - 60, 8);
    ctx.fill();
    ctx.strokeStyle = '#1e3a6a'; ctx.lineWidth = 1; ctx.stroke();

    const pActive = s.turn === 'player' && s.status === 'playing';
    const aActive = s.turn === 'ai'     && s.status === 'playing';

    // Header
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px Orbitron, monospace';

    // Joueur
    ctx.fillStyle = pActive ? '#44aaff' : '#446688';
    ctx.fillText('JOUEUR', sx + w / 2, sy + 22);
    ctx.font = `bold ${pActive ? 32 : 24}px Orbitron, monospace`;
    ctx.fillStyle = pActive ? '#fff' : '#8899aa';
    ctx.fillText(s.playerScore, sx + w / 2, sy + 58);

    if (pActive) {
      ctx.font = '9px Orbitron, monospace';
      ctx.fillStyle = '#44aaff';
      ctx.fillText(`${s.dartsLeft} fléchette${s.dartsLeft > 1 ? 's' : ''}`, sx + w / 2, sy + 78);
    }

    // Séparateur
    ctx.strokeStyle = '#1e3a6a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx + 10, sy + 95); ctx.lineTo(sx + w - 10, sy + 95); ctx.stroke();

    // IA
    ctx.font = 'bold 11px Orbitron, monospace';
    ctx.fillStyle = aActive ? '#ff4466' : '#664455';
    ctx.fillText('IA', sx + w / 2, sy + 116);
    ctx.font = `bold ${aActive ? 32 : 24}px Orbitron, monospace`;
    ctx.fillStyle = aActive ? '#fff' : '#8899aa';
    ctx.fillText(s.aiScore, sx + w / 2, sy + 152);

    if (aActive) {
      ctx.font = '9px Orbitron, monospace';
      ctx.fillStyle = '#ff4466';
      ctx.fillText(`${s.dartsLeft} fléchette${s.dartsLeft > 1 ? 's' : ''}`, sx + w / 2, sy + 172);
    }

    // Séparateur
    ctx.beginPath(); ctx.moveTo(sx + 10, sy + 185); ctx.lineTo(sx + w - 10, sy + 185); ctx.stroke();

    // Historique des derniers lancers
    ctx.font = '9px Orbitron, monospace';
    ctx.fillStyle = '#445566';
    ctx.textAlign = 'center';
    ctx.fillText('DERNIERS LANCERS', sx + w / 2, sy + 202);

    const recent = [...s.throws].reverse().slice(0, 7);
    let lineY = sy + 218;
    for (const t of recent) {
      ctx.fillStyle = t.side === 'player' ? '#4488cc' : '#cc3355';
      if (t.bust) ctx.fillStyle = '#ff6600';
      ctx.font = '9px Orbitron, monospace';
      ctx.fillText(`${t.side === 'player' ? '▶' : '◀'} ${t.label} ${t.pts > 0 ? '+' + t.pts : ''}`, sx + w / 2, lineY);
      lineY += 15;
    }
  }

  _drawHint(ctx, s) {
    if (!this._lastThrow) return;
    const t = this._lastThrow;
    const color = t.bust ? '#ff6600' : t.side === 'player' ? '#44aaff' : '#ff4466';
    ctx.font = 'bold 14px Orbitron, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.fillText(t.label, 10, CH - 10);
    if (t.pts > 0) {
      ctx.fillStyle = '#ffe033';
      ctx.fillText(`+${t.pts}`, 10 + ctx.measureText(t.label + ' ').width, CH - 10);
    }
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);

    this._onClick = e => {
      const s = this._state;
      if (!s || s.status !== 'playing' || s.turn !== 'player') return;
      const rect = this._canvas.getBoundingClientRect();
      const scaleX = CW / rect.width, scaleY = CH / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top)  * scaleY;
      this._game.throwDart(BX, BY, mx, my);
    };
    this._canvas.addEventListener('click', this._onClick);

    this._onKey = e => {
      if (e.key === 'p' || e.key === 'P') EventBus.emit('game:pause-toggle');
      if (e.key === 'r' || e.key === 'R') this._game.restart();
    };
    window.addEventListener('keydown', this._onKey);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    this._canvas?.removeEventListener('click', this._onClick);
    window.removeEventListener('keydown', this._onKey);
    clearTimeout(this._flashTimer);
  }

  _onTick({ state, action, last }) {
    this._state = state;
    if (action === 'throw' && last) {
      this._lastThrow = last;
      clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(() => { this._lastThrow = null; if (this._state) this._draw(this._state); }, 1800);
    }
    if (state.status === 'playing' || action === 'player-turn') this._draw(state);
  }

  _onOver(data) { this._overlay.showGameOver(data, () => { this._overlay.hide(); this._game.start({}); }); }
  _onWon(data)  { this._overlay.showGameOver(data, () => { this._overlay.hide(); this._game.start({}); }); }
  _onPaused()   { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed()  { this._overlay.hide(); }
  _onRestart()  { this._lastThrow = null; this._showStart(); }

  _injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;
    const s = document.createElement('style');
    s.id = `${ID}-styles`;
    s.textContent = `
      .${ID}-wrapper {
        position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
        background:#0a0d14;
      }
      .${ID}-wrapper canvas { display:block; cursor:crosshair; }
    `;
    document.head.appendChild(s);
  }
}
