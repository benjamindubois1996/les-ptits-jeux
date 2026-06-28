import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';

// Each puzzle: grid = array of strings (# = black), words = [{r,c,dir,answer,clue}]
const PUZZLES = [
  {
    title: "Grille 1",
    rows: 6, cols: 5,
    grid: ["MER##", "A####", "ROBE#", "E##L#", "#PLAN", "###N#"],
    words: [
      { r:0, c:0, dir:'A', answer:'MER',  clue:'Étendue salée' },
      { r:2, c:0, dir:'A', answer:'ROBE', clue:'Vêtement féminin' },
      { r:4, c:1, dir:'A', answer:'PLAN', clue:'Dessin ou stratégie' },
      { r:0, c:0, dir:'D', answer:'MARE', clue:'Petite étendue d\'eau' },
      { r:2, c:3, dir:'D', answer:'ELAN', clue:'Enthousiasme' },
    ],
  },
  {
    title: "Grille 2",
    rows: 6, cols: 6,
    grid: ["#CARPE", "#ACIDE", "CHAT##", "#I####", "BEAU##", "#R####"],
    words: [
      { r:0, c:1, dir:'A', answer:'CARPE', clue:'Poisson d\'eau douce' },
      { r:1, c:1, dir:'A', answer:'ACIDE', clue:'Goût âcre' },
      { r:2, c:0, dir:'A', answer:'CHAT',  clue:'Félin domestique' },
      { r:4, c:0, dir:'A', answer:'BEAU',  clue:'Joli, magnifique' },
      { r:0, c:1, dir:'D', answer:'CAHIER',clue:'Bloc de feuilles' },
    ],
  },
  {
    title: "Grille 3",
    rows: 4, cols: 7,
    grid: ["##RADE#", "###B###", "#JARDIN", "#NAIN##"],
    words: [
      { r:0, c:2, dir:'A', answer:'RADE',   clue:'Mouillage naturel' },
      { r:2, c:1, dir:'A', answer:'JARDIN', clue:'Espace vert cultivé' },
      { r:3, c:1, dir:'A', answer:'NAIN',   clue:'Être très petit' },
      { r:0, c:3, dir:'D', answer:'ABRI',   clue:'Refuge protecteur' },
    ],
  },
];

export default class MiniMotsCroises extends BaseGame {
  constructor(config) {
    super(config);
    this.state = null;
    this._loop = new GameLoop(() => this._tick());
    this._nextPuzzleTimeout = null;
  }

  _gameId() { return 'mini-mots-croises'; }

  async init() {
    this._setupEventBusBindings();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); this._loop.destroy(); }

  start(options = {}) {
    this._loop.stop();
    this.state = this._buildFullState();
    this.state.status = 'playing';
    this.state.puzzleIdx = 0;
    this._loadPuzzle(0);
    this._loop.start(1000);
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  restart() {
    this._loop.stop();
    clearTimeout(this._nextPuzzleTimeout);
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  { this._loop.stop(); }
  _onResume() { this._loop.start(1000); }

  _tick() {
    const s = this.state;
    if (s.status !== 'playing') return;
    s.elapsed++;
    EventBus.emit('game:tick', { state: s, action: 'timer' });
  }

  _loadPuzzle(idx) {
    clearTimeout(this._nextPuzzleTimeout);
    const s = this.state;
    const p = PUZZLES[idx];
    s.puzzle    = p;
    s.userGrid  = p.grid.map(row => row.split('').map(ch => ch === '#' ? '#' : ''));
    s.selected  = null;
    s.selWord   = null;
    s.numbered  = this._computeNumbers(p);
  }

  _computeNumbers(p) {
    const nums = {};
    let n = 1;
    for (let r = 0; r < p.rows; r++) {
      for (let c = 0; c < p.cols; c++) {
        if (p.grid[r][c] === '#') continue;
        const startsA = (c === 0 || p.grid[r][c-1] === '#') && c+1 < p.cols && p.grid[r][c+1] !== '#';
        const startsD = (r === 0 || p.grid[r-1]?.[c] === '#') && r+1 < p.rows && p.grid[r+1]?.[c] !== '#';
        if (startsA || startsD) nums[`${r},${c}`] = n++;
      }
    }
    return nums;
  }

  typeChar(r, c, ch) {
    const s = this.state;
    if (s.status !== 'playing') return;
    if (s.puzzle.grid[r][c] === '#') return;
    s.userGrid[r][c] = ch.toUpperCase();
    EventBus.emit('game:tick', { state: s, action: 'type' });
    this._checkComplete();
  }

  clearCell(r, c) {
    const s = this.state;
    if (s.puzzle.grid[r][c] === '#') return;
    s.userGrid[r][c] = '';
    EventBus.emit('game:tick', { state: s, action: 'type' });
  }

  select(r, c) {
    const s = this.state;
    if (s.status !== 'playing') return;
    if (s.puzzle.grid[r][c] === '#') return;
    if (s.selected?.[0] === r && s.selected?.[1] === c) {
      const other = s.selDir === 'A' ? 'D' : 'A';
      if (this._wordAt(r, c, other)) s.selDir = other;
    }
    s.selected = [r, c];
    s.selWord  = this._wordAt(r, c, s.selDir);
    if (!s.selWord) {
      s.selDir = s.selDir === 'A' ? 'D' : 'A';
      s.selWord = this._wordAt(r, c, s.selDir);
    }
    EventBus.emit('game:tick', { state: s, action: 'select' });
  }

  _wordAt(r, c, dir) {
    const p = this.state.puzzle;
    return p.words.find(w => {
      if (w.dir !== dir) return false;
      if (dir === 'A') return w.r === r && c >= w.c && c < w.c + w.answer.length;
      return w.c === c && r >= w.r && r < w.r + w.answer.length;
    }) ?? null;
  }

  _checkComplete() {
    const s = this.state;
    const p = s.puzzle;
    const allCorrect = p.words.every(w =>
      w.answer.split('').every((ch, i) => {
        const [wr, wc] = w.dir === 'A' ? [w.r, w.c + i] : [w.r + i, w.c];
        return s.userGrid[wr]?.[wc] === ch;
      })
    );
    if (!allCorrect) return;
    if (s.completedPuzzles.has(s.puzzleIdx)) return;

    s.completedPuzzles.add(s.puzzleIdx);
    s.score += s.config?.scoring?.bonusComplete ?? 100;
    s.score += p.words.reduce((sum, w) => sum + w.answer.length, 0) * (s.config?.scoring?.perLetter ?? 5);

    if (s.puzzleIdx < PUZZLES.length - 1) {
      s.puzzleIdx++;
      this._nextPuzzleTimeout = setTimeout(() => {
        this._loadPuzzle(s.puzzleIdx);
        EventBus.emit('game:tick', { state: s, action: 'next-puzzle' });
      }, 800);
    } else {
      this._win();
    }
  }

  _win() {
    const s = this.state;
    s.status = 'won';
    this._loop.stop();
    const { best, isRecord } = ScoreService.submit(this._gameId(), s.score);
    EventBus.emit('game:won', {
      result: 'win', icon: '📝', title: 'GRILLES COMPLÈTES !',
      score: s.score, best, isRecord,
      extraInfo: `<div class="overlay-score">${PUZZLES.length} grilles résolues en ${s.elapsed}s</div>`,
    });
  }

  _buildFullState() {
    return {
      status: 'idle', score: 0, elapsed: 0,
      puzzleIdx: 0, puzzle: null, userGrid: [],
      selected: null, selDir: 'A', selWord: null, numbered: {},
      completedPuzzles: new Set(),
      config: this.config,
    };
  }
}
