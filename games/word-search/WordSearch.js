import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import { randInt, randChoice, shuffle } from '../../js/utils/Random.js';

const WORD_POOL = [
  // Animaux
  'CHIEN','CHAT','LAPIN','OISEAU','TIGRE','LION','VACHE','CHEVAL','RENARD','LOUP',
  'SINGE','AIGLE','REQUIN','DAUPHIN','SERPENT','CANARD','HIBOU','SANGLIER',
  // Maison
  'MAISON','TABLE','CHAISE','PORTE','JARDIN','CUISINE','SALON','GARAGE','GRENIER',
  'BALCON','FENETRE','ESCALIER','COULOIR',
  // Nature
  'SOLEIL','LUNE','ETOILE','NUAGE','PLUIE','VENT','NEIGE','MONTAGNE','FORET',
  'RIVIERE','OCEAN','DESERT','VOLCAN','GLACIER',
  // Nourriture
  'PIZZA','GATEAU','VIANDE','SALADE','SOUPE','FROMAGE','POULET','SAUMON','BEURRE',
  'TOMATE','CAROTTE','POMME','FRAISE','CITRON',
  // Couleurs
  'ROUGE','BLEU','VERT','JAUNE','BLANC','NOIR','ROSE','VIOLET','ORANGE',
  // Objets
  'LIVRE','STYLO','CAHIER','GOMME','CRAYON','CARTE','LAMPE','HORLOGE','MIROIR',
  // Transports
  'TRAIN','AVION','BATEAU','VOITURE','VELO','METRO','CAMION','FUSEE',
  // Actions
  'COURIR','SAUTER','NAGER','DANSER','CHANTER','DESSINER','CUISINER',
  // Divers
  'MUSIQUE','CINEMA','THEATRE','VOYAGE','VACANCES','WEEKEND','CADEAU','SURPRISE',
];

const DIRS = [
  [0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1],
];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export default class WordSearch extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
    this._gameTimer = null;
  }

  _gameId() { return 'word-search'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    clearInterval(this._gameTimer);
  }

  start(options = {}) {
    clearInterval(this._gameTimer);
    const { gridSize, wordsPerPuzzle, gameDuration } = this.config.gameplay;
    const { grid, placements } = this._buildPuzzle(gridSize, wordsPerPuzzle);
    this.state = {
      ...this._buildFullState(),
      status:   'playing',
      mode:     options.mode ?? 'basique',
      gridSize, grid,
      words:    placements.map(p => ({ ...p, found: false })),
      found:    [],
      score:    0,
      timeLeft: gameDuration,
      selecting: null,
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
    if (!cells || cells.length < 2) { EventBus.emit('game:tick', { state, action: 'deselect' }); return; }

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
    if (len === 0) return null;
    if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
    const sr = dr === 0 ? 0 : dr / Math.abs(dr);
    const sc = dc === 0 ? 0 : dc / Math.abs(dc);
    const cells = [];
    for (let i = 0; i <= len; i++) cells.push([r1 + i * sr, c1 + i * sc]);
    return cells;
  }

  _buildPuzzle(size, count) {
    const grid = Array.from({ length: size }, () => Array(size).fill(''));
    const pool = shuffle([...WORD_POOL]).filter(w => w.length <= size - 2);
    const placements = [];

    for (const word of pool) {
      if (placements.length >= count) break;
      let placed = false;
      for (let t = 0; t < 60 && !placed; t++) {
        const [dr, dc] = randChoice(DIRS);
        const r = randInt(size);
        const c = randInt(size);
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

    // Fill remaining empty cells with random letters (guaranteed varied)
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (!grid[r][c]) grid[r][c] = LETTERS[randInt(26)];

    return { grid, placements };
  }

  _timeUp() {
    clearInterval(this._gameTimer);
    this.state.status = 'over';
    const { best } = ScoreService.submit(this._gameId(), this.state.score);
    EventBus.emit('game:over', {
      result: 'lose', icon: '⏱️', title: 'TEMPS ÉCOULÉ !',
      score: this.state.score, best,
      extraInfo: `<div class="overlay-score">${this.state.words.filter(w => w.found).length}/${this.state.words.length} mots trouvés</div>`,
    });
  }

  _buildFullState() {
    return { status: 'idle', mode: 'basique', gridSize: 0, grid: [], words: [], found: [], score: 0, timeLeft: 0, selecting: null, hoverCell: null };
  }
}
