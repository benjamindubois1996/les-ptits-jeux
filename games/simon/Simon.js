import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';

export default class Simon {

  constructor(config) {
    this.config       = config;
    this.state        = this._buildState();
    this._timers      = [];
    this._lastPhaseId = 0;
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init() {
    this._bindControls();
    EventBus.emit('game:ready', { gameId: 'simon' });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() {
    this._clearAll();
    this._unbindControls();
    EventBus.off('game:restart',      this._onRestart);
    EventBus.off('game:pause-toggle', this._onPauseToggle);
  }

  /* ============================================================
     SÉLECTION DU MODE
     ============================================================ */

  selectMode(modeName) {
    const modeConfig = this.config.modes[modeName];
    if (!modeConfig) return;
    this.state.mode         = modeName;
    this.state.modeConfig   = modeConfig;
    // Initialiser avant l'emit pour que _renderGame ait les couleurs dispo
    this.state.activeColors = this._colorsForRound(1);
    this.state.status       = 'idle';
    EventBus.emit('game:mode-selected', { mode: modeName, modeConfig });
    EventBus.emit('game:tick', { state: this.state, action: 'mode-selected' });
  }

  /* ============================================================
     DÉMARRAGE
     ============================================================ */

  start() {
    if (!this.state.mode) return;
    this._clearAll();

    const { mode, modeConfig } = this.state;
    this.state            = this._buildState();
    this.state.mode       = mode;
    this.state.modeConfig = modeConfig;
    this._lastPhaseId     = 0;

    // Initialiser avec les couleurs de la phase 1
    this.state.activeColors = this._colorsForRound(1);
    this.state.status       = 'showing';

    this._addToSequence();

    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'showing' });
    this._showSequence();
  }

  /* ============================================================
     RESTART → sélecteur de mode
     ============================================================ */

  restart() {
    this._clearAll();
    this.state        = this._buildState();
    this._lastPhaseId = 0;
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  /* ============================================================
     PAUSE
     ============================================================ */

  togglePause() {
    if (this.state.status === 'waiting') {
      this.state.status = 'paused';
      EventBus.emit('game:paused',  { state: this.state });
    } else if (this.state.status === 'paused') {
      this.state.status = 'waiting';
      EventBus.emit('game:resumed', { state: this.state });
    }
  }

  /* ============================================================
     INPUT JOUEUR
     ============================================================ */

  handleInput(color) {
    if (this.state.status !== 'waiting') return;

    const expected = this.state.sequence[this.state.inputIndex];
    if (color !== expected) {
      EventBus.emit('game:input-wrong', { color, expected });
      this._gameOver();
      return;
    }

    EventBus.emit('game:input-correct', { color, index: this.state.inputIndex });
    this.state.inputIndex++;

    if (this.state.inputIndex < this.state.sequence.length) return;

    // Tour complet
    EventBus.emit('game:restore-buttons');

    this.state.round++;
    this.state.score  = this.state.round * this.config.scoring.basePerRound;
    this.state.status = 'won-round';

    ScoreService.submit('simon', this.state.score);
    EventBus.emit('game:score-update',   { score: this.state.score });
    EventBus.emit('game:round-complete', { round: this.state.round, score: this.state.score });

    const t = setTimeout(() => {
      this.state.status = 'showing';
      this._addToSequence();
      EventBus.emit('game:tick', { state: this.state, action: 'showing' });
      this._showSequence();
    }, this.config.gameplay.interRoundDelay);
    this._timers.push(t);
  }

  /* ============================================================
     SÉQUENCE — flash puis effets de phase
     ============================================================ */

  _addToSequence() {
    const nextRound = this.state.sequence.length + 1;
    const newColors = this._colorsForRound(nextRound);
    const prevCount = this.state.activeColors.length;

    if (newColors.length !== prevCount) {
      const added = newColors.slice(prevCount);
      this.state.activeColors = newColors;
      EventBus.emit('game:colors-changed', { colors: newColors, added, prevCount });
    }

    // Supreme unlocks : seuils absolus, indépendants du phaseMultiplier
    const supreme = this.config.supremeUnlocks?.find(u => u.round === nextRound);
    if (supreme) {
      this.state.activeColors = [...this.state.activeColors, supreme.color];
      EventBus.emit('game:supreme-unlock', {
        color:  supreme.color,
        label:  supreme.label,
        round:  nextRound,
        colors: this.state.activeColors
      });
    }

    const colors = this.state.activeColors;
    this.state.sequence.push(colors[Math.floor(Math.random() * colors.length)]);
  }

  _showSequence() {
    this.state.inputIndex = 0;
    const seq   = this.state.sequence;
    const phase = this._getPhase(seq.length);
    const { flashDuration, flashPause } = phase;

    seq.forEach((color, i) => {
      const delay = i * (flashDuration + flashPause);
      const tOn  = setTimeout(() => EventBus.emit('game:flash', { color, on: true  }), delay);
      const tOff = setTimeout(() => EventBus.emit('game:flash', { color, on: false }), delay + flashDuration);
      this._timers.push(tOn, tOff);
    });

    // Après le dernier flash → appliquer les effets de phase
    const totalMs = (seq.length - 1) * (flashDuration + flashPause) + flashDuration + flashPause * 2;
    const tDone   = setTimeout(() => this._applyPhaseEffects(phase), totalMs);
    this._timers.push(tDone);
  }

  /* ============================================================
     EFFETS DE PHASE (entre fin de séquence et tour du joueur)
     Ordre : annonce phase → mélange → masquage → tour joueur → dérive
     ============================================================ */

  _applyPhaseEffects(phase) {
    // Annoncer la nouvelle phase si elle vient de changer
    if (phase.id > this._lastPhaseId) {
      this._lastPhaseId = phase.id;
      if (phase.id > 1) {
        EventBus.emit('game:phase-up', {
          phaseId: phase.id,
          label:   phase.label,
          round:   this.state.sequence.length
        });
      }
    }

    const { shuffleAfter, hideCount } = phase;
    const shuffleDelay = shuffleAfter ? 580 : 0;
    const hideDelay    = hideCount > 0 ? 340 : 0;

    if (shuffleAfter) {
      EventBus.emit('game:shuffle-positions', { colors: this.state.activeColors });
    }

    const t1 = setTimeout(() => {
      if (hideCount > 0) {
        const toHide = [...this.state.activeColors]
          .sort(() => Math.random() - 0.5)
          .slice(0, hideCount);
        EventBus.emit('game:hide-buttons', { colors: toHide });
      }

      const t2 = setTimeout(() => {
        this.state.status = 'waiting';
        EventBus.emit('game:tick', { state: this.state, action: 'player-turn' });
      }, hideDelay);
      this._timers.push(t2);
    }, shuffleDelay);
    this._timers.push(t1);
  }

  /* ============================================================
     GAME OVER
     ============================================================ */

  _gameOver() {
    this._clearAll();
    this.state.status = 'gameover';
    EventBus.emit('game:over', {
      score: this.state.score,
      round: this.state.round,
      best:  ScoreService.getBest('simon')
    });
  }

  /* ============================================================
     UTILITAIRES
     ============================================================ */

  _getPhase(round) {
    const mult   = this.state.modeConfig?.phaseMultiplier ?? 1;
    const effRnd = round / mult;
    const phases = this.config.phases;
    return [...phases].reverse().find(p => effRnd >= p.fromRound) || phases[0];
  }

  _colorsForRound(round) {
    const phase = this._getPhase(round);
    return this.config.allColors.slice(0, phase.colorCount);
  }

  _clearAll() {
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];
  }

  /* ============================================================
     CONTRÔLES CLAVIER
     ============================================================ */

  _bindControls() {
    this._onKeyDown = (e) => {
      const s = this.state.status;
      if (e.code === 'KeyR') {
        e.preventDefault();
        EventBus.emit('game:restart');
        return;
      }
      if (s === 'idle' || s === 'gameover') {
        e.preventDefault();
        this.start();
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
    this._onRestart     = () => this.restart();
    this._onPauseToggle = () => this.togglePause();
    EventBus.on('game:restart',      this._onRestart);
    EventBus.on('game:pause-toggle', this._onPauseToggle);
  }

  _unbindControls() {
    window.removeEventListener('keydown', this._onKeyDown);
  }

  /* ============================================================
     ÉTAT INITIAL
     ============================================================ */

  _buildState() {
    return {
      status:       'mode-select',
      mode:         null,
      modeConfig:   null,
      sequence:     [],
      inputIndex:   0,
      round:        0,
      score:        0,
      activeColors: []
    };
  }
}
