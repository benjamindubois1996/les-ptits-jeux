import EventBus    from '../../js/core/EventBus.js';
import GameOverlay from '../../js/ui/components/GameOverlay.js';

const CARD_LAYOUTS = [
  // 8 positions (cx, cy) en % de la carte, disposées en cercle + centre
  { cx: 50, cy: 18 },
  { cx: 79, cy: 30 },
  { cx: 89, cy: 60 },
  { cx: 68, cy: 85 },
  { cx: 35, cy: 90 },
  { cx: 12, cy: 72 },
  { cx: 10, cy: 38 },
  { cx: 50, cy: 52 },
];

export default class DobbleRenderer {
  constructor(game, viewport, config) {
    this._game     = game;
    this._viewport = viewport;
    this._wrapper  = null;
    this._overlay  = null;

    this._onTick    = this._onTick.bind(this);
    this._onOver    = this._onOver.bind(this);
    this._onPaused  = this._onPaused.bind(this);
    this._onResumed = this._onResumed.bind(this);
    this._onRestart = this._onRestart.bind(this);
    this._onKey     = this._onKey.bind(this);
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
    if (document.getElementById('dobble-styles')) return;
    const s = document.createElement('style');
    s.id = 'dobble-styles';
    s.textContent = `
      .dobble-wrapper {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; padding: 8px;
        box-sizing: border-box; gap: 6px;
        font-family: Orbitron, monospace; overflow: hidden;
      }
      .dobble-hud {
        display: flex; gap: 16px;
        color: #e0e0e0; font-size: 12px; width: 100%; justify-content: center;
      }
      .dobble-hud span { color: #ffd700; font-weight: bold; }
      .dobble-timer-bar {
        width: 100%; height: 6px;
        background: #1a2a3a; border-radius: 3px; overflow: hidden;
      }
      .dobble-timer-fill {
        height: 100%; background: #4af; border-radius: 3px;
        transition: width 0.2s linear;
      }
      .dobble-timer-fill.low { background: #f44; }
      .dobble-cards {
        flex: 1; width: 100%;
        display: flex; align-items: center; justify-content: center; gap: 12px;
      }
      .dobble-card {
        position: relative; flex: 1; max-width: 200px; aspect-ratio: 1;
        background: radial-gradient(circle at 40% 40%, #1a2e44, #0d1b2a);
        border: 2px solid #2a4a6a; border-radius: 50%;
        overflow: hidden; box-shadow: 0 0 20px rgba(74,150,255,0.2);
      }
      .dobble-card.wrong { border-color: #f44; box-shadow: 0 0 20px rgba(255,60,60,0.5); }
      .dobble-sym {
        position: absolute; transform: translate(-50%, -50%);
        cursor: pointer; user-select: none;
        font-size: 24px; line-height: 1;
        transition: transform 0.1s;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
      }
      .dobble-sym:hover { transform: translate(-50%, -50%) scale(1.25); }
      .dobble-label {
        font-size: 9px; color: #4a8aaf; text-align: center; letter-spacing: 1px;
      }
      .dobble-msg {
        font-size: 11px; color: #a0c4ff; min-height: 16px; text-align: center;
      }
      .dobble-separator {
        font-size: 28px; color: #ffd700; font-weight: bold; align-self: center;
      }
    `;
    document.head.appendChild(s);
  }

  _buildLayout() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'dobble-wrapper';

    const hud = document.createElement('div');
    hud.className = 'dobble-hud';
    hud.innerHTML = `Score: <span id="db-score">0</span>&nbsp; Paires: <span id="db-round">0</span>&nbsp; Temps: <span id="db-time">60</span>s`;

    const timerBar = document.createElement('div');
    timerBar.className = 'dobble-timer-bar';
    const timerFill = document.createElement('div');
    timerFill.className = 'dobble-timer-fill';
    timerFill.id = 'db-fill';
    timerBar.appendChild(timerFill);

    const cards = document.createElement('div');
    cards.className = 'dobble-cards';

    const leftWrap = document.createElement('div');
    leftWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;';
    const deckLabel = document.createElement('div');
    deckLabel.className = 'dobble-label';
    deckLabel.textContent = 'CARTE CENTRALE';
    this._deckCard = document.createElement('div');
    this._deckCard.className = 'dobble-card';
    this._deckCard.id = 'db-deck';
    leftWrap.append(deckLabel, this._deckCard);

    const sep = document.createElement('div');
    sep.className = 'dobble-separator';
    sep.textContent = '?';

    const rightWrap = document.createElement('div');
    rightWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;';
    const handLabel = document.createElement('div');
    handLabel.className = 'dobble-label';
    handLabel.textContent = 'TA CARTE';
    this._handCard = document.createElement('div');
    this._handCard.className = 'dobble-card';
    this._handCard.id = 'db-hand';
    rightWrap.append(handLabel, this._handCard);

    cards.append(leftWrap, sep, rightWrap);

    const msg = document.createElement('div');
    msg.className = 'dobble-msg';
    msg.id = 'db-msg';
    msg.textContent = 'Trouve le symbole commun entre les deux cartes !';

    this._wrapper.append(hud, timerBar, cards, msg);
    this._viewport.appendChild(this._wrapper);
  }

  _renderCard(container, symbols, isHand) {
    container.innerHTML = '';
    symbols.forEach((sym, i) => {
      const pos = CARD_LAYOUTS[i];
      const el  = document.createElement('span');
      el.className   = 'dobble-sym';
      el.textContent = sym;
      el.style.left  = pos.cx + '%';
      el.style.top   = pos.cy + '%';
      // Variable size pour rendre le jeu plus intéressant (comme le vrai Dobble)
      const sizes = [20, 26, 22, 18, 28, 20, 24, 22];
      el.style.fontSize = sizes[i] + 'px';

      if (isHand) {
        el.addEventListener('click', () => this._game.guess(sym));
      }
      container.appendChild(el);
    });
  }

  _bindEvents() {
    EventBus.on('game:tick',    this._onTick);
    EventBus.on('game:over',    this._onOver);
    EventBus.on('game:paused',  this._onPaused);
    EventBus.on('game:resumed', this._onResumed);
    EventBus.on('game:restart', this._onRestart);
    document.addEventListener('keydown', this._onKey);
  }

  _unbindEvents() {
    EventBus.off('game:tick',    this._onTick);
    EventBus.off('game:over',    this._onOver);
    EventBus.off('game:paused',  this._onPaused);
    EventBus.off('game:resumed', this._onResumed);
    EventBus.off('game:restart', this._onRestart);
    document.removeEventListener('keydown', this._onKey);
  }

  _onKey(e) {
    if (e.key === 'p' || e.key === 'P') EventBus.emit('game:pause-toggle');
    if (e.key === 'r' || e.key === 'R') EventBus.emit('game:restart');
  }

  _onTick({ state, action }) {
    if (action === 'restart') { this._showStart(); return; }

    const fill = document.getElementById('db-fill');
    if (fill) {
      const pct = (state.timeLeft / 60) * 100;
      fill.style.width = pct + '%';
      fill.classList.toggle('low', state.timeLeft < 10);
    }
    const sc = document.getElementById('db-score');
    if (sc) sc.textContent = state.score;
    const rn = document.getElementById('db-round');
    if (rn) rn.textContent = state.round;
    const ti = document.getElementById('db-time');
    if (ti) ti.textContent = Math.ceil(state.timeLeft);

    if (state.currentRound) {
      this._renderCard(this._deckCard, state.currentRound.deck, false);
      this._renderCard(this._handCard, state.currentRound.hand, true);
      this._handCard.classList.toggle('wrong', state.wrongFlashMs > 0);
    }

    const msg = document.getElementById('db-msg');
    if (msg) {
      if (action === 'correct') msg.textContent = '✓ Trouvé ! +' + (10 + (state.round > 0 ? 0 : 0)) + ' pts';
      else if (action === 'wrong') msg.textContent = '✗ Pas celui-là ! −3s';
      else if (state.status === 'playing') msg.textContent = 'Clique le symbole qui apparaît sur les DEUX cartes !';
    }
  }

  _onOver({ score, best }) {
    this._overlay.showGameOver(
      { result: 'lose', score, extraInfo: best > score ? `Record: ${best}` : '🏆 Nouveau record !' },
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
    document.getElementById('dobble-styles')?.remove();
  }
}
