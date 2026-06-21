import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';
import { CATEGORIES } from './Yahtzee.js';

/* Dot positions (0-8) for each die value */
const DOT_MAP = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const CAT_LABELS = {
  ones:          { label: 'As (1)', section: 'upper' },
  twos:          { label: 'Deux (2)', section: 'upper' },
  threes:        { label: 'Trois (3)', section: 'upper' },
  fours:         { label: 'Quatre (4)', section: 'upper' },
  fives:         { label: 'Cinq (5)', section: 'upper' },
  sixes:         { label: 'Six (6)', section: 'upper' },
  threeOfKind:   { label: 'Brelan', section: 'lower' },
  fourOfKind:    { label: 'Carré', section: 'lower' },
  fullHouse:     { label: 'Full (25)', section: 'lower' },
  smallStraight: { label: 'Petite Suite (30)', section: 'lower' },
  largeStraight: { label: 'Grande Suite (40)', section: 'lower' },
  yahtzee:       { label: 'Yahtzee (50)', section: 'lower' },
  chance:        { label: 'Chance', section: 'lower' },
};

export default class YahtzeeRenderer {

  constructor(game, viewport, config) {
    this.game     = game;
    this.viewport = viewport;
    this.config   = config;

    this._wrapper = null;
    this._overlay = null;
    this._sel     = { mode: 'basique' };

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
    document.getElementById('ytz-styles')?.remove();
  }

  _injectStyles() {
    if (document.getElementById('ytz-styles')) return;
    const el = document.createElement('style');
    el.id = 'ytz-styles';
    el.textContent = `
      .ytz-wrapper {
        position:absolute; inset:0;
        display:flex; flex-direction:column;
        background:#050810; font-family:Orbitron,monospace;
        overflow:hidden; color:#fff;
      }
      .ytz-top {
        flex:0 0 auto; padding:10px 12px 6px;
        display:flex; flex-direction:column; align-items:center; gap:10px;
        border-bottom:1px solid rgba(0,255,225,0.12);
      }
      .ytz-dice-row {
        display:flex; gap:10px; align-items:center;
      }
      .ytz-die {
        width:56px; height:56px; border-radius:8px;
        background:#0a1020; border:2px solid rgba(0,255,225,0.3);
        display:grid; grid-template-columns:repeat(3,1fr);
        grid-template-rows:repeat(3,1fr);
        padding:6px; gap:4px; cursor:pointer; transition:border-color 0.15s,transform 0.1s;
        box-sizing:border-box;
      }
      .ytz-die:hover:not(.ytz-die--zero) { border-color:rgba(0,255,225,0.7); transform:scale(1.06); }
      .ytz-die--held { border-color:#ff9900 !important; background:rgba(255,153,0,0.08); }
      .ytz-die--zero { opacity:0.3; cursor:default; }
      .ytz-dot {
        border-radius:50%; background:#00ffe1;
        transition:background 0.1s;
        visibility:hidden;
      }
      .ytz-die--held .ytz-dot { background:#ff9900; }
      .ytz-dot--on { visibility:visible; }

      .ytz-hold-label {
        font-size:9px; letter-spacing:0.1em; color:rgba(255,255,255,0.35);
        text-align:center; height:12px;
        transition:color 0.1s;
      }
      .ytz-hold-label--held { color:#ff9900; }

      .ytz-controls {
        display:flex; align-items:center; gap:12px;
      }
      .ytz-roll-btn {
        background:linear-gradient(135deg,#00ffe1,#00b8a0);
        color:#000; border:none; border-radius:6px;
        padding:8px 24px; font-family:Orbitron,monospace;
        font-size:13px; font-weight:bold; letter-spacing:0.1em;
        cursor:pointer; transition:opacity 0.15s, transform 0.1s;
      }
      .ytz-roll-btn:hover:not(:disabled) { opacity:0.88; transform:scale(1.03); }
      .ytz-roll-btn:disabled { opacity:0.35; cursor:default; }
      .ytz-rolls-left { font-size:11px; color:rgba(255,255,255,0.45); letter-spacing:0.1em; }

      .ytz-bottom { flex:1 1 0; overflow-y:auto; padding:8px 10px 10px; }
      .ytz-section-title {
        font-size:10px; letter-spacing:0.15em; color:rgba(0,255,225,0.6);
        padding:6px 0 4px; border-bottom:1px solid rgba(0,255,225,0.1); margin-bottom:4px;
      }
      .ytz-cat-row {
        display:flex; align-items:center; justify-content:space-between;
        padding:4px 6px; border-radius:4px; cursor:pointer;
        transition:background 0.1s; font-size:11px; gap:8px;
        min-height:28px;
      }
      .ytz-cat-row--available { cursor:pointer; }
      .ytz-cat-row--available:hover { background:rgba(0,255,225,0.07); }
      .ytz-cat-row--scored { opacity:0.55; cursor:default; }
      .ytz-cat-label { color:rgba(255,255,255,0.7); flex:1; }
      .ytz-cat-score {
        font-size:13px; font-weight:bold; color:#fff;
        min-width:34px; text-align:right;
      }
      .ytz-cat-potential {
        font-size:11px; color:rgba(0,255,225,0.55); min-width:34px; text-align:right;
      }
      .ytz-bonus-row {
        font-size:11px; padding:4px 6px;
        color:rgba(255,255,255,0.45); display:flex; justify-content:space-between;
      }
      .ytz-total-row {
        font-size:14px; font-weight:bold; padding:8px 6px 4px;
        border-top:1px solid rgba(0,255,225,0.2); margin-top:6px;
        display:flex; justify-content:space-between; color:#00ffe1;
      }
      .ytz-turn-info { font-size:10px; color:rgba(255,255,255,0.35); letter-spacing:0.1em; }
    `;
    document.head.appendChild(el);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'ytz-wrapper';

    /* Top zone */
    const top = document.createElement('div');
    top.className = 'ytz-top';

    /* Dice row */
    const diceRow = document.createElement('div');
    diceRow.className = 'ytz-dice-row';
    this._diceEls = [];
    this._holdLabels = [];

    for (let i = 0; i < 5; i++) {
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '3px';

      const die = document.createElement('div');
      die.className = 'ytz-die ytz-die--zero';
      /* 9 dot cells */
      for (let d = 0; d < 9; d++) {
        const dot = document.createElement('div');
        dot.className = 'ytz-dot';
        die.appendChild(dot);
      }
      die.addEventListener('click', () => this.game.toggleHold(i));
      this._diceEls.push(die);

      const holdLbl = document.createElement('div');
      holdLbl.className = 'ytz-hold-label';
      holdLbl.textContent = 'GARDER';
      this._holdLabels.push(holdLbl);

      wrap.appendChild(die);
      wrap.appendChild(holdLbl);
      diceRow.appendChild(wrap);
    }

    /* Controls */
    const ctrl = document.createElement('div');
    ctrl.className = 'ytz-controls';

    this._rollBtn = document.createElement('button');
    this._rollBtn.className = 'ytz-roll-btn';
    this._rollBtn.textContent = 'LANCER';
    this._rollBtn.addEventListener('click', () => this.game.roll());

    this._rollsLeftEl = document.createElement('div');
    this._rollsLeftEl.className = 'ytz-rolls-left';

    this._turnEl = document.createElement('div');
    this._turnEl.className = 'ytz-turn-info';

    ctrl.appendChild(this._rollBtn);
    ctrl.appendChild(this._rollsLeftEl);

    top.appendChild(diceRow);
    top.appendChild(ctrl);
    top.appendChild(this._turnEl);

    /* Bottom — scorecard */
    const bottom = document.createElement('div');
    bottom.className = 'ytz-bottom';
    this._scorecardEl = bottom;

    this._wrapper.appendChild(top);
    this._wrapper.appendChild(bottom);

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
    );
  }

  _showEndScreen(data) {
    const best = data.best ?? 0;
    this._overlay.showGameOver(
      {
        result:    'win',
        icon:      '🎲',
        title:     'PARTIE TERMINÉE',
        score:     data.score,
        isRecord:  data.score > 0 && data.score >= best,
        extraInfo: `<div class="overlay-score">Meilleur : ${best}</div>`,
      },
      () => this._showStartScreen(),
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
    const keys = this.config.controls?.keyboard ?? {};
    if ((keys.roll ?? []).includes(e.code)) { e.preventDefault(); this.game.roll(); return; }
    if ((keys.pause ?? []).includes(e.code))   { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    if ((keys.restart ?? []).includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
  }

  _onTick({ state }) {
    if (state.status === 'idle') { this._overlay.show(); return; }
    this._renderDice(state);
    this._renderControls(state);
    this._renderScorecard(state);
  }

  _onWon(data)  { this._showEndScreen(data); }
  _onPaused()   { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed()  { this._overlay.hide(); }
  _onRestart()  { this._showStartScreen(); }

  _renderDice(state) {
    const { dice, held, phase } = state;
    const rolled = phase !== 'start-of-turn';

    this._diceEls.forEach((die, i) => {
      const val = dice[i];
      const isZero = val === 0 || !rolled;

      die.className = 'ytz-die' + (held[i] ? ' ytz-die--held' : '') + (isZero ? ' ytz-die--zero' : '');

      /* Update dots */
      const dots = die.querySelectorAll('.ytz-dot');
      const on   = isZero ? [] : (DOT_MAP[val] ?? []);
      dots.forEach((dot, d) => {
        dot.classList.toggle('ytz-dot--on', on.includes(d));
      });

      this._holdLabels[i].className = 'ytz-hold-label' + (held[i] ? ' ytz-hold-label--held' : '');
      this._holdLabels[i].textContent = held[i] ? 'GARDÉ' : 'GARDER';
    });
  }

  _renderControls(state) {
    const cfg = this.config.gameplay;
    const canRoll = state.rollsLeft > 0 && state.phase !== 'start-of-turn'
      ? true
      : state.phase === 'start-of-turn';

    this._rollBtn.disabled = state.rollsLeft <= 0;
    this._rollBtn.textContent = state.phase === 'start-of-turn' ? 'LANCER ▶' : 'RELANCER';

    this._rollsLeftEl.textContent = `Lancers restants : ${state.rollsLeft}`;
    this._turnEl.textContent      = `Tour ${state.totalTurns + 1} / ${cfg.numTurns}`;
  }

  _renderScorecard(state) {
    const el  = this._scorecardEl;
    const cfg = this.config;
    const sc  = state.scorecard;
    const bthr = cfg.gameplay.bonusThreshold;
    const bval = cfg.gameplay.bonusValue;

    const canScore = state.phase !== 'start-of-turn';

    let html = `<div class="ytz-section-title">SECTION HAUTE</div>`;

    const upper = ['ones','twos','threes','fours','fives','sixes'];
    let upperTotal = 0;
    for (const k of upper) {
      const scored   = sc[k] !== null;
      const potential = canScore && !scored ? this.game.calculateScore(k, state.dice) : null;
      if (scored) upperTotal += sc[k];
      html += this._catRow(k, sc[k], potential, canScore && !scored);
    }

    const bonusProgress = `${upperTotal}/${bthr}`;
    const bonusAchieved = upperTotal >= bthr;
    html += `
      <div class="ytz-bonus-row">
        <span>Bonus supérieur (+${bval} si ≥ ${bthr})</span>
        <span style="color:${bonusAchieved ? '#00ffe1' : 'rgba(255,255,255,0.35)'}">
          ${bonusAchieved ? `+${bval}` : bonusProgress}
        </span>
      </div>
    `;

    html += `<div class="ytz-section-title" style="margin-top:6px">SECTION BASSE</div>`;
    const lower = ['threeOfKind','fourOfKind','fullHouse','smallStraight','largeStraight','yahtzee','chance'];
    for (const k of lower) {
      const scored    = sc[k] !== null;
      const potential = canScore && !scored ? this.game.calculateScore(k, state.dice) : null;
      html += this._catRow(k, sc[k], potential, canScore && !scored);
    }

    /* Total */
    const total = state.score;
    html += `
      <div class="ytz-total-row">
        <span>TOTAL</span>
        <span>${total}</span>
      </div>
    `;

    el.innerHTML = html;

    /* Bind score clicks */
    el.querySelectorAll('.ytz-cat-row--available').forEach(row => {
      row.addEventListener('click', () => this.game.score(row.dataset.cat));
    });
  }

  _catRow(key, scored, potential, clickable) {
    const lbl = CAT_LABELS[key]?.label ?? key;
    const scoreDisplay = scored !== null
      ? `<span class="ytz-cat-score">${scored}</span>`
      : potential !== null
        ? `<span class="ytz-cat-potential">${potential}</span>`
        : `<span class="ytz-cat-score" style="color:rgba(255,255,255,0.15)">—</span>`;

    return `
      <div class="ytz-cat-row ${clickable ? 'ytz-cat-row--available' : 'ytz-cat-row--scored'}"
           data-cat="${key}" title="${clickable ? 'Cliquer pour scorer' : ''}">
        <span class="ytz-cat-label">${lbl}</span>
        ${scoreDisplay}
      </div>
    `;
  }
}
