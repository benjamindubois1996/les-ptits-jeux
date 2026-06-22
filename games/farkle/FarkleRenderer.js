import EventBus   from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const FACES = ['','⚀','⚁','⚂','⚃','⚄','⚅'];

export default class FarkleRenderer {
  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;
    this._wrapper = null;
    this._overlay = null;

    this._onTick    = this._onTick.bind(this);
    this._onWon     = this._onWon.bind(this);
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
    document.getElementById('fk-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('fk-styles')) return;
    const s = document.createElement('style');
    s.id = 'fk-styles';
    s.textContent = `
      .fk-wrapper {
        position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
        background:#050810; font-family:Orbitron,monospace; color:#fff; overflow:hidden; gap:12px; padding:12px;
      }
      .fk-scores {
        display:flex; gap:24px; font-size:11px; color:rgba(255,255,255,0.4); letter-spacing:.1em;
      }
      .fk-scores span { color:#fff; font-size:14px; font-weight:bold; }
      .fk-info { font-size:10px; color:rgba(255,255,255,0.3); letter-spacing:.08em; min-height:16px; }
      .fk-info.highlight { color:#ffe030; }
      .fk-dice-row { display:flex; gap:12px; }
      .fk-die {
        width:72px; height:72px; border-radius:12px; display:flex; align-items:center; justify-content:center;
        font-size:40px; cursor:pointer; transition:transform .1s,border-color .15s,background .15s;
        background:#0d1428; border:2px solid rgba(255,255,255,0.15); user-select:none;
      }
      .fk-die:hover { border-color:rgba(0,255,225,0.4); }
      .fk-die.kept {
        background:rgba(0,255,136,0.12); border-color:#00ff88;
        box-shadow:0 0 12px rgba(0,255,136,0.3); transform:translateY(-6px);
      }
      .fk-die.scored { opacity:.3; cursor:default; border-color:rgba(255,255,255,0.05); }
      .fk-die.rolling { animation:fk-roll .25s ease; }
      @keyframes fk-roll { 0%,100%{transform:rotate(0)} 50%{transform:rotate(20deg) scale(1.1)} }
      .fk-actions { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
      .fk-btn {
        background:transparent; border:2px solid rgba(0,255,225,0.3); color:#fff;
        font-family:Orbitron,monospace; font-size:11px; letter-spacing:.08em;
        padding:10px 18px; border-radius:8px; cursor:pointer; transition:background .15s,border-color .15s;
      }
      .fk-btn:hover { background:rgba(0,255,225,0.1); border-color:#00ffe1; }
      .fk-btn:disabled { opacity:.3; cursor:default; }
      .fk-btn.primary { border-color:#7b61ff; color:#a890ff; }
      .fk-btn.primary:hover { background:rgba(123,97,255,0.15); border-color:#a890ff; }
      .fk-turn-score { font-size:22px; color:#00ffe1; font-weight:bold; letter-spacing:.05em; }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'fk-wrapper';

    // Scores
    this._scoresEl = document.createElement('div');
    this._scoresEl.className = 'fk-scores';
    this._scoresEl.innerHTML = `
      ROUND <span id="fk-round">1/10</span>
      &nbsp;&nbsp; TOTAL <span id="fk-total">0</span>
      &nbsp;&nbsp; LANCERS <span id="fk-rolls">3</span>
    `;

    // Turn score
    const turnDiv = document.createElement('div');
    turnDiv.innerHTML = `<div class="fk-turn-score">Tour : <span id="fk-turn">0</span> pts</div>`;

    // Info
    this._infoEl = document.createElement('div');
    this._infoEl.className = 'fk-info';

    // Dice
    this._diceRow = document.createElement('div');
    this._diceRow.className = 'fk-dice-row';
    this._diceDivs = [];
    for (let i = 0; i < 6; i++) {
      const d = document.createElement('div');
      d.className = 'fk-die';
      d.textContent = FACES[1];
      d.addEventListener('click', () => this.game.toggleKeep(i));
      this._diceDivs.push(d);
      this._diceRow.appendChild(d);
    }

    // Actions
    const actions = document.createElement('div');
    actions.className = 'fk-actions';

    this._rollBtn = document.createElement('button');
    this._rollBtn.className = 'fk-btn primary';
    this._rollBtn.textContent = 'LANCER';
    this._rollBtn.addEventListener('click', () => this.game.roll());

    this._bankBtn = document.createElement('button');
    this._bankBtn.className = 'fk-btn';
    this._bankBtn.textContent = 'SCORER SÉLECTION';
    this._bankBtn.addEventListener('click', () => this.game.bank());

    this._endBtn = document.createElement('button');
    this._endBtn.className = 'fk-btn';
    this._endBtn.textContent = 'PASSER TOUR';
    this._endBtn.addEventListener('click', () => this.game.endTurn());

    actions.appendChild(this._rollBtn);
    actions.appendChild(this._bankBtn);
    actions.appendChild(this._endBtn);

    this._overlay = new GameOverlay(this._wrapper);
    this._showStartScreen();

    this._wrapper.appendChild(this._scoresEl);
    this._wrapper.appendChild(turnDiv);
    this._wrapper.appendChild(this._infoEl);
    this._wrapper.appendChild(this._diceRow);
    this._wrapper.appendChild(actions);
    this.viewport.appendChild(this._wrapper);
  }

  _showStartScreen() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique', options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this.game.start(sel); },
    );
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    const k = this.config.controls?.keyboard ?? {};
    if ((k.pause   ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if ((k.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.game.roll(); }
  }

  _onTick({ state, action }) {
    if (state.status === 'idle') { this._overlay.show(); return; }

    document.getElementById('fk-round') && (document.getElementById('fk-round').textContent = `${state.round}/${this.config.gameplay.maxRounds}`);
    document.getElementById('fk-total') && (document.getElementById('fk-total').textContent = state.totalScore);
    document.getElementById('fk-rolls') && (document.getElementById('fk-rolls').textContent = state.rollsLeft);
    document.getElementById('fk-turn')  && (document.getElementById('fk-turn').textContent  = state.turnScore);

    this._infoEl.textContent = state.lastScoreInfo;
    this._infoEl.className = 'fk-info' + (state.lastScoreInfo.includes('FARKLE') ? ' highlight' : '');

    if (action === 'rolled') {
      this._diceDivs.forEach(d => { d.classList.add('rolling'); setTimeout(() => d.classList.remove('rolling'), 280); });
    }

    this._diceDivs.forEach((d, i) => {
      const die = state.dice[i];
      d.textContent = FACES[die.value];
      d.className   = 'fk-die' + (die.kept ? ' kept' : '') + (die.scored ? ' scored' : '');
    });

    this._rollBtn.disabled = state.phase !== 'roll' || state.rollsLeft <= 0;
    this._bankBtn.disabled = state.phase !== 'keep';
    this._endBtn.textContent = state.phase === 'farkle' ? 'FARKLE — SUIVANT' : 'PASSER TOUR';
  }

  _onWon(data) {
    this._overlay.showGameOver(
      { result: 'win', icon: data.icon, title: data.title, score: data.score,
        isRecord: data.score >= (data.best ?? 0), extraInfo: data.extraInfo ?? '' },
      () => this._showStartScreen(),
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); }
  _onRestart() { this._showStartScreen(); }
}
