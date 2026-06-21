import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// 144 tuiles : 4 copies × 34 types + 4 fleurs + 4 saisons (simplifiées en paires)
// On utilise 36 types uniques × 4 = 144 tuiles
const TILE_TYPES = 36; // types 0-35 (9 bambous, 9 cercles, 9 caractères, 4 vents, 3 dragons, 2 groupes spéciaux)

// Turtle layout : [col, row, layer] — layout classique Mahjong Solitaire (simplified)
function buildTurtleLayout() {
  const positions = [];
  // Layers from bottom (0) to top (max)
  // Layer 0 : 8×4 base rows
  const base = [
    [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],
    [0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],
    [0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],
    [0,5],[1,5],[2,5],[3,5],[4,5],[5,5],[6,5],[7,5],
    // wings
    [-1,3],[-1,4],[8,3],[8,4],
    // center top & bottom
    [3,1],[4,1],[3,6],[4,6],
  ];
  base.forEach(([c,r]) => positions.push({ c, r, layer: 0 }));

  // Layer 1 : 6×2 interior
  [
    [1,2],[2,2],[3,2],[4,2],[5,2],[6,2],
    [1,3],[2,3],[3,3],[4,3],[5,3],[6,3],
    [1,4],[2,4],[3,4],[4,4],[5,4],[6,4],
    [1,5],[2,5],[3,5],[4,5],[5,5],[6,5],
  ].forEach(([c,r]) => positions.push({ c, r, layer: 1 }));

  // Layer 2 : 4×2
  [
    [2,2],[3,2],[4,2],[5,2],
    [2,3],[3,3],[4,3],[5,3],
    [2,4],[3,4],[4,4],[5,4],
    [2,5],[3,5],[4,5],[5,5],
  ].forEach(([c,r]) => positions.push({ c, r, layer: 2 }));

  // Layer 3 : 2×2 center
  [
    [3,3],[4,3],[3,4],[4,4],
  ].forEach(([c,r]) => positions.push({ c, r, layer: 3 }));

  // Layer 4 : 1 top
  positions.push({ c: 3, r: 3, layer: 4 });

  return positions;
}

export default class Mahjong extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
  }

  _gameId() { return 'mahjong'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick', { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); }

  start(options = {}) {
    const mode = options.mode ?? 'basique';
    const layout = buildTurtleLayout();
    const tiles  = this._assignTiles(layout);
    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode, layout, tiles,
      selected: null,
      pairsRemoved: 0,
      totalPairs: Math.floor(tiles.length / 2),
    };
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  selectTile(tileId) {
    const { state } = this;
    if (state.status !== 'playing') return;

    const tile = state.tiles.find(t => t.id === tileId && !t.removed);
    if (!tile || !this._isFree(tile)) return;

    if (state.selected === null) {
      state.selected = tileId;
      EventBus.emit('game:tick', { state, action: 'select' });
      return;
    }

    if (state.selected === tileId) {
      state.selected = null;
      EventBus.emit('game:tick', { state, action: 'deselect' });
      return;
    }

    const prev = state.tiles.find(t => t.id === state.selected);
    if (prev && prev.type === tile.type) {
      prev.removed = true;
      tile.removed = true;
      state.selected = null;
      state.pairsRemoved++;
      const score = state.pairsRemoved * this.config.scoring.pointsPerPair;
      EventBus.emit('game:score-update', { score });
      EventBus.emit('game:tick', { state, action: 'match' });

      if (state.pairsRemoved >= state.totalPairs) {
        state.status = 'won';
        ScoreService.submit(this._gameId(), score);
        EventBus.emit('game:won', {
          result: 'win', icon: '🀄', title: 'MAHJONG !',
          score, best: ScoreService.getBest(this._gameId()),
        });
      } else if (!this._hasValidMoves()) {
        state.status = 'gameover';
        EventBus.emit('game:over', {
          result: 'lose', icon: '🀄', title: 'BLOQUÉ !',
          score, best: ScoreService.getBest(this._gameId()),
        });
      }
    } else {
      state.selected = tileId;
      EventBus.emit('game:tick', { state, action: 'select' });
    }
  }

  _isFree(tile) {
    const { tiles } = this.state;
    const active = tiles.filter(t => !t.removed);

    // Not blocked from above
    const blockedAbove = active.some(t =>
      t.id !== tile.id &&
      t.layer === tile.layer + 1 &&
      Math.abs(t.c - tile.c) < 1 &&
      Math.abs(t.r - tile.r) < 1
    );
    if (blockedAbove) return false;

    // Not blocked on both left and right
    const leftBlocked  = active.some(t => t.id !== tile.id && t.layer === tile.layer && t.c === tile.c - 1 && Math.abs(t.r - tile.r) < 1);
    const rightBlocked = active.some(t => t.id !== tile.id && t.layer === tile.layer && t.c === tile.c + 1 && Math.abs(t.r - tile.r) < 1);
    if (leftBlocked && rightBlocked) return false;

    return true;
  }

  _hasValidMoves() {
    const free = this.state.tiles.filter(t => !t.removed && this._isFree(t));
    for (let i = 0; i < free.length; i++)
      for (let j = i + 1; j < free.length; j++)
        if (free[i].type === free[j].type) return true;
    return false;
  }

  _assignTiles(layout) {
    const count   = layout.length;
    const pairs   = Math.floor(count / 2);
    const types   = [];
    for (let i = 0; i < pairs; i++) types.push(i % TILE_TYPES, i % TILE_TYPES);
    // Shuffle
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    return layout.map((pos, idx) => ({
      id: idx, ...pos, type: types[idx] ?? 0, removed: false,
    }));
  }

  _buildFullState() {
    return {
      status:       'loading',
      mode:         'basique',
      tiles:        [],
      layout:       [],
      selected:     null,
      pairsRemoved: 0,
      totalPairs:   0,
    };
  }
}
