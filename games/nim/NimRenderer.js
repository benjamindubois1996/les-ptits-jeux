import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const ID = 'nim';

export default class NimRenderer {
  constructor(game, viewport, config) {
    this._game    = game;
    this._vp      = viewport;
    this._cfg     = config;
    this._wrapper = null;
    this._overlay = null;
    this._state   = null;
    this._sel     = { pile: -1, count: 0 };

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
    this._overlay = new GameOverlay(this._vp);
    this._showStart();
    this._bindEvents();
  }

  destroy() {
    this._unbindEvents();
    this._overlay?.destroy();
    this._wrapper?.remove();
    document.getElementById(`${ID}-styles`)?.remove();
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = `${ID}-wrapper`;

    this._statusEl = document.createElement('div');
    this._statusEl.className = `${ID}-status`;

    this._pilesEl = document.createElement('div');
    this._pilesEl.className = `${ID}-piles`;

    this._actionEl = document.createElement('div');
    this._actionEl.className = `${ID}-action`;

    this._wrapper.append(this._statusEl, this._pilesEl, this._actionEl);
    this._vp.appendChild(this._wrapper);
  }

  _showStart() {
    this._overlay.showStart(
      [{ key: 'mode', label: 'MODE', default: 'basique',
         options: [{ value: 'basique', label: 'BASIQUE' }] }],
      sel => { this._overlay.hide(); this._game.start(sel); },
      { extraHtml: `<div style="color:rgba(255,255,255,0.5);font-size:10px;text-align:center;line-height:1.9;margin-bottom:4px">
          3 tas d'allumettes : 3, 5, 7<br>
          Clique sur les allumettes pour en prendre<br>
          Celui qui prend la <em>dernière</em> allumette <strong>gagne</strong> !
        </div>` }
    );
  }

  _render(state) {
    this._state = state;
    const isPlayer = state.turn === 'player';
    this._statusEl.textContent = isPlayer ? '🟡 TON TOUR' : "🤖 L'IA réfléchit…";
    this._statusEl.className   = `${ID}-status ${isPlayer ? `${ID}-status--player` : `${ID}-status--ai`}`;

    this._pilesEl.innerHTML = '';
    state.piles.forEach((count, pi) => {
      const row   = document.createElement('div');
      row.className = `${ID}-pile`;

      const lbl = document.createElement('div');
      lbl.className = `${ID}-pile-label`;
      lbl.textContent = `Tas ${pi + 1}`;

      const sticks = document.createElement('div');
      sticks.className = `${ID}-sticks`;

      for (let i = 0; i < count; i++) {
        const btn = document.createElement('button');
        btn.className = `${ID}-stick`;
        const take = i + 1;
        btn.addEventListener('click', () => this._selectTake(pi, take));
        sticks.appendChild(btn);
      }
      if (count === 0) {
        const empty = document.createElement('span');
        empty.className = `${ID}-empty`;
        empty.textContent = '(vide)';
        sticks.appendChild(empty);
      }
      row.append(lbl, sticks);
      this._pilesEl.appendChild(row);
    });
    if (this._sel.pile >= 0) this._applyHighlight();
  }

  _selectTake(pileIdx, count) {
    if (this._state?.turn !== 'player' || this._state?.status !== 'playing') return;
    this._sel = { pile: pileIdx, count };
    this._applyHighlight();

    this._actionEl.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = `${ID}-btn`;
    btn.textContent = `Prendre ${count} allumette${count > 1 ? 's' : ''} du tas ${pileIdx + 1}`;
    btn.addEventListener('click', () => {
      this._game.take(pileIdx, count);
      this._actionEl.innerHTML = '';
      this._sel = { pile: -1, count: 0 };
    });
    this._actionEl.appendChild(btn);
  }

  _applyHighlight() {
    this._pilesEl.querySelectorAll(`.${ID}-stick--sel`).forEach(el => el.classList.remove(`${ID}-stick--sel`));
    const { pile, count } = this._sel;
    if (pile < 0) return;
    const rows = this._pilesEl.querySelectorAll(`.${ID}-pile`);
    if (!rows[pile]) return;
    const sticks = [...rows[pile].querySelectorAll(`.${ID}-stick`)];
    for (let i = sticks.length - count; i < sticks.length; i++) {
      sticks[i]?.classList.add(`${ID}-stick--sel`);
    }
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:won',     this._onWon);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    this._onKey = e => {
      if (e.key === 'p' || e.key === 'P') EventBus.emit('game:pause-toggle');
      if (e.key === 'r' || e.key === 'R') this._game.restart();
    };
    window.addEventListener('keydown', this._onKey);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:won',     this._onWon);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    window.removeEventListener('keydown', this._onKey);
  }

  _onTick({ state, action }) {
    if (action === 'play') { this._actionEl.innerHTML = ''; this._sel = { pile: -1, count: 0 }; }
    if (state.status === 'playing') this._render(state);
  }

  _onOver({ result, icon, title, score, best, extraInfo }) {
    this._overlay.showGameOver(
      { result, icon, title, score, best, isRecord: false, extraInfo },
      () => { this._overlay.hide(); this._game.start({ mode: this._game.state?.mode }); }
    );
  }

  _onWon({ result, icon, title, score, best, isRecord, extraInfo }) {
    this._overlay.showGameOver(
      { result, icon, title, score, best, isRecord, extraInfo },
      () => { this._overlay.hide(); this._game.start({ mode: this._game.state?.mode }); }
    );
  }

  _onPaused()  { this._overlay.showPause(() => EventBus.emit('game:pause-toggle')); }
  _onResumed() { this._overlay.hide(); if (this._state) this._render(this._state); }
  _onRestart() { this._actionEl.innerHTML = ''; this._sel = { pile: -1, count: 0 }; this._showStart(); }

  _injectStyles() {
    if (document.getElementById(`${ID}-styles`)) return;
    const s = document.createElement('style');
    s.id = `${ID}-styles`;
    s.textContent = `
      .${ID}-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        background: #05080f; gap: 18px; padding: 20px; box-sizing: border-box;
        font-family: Orbitron, monospace; overflow: hidden;
      }
      .${ID}-status {
        font-size: 0.78rem; letter-spacing: 1.5px; padding: 6px 18px;
        border-radius: 20px; transition: all 0.3s;
      }
      .${ID}-status--player { color: #ffe033; background: rgba(255,224,51,.1); border: 1px solid rgba(255,224,51,.3); }
      .${ID}-status--ai     { color: #88aaff; background: rgba(136,170,255,.1); border: 1px solid rgba(136,170,255,.3); }
      .${ID}-piles { display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: 440px; }
      .${ID}-pile  { display: flex; flex-direction: column; gap: 5px; }
      .${ID}-pile-label { font-size: 0.66rem; color: #445566; letter-spacing: 2px; text-transform: uppercase; }
      .${ID}-sticks { display: flex; flex-wrap: wrap; gap: 7px; min-height: 44px; align-items: center; }
      .${ID}-stick {
        width: 13px; height: 54px;
        background: linear-gradient(180deg, #d4a644 0%, #a07028 100%);
        border: none; border-radius: 3px 3px 2px 2px; cursor: pointer;
        transition: all .12s; box-shadow: 0 2px 5px rgba(0,0,0,.5);
      }
      .${ID}-stick:hover:not(:disabled) { filter: brightness(1.3); transform: scaleY(1.06); }
      .${ID}-stick--sel {
        background: linear-gradient(180deg, #ff7744 0%, #cc3300 100%);
        box-shadow: 0 0 10px rgba(255,100,50,.6), 0 2px 5px rgba(0,0,0,.5);
        transform: scaleY(1.1);
      }
      .${ID}-empty { color: #2a3a4a; font-size: 0.72rem; letter-spacing: 1px; }
      .${ID}-action { min-height: 42px; display: flex; align-items: center; }
      .${ID}-btn {
        padding: 10px 22px; background: #0d2040; border: 1px solid #1e4080;
        color: #5599dd; font-family: Orbitron, monospace; font-size: 0.72rem;
        border-radius: 6px; cursor: pointer; letter-spacing: 1px;
        transition: background .2s, border-color .2s;
      }
      .${ID}-btn:hover { background: #1a3060; border-color: #3a70c0; color: #88bbff; }
    `;
    document.head.appendChild(s);
  }
}
