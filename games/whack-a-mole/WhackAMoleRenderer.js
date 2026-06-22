import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

export default class WhackAMoleRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper    = null;
    this._overlay    = null;
    this._holeDivs   = [];
    this._moleDivs   = [];
    this._timerFill  = null;

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
    document.getElementById('wam-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('wam-styles')) return;
    const s = document.createElement('style');
    s.id = 'wam-styles';
    s.textContent = `
      .wam-wrapper {
        position:absolute; inset:0;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        background:#050810; font-family:Orbitron,monospace; overflow:hidden; color:#fff;
      }
      .wam-info {
        width:80%; max-width:360px; display:flex; justify-content:space-between;
        font-size:11px; color:rgba(255,255,255,0.5); margin-bottom:8px; letter-spacing:.08em;
      }
      .wam-timer-bar {
        width:80%; max-width:360px; height:7px;
        background:rgba(255,255,255,0.1); border-radius:4px; margin-bottom:14px; overflow:hidden;
      }
      .wam-timer-fill {
        height:100%; border-radius:4px; width:100%;
        background:linear-gradient(90deg,#00ffe1,#7b61ff); transition:width 0.9s linear, background 0.5s;
      }
      .wam-hint {
        font-size:9px; color:rgba(255,255,255,0.25); letter-spacing:.08em; margin-bottom:12px;
      }
      .wam-grid {
        display:grid; gap:14px; padding:8px;
      }
      .wam-hole {
        width:92px; height:92px; border-radius:50%;
        background:radial-gradient(circle at 50% 65%,#1a0e00,#070308);
        border:3px solid #231506; position:relative; overflow:hidden;
        cursor:pointer; box-shadow:0 6px 18px rgba(0,0,0,0.6),inset 0 3px 8px rgba(0,0,0,0.9);
        transition:transform .1s;
      }
      .wam-hole:hover { border-color:#3a2010; }
      .wam-hole:active { transform:scale(.9); }
      .wam-mole {
        font-size:50px; position:absolute; left:50%; bottom:-64px;
        transform:translateX(-50%); transition:bottom .14s ease-out; pointer-events:none; user-select:none;
      }
      .wam-hole.up .wam-mole  { bottom:2px; }
      .wam-hole.fake { border-color:#3a0505; }
      .wam-hole.fake:hover { border-color:#7a1010; }
      /* Hit flash */
      .wam-hit  { animation:wam-hit-anim  .25s ease; }
      @keyframes wam-hit-anim  { 0%{background:radial-gradient(circle at 50% 65%,rgba(0,255,200,.4),#070308)} 100%{background:radial-gradient(circle at 50% 65%,#1a0e00,#070308)} }
      /* Fake hit flash (red) */
      .wam-fake-hit { animation:wam-fake-anim .3s ease; }
      @keyframes wam-fake-anim { 0%{background:radial-gradient(circle at 50% 65%,rgba(255,40,40,.5),#070308)} 100%{background:radial-gradient(circle at 50% 65%,#1a0e00,#070308)} }
      /* Miss (clicked empty) */
      .wam-miss { animation:wam-miss-anim .25s ease; }
      @keyframes wam-miss-anim { 0%{border-color:#ff4040} 100%{border-color:#231506} }
      /* Score feedback */
      .wam-score-pop {
        position:absolute; left:50%; top:30%; transform:translateX(-50%) translateY(0);
        font-size:14px; font-weight:bold; pointer-events:none; user-select:none;
        animation:wam-score-float .7s ease forwards;
        font-family:Orbitron,monospace; text-shadow:0 0 8px currentColor;
      }
      @keyframes wam-score-float { 0%{opacity:1;transform:translateX(-50%) translateY(0)} 100%{opacity:0;transform:translateX(-50%) translateY(-30px)} }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'wam-wrapper';

    const info = document.createElement('div');
    info.className = 'wam-info';
    this._timeLabel = document.createElement('span');
    this._timeLabel.textContent = 'TEMPS : 60s';
    info.appendChild(this._timeLabel);

    const bar  = document.createElement('div'); bar.className = 'wam-timer-bar';
    this._timerFill = document.createElement('div'); this._timerFill.className = 'wam-timer-fill';
    bar.appendChild(this._timerFill);

    const hint = document.createElement('div');
    hint.className = 'wam-hint';
    hint.innerHTML = '🦔 Frappe les taupes · 💣 Évite les bombes (−5 pts)';

    const size  = this.config.gameplay.gridSize;
    const grid  = document.createElement('div');
    grid.className = 'wam-grid';
    grid.style.gridTemplateColumns = `repeat(${size},92px)`;

    for (let i = 0; i < size * size; i++) {
      const hole = document.createElement('div');
      hole.className = 'wam-hole';

      const moleEl = document.createElement('div');
      moleEl.className = 'wam-mole';
      moleEl.textContent = '🦔';
      hole.appendChild(moleEl);
      this._moleDivs.push(moleEl);

      const idx = i;
      hole.addEventListener('click', () => {
        const cellState = this.game.state.cells[idx];
        if (cellState === 'mole') {
          hole.classList.add('wam-hit');
          setTimeout(() => hole.classList.remove('wam-hit'), 250);
          this._showScorePop(hole, `+${this.config.scoring.hit}`, '#00ff88');
        } else if (cellState === 'fake') {
          hole.classList.add('wam-fake-hit');
          setTimeout(() => hole.classList.remove('wam-fake-hit'), 300);
          this._showScorePop(hole, `${this.config.scoring.fakePenalty}`, '#ff4040');
        } else {
          hole.classList.add('wam-miss');
          setTimeout(() => hole.classList.remove('wam-miss'), 250);
        }
        this.game.whack(idx);
      });

      this._holeDivs.push(hole);
      grid.appendChild(hole);
    }

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this._wrapper.appendChild(info);
    this._wrapper.appendChild(bar);
    this._wrapper.appendChild(hint);
    this._wrapper.appendChild(grid);
    this.viewport.appendChild(this._wrapper);
  }

  _showScorePop(hole, text, color) {
    const pop = document.createElement('div');
    pop.className = 'wam-score-pop';
    pop.textContent = text;
    pop.style.color = color;
    hole.appendChild(pop);
    setTimeout(() => pop.remove(), 700);
  }

  _showStartScreen() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this.game.start(sel); },
    );
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    const k = this.config.controls?.keyboard ?? {};
    if ((k.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if ((k.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }

    state.cells.forEach((val, i) => {
      const hole   = this._holeDivs[i];
      const moleEl = this._moleDivs[i];
      const isUp   = val === 'mole' || val === 'fake';
      hole.classList.toggle('up',   isUp);
      hole.classList.toggle('fake', val === 'fake');
      if (val === 'mole') moleEl.textContent = '🦔';
      if (val === 'fake') moleEl.textContent = '💣';
    });

    const dur = this.config.gameplay.gameDuration;
    const pct = (state.timeLeft / dur) * 100;
    this._timerFill.style.width = pct + '%';
    if (pct < 25)       this._timerFill.style.background = 'linear-gradient(90deg,#ff3030,#ff6020)';
    else if (pct < 50)  this._timerFill.style.background = 'linear-gradient(90deg,#ff8020,#ffe030)';
    else                this._timerFill.style.background = 'linear-gradient(90deg,#00ffe1,#7b61ff)';
    this._timeLabel.textContent = `TEMPS : ${state.timeLeft}s`;
  }

  _onOver(data) {
    this._overlay.showGameOver(
      { result: 'lose', icon: data.icon, title: data.title, score: data.score, isRecord: data.score >= (data.best ?? 0) },
      () => this._showStartScreen(),
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStartScreen(); }
}
