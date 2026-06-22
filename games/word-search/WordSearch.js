import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import { randInt, randChoice }  from '../../js/utils/Random.js';

const WORD_POOL = [
  'CHIEN','CHAT','LAPIN','OISEAU','POISSON','VACHE','CHEVAL','LION','TIGRE','RENARD',
  'MAISON','TABLE','CHAISE','PORTE','FENETRE','JARDIN','CUISINE','SALON','GARAGE','BALCON',
  'SOLEIL','LUNE','ETOILE','NUAGE','PLUIE','VENT','NEIGE','ORAGE','BRUME','GIVRE',
  'PIZZA','SOUPE','VIANDE','SALADE','FRUIT','GATEAU','BEURRE','FROMAGE','POULET','SAUMON',
  'ROUGE','BLEU','VERT','JAUNE','BLANC','NOIR','ROSE','VIOLET','ORANGE','BEIGE',
  'LIVRE','ECOLE','STYLO','CAHIER','CLASSE','REGLE','GOMME','CRAYON','BUREAU','CARTE',
  'TRAIN','AVION','BATEAU','VOITURE','VELO','METRO','CAMION','MOTO','FUSEE','BARQUE',
];

const DIRS = [
  [0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]
];

export default class WordSearch extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
  }

  _gameId() { return 'word-search'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); }

  start(options = {}) {
    const { gridSize, wordsPerPuzzle, gameDuration } = this.config.gameplay;
    const { grid, placements } = this._buildPuzzle(gridSize, wordsPerPuzzle);
    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode:   options.mode ?? 'basique',
      gridSize, grid,
      words:  placements.map(p => ({ ...p, found: false })),
      found:  [],
      score:  0,
      timeLeft: gameDuration,
      selecting: null, // { startR, startC }
      hoverCell: null,
    };
    this._gameTimer = setInterval(() => {
      if (this.state.status !== 'playing') return;
      this.state.timeLeft--;
      EventBus.emit('game:tick', { state: this.state, action: 'tick' });
      if (this.state.timeLeft <= 0) this._timeUp();
    }, 1000);
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  restart() {
    clearInterval(this._gameTimer);
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  startSelect(r, c) {
    if (this.state.status !== 'playing') return;
    this.state.selecting = { r, c };
    EventBus.emit('game:tick', { state: this.state, action: 'select-start' });
  }

  hoverSelect(r, c) {
    if (this.state.status !== 'playing') return;
    this.state.hoverCell = { r, c };
    EventBus.emit('game:tick', { state: this.state, action: 'hover' });
  }

  endSelect(r, c) {
    const { state } = this;
    if (state.status !== 'playing' || !state.selecting) return;
    const { r: sr, c: sc } = state.selecting;
    state.selecting = null;
    state.hoverCell = null;

    const cells = this._getCellsBetween(sr, sc, r, c, state.gridSize);
    if (!cells) { EventBus.emit('game:tick', { state, action: 'deselect' }); return; }

    const text = cells.map(([cr, cc]) => state.grid[cr][cc]).join('');
    const rev  = text.split('').reverse().join('');

    const match = state.words.find(w => !w.found && (w.word === text || w.word === rev));
    if (match) {
      match.found = true;
      state.found.push({ cells, word: match.word });
      const pts = this.config.scoring.perWord + match.word.length * this.config.scoring.lengthBonus;
      state.score += pts;
      EventBus.emit('game:score-update', { score: state.score });
      EventBus.emit('game:tick', { state, action: 'found', word: match.word });

      if (state.words.every(w => w.found)) {
        clearInterval(this._gameTimer);
        state.status = 'won';
        const finalScore = state.score + state.timeLeft * this.config.scoring.timeBonus;
        const { best } = ScoreService.submit(this._gameId(), finalScore);
        EventBus.emit('game:won', {
          result: 'win', icon: '🔤', title: 'TOUS TROUVÉS !',
          score: finalScore, best,
          extraInfo: `<div class="overlay-score">${state.words.length} mots trouvés</div>`,
        });
      }
    } else {
      EventBus.emit('game:tick', { state, action: 'miss' });
    }
  }

  _getCellsBetween(r1, c1, r2, c2, size) {
    const dr = r2 - r1, dc = c2 - c1;
    const len = Math.max(Math.abs(dr), Math.abs(dc));
    if (len === 0) return [[r1, c1]];
    // Must be perfectly straight or diagonal
    if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
    const sr = dr === 0 ? 0 : dr / Math.abs(dr);
    const sc = dc === 0 ? 0 : dc / Math.abs(dc);
    const cells = [];
    for (let i = 0; i <= len; i++) cells.push([r1 + i * sr, c1 + i * sc]);
    return cells;
  }

  _buildPuzzle(size, count) {
    const grid = Array.from({ length: size }, () => Array(size).fill(''));
    const pool = [...WORD_POOL].sort(() => Math.random() - 0.5);
    const placements = [];
    let attempts = 0;

    for (const word of pool) {
      if (placements.length >= count) break;
      if (word.length > size) continue;
      let placed = false;
      for (let t = 0; t < 40 && !placed; t++) {
        const [dr, dc] = DIRS[randInt(0, DIRS.length - 1)];
        const r = randInt(0, size - 1), c = randInt(0, size - 1);
        const cells = [];
        let ok = true;
        for (let i = 0; i < word.length; i++) {
          const nr = r + i * dr, nc = c + i * dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) { ok = false; break; }
          if (grid[nr][nc] !== '' && grid[nr][nc] !== word[i]) { ok = false; break; }
          cells.push([nr, nc]);
        }
        if (ok) {
          cells.forEach(([cr, cc], i) => { grid[cr][cc] = word[i]; });
          placements.push({ word, cells });
          placed = true;
        }
      }
    }

    // Fill empty cells with random letters
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (!grid[r][c]) grid[r][c] = LETTERS[randInt(0, 25)];

    return { grid, placements };
  }

  _timeUp() {
    clearInterval(this._gameTimer);
    this.state.status = 'over';
    const { best } = ScoreService.submit(this._gameId(), this.state.score);
    EventBus.emit('game:over', {
      result: 'lose', icon: '⏱️', title: 'TEMPS ÉCOULÉ !',
      score: this.state.score, best,
      extraInfo: `<div class="overlay-score">${this.state.words.filter(w=>w.found).length}/${this.state.words.length} mots trouvés</div>`,
    });
  }

  _buildFullState() {
    return { status:'idle', mode:'basique', gridSize:0, grid:[], words:[], found:[], score:0, timeLeft:0, selecting:null, hoverCell:null };
  }
}
