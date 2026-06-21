import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

/* Lane colors */
const LANE_COLORS = {
  goal:  '#163d16',
  safe:  '#1a4d1a',
  road:  '#1a1a1a',
  water: '#0a2a4a',
};

/* Car colors cycling per lane */
const CAR_COLORS = ['#e63030', '#e6a030', '#3070e6', '#30b030', '#e630e6'];

export default class FroggerRenderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    this._wrapper = null;
    this._canvas  = null;
    this._ctx     = null;
    this._overlay = null;
    this._sel     = { mode: 'basique' };

    this._onFrame   = this._onFrame.bind(this);
    this._onTick    = this._onTick.bind(this);
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
    document.getElementById('frog-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('frog-styles')) return;
    const el = document.createElement('style');
    el.id = 'frog-styles';
    el.textContent = `
      .frog-wrapper {
        position:absolute; inset:0;
        display:flex; align-items:center; justify-content:center;
        background:#050810; overflow:hidden; font-family:Orbitron,monospace;
      }
      .frog-canvas { display:block; max-width:100%; max-height:100%; }
    `;
    document.head.appendChild(el);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'frog-wrapper';

    const { W, H } = this.config.gameplay;
    this._canvas = document.createElement('canvas');
    this._canvas.className = 'frog-canvas';
    this._canvas.width  = W;
    this._canvas.height = H;
    this._ctx = this._canvas.getContext('2d');

    this._wrapper.appendChild(this._canvas);
    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();
    this.viewport.appendChild(this._wrapper);
  }

  _optionGroups() {
    return [
      {
        key: 'mode', label: 'MODE', default: 'basique',
        options: [{ value: 'basique', label: 'BASIQUE' }],
      },
    ];
  }

  _showStartScreen() {
    this._overlay.showStart(
      this._optionGroups(),
      sel => { this._sel = sel; this._overlay.hide(); this.game.start(sel); },
      { extraHtml: '<div style="font-size:10px;color:rgba(0,255,225,0.6);letter-spacing:0.1em;margin-top:4px">↑↓←→ ou WASD pour se déplacer</div>' },
    );
  }

  _showGameOverScreen({ score, best }) {
    this._overlay.showGameOver(
      {
        result:    'lose',
        score,
        isRecord:  score > 0 && score >= best,
        extraInfo: `<div class="overlay-score">Meilleur : ${best}</div>`,
      },
      () => this._showStartScreen(),
    );
  }

  _bindEvents() {
    EventBus.on('game:frame',   this._onFrame);
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindEvents() {
    EventBus.off('game:frame',   this._onFrame);
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    if (this.game.state.status === 'idle' && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      this._overlay.hide();
      this.game.start(this._sel);
    }
  }

  _onFrame({ state }) { this._draw(state); }
  _onTick({ state })  { if (state.status === 'idle') { this._overlay.show(); this._draw(state); } }
  _onOver(data)       { this._draw(this.game.state); this._showGameOverScreen(data); }
  _onPaused()         { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed()        { this._overlay.hide(); }
  _onRestart()        { this._showStartScreen(); }

  _draw(state) {
    const ctx  = this._ctx;
    const cfg  = this.config.gameplay;
    const { W, H, CELL, ROWS } = cfg;

    /* Background */
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, W, H);

    if (state.status === 'idle') return;

    /* Lanes */
    for (let r = 0; r < ROWS; r++) {
      const lane = state.lanes[r];
      const y    = r * CELL;
      const type = lane?.type ?? 'safe';

      ctx.fillStyle = LANE_COLORS[type] ?? '#111';
      ctx.fillRect(0, y, W, CELL);

      /* Lane border */
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth   = 1;
      ctx.strokeRect(0, y, W, CELL);

      if (type === 'road') {
        /* Road markings */
        ctx.fillStyle   = 'rgba(255,255,200,0.12)';
        ctx.fillRect(0, y + CELL / 2 - 1, W, 2);
      }
    }

    /* Goals row */
    this._drawGoalRow(ctx, state, cfg);

    /* Lane objects */
    for (let r = 0; r < ROWS; r++) {
      const lane = state.lanes[r];
      if (!lane) continue;
      const y = r * CELL;

      if (lane.type === 'water') {
        /* Logs */
        for (const log of lane.objects) {
          this._drawLog(ctx, log.px, y, log.w, CELL);
        }
      } else if (lane.type === 'road') {
        /* Cars */
        const color = CAR_COLORS[r % CAR_COLORS.length];
        for (const car of lane.objects) {
          this._drawCar(ctx, car.px, y, car.w, CELL, color, lane.dir);
        }
      }
    }

    /* Frog */
    if (state.status === 'playing') {
      const frog = state.frog;
      const fy   = frog.row * CELL + CELL / 2;
      const blink = frog.dying && Math.floor(frog.deathTimer / 120) % 2 === 0;
      if (!blink) this._drawFrog(ctx, frog.px, fy, CELL, frog.dying);
    }

    /* HUD */
    ctx.font         = '13px Orbitron, monospace';
    ctx.fillStyle    = 'rgba(255,255,255,0.85)';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Score : ${state.score}`, 6, 10);
    ctx.textAlign = 'right';
    ctx.fillText(`Niv. ${state.level}`, W - 6, 10);
  }

  _drawGoalRow(ctx, state, cfg) {
    const { CELL, homeX } = cfg;
    const y = 0;

    /* Dark areas between homes */
    ctx.fillStyle = '#0d260d';
    ctx.fillRect(0, y, cfg.W, CELL);

    /* Home pads */
    homeX.forEach((hx, i) => {
      const px = hx - CELL * 0.55;
      const isHome = state.homes[i];
      ctx.fillStyle = isHome ? '#28a028' : '#1a5c1a';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(px, y + 4, CELL * 1.1, CELL - 8, 6) : ctx.rect(px, y + 4, CELL * 1.1, CELL - 8);
      ctx.fill();
      if (isHome) {
        ctx.fillStyle   = '#50c050';
        ctx.font        = '18px sans-serif';
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🐸', hx, y + CELL / 2);
      }
    });
  }

  _drawLog(ctx, px, y, w, cell) {
    const margin = 5;
    ctx.fillStyle = '#5c3d1a';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px, y + margin, w, cell - margin * 2, 6);
    else ctx.rect(px, y + margin, w, cell - margin * 2);
    ctx.fill();

    ctx.strokeStyle = '#3d2800';
    ctx.lineWidth   = 1;
    ctx.stroke();

    /* Log grain lines */
    ctx.strokeStyle = 'rgba(255,200,120,0.15)';
    ctx.lineWidth   = 1;
    for (let i = 1; i < Math.floor(w / 14); i++) {
      const lx = px + i * 14;
      ctx.beginPath();
      ctx.moveTo(lx, y + margin + 2);
      ctx.lineTo(lx, y + cell - margin - 2);
      ctx.stroke();
    }
  }

  _drawCar(ctx, px, y, w, cell, color, dir) {
    const margin = 6;
    const h      = cell - margin * 2;
    const cy     = y + margin;

    /* Body */
    ctx.fillStyle = color;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px, cy, w, h, 5);
    else ctx.rect(px, cy, w, h);
    ctx.fill();

    /* Windshield */
    ctx.fillStyle = 'rgba(150,220,255,0.5)';
    const ww = Math.min(w * 0.35, 20);
    const wx = dir > 0 ? px + w - ww - 4 : px + 4;
    ctx.fillRect(wx, cy + 3, ww, h - 6);

    /* Wheels */
    ctx.fillStyle = '#222';
    [[px + 4, cy + h - 1], [px + w - 10, cy + h - 1]].forEach(([wx2, wy]) => {
      ctx.beginPath();
      ctx.ellipse(wx2 + 3, wy, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  _drawFrog(ctx, cx, cy, cell, dying) {
    const r = cell * 0.35;

    ctx.save();
    if (dying) ctx.globalAlpha = 0.7;

    /* Body */
    ctx.fillStyle = dying ? '#ff4444' : '#30c030';
    ctx.shadowColor = dying ? '#ff0000' : '#00ff44';
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    /* Eyes */
    ctx.fillStyle = '#fff';
    [[-r * 0.45, -r * 0.5], [r * 0.45, -r * 0.5]].forEach(([ex, ey]) => {
      ctx.beginPath();
      ctx.arc(cx + ex, cy + ey, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#111';
    [[-r * 0.42, -r * 0.48], [r * 0.42, -r * 0.48]].forEach(([ex, ey]) => {
      ctx.beginPath();
      ctx.arc(cx + ex, cy + ey, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    });

    /* Front legs */
    ctx.strokeStyle = dying ? '#ff4444' : '#28a828';
    ctx.lineWidth   = 3;
    [[-1, -1], [1, -1]].forEach(([sx]) => {
      ctx.beginPath();
      ctx.moveTo(cx + sx * r * 0.7, cy - r * 0.15);
      ctx.lineTo(cx + sx * r * 1.25, cy - r * 0.5);
      ctx.stroke();
    });

    ctx.restore();
  }
}
