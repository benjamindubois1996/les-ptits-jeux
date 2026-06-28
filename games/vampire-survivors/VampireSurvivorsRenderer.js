import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';
import { WORLD }   from './VampireSurvivors.js';

const ID = 'vampire-survivors';

export default class VampireSurvivorRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._vp       = viewport;
    this._cfg      = config;
    this._wrapper  = null;
    this._canvas   = null;
    this._ctx      = null;
    this._overlay  = null;
    this._state    = null;
    this._rafId    = null;
    this._lastTime = 0;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
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
    this._stopLoop();
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById(`${ID}-styles`)?.remove();
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = `${ID}-wrapper`;

    this._canvas = document.createElement('canvas');
    this._canvas.width  = WORLD.W;
    this._canvas.height = WORLD.H;
    this._canvas.className = `${ID}-canvas`;
    this._ctx = this._canvas.getContext('2d');

    this._hudEl = document.createElement('div');
    this._hudEl.className = `${ID}-hud`;

    this._upgradeEl = document.createElement('div');
    this._upgradeEl.className = `${ID}-upgrade ${ID}-upgrade--hidden`;

    this._wrapper.append(this._canvas, this._hudEl, this._upgradeEl);
    this._vp.appendChild(this._wrapper);
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique',
         options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this._game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.9;margin-bottom:4px">
          Survie top-down &mdash; WASD / &uarr;&darr;&larr;&rarr; pour bouger<br>
          Ton personnage tire automatiquement<br>
          Collecte les gemmes XP et monte de niveau<br>
          Choisis une am&eacute;lioration &agrave; chaque niveau !
        </div>` }
    );
  }

  _startLoop() {
    this._lastTime = performance.now();
    const tick = (now) => {
      this._rafId = requestAnimationFrame(tick);
      const dt = Math.min((now - this._lastTime) / 1000, 0.05);
      this._lastTime = now;
      const s = this._state;
      if (!s) return;
      if (s.status === 'playing') {
        this._game.update(dt);
        this._draw(s);
        this._refreshHUD(s);
      }
    };
    this._rafId = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this._rafId !== null) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }

  _draw(s) {
    const ctx = this._ctx;
    ctx.clearRect(0, 0, WORLD.W, WORLD.H);

    ctx.fillStyle = '#040710';
    ctx.fillRect(0, 0, WORLD.W, WORLD.H);
    ctx.strokeStyle = '#0a1225';
    ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD.W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.H); ctx.stroke();
    }
    for (let y = 0; y <= WORLD.H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.W, y); ctx.stroke();
    }

    for (const gem of s.xpGems) {
      ctx.beginPath();
      ctx.arc(gem.x, gem.y, gem.r, 0, Math.PI * 2);
      ctx.fillStyle = '#33ff88';
      ctx.fill();
      ctx.strokeStyle = '#00dd44';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    for (const proj of s.projectiles) {
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, proj.r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffcc00';
      ctx.fill();
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const enemyColors = ['#ff3344', '#ff5500', '#cc00ff', '#ff0066'];
    for (const e of s.enemies) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fillStyle = enemyColors[e.tier] ?? '#ff3344';
      ctx.fill();
      ctx.strokeStyle = '#ff8888';
      ctx.lineWidth = 2;
      ctx.stroke();

      const bw = e.r * 2.2;
      const bh = 4;
      const bx = e.x - bw / 2;
      const by = e.y - e.r - 8;
      ctx.fillStyle = '#330000';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), bh);
    }

    const p = s.player;
    const flash = s.invincibleTimer > 0 && Math.floor(s.invincibleTimer * 8) % 2 === 0;
    if (!flash) {
      ctx.beginPath();
      ctx.arc(p.x, p.y + 4, p.r * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = '#2255ff';
      ctx.fill();
      ctx.strokeStyle = '#88aaff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x + 5, p.y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _refreshHUD(s) {
    const p    = s.player;
    const mins = Math.floor(s.time / 60);
    const secs = Math.floor(s.time % 60).toString().padStart(2, '0');
    const hearts = '&#9829;'.repeat(Math.max(0, p.hp)) + '&#9825;'.repeat(Math.max(0, p.maxHp - p.hp));
    this._hudEl.innerHTML = `
      <span class="${ID}-hp">${hearts}</span>
      <span>${mins}:${secs}</span>
      <span>NIV ${s.level}</span>
      <span>${s.kills} kills</span>
      <span>XP ${s.xp}/${s.xpToLevel}</span>
    `;
  }

  _showUpgradeMenu(s) {
    this._upgradeEl.innerHTML = `
      <div class="${ID}-upgrade-title">NIVEAU ${s.level} &mdash; CHOISIR UNE AM&Eacute;LIORATION</div>
      <div class="${ID}-upgrade-cards">
        ${s.pendingUpgrades.map((u, i) => `
          <button class="${ID}-upgrade-card" data-idx="${i}">
            <div class="${ID}-upgrade-label">${u.label}</div>
            <div class="${ID}-upgrade-desc">${u.desc}</div>
          </button>
        `).join('')}
      </div>
    `;
    this._upgradeEl.classList.remove(`${ID}-upgrade--hidden`);
    this._upgradeEl.querySelectorAll(`.${ID}-upgrade-card`).forEach(btn => {
      btn.addEventListener('click', () => {
        this._upgradeEl.classList.add(`${ID}-upgrade--hidden`);
        this._game.chooseUpgrade(+btn.dataset.idx);
      });
    });
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);

    this._onKeyDown = e => {
      const s = this._state;
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        EventBus.emit('game:pause-toggle'); return;
      }
      if (e.key === 'r' || e.key === 'R') { this._game.restart(); return; }
      if (s?.status === 'upgrading') {
        if (e.key === '1') this._upgradeEl.querySelectorAll(`.${ID}-upgrade-card`)[0]?.click();
        if (e.key === '2') this._upgradeEl.querySelectorAll(`.${ID}-upgrade-card`)[1]?.click();
        if (e.key === '3') this._upgradeEl.querySelectorAll(`.${ID}-upgrade-card`)[2]?.click();
        return;
      }
      s?.keys.add(e.code);
    };
    this._onKeyUp = e => { this._state?.keys.delete(e.code); };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
  }

  _onTick({ state, action }) {
    this._state = state;
    if (action === 'play') {
      this._resizeCanvas();
      this._startLoop();
      this._hudEl.style.display = 'flex';
    }
    if (action === 'levelup')  this._showUpgradeMenu(state);
    if (action === 'upgraded') this._upgradeEl.classList.add(`${ID}-upgrade--hidden`);
    if (action === 'restart')  { this._stopLoop(); this._hudEl.style.display = 'none'; }
  }

  _resizeCanvas() {
    const vw = this._vp.clientWidth  - 4;
    const vh = this._vp.clientHeight - 44;
    const scale = Math.min(vw / WORLD.W, vh / WORLD.H, 1);
    this._canvas.style.width  = `${WORLD.W * scale}px`;
    this._canvas.style.height = `${WORLD.H * scale}px`;
  }

  _onOver({ result, icon, title, score, best, isRecord, extraInfo }) {
    this._stopLoop();
    this._overlay.showGameOver(
      { result, icon, title, score, best, isRecord: false, extraInfo },
      () => { this._overlay.hide(); this._game.start({ mode: this._game.state?.mode }); }
    );
  }

  _onPaused()  {
    this._stopLoop();
    this._overlay.showPause(() => EventBus.emit('game:pause-toggle'));
  }
  _onResumed() {
    this._overlay.hide();
    if (this._state?.status === 'playing') this._startLoop();
  }
  _onRestart() {
    this._stopLoop();
    this._hudEl.style.display = 'none';
    this._upgradeEl.classList.add(`${ID}-upgrade--hidden`);
    this._ctx.clearRect(0, 0, WORLD.W, WORLD.H);
    this._showStart();
  }

  _injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;
    const s = document.createElement('style');
    s.id = `${ID}-styles`;
    s.textContent = `
      .${ID}-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        background: #040710; padding: 4px; box-sizing: border-box;
        font-family: Orbitron, monospace; gap: 4px; overflow: hidden;
      }
      .${ID}-canvas { display: block; image-rendering: crisp-edges; }
      .${ID}-hud {
        display: none; flex-direction: row; gap: 14px;
        color: #aabbdd; font-size: 0.7rem; letter-spacing: 1px;
        align-items: center; flex-wrap: wrap; justify-content: center;
        min-height: 22px;
      }
      .${ID}-hp { color: #ff6688; letter-spacing: 2px; }
      .${ID}-upgrade {
        position: absolute; inset: 0;
        background: rgba(4,7,16,0.88); backdrop-filter: blur(6px);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 20px;
        z-index: 10;
      }
      .${ID}-upgrade--hidden { display: none; }
      .${ID}-upgrade-title { color: #ffcc44; font-size: 0.85rem; letter-spacing: 2px; text-align: center; }
      .${ID}-upgrade-cards { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; }
      .${ID}-upgrade-card {
        background: #0d1828; border: 1px solid #2a4070;
        border-radius: 10px; padding: 18px 20px; cursor: pointer;
        width: 160px; text-align: center; transition: all .2s;
        font-family: Orbitron, monospace;
      }
      .${ID}-upgrade-card:hover { background: #1a2f50; border-color: #4477cc; transform: translateY(-3px); }
      .${ID}-upgrade-label { color: #88ccff; font-size: 0.78rem; letter-spacing: 1px; margin-bottom: 8px; }
      .${ID}-upgrade-desc  { color: #556677; font-size: 0.62rem; line-height: 1.5; }
    `;
    document.head.appendChild(s);
  }
}
