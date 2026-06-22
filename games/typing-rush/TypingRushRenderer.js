import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const COLORS = ['#00ffe1','#7b61ff','#ff6b35','#ffe030','#ff4d8b','#00d4ff'];

export default class TypingRushRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._overlay = null;
    this._canvas  = null;
    this._ctx     = null;
    this._inputEl = null;
    this._lastWords = [];

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
    document.getElementById('tr-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('tr-styles')) return;
    const s = document.createElement('style');
    s.id = 'tr-styles';
    s.textContent = `
      .tr-wrapper {
        position:absolute; inset:0; display:flex; flex-direction:column;
        background:#050810; font-family:Orbitron,monospace; color:#fff; overflow:hidden;
      }
      .tr-canvas-area { flex:1; position:relative; overflow:hidden; }
      .tr-canvas { position:absolute; inset:0; width:100%; height:100%; }
      .tr-input-row {
        flex:0 0 auto; display:flex; align-items:center; gap:10px;
        padding:10px 16px; background:rgba(0,0,0,0.5);
        border-top:1px solid rgba(0,255,225,0.12);
      }
      .tr-input {
        flex:1; background:rgba(0,255,225,0.06); border:2px solid rgba(0,255,225,0.25);
        color:#fff; font-family:Orbitron,monospace; font-size:16px; font-weight:bold;
        padding:8px 12px; border-radius:6px; outline:none; letter-spacing:.08em;
        text-transform:lowercase;
      }
      .tr-input:focus { border-color:rgba(0,255,225,0.6); }
      .tr-combo {
        font-size:10px; color:rgba(255,255,255,0.3); letter-spacing:.1em; white-space:nowrap;
      }
      .tr-combo.active { color:#ffe030; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'tr-wrapper';

    const area = document.createElement('div');
    area.className = 'tr-canvas-area';

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'tr-canvas';
    this._ctx = this._canvas.getContext('2d');
    area.appendChild(this._canvas);

    const inputRow = document.createElement('div');
    inputRow.className = 'tr-input-row';

    this._inputEl = document.createElement('input');
    this._inputEl.className = 'tr-input';
    this._inputEl.type = 'text';
    this._inputEl.placeholder = 'Tapez le mot...';
    this._inputEl.autocomplete = 'off';
    this._inputEl.spellcheck = false;

    this._comboEl = document.createElement('div');
    this._comboEl.className = 'tr-combo';
    this._comboEl.textContent = 'COMBO ×0';

    inputRow.appendChild(this._inputEl);
    inputRow.appendChild(this._comboEl);

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this._wrapper.appendChild(area);
    this._wrapper.appendChild(inputRow);
    this.viewport.appendChild(this._wrapper);
  }

  _showStartScreen() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this.game.start(sel); this._inputEl.focus(); },
    );
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    this._inputEl.addEventListener('keydown', this._onKeyDown);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    this._inputEl.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    const { state } = this.game;
    if (e.code === 'Escape') { e.preventDefault(); EventBus.emit('game:pause-toggle'); return; }
    if (state.status !== 'playing') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      this.game.type('Enter');
      this._inputEl.value = '';
      return;
    }
    if (e.key === 'Backspace') { this.game.type('Backspace'); return; }
    // Sync typed value after keydown settles
    requestAnimationFrame(() => {
      const val = this._inputEl.value;
      // Replace game typed state with actual input value
      this.game.state.typed = val;
      // Try to match
      if (val.length > 0) {
        const idx = this.game.state.words.findIndex(w => w.text.toLowerCase() === val.toLowerCase());
        if (idx !== -1) {
          this.game.type('Enter');
          this._inputEl.value = '';
        }
      }
    });
    this.game.type(e.key);
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    this._comboEl.textContent = `COMBO ×${state.combo}`;
    this._comboEl.className = 'tr-combo' + (state.combo > 0 ? ' active' : '');
    this._draw(state);
  }

  _draw(state) {
    const cv  = this._canvas;
    const ctx = this._ctx;
    const W   = cv.offsetWidth;
    const H   = cv.offsetHeight;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }

    ctx.clearRect(0, 0, W, H);

    // Lane dividers
    const lanes = this.config.gameplay.laneCount;
    const laneW = W / lanes;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 1; i < lanes; i++) {
      ctx.beginPath(); ctx.moveTo(i * laneW, 0); ctx.lineTo(i * laneW, H); ctx.stroke();
    }

    // Danger zone
    ctx.fillStyle = 'rgba(255,40,40,0.06)';
    ctx.fillRect(0, H - 60, W, 60);
    ctx.strokeStyle = 'rgba(255,40,40,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H - 60); ctx.lineTo(W, H - 60); ctx.stroke();

    const typed = (state.typed ?? '').toLowerCase();

    for (const word of state.words) {
      const x = (word.lane + 0.5) * laneW;
      const y = (word.y / 100) * H;

      const color = COLORS[word.id % COLORS.length];
      const isMatch = word.text.toLowerCase().startsWith(typed) && typed.length > 0;

      // Background pill
      ctx.font = 'bold 16px Orbitron, monospace';
      const tw = ctx.measureText(word.text).width;
      const pw = tw + 24, ph = 32;
      const px = x - pw / 2, py = y - ph / 2;

      ctx.fillStyle = isMatch ? 'rgba(0,255,136,0.18)' : 'rgba(10,20,50,0.85)';
      ctx.strokeStyle = isMatch ? 'rgba(0,255,136,0.7)' : color + '55';
      ctx.lineWidth = isMatch ? 2 : 1;
      this._roundRect(ctx, px, py, pw, ph, 6);
      ctx.fill(); ctx.stroke();

      // Text with typed portion highlighted
      const typedLen = isMatch ? typed.length : 0;
      if (typedLen > 0) {
        const before = word.text.slice(0, typedLen);
        const after  = word.text.slice(typedLen);
        const bw = ctx.measureText(before).width;
        ctx.fillStyle = '#00ff88';
        ctx.fillText(before, x - tw / 2, y + 6);
        ctx.fillStyle = '#fff';
        ctx.fillText(after, x - tw / 2 + bw, y + 6);
      } else {
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(word.text, x, y + 6);
        ctx.textAlign = 'left';
      }
    }
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  _onOver(data) {
    this._overlay.showGameOver(
      { result: 'lose', icon: data.icon, title: data.title, score: data.score, isRecord: data.score >= (data.best ?? 0) },
      () => { this._showStartScreen(); this._inputEl.value = ''; },
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); this._inputEl.focus(); }
  _onRestart() { this._showStartScreen(); this._inputEl.value = ''; }
}
