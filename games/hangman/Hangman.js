import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

function stripAccents(w) {
  return w.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/Œ|œ/g, 'OE')
    .replace(/Æ|æ/g, 'AE')
    .toUpperCase();
}

export default class Hangman extends BaseGame {

  constructor(config) {
    super(config);
    this._allWords = null;
    this.state = this._buildFullState();
  }

  _gameId() { return 'hangman'; }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    await this._loadWords();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: 'hangman' });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    this._unbindControls();
  }

  /* ============================================================
     DICTIONNAIRE — réutilise celui de Wordle
     ============================================================ */

  async _loadWords() {
    const { language } = this.config.gameplay;
    try {
      const res = await fetch(`/games/wordle/data/words-${language}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._allWords = await res.json();
    } catch (err) {
      console.error('[Hangman] Dict error:', err);
      this._allWords = { 5: ['ARBRE','BLANC','CARTE','CHIEN','MONDE','PORTE','ROUGE','TRAIN','VERRE','SOLDE'] };
    }
  }

  _wordsForLength(len) {
    const raw = this._allWords?.[String(len)] ?? [];
    return [...new Set(raw.map(stripAccents))].filter(w => /^[A-Z]+$/.test(w));
  }

  _pickWord(wordLength) {
    const opts = this.config.gameplay.wordLengthOptions;
    let len = wordLength > 0 ? wordLength : opts[Math.floor(Math.random() * opts.length)];

    let words = this._wordsForLength(len);
    if (!words.length) {
      for (const l of opts) {
        const fallback = this._wordsForLength(l);
        if (fallback.length) { words = fallback; break; }
      }
    }
    return words.length
      ? words[Math.floor(Math.random() * words.length)]
      : 'MONDE';
  }

  /* ============================================================
     ACTIONS
     ============================================================ */

  start(options = {}) {
    const lives      = options.lives      ?? this.config.gameplay.lives;
    const wordLength = options.wordLength ?? this.config.gameplay.wordLength;
    const word       = this._pickWord(wordLength);

    this.state = {
      ...this._buildFullState(),
      status:      'playing',
      word,
      wordDisplay: word.split('').map(l => ({ letter: l, revealed: false })),
      lives,
      maxLives:    lives,
      wordLength:  word.length,
    };

    EventBus.emit('game:tick', { state: this.state, action: 'new-word' });
  }

  guessLetter(letter) {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (state.guessedLetters.includes(letter)) return;

    state.guessedLetters = [...state.guessedLetters, letter];
    const inWord = state.word.includes(letter);

    if (inWord) {
      state.wordDisplay = state.word.split('').map((l, i) => ({
        letter:   l,
        revealed: state.wordDisplay[i].revealed || l === letter,
      }));

      if (state.wordDisplay.every(c => c.revealed)) {
        const gained = Math.max(0,
          this.config.scoring.baseScore
          - state.wrongLetters.length * this.config.scoring.penaltyPerWrongGuess
        );
        state.score += gained;
        state.status = 'won';
        ScoreService.submit('hangman', state.score, { wordLength: state.wordLength });
        EventBus.emit('game:score-update', { score: state.score });
        EventBus.emit('game:won', {
          word:   state.word,
          score:  state.score,
          gained,
          errors: state.wrongLetters.length,
          best:   ScoreService.getBest('hangman'),
        });
      }
    } else {
      state.wrongLetters = [...state.wrongLetters, letter];
      state.lives--;

      if (state.lives <= 0) {
        state.status = 'gameover';
        ScoreService.submit('hangman', state.score, { won: false });
        EventBus.emit('game:score-update', { score: state.score });
        EventBus.emit('game:over', { word: state.word, score: state.score });
      }
    }

    EventBus.emit('game:tick', {
      state:  this.state,
      action: inWord ? 'correct' : 'wrong',
      letter,
    });
  }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
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
      // Pas de raccourci clavier P ici : les lettres A-Z (dont P) servent à deviner le mot.
      // La pause reste accessible via le bouton ⏸ du GameShell.
      if (s !== 'playing') return;
      if (/^[a-zA-ZÀ-ÿ]$/.test(e.key)) {
        e.preventDefault();
        this.guessLetter(stripAccents(e.key));
      }
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
      word:           '',
      wordDisplay:    [],
      guessedLetters: [],
      wrongLetters:   [],
      lives:          this.config.gameplay.lives,
      maxLives:       this.config.gameplay.lives,
      wordLength:     0,
      score:          0,
    };
  }
}
