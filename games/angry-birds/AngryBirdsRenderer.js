import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const BIRD_R = 14;
const PIG_R  = 14;
const SLING_X = 0.13;
const SLING_Y = 0.78;

export default class AngryBirdsRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._canvas   = null;
    this._ctx      = null;
    this._wrapper  = null;
    this._overlay  = null;
    this._state    = null;
    this._W = 0; this._H = 0;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onWon     = this._onWon.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp   = this._onMouseUp.bind(this);
    this._onKey       = this._onKey.bind(this);
    this._dragging    = false;
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._overlay = new GameOverlay(this._viewport);
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
    if (document.getElementById('ab-styles')) return;
    const s = document.createElement('style');
    s.id = 'ab-styles';
    s.textContent = `
      .ab-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 8px;
        box-sizing: border-box; gap: 4px;
        font-family: Orbitron, monospace; overflow: hidden;
      }
      .ab-hud {
        display: flex; gap: 16px; color: #e0e0e0; font-size: 12px;
        width: 100%; justify-content: center;
      }
      .ab-hud span { color: #ffd700; font-weight: bold; }
      .ab-canvas-wrap { flex: 1; width: 100%; display: flex; align-items: center; justify-content: center; }
      #ab-canvas { cursor: crosshair; display: block; border-radius: 4px; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'ab-wrapper';

    const hud = document.createElement('div');
    hud.className = 'ab-hud';
    hud.innerHTML = `Score: <span id="ab-score">0</span>&nbsp; Niveau: <span id="ab-level">1</span>&nbsp; Oiseaux: <span id="ab-birds">4</span>`;

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'ab-canvas-wrap';
    this._canvas = document.createElement('canvas');
    this._canvas.id = 'ab-canvas';
    canvasWrap.appendChild(this._canvas);

    this._wrapper.append(hud, canvasWrap);
    this._viewport.appendChild(this._wrapper);

    this._ctx = this._canvas.getContext('2d');
    this._resizeCanvas();
  }

  _resizeCanvas() {
    const wrap = this._canvas.parentElement;
    const W = Math.min(wrap.clientWidth  || 480, 560);
    const H = Math.min(wrap.clientHeight || 340, 420);
    this._canvas.width  = W;
    this._canvas.height = H;
    this._W = W;
    this._H = H;
  }

  _px(nx) { return nx * this._W; }
  _py(ny) { return ny * this._H; }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    this._canvas.addEventListener('mousedown', this._onMouseDown);
    this._canvas.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    this._canvas.addEventListener('touchstart', this._onTouchStart = (e) => {
      e.preventDefault();
      const t = e.touches[0];
      const r = this._canvas.getBoundingClientRect();
      this._onMouseDown({ clientX: t.clientX, clientY: t.clientY, target: this._canvas, rect: r });
    }, { passive: false });
    this._canvas.addEventListener('touchmove', this._onTouchMove = (e) => {
      e.preventDefault();
      const t = e.touches[0];
      this._onMouseMove({ clientX: t.clientX, clientY: t.clientY });
    }, { passive: false });
    this._canvas.addEventListener('touchend', this._onTouchEnd = (e) => {
      e.preventDefault(); this._onMouseUp();
    }, { passive: false });
    document.addEventListener('keydown', this._onKey);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    this._canvas.removeEventListener('mousedown', this._onMouseDown);
    this._canvas.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('keydown', this._onKey);
  }

  _onKey(e) {
    if (e.key === 'p' || e.key === 'P') EventBus.emit('game:pause-toggle');
    if (e.key === 'r' || e.key === 'R') EventBus.emit('game:restart');
  }

  _toNorm(clientX, clientY) {
    const r = this._canvas.getBoundingClientRect();
    return { nx: (clientX - r.left) / this._W, ny: (clientY - r.top) / this._H };
  }

  _nearSling(nx, ny) {
    const dx = nx - SLING_X;
    const dy = ny - SLING_Y;
    return Math.sqrt(dx * dx + dy * dy) < 0.08;
  }

  _onMouseDown(e) {
    if (!this._state || this._state.phase !== 'ready') return;
    const { nx, ny } = this._toNorm(e.clientX, e.clientY);
    if (this._nearSling(nx, ny)) {
      this._dragging = true;
      this._game.startDrag(nx, ny);
    }
  }

  _onMouseMove(e) {
    if (!this._dragging) return;
    const { nx, ny } = this._toNorm(e.clientX, e.clientY);
    this._game.updateDrag(nx, ny);
  }

  _onMouseUp() {
    if (!this._dragging) return;
    this._dragging = false;
    this._game.releaseDrag();
  }

  _onTick({ state, action }) {
    if (action === 'restart') { this._showStart(); return; }
    this._state = state;

    const sc = document.getElementById('ab-score');
    if (sc) sc.textContent = state.score;
    const lv = document.getElementById('ab-level');
    if (lv) lv.textContent = state.level + 1;
    const bi = document.getElementById('ab-birds');
    if (bi) bi.textContent = state.birdsLeft;

    this._draw(state);
  }

  _draw(s) {
    const ctx = this._ctx;
    const W = this._W, H = this._H;
    if (!ctx) return;

    // Ciel
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#87CEEB');
    sky.addColorStop(1, '#B0E0FF');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Sol
    const groundY = 0.90;
    ctx.fillStyle = '#5a8a3a';
    ctx.fillRect(0, this._py(groundY), W, H - this._py(groundY));
    ctx.fillStyle = '#4a7a2a';
    ctx.fillRect(0, this._py(groundY), W, 4);

    // Nuages décoratifs
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    this._drawCloud(ctx, 80, 60, 30);
    this._drawCloud(ctx, 200, 45, 20);
    this._drawCloud(ctx, 350, 70, 25);

    // Blocs
    for (const blk of s.blocks) {
      ctx.fillStyle = '#a0784a';
      ctx.strokeStyle = '#7a5a2a';
      ctx.lineWidth = 1;
      const bx = this._px(blk.x), by = this._py(blk.y);
      const bw = this._px(blk.w), bh = this._py(blk.h);
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);
      // Texture bois
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      for (let yi = by + 6; yi < by + bh; yi += 8) {
        ctx.beginPath(); ctx.moveTo(bx, yi); ctx.lineTo(bx + bw, yi); ctx.stroke();
      }
    }

    // Plateformes
    for (const plt of s.platforms) {
      const px = this._px(plt.x), py = this._py(plt.y);
      const pw = this._px(plt.w), ph = 8;
      ctx.fillStyle = '#8B5E3C';
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = '#a07040';
      ctx.fillRect(px, py, pw, 3);
    }

    // Trail de l'oiseau
    for (let i = 0; i < s.bird.trail.length; i++) {
      const t = s.bird.trail[i];
      const alpha = (i / s.bird.trail.length) * 0.4;
      ctx.fillStyle = `rgba(255,255,100,${alpha})`;
      ctx.beginPath();
      ctx.arc(this._px(t.x), this._py(t.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cochons
    for (const pig of s.pigs) {
      if (!pig.alive) continue;
      const px = this._px(pig.cx);
      const py = this._py(pig.cy);
      const r  = PIG_R;

      // Corps
      const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
      g.addColorStop(0, '#7ec850');
      g.addColorStop(1, '#3a8a20');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();

      // Museau
      ctx.fillStyle = '#5ab830';
      ctx.beginPath();
      ctx.ellipse(px, py + r * 0.3, r * 0.5, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // Yeux
      ctx.fillStyle = 'white';
      ctx.beginPath(); ctx.arc(px - r * 0.35, py - r * 0.2, r * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(px + r * 0.35, py - r * 0.2, r * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(px - r * 0.3, py - r * 0.18, r * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(px + r * 0.3, py - r * 0.18, r * 0.12, 0, Math.PI * 2); ctx.fill();

      // Narines
      ctx.fillStyle = '#3a8a20';
      ctx.beginPath(); ctx.arc(px - r * 0.18, py + r * 0.3, r * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(px + r * 0.18, py + r * 0.3, r * 0.08, 0, Math.PI * 2); ctx.fill();
    }

    // Fronde
    const sx = this._px(SLING_X);
    const sy = this._py(SLING_Y);
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 4;
    // Bras gauche
    ctx.beginPath();
    ctx.moveTo(sx - 10, sy + 30);
    ctx.lineTo(sx - 12, sy - 20);
    ctx.stroke();
    // Bras droit
    ctx.beginPath();
    ctx.moveTo(sx + 10, sy + 30);
    ctx.lineTo(sx + 12, sy - 20);
    ctx.stroke();

    // Élastique
    if (s.phase === 'ready') {
      ctx.strokeStyle = '#a0622a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 12, sy - 20);
      ctx.lineTo(sx, sy);
      ctx.moveTo(sx + 12, sy - 20);
      ctx.lineTo(sx, sy);
      ctx.stroke();
    } else if (s.drag) {
      const dx = this._px(s.drag.curX);
      const dy = this._py(s.drag.curY);
      ctx.strokeStyle = '#a0622a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 12, sy - 20);
      ctx.lineTo(dx, dy);
      ctx.moveTo(sx + 12, sy - 20);
      ctx.lineTo(dx, dy);
      ctx.stroke();

      // Ligne de visée prédictive
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1;
      const dpx = sx - dx, dpy = sy - 20 - dy; // approximate
      ctx.beginPath();
      let tx = dx / this._W, ty = dy / this._H;
      const vx0 = ((s.sling.x - s.drag.curX) / 1) * 0.0001 * 60;
      const vy0 = ((s.sling.y - s.drag.curY) / 1) * 0.0001 * 60;
      ctx.moveTo(this._px(tx), this._py(ty));
      for (let t = 0; t < 40; t++) {
        tx += vx0 * 8; ty += (vy0 + 0.35 * (t / 60) * 60 * 0.016) * 8;
        ctx.lineTo(this._px(tx), this._py(ty));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Oiseau (rouge)
    if (s.phase === 'ready' || s.phase === 'flying') {
      const bx = (s.phase === 'ready' && !s.drag) ? this._px(s.sling.x) : (s.drag ? this._px(s.drag.curX) : this._px(s.bird.x));
      const by = (s.phase === 'ready' && !s.drag) ? this._py(s.sling.y) : (s.drag ? this._py(s.drag.curY) : this._py(s.bird.y));
      const bxFly = s.phase === 'flying' ? this._px(s.bird.x) : bx;
      const byFly = s.phase === 'flying' ? this._py(s.bird.y) : by;
      this._drawBird(ctx, bxFly, byFly, BIRD_R);
    }

    // Oiseaux en attente (en bas à gauche) — ne pas compter celui à la fronde ou en vol
    const waiting = s.phase === 'ready'
      ? Math.max(0, s.birdsLeft - 1)
      : Math.max(0, s.birdsLeft);
    for (let i = 0; i < waiting; i++) {
      const wx = 20 + i * (BIRD_R * 2 + 4);
      const wy = H - 20;
      this._drawBird(ctx, wx, wy, BIRD_R * 0.6);
    }

    // Message niveau suivant
    if (s.phase === 'settling' && s.pigs.every(p => !p.alive)) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(W / 2 - 100, H / 2 - 25, 200, 50);
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 16px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Niveau ${s.level + 1} réussi !`, W / 2, H / 2 + 6);
      ctx.textAlign = 'left';
    }
  }

  _drawBird(ctx, x, y, r) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#ff6a6a');
    g.addColorStop(1, '#cc1a1a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Bec
    ctx.fillStyle = '#ffa500';
    ctx.beginPath();
    ctx.moveTo(x + r * 0.5, y);
    ctx.lineTo(x + r * 1.0, y - r * 0.15);
    ctx.lineTo(x + r * 1.0, y + r * 0.15);
    ctx.closePath();
    ctx.fill();

    // Œil
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(x + r * 0.1, y - r * 0.25, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(x + r * 0.15, y - r * 0.22, r * 0.15, 0, Math.PI * 2); ctx.fill();

    // Sourcil furieux
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.1, y - r * 0.45);
    ctx.lineTo(x + r * 0.4, y - r * 0.35);
    ctx.stroke();
  }

  _drawCloud(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r * 0.8, y - r * 0.2, r * 0.7, 0, Math.PI * 2);
    ctx.arc(x + r * 1.6, y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  _onOver({ score, best }) {
    this._overlay.showGameOver(
      { result: 'lose', score, extraInfo: best > score ? `Record: ${best}` : '🏆 Nouveau record !' },
      () => EventBus.emit('game:restart')
    );
  }

  _onWon({ score, best }) {
    this._overlay.showGameOver(
      { result: 'win', score, extraInfo: `Tous les niveaux complétés !${best > score ? ` Record: ${best}` : ' 🏆 Record !'}` },
      () => EventBus.emit('game:restart')
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStart(); }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('ab-styles')?.remove();
  }
}
