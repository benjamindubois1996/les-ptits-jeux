/**
 * Wordle.js — v2.1
 *
 * Nouveautés v2.1 :
 *  - Chargement unique du JSON entier + changement de longueur synchrone
 *  - Normalisation des accents (ÉCOLE → ECOLE) : pool de mots maximal
 *  - Mode longueur aléatoire : chaque mot peut avoir une longueur différente
 */

import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

/* ============================================================
   UTILITAIRES
   ============================================================ */

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s ^= (s >>> 16);
    return (s >>> 0) / 0x100000000;
  };
}

/** Supprime les accents français : ÉCOLE → ECOLE, CŒUR → COEUR */
function stripAccents(word) {
  return word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/Œ/g, 'OE').replace(/œ/g, 'OE')
    .replace(/Æ/g, 'AE').replace(/æ/g, 'AE')
    .toUpperCase();
}

export default class Wordle extends BaseGame {

  constructor(config) {
    super(config);

    this._allWords     = null;  // JSON complet { "4":[...], "5":[...] ... }
    this._words        = [];    // mots pour la longueur courante
    this._wordsSet     = null;
    this._wordSequence = null;

    this._timerInterval   = null;
    this._wonTimeout      = null;
    this._overTimeout     = null;
    this._nextWordTimeout = null;

    this.state = this._buildFullState();
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  _gameId() { return 'wordle'; }

  async init() {
    this._bindControls();
    this._setupEventBusBindings();
    await this._loadAllWords();           // une seule requête
    this._applyLength(this.config.gameplay.wordLength);
    this._initSeries();
    this._resetWordState();
    this.state.status = 'playing';
    EventBus.emit('game:ready', { gameId: 'wordle' });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    this._clearAllTimers();
    this._unbindControls();
  }

  /* ============================================================
     CHARGEMENT — UN SEUL FETCH pour tout le dictionnaire
     ============================================================ */

  async _loadAllWords() {
    const { language } = this.config.gameplay;
    try {
      const res = await fetch(`/games/wordle/data/words-${language}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._allWords = await res.json();
    } catch (err) {
      console.error('[Wordle] Dict error:', err);
      this._allWords = { 5: ['ARBRE','BLANC','CARTE','CHIEN','MONDE','PORTE','ROUGE','TRAIN','VERRE','SOLDE'] };
    }
  }

  /**
   * Applique la longueur cible : filtre + normalise accents.
   * Synchrone (le JSON est déjà en mémoire).
   */
  _applyLength(wordLength) {
    const raw = this._allWords?.[String(wordLength)] || [];

    // Normaliser les accents → garder TOUS les mots (ÉCOLE → ECOLE)
    const normalized = raw.map(stripAccents);

    // Dédupliquer + garder uniquement A-Z
    const unique = [...new Set(normalized)].filter(w => /^[A-Z]+$/.test(w));

    this._words    = unique;
    this._wordsSet = new Set(unique);
    this.state.wordCount = unique.length;

    console.log(`[Wordle] ${unique.length} mots (${wordLength} lettres)`);
  }

  /* ============================================================
     CHANGER LA LONGUEUR (#1 / #2 aléatoire)
     ============================================================ */

  setWordLength(n) {
    this._clearAllTimers();
    this.config.gameplay.wordLength  = n;
    this.config.gameplay.randomLength = false;
    this._applyLength(n);
    this.state = this._buildFullState();
    this._initSeries();
    this._resetWordState();
    this.state.status = 'playing';
    EventBus.emit('game:word-length-changed', { wordLength: n, randomLength: false, wordCount: this._words.length });
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  setRandomLength() {
    this._clearAllTimers();
    this.config.gameplay.randomLength = true;
    const n = this._pickRandomLength();
    this.config.gameplay.wordLength = n;
    this._applyLength(n);
    this.state = this._buildFullState();
    this._initSeries();
    this._resetWordState();
    this.state.status = 'playing';
    EventBus.emit('game:word-length-changed', { wordLength: n, randomLength: true, wordCount: this._words.length });
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _pickRandomLength(exclude) {
    const opts   = this.config.gameplay.wordLengthOptions;
    const others = exclude != null ? opts.filter(n => n !== exclude) : opts;
    const pool   = others.length > 0 ? others : opts;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* ============================================================
     INITIALISATION SÉRIE
     ============================================================ */

  _initSeries() {
    const { series, seed, lives, wordLength } = this.config.gameplay;

    const actualSeed = seed > 0 ? seed : Math.floor(Math.random() * 999999) + 1;
    this.state.seed         = actualSeed;
    this.state.seriesTarget = series;

    if (series === 0) {
      const maxLives = lives > 0 ? lives : Math.max(1, wordLength - 2);
      this.state.maxLives = maxLives;
      this.state.lives    = maxLives;
    } else {
      this.state.maxLives = 0;
      this.state.lives    = 0;
    }

    if (series > 0) {
      const rng  = makeRng(actualSeed);
      const pool = [...this._words];
      const seq  = [];
      const used = new Set();
      while (seq.length < series) {
        const word = pool[Math.floor(rng() * pool.length)];
        if (!used.has(word)) { used.add(word); seq.push(word); }
        if (used.size >= pool.length) used.clear();
      }
      this._wordSequence = seq;
    }

    this.state.wordIndex      = 0;
    this.state.wordsCompleted = 0;
    this.state.wordsFailed    = 0;
    this.state.totalScore     = 0;
  }

  _pickSolution() {
    if (this._wordSequence) return this._wordSequence[this.state.wordIndex] ?? this._words[0];
    return this._words[Math.floor(Math.random() * this._words.length)] || 'MONDE';
  }

  /* ============================================================
     ACTIONS DU JOUEUR
     ============================================================ */

  addLetter(letter) {
    if (this.state.status !== 'playing') return;
    const { wordLength, timer } = this.config.gameplay;
    if (this.state.currentCol >= wordLength) return;

    // Démarre le chrono à la première lettre
    if (timer.enabled && !this.state.timerStarted) {
      this.state.timerStarted = true;
      this._startTimer();
    }

    this.state.grid[this.state.currentRow][this.state.currentCol].letter = letter;
    this.state.currentCol++;
    EventBus.emit('game:tick', { state: this.state, action: 'add' });
  }

  deleteLetter() {
    if (this.state.status !== 'playing') return;
    if (this.state.currentCol <= 0) return;
    this.state.currentCol--;
    this.state.grid[this.state.currentRow][this.state.currentCol].letter = '';
    EventBus.emit('game:tick', { state: this.state, action: 'delete' });
  }

  submitGuess() {
    if (this.state.status !== 'playing') return;
    const { wordLength, maxAttempts } = this.config.gameplay;

    if (this.state.currentCol < wordLength) {
      EventBus.emit('game:invalid-guess', { reason: 'too-short' }); return;
    }

    const guess = this.state.grid[this.state.currentRow].map(c => c.letter).join('');
    if (!this._wordsSet.has(guess)) {
      EventBus.emit('game:invalid-guess', { reason: 'not-in-list', guess }); return;
    }

    const results = this._evaluateGuess(guess);
    results.forEach((r, i) => { this.state.grid[this.state.currentRow][i].state = r.state; });
    this._updateLetterStates(results);

    const isWin   = results.every(r => r.state === 'correct');
    const attempt = this.state.currentRow + 1;
    const flipMs  = (wordLength - 1) * 200 + 350 + 150;

    EventBus.emit('game:tick', { state: this.state, action: 'submit', row: this.state.currentRow });

    if (isWin) {
      this._stopTimer();
      this.state.status = 'won';
      const wordScore        = this._calcWordScore(attempt);
      this.state.wordScore   = wordScore;
      this.state.totalScore += wordScore;
      this.state.wordsCompleted++;
      ScoreService.submit('wordle', this.state.totalScore, { attempts: attempt });
      EventBus.emit('game:score-update', { score: this.state.totalScore });
      this._wonTimeout = setTimeout(() => this._handleWin(attempt), flipMs);

    } else if (attempt >= maxAttempts) {
      this._stopTimer();
      this.state.status = 'gameover-word';
      this.state.wordsFailed++;
      this.state.currentRow++;
      this._overTimeout = setTimeout(() => this._handleFail(), flipMs);
    } else {
      this.state.currentRow++;
      this.state.currentCol = 0;
    }
  }

  /* ============================================================
     FIN DE MOT
     ============================================================ */

  _handleWin(attempt) {
    const { series } = this.config.gameplay;
    const isLastWord = series > 0 && this.state.wordIndex >= series - 1;

    EventBus.emit('game:won', {
      solution:         this.state.solution,
      wordScore:        this.state.wordScore,
      totalScore:       this.state.totalScore,
      attempts:         attempt,
      lives:            this.state.lives,
      maxLives:         this.state.maxLives,
      wordsCompleted:   this.state.wordsCompleted,
      wordIndex:        this.state.wordIndex,
      seriesTarget:     this.state.seriesTarget,
      seed:             this.state.seed,
      best:             ScoreService.getBest('wordle'),
      hasNext:          !isLastWord,
      isSeriesComplete: isLastWord
    });

    if (!isLastWord) {
      this._nextWordTimeout = setTimeout(() => this._nextWord(), 2200);
    }
  }

  _handleFail() {
    const { series } = this.config.gameplay;

    if (series === 0) {
      this.state.lives--;
      const gameover = this.state.lives <= 0;
      EventBus.emit('game:word-failed', {
        solution: this.state.solution, lives: this.state.lives,
        maxLives: this.state.maxLives, wordsCompleted: this.state.wordsCompleted,
        totalScore: this.state.totalScore, gameover
      });
      if (gameover) {
        ScoreService.submit('wordle', this.state.totalScore, { won: false });
        EventBus.emit('game:score-update', { score: this.state.totalScore });
        EventBus.emit('game:over', {
          solution: this.state.solution, totalScore: this.state.totalScore,
          wordsCompleted: this.state.wordsCompleted, wordsFailed: this.state.wordsFailed,
          reason: 'no-lives'
        });
      } else {
        this._nextWordTimeout = setTimeout(() => this._nextWord(), 2200);
      }
    } else {
      ScoreService.submit('wordle', this.state.totalScore, { won: false });
      EventBus.emit('game:score-update', { score: this.state.totalScore });
      EventBus.emit('game:over', {
        solution: this.state.solution, totalScore: this.state.totalScore,
        wordsCompleted: this.state.wordsCompleted, wordsFailed: this.state.wordsFailed,
        seriesTarget: this.state.seriesTarget, seed: this.state.seed, reason: 'failed-word'
      });
    }
  }

  /* ============================================================
     MOT SUIVANT — avec changement de longueur si mode aléatoire
     ============================================================ */

  _nextWord() {
    this._clearAllTimers();
    this.state.wordIndex++;

    // Mode longueur aléatoire : nouvelle longueur à chaque mot
    if (this.config.gameplay.randomLength) {
      const prev = this.config.gameplay.wordLength;
      const next = this._pickRandomLength(prev);   // différente de la précédente si possible
      this.config.gameplay.wordLength = next;
      this._applyLength(next);
      // Reconstruire la grille avec la nouvelle taille
      EventBus.emit('game:word-length-changed', {
        wordLength: next, randomLength: true, wordCount: this._words.length
      });
    }

    this._resetWordState();
    this.state.status = 'playing';
    EventBus.emit('game:tick', { state: this.state, action: 'next-word' });
  }

  _resetWordState() {
    const { wordLength, maxAttempts } = this.config.gameplay;
    this.state.solution     = this._pickSolution();
    this.state.grid         = Array.from({ length: maxAttempts }, () =>
      Array.from({ length: wordLength }, () => ({ letter: '', state: 'empty' }))
    );
    this.state.currentRow   = 0;
    this.state.currentCol   = 0;
    this.state.letterStates = {};
    this.state.time         = 0;
    this.state.wordScore    = 0;
    this.state.wordCount    = this._words.length;
    this.state.timerStarted = false;
  }

  /* ============================================================
     PAUSE / RESTART
     ============================================================ */

  togglePause() {
    if (this.state.status === 'playing') {
      this.state.status = 'paused';
      this._stopTimer();
      EventBus.emit('game:paused', { state: this.state });
    } else if (this.state.status === 'paused') {
      this.state.status = 'playing';
      if (this.state.timerStarted) this._startTimer();
      EventBus.emit('game:resumed', { state: this.state });
    }
  }

  async restart() {
    this._clearAllTimers();
    this._applyLength(this.config.gameplay.wordLength);
    this.state = this._buildFullState();
    this._initSeries();
    this._resetWordState();
    this.state.status = 'playing';
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  /* ============================================================
     SCORE
     ============================================================ */

  _calcWordScore(attempt) {
    const { baseScore, penaltyPerAttempt } = this.config.scoring;
    const { timer } = this.config.gameplay;
    const base  = Math.max(0, baseScore - (attempt - 1) * penaltyPerAttempt);
    const bonus = timer.enabled
      ? Math.max(0, timer.bonusBase - this.state.time * timer.penaltyPerSecond)
      : 0;
    return base + bonus;
  }

  /* ============================================================
     ÉVALUATION
     ============================================================ */

  _evaluateGuess(guess) {
    const solution  = this.state.solution;
    const result    = guess.split('').map(letter => ({ letter, state: 'absent' }));
    const remaining = solution.split('');
    for (let i = 0; i < solution.length; i++) {
      if (guess[i] === solution[i]) { result[i].state = 'correct'; remaining[i] = null; }
    }
    for (let i = 0; i < guess.length; i++) {
      if (result[i].state === 'correct') continue;
      const idx = remaining.indexOf(guess[i]);
      if (idx !== -1) { result[i].state = 'present'; remaining[idx] = null; }
    }
    return result;
  }

  _updateLetterStates(results) {
    const priority = { correct: 3, present: 2, absent: 1 };
    results.forEach(({ letter, state }) => {
      const cur = this.state.letterStates[letter];
      if (!cur || priority[state] > priority[cur]) this.state.letterStates[letter] = state;
    });
  }

  /* ============================================================
     TIMER
     ============================================================ */

  _startTimer() {
    this._stopTimer();
    this._timerInterval = setInterval(() => {
      this.state.time++;
      EventBus.emit('game:timer', { time: this.state.time });
    }, 1000);
  }

  _stopTimer() {
    if (this._timerInterval) { clearInterval(this._timerInterval); this._timerInterval = null; }
  }

  _clearAllTimers() {
    this._stopTimer();
    if (this.state) this.state.timerStarted = false;
    clearTimeout(this._wonTimeout);
    clearTimeout(this._overTimeout);
    clearTimeout(this._nextWordTimeout);
  }

  /* ============================================================
     CONTRÔLES
     ============================================================ */

  _bindControls() {
    this._onKeyDown = (e) => {
      const s = this.state.status;
      if (s === 'won' || s === 'gameover' || s === 'gameover-word') {
        if (e.code === 'KeyR') { e.preventDefault(); EventBus.emit('game:restart'); }
        return;
      }
      if (s !== 'playing') return;
      if (e.key === 'Enter')          { e.preventDefault(); this.submitGuess(); }
      else if (e.key === 'Backspace') { e.preventDefault(); this.deleteLetter(); }
      else if (/^[a-zA-Z]$/.test(e.key)) { e.preventDefault(); this.addLetter(e.key.toUpperCase()); }
    };
    window.addEventListener('keydown', this._onKeyDown);
    // EventBus (boutons GameShell) — gérés par BaseGame._setupEventBusBindings()
  }

  _unbindControls() {
    window.removeEventListener('keydown', this._onKeyDown);
  }

  /* ============================================================
     ÉTAT
     ============================================================ */

  _buildFullState() {
    return {
      status: 'loading', solution: '', grid: [],
      currentRow: 0, currentCol: 0, letterStates: {},
      timerStarted: false,
      time: 0, wordScore: 0, totalScore: 0,
      wordsCompleted: 0, wordsFailed: 0, wordIndex: 0,
      seriesTarget: this.config.gameplay.series,
      lives: 0, maxLives: 0, seed: 0,
      wordCount: 0
    };
  }
}
