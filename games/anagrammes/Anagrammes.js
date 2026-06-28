import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';
import { isValid, wordsFromLetters } from '../../js/utils/FrenchWords.js';

// Weighted pool biased toward common French letters
const POOL = (
  'EEEEEEEEEEEEEEEAAAAAAAAAAAAIIIIIIIIIISSSSSSSSSSTTTTTTTTTTNNNNNNNNNNRRRRRRRRRR' +
  'UUUUUUUUOOOOOOOOLLLLLLLLLDDDDDCCCCCMMMMPPPGGGBBFFHHVVJKQWXYZ'
).split('');

function pickLetters(n) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(POOL[Math.floor(Math.random() * POOL.length)]);
  return arr;
}

export default class Anagrammes extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._loop = new GameLoop(() => this._tick());
  }

  _gameId() { return 'anagrammes'; }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); this._loop.destroy(); }

  start(options = {}) {
    this._loop.stop();
    const letterCount = Number(options.letterCount) || this.config?.gameplay?.letterCount || 7;
    this.state = this._buildFullState(letterCount);
    this.state.status = 'playing';
    this.state.mode   = options.mode ?? 'basique';
    this._newRound();
    this._loop.start(1000);
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  restart() {
    this._loop.stop();
    this.state = this._buildFullState();
    this.state.status = 'idle';
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  { this._loop.stop(); }
  _onResume() { this._loop.start(1000); }

  _tick() {
    const s = this.state;
    if (s.status !== 'playing') return;
    s.timeLeft--;
    if (s.timeLeft <= 0) { s.timeLeft = 0; this._endGame(); return; }
    EventBus.emit('game:tick', { state: s, action: 'timer' });
  }

  _newRound() {
    const s    = this.state;
    const n    = s.cfg.letterCount;
    s.letters  = pickLetters(n);
    s.possible = wordsFromLetters(s.letters);
    s.foundInRound = new Set();
    s.round++;
    EventBus.emit('game:tick', { state: s, action: 'round' });
  }

  shuffle() {
    const s = this.state;
    for (let i = s.letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s.letters[i], s.letters[j]] = [s.letters[j], s.letters[i]];
    }
    EventBus.emit('game:tick', { state: s, action: 'shuffle' });
  }

  nextRound() {
    const s = this.state;
    if (s.round >= s.cfg.roundsTotal) { this._endGame(); return; }
    this._newRound();
  }

  submitWord(word) {
    const s = this.state;
    if (s.status !== 'playing') return { ok: false, reason: 'not playing' };
    const w = word.toLowerCase().trim();
    if (w.length < 3)              return { ok: false, reason: 'trop court' };
    if (s.found.has(w))            return { ok: false, reason: 'déjà trouvé' };
    if (!isValid(w))               return { ok: false, reason: 'mot inconnu' };
    if (!this._usesAvailableLetters(w, s.letters))
                                    return { ok: false, reason: 'lettres insuffisantes' };
    s.found.add(w);
    s.foundInRound.add(w);
    const pts = this._scoreWord(w, s.letters);
    s.score  += pts;
    EventBus.emit('game:tick', { state: s, action: 'word', word: w, pts });
    return { ok: true, pts };
  }

  _usesAvailableLetters(word, letters) {
    const pool = [...letters];
    for (const ch of word.toUpperCase()) {
      const idx = pool.indexOf(ch);
      if (idx === -1) return false;
      pool.splice(idx, 1);
    }
    return true;
  }

  _scoreWord(w, letters) {
    const sc  = this.config.scoring;
    const pts = w.length * sc.perLetter;
    const bonus = w.length === letters.length ? sc.bonusAllLetters : 0;
    return pts + bonus;
  }

  _endGame() {
    const s   = this.state;
    s.status  = 'over';
    this._loop.stop();
    const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:over', {
      result: 'win', icon: '🔡', title: 'FIN DU JEU',
      score: s.score, best, isRecord,
      extraInfo: `<div class="overlay-score">${s.found.size} mots trouvés · ${s.round} manche${s.round > 1 ? 's' : ''}</div>`,
    });
  }

  _buildFullState(letterCount) {
    const cfg = {
      letterCount:  letterCount ?? this.config?.gameplay?.letterCount ?? 7,
      timeSec:      this.config?.gameplay?.timeSec      ?? 180,
      roundsTotal:  this.config?.gameplay?.roundsTotal  ?? 5,
      perLetter:    this.config?.scoring?.perLetter     ?? 10,
      bonusAllLetters: this.config?.scoring?.bonusAllLetters ?? 50,
    };
    return {
      status: 'idle', mode: 'basique',
      score: 0, round: 0, timeLeft: cfg.timeSec,
      cfg, letters: [], found: new Set(), foundInRound: new Set(), possible: [],
    };
  }
}
