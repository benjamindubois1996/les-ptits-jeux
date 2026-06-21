import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class Mastermind extends BaseGame {

  constructor(config) {
    super(config);
    this.state = this._buildFullState();
  }

  _gameId() { return 'mastermind'; }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: 'mastermind' });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    this._unbindControls();
  }

  /* ============================================================
     ACTIONS
     ============================================================ */

  start(options = {}) {
    const mode            = options.mode        ?? 'basique';
    const codeLength      = options.codeLength  ?? this.config.gameplay.codeLength;
    const colorCount      = options.colorCount  ?? this.config.gameplay.colorCount;
    const maxAttempts     = options.maxAttempts ?? this.config.gameplay.maxAttempts;
    const allowDuplicates = mode !== 'basique';

    this.state = {
      ...this._buildFullState(),
      status:        'playing',
      mode,
      allowDuplicates,
      secretCode:    this._generateCode(codeLength, colorCount, allowDuplicates),
      codeLength,
      colorCount,
      maxAttempts,
      currentGuess:  new Array(codeLength).fill(null),
      selectedPeg:   0,
    };

    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  selectPeg(position) {
    const { state } = this;
    if (state.status !== 'playing') return;
    state.selectedPeg = position;
    EventBus.emit('game:tick', { state: this.state, action: 'peg-selected' });
  }

  placeColor(colorIndex) {
    const { state } = this;
    if (state.status !== 'playing') return;
    state.currentGuess[state.selectedPeg] = colorIndex;

    /* Avance automatiquement vers le prochain peg vide */
    const nextEmpty = state.currentGuess.findIndex((c, i) => i > state.selectedPeg && c === null);
    if (nextEmpty !== -1) state.selectedPeg = nextEmpty;
    else {
      /* Cherche aussi avant la position actuelle */
      const prevEmpty = state.currentGuess.findIndex(c => c === null);
      if (prevEmpty !== -1) state.selectedPeg = prevEmpty;
    }

    EventBus.emit('game:tick', { state: this.state, action: 'color-placed' });
  }

  deletePeg() {
    const { state } = this;
    if (state.status !== 'playing') return;

    if (state.currentGuess[state.selectedPeg] !== null) {
      state.currentGuess[state.selectedPeg] = null;
    } else {
      for (let i = state.selectedPeg - 1; i >= 0; i--) {
        if (state.currentGuess[i] !== null) {
          state.currentGuess[i] = null;
          state.selectedPeg = i;
          break;
        }
      }
    }

    EventBus.emit('game:tick', { state: this.state, action: 'peg-deleted' });
  }

  submitGuess() {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (state.currentGuess.includes(null)) {
      EventBus.emit('game:tick', { state: this.state, action: 'submit-invalid' });
      return;
    }

    const feedback = this._computeFeedback(state.currentGuess, state.secretCode);
    state.history.push({ guess: [...state.currentGuess], feedback });
    state.attemptNumber++;

    if (feedback.blacks === state.codeLength) {
      const remaining = state.maxAttempts - state.attemptNumber;
      const score = Math.max(0,
        this.config.scoring.baseScore
        - (state.attemptNumber - 1) * this.config.scoring.penaltyPerAttempt
        + remaining * this.config.scoring.bonusPerRemainingAttempt
      );
      state.score  = score;
      state.status = 'won';
      ScoreService.submit('mastermind', score, { attempts: state.attemptNumber, codeLength: state.codeLength });
      EventBus.emit('game:score-update', { score });
      EventBus.emit('game:won', {
        code:     state.secretCode,
        score,
        attempts: state.attemptNumber,
        best:     ScoreService.getBest('mastermind'),
      });

    } else if (state.attemptNumber >= state.maxAttempts) {
      state.status = 'gameover';
      ScoreService.submit('mastermind', 0, { won: false });
      EventBus.emit('game:score-update', { score: 0 });
      EventBus.emit('game:over', { code: state.secretCode, score: 0 });

    } else {
      state.currentGuess = new Array(state.codeLength).fill(null);
      state.selectedPeg  = 0;
    }

    EventBus.emit('game:tick', { state: this.state, action: 'guess-submitted', feedback });
  }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  /* ============================================================
     LOGIQUE
     ============================================================ */

  _generateCode(codeLength, colorCount, allowDuplicates) {
    if (allowDuplicates) {
      return Array.from({ length: codeLength }, () => Math.floor(Math.random() * colorCount));
    }
    /* Sans doublons : Fisher-Yates partiel sur le pool de couleurs */
    const pool = Array.from({ length: colorCount }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, codeLength);
  }

  _computeFeedback(guess, secret) {
    const len = guess.length;
    let blacks = 0;
    const guessRem  = [];
    const secretRem = [];

    for (let i = 0; i < len; i++) {
      if (guess[i] === secret[i]) blacks++;
      else { guessRem.push(guess[i]); secretRem.push(secret[i]); }
    }

    const counts = {};
    for (const c of secretRem) counts[c] = (counts[c] ?? 0) + 1;

    let whites = 0;
    for (const c of guessRem) {
      if (counts[c] > 0) { whites++; counts[c]--; }
    }

    return { blacks, whites };
  }

  /* ============================================================
     CONTRÔLES CLAVIER
     ============================================================ */

  _bindControls() {
    this._onKeyDown = (e) => {
      const s = this.state.status;
      if (s === 'won' || s === 'gameover') {
        if (e.code === 'KeyR') { e.preventDefault(); EventBus.emit('game:restart'); }
        return;
      }
      if (e.code === 'KeyP' && (s === 'playing' || s === 'paused')) {
        e.preventDefault();
        EventBus.emit('game:pause-toggle');
        return;
      }
      if (s !== 'playing') return;

      if (e.code === 'Enter') { e.preventDefault(); this.submitGuess(); return; }
      if (e.code === 'Backspace' || e.code === 'Delete') { e.preventDefault(); this.deletePeg(); return; }

      /* Chiffres 1–N pour choisir une couleur */
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= this.state.colorCount) {
        e.preventDefault();
        this.placeColor(num - 1);
      }

      /* Flèches pour naviguer entre les pegs */
      if (e.code === 'ArrowLeft')  { e.preventDefault(); this.selectPeg(Math.max(0, this.state.selectedPeg - 1)); }
      if (e.code === 'ArrowRight') { e.preventDefault(); this.selectPeg(Math.min(this.state.codeLength - 1, this.state.selectedPeg + 1)); }
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
      status:        'loading',
      secretCode:    [],
      currentGuess:  [],
      selectedPeg:   0,
      history:       [],
      attemptNumber: 0,
      codeLength:    this.config.gameplay.codeLength,
      colorCount:    this.config.gameplay.colorCount,
      maxAttempts:   this.config.gameplay.maxAttempts,
      score:         0,
    };
  }
}
