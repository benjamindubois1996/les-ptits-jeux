import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const FMT = n => {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9)  return (n / 1e9).toFixed(1)  + 'G';
  if (n >= 1e6)  return (n / 1e6).toFixed(1)  + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(1)  + 'K';
  return Math.floor(n).toString();
};

export default class IdleClickerRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._wrapper  = null;
    this._overlay  = null;
    this._els      = {};

    this._onTick    = this._onTick.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
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
    if (document.getElementById('ic-styles')) return;
    const s = document.createElement('style');
    s.id = 'ic-styles';
    s.textContent = `
      .ic-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 8px;
        box-sizing: border-box; gap: 6px;
        font-family: Orbitron, monospace;
        background: #05080f; overflow: hidden; color: #ccc;
      }
      .ic-header {
        display: flex; gap: 16px; font-size: 11px;
        color: #888; justify-content: center; flex-wrap: wrap;
      }
      .ic-header .val { color: #ffd700; font-weight: bold; font-size: 14px; }
      .ic-header .lbl { color: #555; }
      .ic-body {
        display: flex; gap: 8px; flex: 1; overflow: hidden; width: 100%;
      }
      .ic-left {
        display: flex; flex-direction: column; align-items: center;
        gap: 10px; flex: 0 0 140px; justify-content: center;
      }
      .ic-coin-btn {
        width: 110px; height: 110px; border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, #ffe066 0%, #ff8800 70%, #cc5500 100%);
        border: 3px solid #ffcc00;
        font-size: 44px; cursor: pointer;
        box-shadow: 0 0 24px #ffd70055, inset 0 -4px 8px #cc550066;
        transition: transform 0.07s, box-shadow 0.07s;
        display: flex; align-items: center; justify-content: center;
        user-select: none; outline: none;
      }
      .ic-coin-btn:active { transform: scale(0.91); box-shadow: 0 0 8px #ffd70033; }
      .ic-stat { font-size: 10px; color: #888; text-align: center; }
      .ic-stat strong { color: #44ffaa; }
      .ic-right {
        flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;
        scrollbar-width: thin; scrollbar-color: #1e2535 transparent;
      }
      .ic-shop-title {
        font-size: 9px; color: #555; text-transform: uppercase;
        letter-spacing: 2px; padding: 2px 0; text-align: center;
        border-bottom: 1px solid #111; margin-bottom: 2px;
      }
      .ic-upg {
        display: flex; align-items: center; gap: 6px;
        background: #0d1117; border: 1px solid #1e2535;
        border-radius: 6px; padding: 5px 8px;
        cursor: pointer; transition: border-color 0.15s, background 0.15s;
        user-select: none;
      }
      .ic-upg.can-buy { border-color: #ffd70066; }
      .ic-upg.can-buy:hover { border-color: #ffd700; background: #11181f; }
      .ic-upg.cannot-buy { opacity: 0.45; cursor: default; }
      .ic-upg-emoji { font-size: 18px; flex-shrink: 0; line-height: 1; }
      .ic-upg-info { flex: 1; min-width: 0; }
      .ic-upg-name { font-size: 10px; color: #ddd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ic-upg-desc { font-size: 9px; color: #666; }
      .ic-upg-right { text-align: right; flex-shrink: 0; }
      .ic-upg-cost { font-size: 10px; color: #ffd700; font-weight: bold; }
      .ic-upg-owned { font-size: 9px; color: #4488ff; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'ic-wrapper';
    this._wrapper.innerHTML = `
      <div class="ic-header">
        <span><span class="lbl">PIÈCES</span> <span class="val" id="ic-coins">0</span></span>
        <span><span class="lbl">TOTAL</span> <span class="val" id="ic-total">0</span></span>
      </div>
      <div class="ic-body">
        <div class="ic-left">
          <button class="ic-coin-btn" id="ic-click-btn">🪙</button>
          <div class="ic-stat">+<span id="ic-cpc">1</span> par clic</div>
          <div class="ic-stat"><strong><span id="ic-cps">0</span>/s</strong> passif</div>
        </div>
        <div class="ic-right">
          <div class="ic-shop-title">🛒 Améliorations</div>
          <div id="ic-shop"></div>
        </div>
      </div>
    `;
    this._viewport.appendChild(this._wrapper);
    this._els.coins    = this._wrapper.querySelector('#ic-coins');
    this._els.total    = this._wrapper.querySelector('#ic-total');
    this._els.cpc      = this._wrapper.querySelector('#ic-cpc');
    this._els.cps      = this._wrapper.querySelector('#ic-cps');
    this._els.shop     = this._wrapper.querySelector('#ic-shop');
    this._els.clickBtn = this._wrapper.querySelector('#ic-click-btn');
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    this._els.clickBtn.addEventListener('click', () => this._game.click());
    this._els.shop.addEventListener('click', e => {
      const btn = e.target.closest('.ic-upg[data-id]');
      if (btn) this._game.buyUpgrade(btn.dataset.id);
    });
  }

  _onTick(e) {
    if (e.action === 'restart') { this._showStart(); return; }
    if (e.action === 'play')    { this._overlay.hide(); }
    const s = e.state;
    if (!s) return;
    this._els.coins.textContent = FMT(s.coins);
    this._els.total.textContent = FMT(s.totalEarned);
    this._els.cpc.textContent   = FMT(s.coinsPerClick);
    this._els.cps.textContent   = FMT(s.coinsPerSecond);
    this._renderShop(s);
  }

  _renderShop(s) {
    this._els.shop.innerHTML = s.upgrades.map(u => {
      const canBuy = s.coins >= u.currentCost;
      return `
        <div class="ic-upg ${canBuy ? 'can-buy' : 'cannot-buy'}" data-id="${u.id}">
          <span class="ic-upg-emoji">${u.emoji}</span>
          <div class="ic-upg-info">
            <div class="ic-upg-name">${u.name}</div>
            <div class="ic-upg-desc">${u.desc}</div>
          </div>
          <div class="ic-upg-right">
            <div class="ic-upg-cost">🪙${FMT(u.currentCost)}</div>
            ${u.owned ? `<div class="ic-upg-owned">×${u.owned}</div>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }

  destroy() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('ic-styles')?.remove();
  }
}
