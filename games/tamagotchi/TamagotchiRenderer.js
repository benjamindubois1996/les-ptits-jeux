import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const MOOD_FACE  = { happy: '😊', ok: '😐', sad: '😢', critical: '😰' };
const MOOD_SLEEP = '😴';
const BAR_COLOR  = { hunger: '#ff8844', happiness: '#44ff88', energy: '#4488ff' };

export default class TamagotchiRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._wrapper  = null;
    this._overlay  = null;
    this._els      = {};
    this._lastFace = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
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
    if (document.getElementById('tg-styles')) return;
    const s = document.createElement('style');
    s.id = 'tg-styles';
    s.textContent = `
      .tg-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 12px; box-sizing: border-box; gap: 12px;
        font-family: Orbitron, monospace;
        background: #05080f; overflow: hidden; color: #ccc;
      }
      .tg-pet-box {
        background: #0d1117; border: 2px solid #1e2535; border-radius: 20px;
        padding: 16px 28px;
        display: flex; flex-direction: column; align-items: center; gap: 6px;
        box-shadow: 0 0 24px #0a0a1a;
      }
      .tg-name { font-size: 11px; color: #666; letter-spacing: 3px; text-transform: uppercase; }
      .tg-face {
        font-size: 80px; line-height: 1;
        transition: transform 0.2s;
        cursor: default; user-select: none;
      }
      .tg-face.pop { animation: tg-pop 0.25s; }
      @keyframes tg-pop { 0%,100%{transform:scale(1)} 50%{transform:scale(1.18)} }
      .tg-age { font-size: 9px; color: #555; }
      .tg-stats {
        width: 100%; max-width: 270px;
        display: flex; flex-direction: column; gap: 7px;
      }
      .tg-stat { display: flex; align-items: center; gap: 8px; font-size: 10px; }
      .tg-stat-label { width: 80px; color: #777; flex-shrink: 0; }
      .tg-bar-track {
        flex: 1; height: 9px; background: #141422; border-radius: 5px; overflow: hidden;
      }
      .tg-bar-fill {
        height: 100%; border-radius: 5px;
        transition: width 0.6s ease, background 0.4s;
      }
      .tg-bar-val { width: 30px; text-align: right; color: #555; font-size: 9px; }
      .tg-message {
        font-size: 11px; color: #aaa; text-align: center;
        min-height: 16px; font-style: italic; max-width: 260px;
      }
      .tg-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
      .tg-btn {
        background: #0d1117; border: 1px solid #1e2535; border-radius: 10px;
        padding: 10px 16px; color: #ccc; cursor: pointer;
        font-family: Orbitron, monospace;
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        transition: border-color 0.2s, background 0.2s;
      }
      .tg-btn:hover:not(:disabled) { border-color: #44aaff; background: #111827; }
      .tg-btn:disabled { opacity: 0.35; cursor: default; }
      .tg-btn-icon  { font-size: 22px; }
      .tg-btn-label { font-size: 8px; color: #666; letter-spacing: 1px; }
      .tg-btn.active { border-color: #4488ff; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'tg-wrapper';
    this._wrapper.innerHTML = `
      <div class="tg-pet-box">
        <div class="tg-name"  id="tg-name">—</div>
        <div class="tg-face"  id="tg-face">😊</div>
        <div class="tg-age"   id="tg-age">0 heure</div>
      </div>
      <div class="tg-stats">
        <div class="tg-stat">
          <span class="tg-stat-label">🍎 Faim</span>
          <div class="tg-bar-track"><div class="tg-bar-fill" id="tg-hunger-bar" style="width:100%;background:#ff8844"></div></div>
          <span class="tg-bar-val" id="tg-hunger-val">100</span>
        </div>
        <div class="tg-stat">
          <span class="tg-stat-label">😄 Bonheur</span>
          <div class="tg-bar-track"><div class="tg-bar-fill" id="tg-happy-bar" style="width:100%;background:#44ff88"></div></div>
          <span class="tg-bar-val" id="tg-happy-val">100</span>
        </div>
        <div class="tg-stat">
          <span class="tg-stat-label">⚡ Énergie</span>
          <div class="tg-bar-track"><div class="tg-bar-fill" id="tg-energy-bar" style="width:100%;background:#4488ff"></div></div>
          <span class="tg-bar-val" id="tg-energy-val">100</span>
        </div>
      </div>
      <div class="tg-message" id="tg-msg"></div>
      <div class="tg-actions">
        <button class="tg-btn" id="tg-btn-feed">
          <span class="tg-btn-icon">🍎</span>
          <span class="tg-btn-label">NOURRIR</span>
        </button>
        <button class="tg-btn" id="tg-btn-play">
          <span class="tg-btn-icon">🎮</span>
          <span class="tg-btn-label">JOUER</span>
        </button>
        <button class="tg-btn" id="tg-btn-sleep">
          <span class="tg-btn-icon">💤</span>
          <span class="tg-btn-label">DORMIR</span>
        </button>
      </div>
    `;
    this._viewport.appendChild(this._wrapper);
    this._els.name       = this._wrapper.querySelector('#tg-name');
    this._els.face       = this._wrapper.querySelector('#tg-face');
    this._els.age        = this._wrapper.querySelector('#tg-age');
    this._els.hungerBar  = this._wrapper.querySelector('#tg-hunger-bar');
    this._els.hungerVal  = this._wrapper.querySelector('#tg-hunger-val');
    this._els.happyBar   = this._wrapper.querySelector('#tg-happy-bar');
    this._els.happyVal   = this._wrapper.querySelector('#tg-happy-val');
    this._els.energyBar  = this._wrapper.querySelector('#tg-energy-bar');
    this._els.energyVal  = this._wrapper.querySelector('#tg-energy-val');
    this._els.msg        = this._wrapper.querySelector('#tg-msg');
    this._els.btnFeed    = this._wrapper.querySelector('#tg-btn-feed');
    this._els.btnPlay    = this._wrapper.querySelector('#tg-btn-play');
    this._els.btnSleep   = this._wrapper.querySelector('#tg-btn-sleep');
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    this._els.btnFeed.addEventListener('click',  () => this._game.feed());
    this._els.btnPlay.addEventListener('click',  () => this._game.play());
    this._els.btnSleep.addEventListener('click', () => this._game.sleep());
  }

  _onTick(e) {
    if (e.action === 'restart') { this._showStart(); return; }
    if (e.action === 'play')    { this._overlay.hide(); }
    const s = e.state;
    if (!s?.pet) return;
    const p = s.pet;

    this._els.name.textContent = p.name;

    const face = p.sleeping ? MOOD_SLEEP : (MOOD_FACE[p.mood] ?? '😊');
    if (face !== this._lastFace) {
      this._lastFace = face;
      this._els.face.textContent = face;
      this._els.face.classList.remove('pop');
      void this._els.face.offsetWidth;
      this._els.face.classList.add('pop');
    }

    this._els.age.textContent = p.age === 1 ? '1 heure' : `${p.age} heures`;

    this._setBar(this._els.hungerBar, this._els.hungerVal, p.hunger, '#ff8844');
    this._setBar(this._els.happyBar,  this._els.happyVal,  p.happiness, '#44ff88');
    this._setBar(this._els.energyBar, this._els.energyVal, p.energy,  '#4488ff');

    this._els.msg.textContent = s.message || '';

    const sleeping = p.sleeping;
    this._els.btnFeed.disabled  = sleeping;
    this._els.btnPlay.disabled  = sleeping;
    this._els.btnSleep.classList.toggle('active', sleeping);
  }

  _setBar(barEl, valEl, value, color) {
    barEl.style.width      = Math.max(0, value) + '%';
    barEl.style.background = value < 25 ? '#ff2244' : color;
    valEl.textContent      = Math.max(0, Math.floor(value));
  }

  _onOver(e) {
    const age = this._game.state?.pet?.age ?? 0;
    this._overlay.showGameOver(
      { result: 'lose', score: e.score, isRecord: e.isRecord,
        extraInfo: `<div style="color:#888;font-size:11px;margin-top:4px">Survie : ${age} heure${age > 1 ? 's' : ''}</div>` },
      () => EventBus.emit('game:restart')
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }

  destroy() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('tg-styles')?.remove();
  }
}
