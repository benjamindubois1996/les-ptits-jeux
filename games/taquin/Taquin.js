import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import { randChoice } from '../../js/utils/Random.js';

export default class Taquin extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
  }

  _gameId() { return 'taquin'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); }

  start(options = {}) {
    const size  = this.config.gameplay.size;
    const tiles = this._generatePuzzle(size);
    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode:   options.mode ?? 'basique',
      size,
      tiles,
      moves:  0,
      score:  0,
    };
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  slideAt(r, c) {
    const { state } = this;
    if (state.status !== 'playing') return;
    const emptyIdx = state.tiles.indexOf(0);
    const er       = Math.floor(emptyIdx / state.size);
    const ec       = emptyIdx % state.size;

    if (r === er && c !== ec) {
      // Slide tiles in the same row toward the empty cell
      const step = c < ec ? 1 : -1;
      for (let col = ec; col !== c; col -= step) {
        const a = er * state.size + col;
        const b = er * state.size + (col - step);
        [state.tiles[a], state.tiles[b]] = [state.tiles[b], state.tiles[a]];
      }
      state.moves++;
      EventBus.emit('game:tick', { state, action: 'move' });
      if (this._isSolved(state.tiles)) this._win();
    } else if (c === ec && r !== er) {
      // Slide tiles in the same column toward the empty cell
      const step = r < er ? 1 : -1;
      for (let row = er; row !== r; row -= step) {
        const a = row * state.size + ec;
        const b = (row - step) * state.size + ec;
        [state.tiles[a], state.tiles[b]] = [state.tiles[b], state.tiles[a]];
      }
      state.moves++;
      EventBus.emit('game:tick', { state, action: 'move' });
      if (this._isSolved(state.tiles)) this._win();
    }
  }

  _isSolved(tiles) {
    return tiles.every((v, i) => v === (i < tiles.length - 1 ? i + 1 : 0));
  }

  // Génère un puzzle garanti soluble en mélangeant depuis l'état résolu
  // par des mouvements valides aléatoires (anti-backtrack pour éviter les cycles).
  _generatePuzzle(size) {
    const tiles = Array.from({ length: size * size }, (_, i) => (i < size * size - 1 ? i + 1 : 0));
    let emptyIdx = size * size - 1;
    let prev = -1; // dernier position de la case vide — évite le backtrack immédiat

    const moves = this.config.gameplay.shuffleMoves;
    for (let k = 0; k < moves; k++) {
      const neighbors = this._getNeighbors(emptyIdx, size).filter(n => n !== prev);
      const next = randChoice(neighbors.length ? neighbors : this._getNeighbors(emptyIdx, size));
      [tiles[emptyIdx], tiles[next]] = [tiles[next], tiles[emptyIdx]];
      prev     = emptyIdx;
      emptyIdx = next;
    }

    // Si par malchance on revient à l'état résolu, on relance
    if (this._isSolved(tiles)) return this._generatePuzzle(size);

    return tiles;
  }

  _getNeighbors(idx, size) {
    const r = Math.floor(idx / size), c = idx % size;
    const n = [];
    if (r > 0)        n.push((r - 1) * size + c);
    if (r < size - 1) n.push((r + 1) * size + c);
    if (c > 0)        n.push(r * size + (c - 1));
    if (c < size - 1) n.push(r * size + (c + 1));
    return n;
  }

  _win() {
    this.state.status = 'won';
    const score = Math.max(0,
      this.config.scoring.baseBonus
      - this.state.moves * this.config.scoring.movePenalty
    );
    this.state.score = score;
    const { best } = ScoreService.submit(this._gameId(), score);
    EventBus.emit('game:won', {
      result: 'win', icon: '🧩', title: 'RÉSOLU !',
      score, best,
      extraInfo: `<div class="overlay-score">En ${this.state.moves} coups</div>`,
    });
  }

  _buildFullState() {
    return { status: 'idle', mode: 'basique', size: this.config.gameplay.size, tiles: [], moves: 0, score: 0 };
  }
}
