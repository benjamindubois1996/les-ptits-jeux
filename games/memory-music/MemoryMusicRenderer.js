import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const NOTES = [
  { id: 0, name: 'Do',  freq: 261.63, color: '#ff4d6d' },
  { id: 1, name: 'Ré',  freq: 293.66, color: '#ff9d4d' },
  { id: 2, name: 'Mi',  freq: 329.63, color: '#ffe14d' },
  { id: 3, name: 'Fa',  freq: 349.23, color: '#4dff88' },
  { id: 4, name: 'Sol', freq: 392.00, color: '#4dc8ff' },
  { id: 5, name: 'La',  freq: 440.00, color: '#b34dff' },
];

export default class MemoryMusicRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._wrapper  = null;
    this._overlay  = null;
    this._els      = {};
    this._pads     = [];
    this._audioCtx = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
  }

  init() {
    this._injectStyles();
    this._buildLayout();
    this._overlay = new GameOverlay(this._wrapper);
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
    if (document.getElementById('mm-styles')) return;
    const s = document.createElement('style');
    s.id = 'mm-styles';
    s.textContent = `
      .mm-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 12px; box-sizing: border-box; gap: 14px;
        font-family: Orbitron, monospace;
        background: #05080f; overflow: hidden; color: #ccc;
      }
      .mm-info { display: flex; gap: 18px; font-size: 11px; color: rgba(255,255,255,0.5); }
      .mm-info strong { color: #ffd700; }
      .mm-message {
        font-size: 13px; font-weight: bold; min-height: 18px;
        letter-spacing: 0.05em; text-align: center; color: #9d7bff;
      }
      .mm-pads {
        display: grid; grid-template-columns: repeat(3, 1fr);
        gap: 10px; width: 100%; max-width: 320px;
      }
      .mm-pad {
        aspect-ratio: 1; border-radius: 14px; border: none; cursor: pointer;
        font-family: Orbitron, monospace; font-size: 13px; font-weight: bold;
        color: rgba(0,0,0,0.55); opacity: 0.55; transition: opacity 0.1s, transform 0.1s;
        display: flex; align-items: center; justify-content: center;
      }
      .mm-pad.lit  { opacity: 1; transform: scale(1.05); box-shadow: 0 0 24px currentColor; }
      .mm-pad.wrong { animation: mm-shake 0.3s; }
      @keyframes mm-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
      .mm-lives { display: flex; gap: 4px; }
      .mm-life { font-size: 16px; opacity: 0.25; }
      .mm-life.on { opacity: 1; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'mm-wrapper';
    this._wrapper.innerHTML = `
      <div class="mm-info">
        <span>Manche <strong id="mm-round">0</strong></span>
        <span>Score : <strong id="mm-score">0</strong></span>
        <div class="mm-lives" id="mm-lives"></div>
      </div>
      <div class="mm-message" id="mm-message"></div>
      <div class="mm-pads" id="mm-pads"></div>
    `;
    this._viewport.appendChild(this._wrapper);

    this._els = {
      round:   this._wrapper.querySelector('#mm-round'),
      score:   this._wrapper.querySelector('#mm-score'),
      lives:   this._wrapper.querySelector('#mm-lives'),
      message: this._wrapper.querySelector('#mm-message'),
      pads:    this._wrapper.querySelector('#mm-pads'),
    };

    NOTES.forEach(n => {
      const btn = document.createElement('button');
      btn.className = 'mm-pad';
      btn.style.background = n.color;
      btn.textContent = n.name;
      btn.dataset.note = n.id;
      this._els.pads.appendChild(btn);
      this._pads.push(btn);
    });
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    this._els.pads.addEventListener('click', e => {
      const btn = e.target.closest('.mm-pad');
      if (btn) this._game.press(Number(btn.dataset.note));
    });
  }

  _playTone(freq) {
    try {
      if (!this._audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this._audioCtx = new AC();
      }
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.38);
    } catch {
      /* audio non disponible — le jeu reste jouable visuellement */
    }
  }

  _onTick(e) {
    if (e.action === 'restart') { this._showStart(); return; }
    if (e.action === 'play')    { this._overlay.hide(); }

    const s = e.state;
    if (!s) return;

    this._els.round.textContent = s.round;
    this._els.score.textContent = s.score;
    this._renderLives(s.lives);

    if (e.action === 'flash-on') {
      const note = NOTES[e.note];
      this._pads[e.note].classList.add('lit');
      this._playTone(note.freq);
    }
    if (e.action === 'flash-off') {
      this._pads.forEach(p => p.classList.remove('lit'));
    }
    if (e.action === 'press' && e.correct) {
      const note = NOTES[e.note];
      this._playTone(note.freq);
      const pad = this._pads[e.note];
      pad.classList.add('lit');
      setTimeout(() => pad.classList.remove('lit'), 180);
    }
    if (e.action === 'press' && !e.correct) {
      this._pads[e.note].classList.add('wrong');
      setTimeout(() => this._pads[e.note]?.classList.remove('wrong'), 300);
    }

    const messages = {
      showing:        'Écoute bien…',
      'round-start':   'Écoute bien…',
      waiting:         'À toi de jouer !',
      mistake:         'Oups ! Une vie en moins…',
      'round-complete': 'Bien joué !',
      gameover:        '',
    };
    this._els.message.textContent = messages[s.phase] ?? '';
  }

  _renderLives(count) {
    const total = Math.max(count, 3);
    this._els.lives.innerHTML = Array.from({ length: total }, (_, i) =>
      `<span class="mm-life ${i < count ? 'on' : ''}">❤</span>`
    ).join('');
  }

  _onOver(e) {
    this._overlay.showGameOver(
      { result: 'lose', icon: '🎵', title: 'GAME OVER', score: e.score, isRecord: e.isRecord,
        extraInfo: `<div class="overlay-score">Manche atteinte : ${e.round}</div><div class="overlay-score">Record : ${e.best}</div>` },
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
    if (this._audioCtx) { try { this._audioCtx.close(); } catch { /* noop */ } }
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById('mm-styles')?.remove();
  }
}
