import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const MAP_W = 22, MAP_H = 16;
const WALL = 0, FLOOR = 1, STAIRS = 2;

export default class RoguelikeDungeonRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._canvas   = null;
    this._ctx      = null;
    this._wrapper  = null;
    this._overlay  = null;
    this._ts       = 24; // taille d'une tuile en px

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
    if (document.getElementById('rl-styles')) return;
    const s = document.createElement('style');
    s.id = 'rl-styles';
    s.textContent = `
      .rl-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 6px;
        box-sizing: border-box; gap: 4px;
        font-family: 'Courier New', monospace; overflow: hidden;
        background: #080808;
      }
      .rl-top {
        display: flex; gap: 10px; color: #aaa; font-size: 11px;
        width: 100%; justify-content: center; flex-wrap: wrap;
      }
      .rl-top .lbl { color: #666; }
      .rl-top .val { color: #ffd700; font-weight: bold; }
      .rl-top .hp-val { color: #ff4444; font-weight: bold; }
      .rl-top .hp-ok { color: #44ff44; }
      .rl-top .floor-val { color: #88aaff; }
      .rl-canvas-wrap { display: flex; align-items: center; justify-content: center; }
      #rl-canvas { display: block; image-rendering: pixelated; }
      .rl-log {
        width: 100%; font-size: 10px; color: #888;
        display: flex; flex-direction: column; gap: 1px;
        border-top: 1px solid #222; padding-top: 2px;
        max-height: 52px; overflow: hidden;
        font-family: 'Courier New', monospace;
      }
      .rl-log div:last-child { color: #ccc; }
      .rl-upgrade-overlay {
        position: absolute; inset: 0; z-index: 30;
        background: rgba(0,0,0,0.92);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 10px;
        font-family: Orbitron, monospace;
      }
      .rl-upgrade-overlay.rl-hidden { display: none; }
      .rl-upgrade-title {
        color: #ffd700; font-size: 14px; font-weight: bold; letter-spacing: 2px;
        text-align: center;
      }
      .rl-upgrade-subtitle { color: #888; font-size: 10px; text-align: center; }
      .rl-upgrade-choices { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
      .rl-upgrade-btn {
        padding: 10px 16px; border: 1px solid #444; border-radius: 6px;
        background: #111; color: #e0e0e0; cursor: pointer;
        font-family: Orbitron, monospace; font-size: 11px;
        display: flex; flex-direction: column; gap: 4px;
        min-width: 130px; text-align: center; transition: border-color 0.2s;
      }
      .rl-upgrade-btn:hover { border-color: #ffd700; background: #1a1600; color: #ffd700; }
      .rl-upgrade-btn-desc { color: #666; font-size: 9px; font-family: 'Courier New', monospace; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'rl-wrapper';

    // Stats HUD
    const top = document.createElement('div');
    top.className = 'rl-top';
    top.innerHTML = `
      <span><span class="lbl">Étage </span><span id="rl-floor" class="floor-val">1</span></span>
      <span><span class="lbl">HP </span><span id="rl-hp" class="hp-ok">30</span>/<span id="rl-maxhp" class="val">30</span></span>
      <span><span class="lbl">ATK </span><span id="rl-atk" class="val">6</span></span>
      <span><span class="lbl">DEF </span><span id="rl-def" class="val">2</span></span>
      <span><span class="lbl">Niv.</span><span id="rl-lvl" class="val">1</span></span>
      <span><span class="lbl">XP </span><span id="rl-xp" class="val">0</span>/<span id="rl-xpnxt" class="val">20</span></span>
      <span><span class="lbl">Score </span><span id="rl-score" class="val">0</span></span>
    `;

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'rl-canvas-wrap';
    this._canvas = document.createElement('canvas');
    this._canvas.id = 'rl-canvas';
    canvasWrap.appendChild(this._canvas);

    const log = document.createElement('div');
    log.className = 'rl-log';
    log.id = 'rl-log';

    this._upgradeOverlay = document.createElement('div');
    this._upgradeOverlay.className = 'rl-upgrade-overlay rl-hidden';

    this._wrapper.append(top, canvasWrap, log, this._upgradeOverlay);
    this._viewport.appendChild(this._wrapper);
    this._ctx = this._canvas.getContext('2d');
    this._resizeCanvas();
  }

  _resizeCanvas() {
    const wrap = this._canvas.parentElement;
    const maxW = (wrap.clientWidth  || 528) - 4;
    const maxH = (wrap.clientHeight || 384) - 4;
    const tileW = Math.floor(maxW / MAP_W);
    const tileH = Math.floor(maxH / MAP_H);
    this._ts = Math.max(18, Math.min(tileW, tileH, 28));
    this._canvas.width  = this._ts * MAP_W;
    this._canvas.height = this._ts * MAP_H;
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

    // HUD
    const p = state.player;
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('rl-floor', state.floor);
    setEl('rl-hp',    p.hp);
    setEl('rl-maxhp', p.maxHp);
    setEl('rl-atk',   p.atk);
    setEl('rl-def',   p.def);
    setEl('rl-lvl',   p.lvl);
    setEl('rl-xp',    p.xp);
    setEl('rl-xpnxt', p.xpNext);
    setEl('rl-score', state.score);
    const hpEl = document.getElementById('rl-hp');
    if (hpEl) {
      hpEl.className = p.hp < p.maxHp * 0.3 ? 'hp-val' : 'hp-ok';
    }

    // Log
    const logEl = document.getElementById('rl-log');
    if (logEl) {
      logEl.innerHTML = '';
      const last5 = state.log.slice(-5);
      for (const msg of last5) {
        const d = document.createElement('div');
        d.textContent = '> ' + msg;
        logEl.appendChild(d);
      }
    }

    // Upgrade overlay
    if (state.phase === 'upgrade' && state.upgradeOptions) {
      this._showUpgradeOverlay(state.upgradeOptions);
    } else {
      this._upgradeOverlay.classList.add('rl-hidden');
    }

    this._draw(state);
  }

  _showUpgradeOverlay(options) {
    this._upgradeOverlay.classList.remove('rl-hidden');
    this._upgradeOverlay.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'rl-upgrade-title';
    title.textContent = '⭐ AMÉLIORATION ⭐';

    const sub = document.createElement('div');
    sub.className = 'rl-upgrade-subtitle';
    sub.textContent = 'Choisissez une amélioration avant le prochain étage';

    const choices = document.createElement('div');
    choices.className = 'rl-upgrade-choices';

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.className = 'rl-upgrade-btn';
      btn.innerHTML = `<span>${opt.label}</span><span class="rl-upgrade-btn-desc">${opt.desc}</span>`;
      btn.addEventListener('click', () => {
        this._game.applyUpgrade(opt.type);
        this._upgradeOverlay.classList.add('rl-hidden');
      });
      choices.appendChild(btn);
    }

    this._upgradeOverlay.append(title, sub, choices);
  }

  _draw(s) {
    const ctx = this._ctx;
    const ts  = this._ts;
    if (!ctx) return;

    // Fond
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    // Tuiles
    for (let row = 0; row < MAP_H; row++) {
      for (let col = 0; col < MAP_W; col++) {
        const tile = s.map[row]?.[col] ?? WALL;
        const x = col * ts, y = row * ts;
        if (tile === WALL) {
          ctx.fillStyle = '#111';
          ctx.fillRect(x, y, ts, ts);
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
        } else if (tile === FLOOR) {
          ctx.fillStyle = '#1e1a12';
          ctx.fillRect(x, y, ts, ts);
          ctx.fillStyle = '#252018';
          ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
          // Grain de sol
          if ((row + col) % 3 === 0) {
            ctx.fillStyle = '#1c1813';
            ctx.fillRect(x + ts * 0.6, y + ts * 0.7, 2, 2);
          }
        } else if (tile === STAIRS) {
          ctx.fillStyle = '#1e1a12';
          ctx.fillRect(x, y, ts, ts);
          ctx.fillStyle = '#ffd700';
          ctx.font = `${ts - 4}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('▽', x + ts / 2, y + ts / 2);
          ctx.textAlign = 'left';
        }
      }
    }

    // Items
    for (const item of s.items) {
      const x = item.x * ts, y = item.y * ts;
      // Halo
      ctx.fillStyle = 'rgba(255,255,100,0.1)';
      ctx.fillRect(x, y, ts, ts);
      ctx.fillStyle = item.color;
      ctx.font = `bold ${ts - 4}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.char, x + ts / 2, y + ts / 2);
      ctx.textAlign = 'left';
    }

    // Ennemis
    for (const enemy of s.enemies) {
      const x = enemy.x * ts, y = enemy.y * ts;
      // HP bar
      const hpPct = enemy.hp / enemy.maxHp;
      ctx.fillStyle = '#400';
      ctx.fillRect(x + 1, y + 1, ts - 2, 3);
      ctx.fillStyle = hpPct > 0.5 ? '#4a4' : '#aa4';
      ctx.fillRect(x + 1, y + 1, (ts - 2) * hpPct, 3);

      ctx.fillStyle = enemy.color;
      ctx.font = `bold ${ts - 4}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(enemy.char, x + ts / 2, y + ts / 2 + 2);
      ctx.textAlign = 'left';
    }

    // Joueur (@)
    const { player: p } = s;
    const px = p.x * ts, py = p.y * ts;
    // Halo lumineux
    const grd = ctx.createRadialGradient(px + ts / 2, py + ts / 2, 2, px + ts / 2, py + ts / 2, ts);
    grd.addColorStop(0, 'rgba(100,200,255,0.25)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(px - ts, py - ts, ts * 3, ts * 3);

    ctx.fillStyle = '#44aaff';
    ctx.font = `bold ${ts - 2}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('@', px + ts / 2, py + ts / 2);
    ctx.textAlign = 'left';

    // HP bar joueur
    const hpPct = p.hp / p.maxHp;
    ctx.fillStyle = '#300';
    ctx.fillRect(px + 1, py + 1, ts - 2, 3);
    ctx.fillStyle = hpPct > 0.6 ? '#4a4' : hpPct > 0.3 ? '#aa4' : '#a44';
    ctx.fillRect(px + 1, py + 1, (ts - 2) * hpPct, 3);
  }

  _onOver({ score, best }) {
    this._upgradeOverlay.classList.add('rl-hidden');
    this._overlay.showGameOver(
      { result: 'lose', score, extraInfo: best > score ? `Record: ${best}` : '🏆 Nouveau record !' },
      () => EventBus.emit('game:restart')
    );
  }

  _onWon({ score, best }) {
    this._upgradeOverlay.classList.add('rl-hidden');
    this._overlay.showGameOver(
      { result: 'win', score, extraInfo: `Dragon vaincu ! Héros légendaire !${best > score ? ` Record: ${best}` : ' 🏆 Record !'}` },
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
    document.getElementById('rl-styles')?.remove();
  }
}
