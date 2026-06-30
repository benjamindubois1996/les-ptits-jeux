import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const SHIP_R = 12;
const STAR_R = 18;

export default class SpacewarRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._canvas   = null;
    this._ctx      = null;
    this._wrapper  = null;
    this._overlay  = null;
    this._stars    = [];

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
    if (document.getElementById('sw-styles')) return;
    const s = document.createElement('style');
    s.id = 'sw-styles';
    s.textContent = `
      .sw-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 8px;
        box-sizing: border-box; gap: 4px;
        font-family: Orbitron, monospace; overflow: hidden; background: #000;
      }
      .sw-hud {
        display: flex; gap: 12px; color: #e0e0e0; font-size: 11px; width: 100%; justify-content: center;
      }
      .sw-hud span { font-weight: bold; }
      .sw-hud .sc { color: #ffd700; }
      .sw-hud .pl { color: #44aaff; }
      .sw-hud .en { color: #ff6644; }
      .sw-canvas-wrap { flex: 1; width: 100%; display: flex; align-items: center; justify-content: center; }
      #sw-canvas { display: block; }
      .sw-legend {
        font-size: 9px; color: #667; text-align: center; letter-spacing: 1px;
      }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'sw-wrapper';

    const hud = document.createElement('div');
    hud.className = 'sw-hud';
    hud.innerHTML = `Score: <span id="sw-score" class="sc">0</span>&nbsp; Tu: <span id="sw-plives" class="pl">❤❤❤</span>&nbsp; Ennemi: <span id="sw-elives" class="en">❤❤❤</span>`;

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'sw-canvas-wrap';
    this._canvas = document.createElement('canvas');
    this._canvas.id = 'sw-canvas';
    canvasWrap.appendChild(this._canvas);

    const legend = document.createElement('div');
    legend.className = 'sw-legend';
    legend.textContent = '← → : rotation · ↑ : propulseur · Espace : tirer · H : hyperespace';

    this._wrapper.append(hud, canvasWrap, legend);
    this._viewport.appendChild(this._wrapper);
    this._ctx = this._canvas.getContext('2d');
    this._resizeCanvas();
    this._generateStars();
  }

  _resizeCanvas() {
    const wrap = this._canvas.parentElement;
    const W = Math.min(wrap.clientWidth  || 580, 640);
    const H = Math.min(wrap.clientHeight || 380, 460);
    this._canvas.width  = W;
    this._canvas.height = H;
    this._game.setDimensions(W, H);
  }

  _generateStars() {
    this._stars = [];
    for (let i = 0; i < 80; i++) {
      this._stars.push({
        x: Math.random() * this._canvas.width,
        y: Math.random() * this._canvas.height,
        r: Math.random() * 1.5 + 0.5,
        b: Math.random() * 0.6 + 0.4,
      });
    }
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

  _onTick({ state, action }) {
    if (action === 'restart') { this._showStart(); return; }

    const sc = document.getElementById('sw-score');
    if (sc) sc.textContent = state.score;
    const pl = document.getElementById('sw-plives');
    if (pl) pl.textContent = '❤'.repeat(Math.max(0, state.player.lives));
    const el = document.getElementById('sw-elives');
    if (el) el.textContent = '❤'.repeat(Math.max(0, state.enemy.lives));

    this._draw(state);
  }

  _draw(s) {
    const ctx = this._ctx;
    const W = this._canvas.width, H = this._canvas.height;
    if (!ctx) return;

    // Fond noir
    ctx.fillStyle = '#000010';
    ctx.fillRect(0, 0, W, H);

    // Étoiles fond
    for (const st of this._stars) {
      ctx.fillStyle = `rgba(255,255,255,${st.b})`;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Étoile centrale (gravitationnelle)
    const sg = ctx.createRadialGradient(s.star.x, s.star.y, 2, s.star.x, s.star.y, STAR_R * 2.5);
    sg.addColorStop(0, '#fffaaa');
    sg.addColorStop(0.3, '#ffaa00');
    sg.addColorStop(0.7, '#ff4400');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(s.star.x, s.star.y, STAR_R * 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.star.x, s.star.y, STAR_R * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Bullets
    for (const b of s.bullets) {
      const col = b.owner === 'player' ? '#88ddff' : '#ff8844';
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
      // Traînée
      ctx.fillStyle = b.owner === 'player' ? 'rgba(100,200,255,0.4)' : 'rgba(255,100,40,0.4)';
      ctx.beginPath();
      const spd = Math.sqrt(b.vx ** 2 + b.vy ** 2);
      const nx = spd > 0 ? -b.vx / spd : 0;
      const ny = spd > 0 ? -b.vy / spd : 0;
      ctx.arc(b.x + nx * 8, b.y + ny * 8, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Vaisseaux
    this._drawShip(ctx, s.player, '#44aaff', '#0044aa');
    this._drawShip(ctx, s.enemy,  '#ff6644', '#aa2200');
  }

  _drawShip(ctx, ship, colorMain, colorDark) {
    if (ship.respawnMs > 0) {
      // Clignotement pendant respawn
      if (Math.floor(ship.respawnMs / 200) % 2 === 0) return;
    }

    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    // Triangle du vaisseau
    ctx.beginPath();
    ctx.moveTo(SHIP_R * 1.4, 0);
    ctx.lineTo(-SHIP_R, SHIP_R * 0.7);
    ctx.lineTo(-SHIP_R * 0.5, 0);
    ctx.lineTo(-SHIP_R, -SHIP_R * 0.7);
    ctx.closePath();
    ctx.fillStyle = colorMain;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Propulseur (flamme quand on pousse)
    if (ship.thrusting && ship.respawnMs <= 0) {
      ctx.fillStyle = '#ff8800';
      ctx.beginPath();
      ctx.moveTo(-SHIP_R * 0.6, SHIP_R * 0.3);
      ctx.lineTo(-SHIP_R * 0.6 - (Math.random() * 0.8 + 0.8) * SHIP_R, 0);
      ctx.lineTo(-SHIP_R * 0.6, -SHIP_R * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffee00';
      ctx.beginPath();
      ctx.moveTo(-SHIP_R * 0.6, SHIP_R * 0.15);
      ctx.lineTo(-SHIP_R * 0.6 - (Math.random() * 0.4 + 0.4) * SHIP_R, 0);
      ctx.lineTo(-SHIP_R * 0.6, -SHIP_R * 0.15);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  _onOver({ score, best }) {
    this._overlay.showGameOver(
      { result: 'lose', score, extraInfo: best > score ? `Record: ${best}` : '🏆 Nouveau record !' },
      () => EventBus.emit('game:restart')
    );
  }

  _onWon({ score, best }) {
    this._overlay.showGameOver(
      { result: 'win', score, extraInfo: `Ennemi détruit !${best > score ? ` Record: ${best}` : ' 🏆 Record !'}` },
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
    document.getElementById('sw-styles')?.remove();
  }
}
