import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class Memory extends BaseGame {

  constructor(config) {
    super(config);
    this.state        = this._buildFullState();
    this._flipTimeout = null;
  }

  _gameId() { return 'memory'; }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    if (this._flipTimeout) { clearTimeout(this._flipTimeout); this._flipTimeout = null; }
    this._unbindControls();
  }

  restart() {
    if (this._flipTimeout) { clearTimeout(this._flipTimeout); this._flipTimeout = null; }
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  /* ============================================================
     ACTIONS
     ============================================================ */

  start(options = {}) {
    const mode     = options.mode     ?? 'basique';
    const gridSize = options.gridSize ?? '4×4';
    const { cols, rows } = this.config.gameplay.gridMap[gridSize];
    const totalPairs = (cols * rows) / 2;
    const symbols = this.config.gameplay.symbols.slice(0, totalPairs);

    const cardSymbols = [...symbols, ...symbols];
    this._shuffle(cardSymbols);

    const cards = cardSymbols.map((symbol, id) => ({
      id, symbol, flipped: false, matched: false,
    }));

    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode, gridSize, cols, rows, totalPairs,
      cards,
    };

    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  flipCard(index) {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (state.isChecking) return;

    const card = state.cards[index];
    if (!card || card.flipped || card.matched) return;
    if (state.flippedIndices.includes(index)) return;

    card.flipped = true;
    state.flippedIndices = [...state.flippedIndices, index];
    EventBus.emit('game:tick', { state, action: 'flip' });

    if (state.flippedIndices.length === 2) {
      state.moves++;
      state.isChecking = true;
      this._scheduleCheck();
    }
  }

  /* ============================================================
     LOGIQUE
     ============================================================ */

  _scheduleCheck() {
    const { state } = this;
    const [i1, i2] = state.flippedIndices;
    const c1 = state.cards[i1];
    const c2 = state.cards[i2];

    if (c1.symbol === c2.symbol) {
      c1.matched = true;
      c2.matched = true;
      state.matches++;
      const matchedIndices = [i1, i2];
      state.flippedIndices = [];
      state.isChecking     = false;
      EventBus.emit('game:tick', { state, action: 'match', indices: matchedIndices });

      if (state.matches === state.totalPairs) {
        this._onWon();
      }
    } else {
      EventBus.emit('game:tick', { state, action: 'no-match', indices: [i1, i2] });
      this._flipTimeout = setTimeout(() => {
        c1.flipped = false;
        c2.flipped = false;
        state.flippedIndices = [];
        state.isChecking     = false;
        this._flipTimeout    = null;
        if (state.status === 'playing') {
          EventBus.emit('game:tick', { state, action: 'flip-back' });
        }
      }, this.config.gameplay.flipDelay);
    }
  }

  _onWon() {
    const { state }  = this;
    const cfg        = this.config.scoring;
    const minMoves   = state.totalPairs;
    const score      = Math.max(
      state.totalPairs * cfg.minPerPair,
      state.totalPairs * cfg.basePerPair - Math.max(0, state.moves - minMoves) * cfg.movePenalty
    );
    state.score  = score;
    state.status = 'won';

    ScoreService.submit('memory', score);
    EventBus.emit('game:won', {
      score,
      moves: state.moves,
      best:  ScoreService.getBest('memory'),
    });
  }

  /* ============================================================
     CONTRÔLES
     ============================================================ */

  _bindControls() {
    this._onKeyDown = (e) => {
      const keys = this.config.controls.keyboard;
      if (keys.restart.includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
      if (keys.pause.includes(e.code))   { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindControls() {
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
  }

  /* ============================================================
     ÉTAT
     ============================================================ */

  _buildFullState() {
    return {
      status:         'loading',
      mode:           'basique',
      gridSize:       '4×4',
      cols:           4,
      rows:           4,
      totalPairs:     8,
      cards:          [],
      moves:          0,
      matches:        0,
      score:          0,
      flippedIndices: [],
      isChecking:     false,
    };
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}
