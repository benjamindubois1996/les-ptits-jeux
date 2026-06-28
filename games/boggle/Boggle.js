import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';
import { isValid, WORDS } from '../../js/utils/FrenchWords.js';

// Weighted French letter pool (biased toward common letters)
const LETTER_POOL = (
  'EEEEEEEEEEEEEEEEEEEAAAAAAAAAAAAIIIIIIIIIIISSSSSSSSSSTTTTTTTTTTNNNNNNNNNNRRRRRRRRRR' +
  'UUUUUUUUOOLLLLLLLLDDDDDCCCCCCMMMMMPPPPGGGBBBBFFHHVVJKQWXYZ'
).split('');

function generateGrid(size) {
  const letters = [];
  for (let i = 0; i < size * size; i++) {
    letters.push(LETTER_POOL[Math.floor(Math.random() * LETTER_POOL.length)]);
  }
  return letters;
}

// Find all valid words in a grid using DFS
function findAllWords(grid, size) {
  const found = new Set();
  const dirs  = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

  function dfs(r, c, used, word) {
    if (word.length >= 3 && isValid(word)) found.add(word.toLowerCase());
    if (word.length >= 8) return;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const idx = nr * size + nc;
      if (used.has(idx)) continue;
      used.add(idx);
      dfs(nr, nc, used, word + grid[idx]);
      used.delete(idx);
    }
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      const used = new Set([idx]);
      dfs(r, c, used, grid[idx]);
    }
  }
  return [...found].sort((a, b) => b.length - a.length);
}

export default class Boggle extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._loop = new GameLoop(() => this._tick());
  }

  _gameId() { return 'boggle'; }

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
    this.state = this._buildFullState();
    this.state.status  = 'playing';
    this.state.mode    = options.mode ?? 'basique';
    const size         = this.state.size;
    this.state.grid    = generateGrid(size);
    this.state.possible = findAllWords(this.state.grid, size);
    this.state.timeLeft = this.config.gameplay.timeSec;
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

  // Submit a word attempt
  submitWord(word) {
    const s = this.state;
    if (s.status !== 'playing') return { ok: false, reason: 'not playing' };
    const w = word.toLowerCase().trim();
    if (w.length < 3)          return { ok: false, reason: 'trop court' };
    if (s.found.has(w))        return { ok: false, reason: 'déjà trouvé' };
    if (!s.possible.includes(w)) return { ok: false, reason: 'pas dans la grille' };
    if (!isValid(w))           return { ok: false, reason: 'mot inconnu' };
    s.found.add(w);
    const pts = this._scoreWord(w);
    s.score  += pts;
    EventBus.emit('game:tick', { state: s, action: 'word', word: w, pts });
    return { ok: true, pts };
  }

  _scoreWord(w) {
    const sc = this.config.scoring;
    const l  = w.length;
    if (l >= 8) return sc.len8plus;
    if (l === 7) return sc.len7;
    if (l === 6) return sc.len6;
    if (l === 5) return sc.len5;
    if (l === 4) return sc.len4;
    return sc.len3;
  }

  _endGame() {
    const s   = this.state;
    s.status  = 'over';
    this._loop.stop();
    const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
    const missed = s.possible.length - s.found.size;
    EventBus.emit('game:over', {
      result: 'win', icon: '🔤', title: 'TEMPS ÉCOULÉ',
      score: s.score, best, isRecord,
      extraInfo: `<div class="overlay-score">${s.found.size} mots trouvés · ${missed} manqués sur ${s.possible.length}</div>`,
    });
  }

  _buildFullState() {
    return {
      status: 'idle', mode: 'basique',
      size: this.config?.gameplay?.gridSize ?? 4,
      score: 0, timeLeft: this.config?.gameplay?.timeSec ?? 180,
      grid: [], found: new Set(), possible: [],
    };
  }
}
