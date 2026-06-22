import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import { randInt }  from '../../js/utils/Random.js';

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

  move(tileIdx) {
    const { state } = this;
    if (state.status !== 'playing') return;
    const emptyIdx = state.tiles.indexOf(0);
    if (!this._adjacent(tileIdx, emptyIdx, state.size)) return;

    [state.tiles[tileIdx], state.tiles[emptyIdx]] = [state.tiles[emptyIdx], state.tiles[tileIdx]];
    state.moves++;
    EventBus.emit('game:tick', { state, action: 'move' });

    if (this._isSolved(state.tiles)) this._win();
  }

  slideAt(r, c) {
    const { state } = this;
    if (state.status !== 'playing') return;
    const idx      = r * state.size + c;
    const emptyIdx = state.tiles.indexOf(0);
    const er       = Math.floor(emptyIdx / state.size);
    const ec       = emptyIdx % state.size;

    // Slide entire row or column toward empty
    if (r === er && c !== ec) {
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

  _adjacent(i, j, size) {
    const ri = Math.floor(i / size), ci = i % size;
    const rj = Math.floor(j / size), cj = j % size;
    return (ri === rj && Math.abs(ci - cj) === 1) || (ci === cj && Math.abs(ri - rj) === 1);
  }

  _isSolved(tiles) {
    return tiles.every((v, i) => v === (i < tiles.length - 1 ? i + 1 : 0));
  }

  _generatePuzzle(size) {
    const tiles = Array.from({ length: size * size }, (_, i) => (i < size * size - 1 ? i + 1 : 0));
    // Shuffle via random valid moves from solved state
    let emptyIdx = size * size - 1;
    for (let k = 0; k < this.config.gameplay.shuffleMoves; k++) {
      const neighbors = this._getNeighbors(emptyIdx, size);
      const next      = neighbors[randInt(0, neighbors.length - 1)];
      [tiles[emptyIdx], tiles[next]] = [tiles[next], tiles[emptyIdx]];
      emptyIdx = next;
    }
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
    const sc = this.config.gameplay;
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
