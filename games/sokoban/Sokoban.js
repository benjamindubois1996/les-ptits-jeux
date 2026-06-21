import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// Map symbols: # wall, ' ' floor, @ player, $ box, . target, * box-on-target, + player-on-target
const WALL   = '#';
const FLOOR  = ' ';
const PLAYER = '@';
const BOX    = '$';
const TARGET = '.';
const BOX_ON = '*';
const PLR_ON = '+';

export default class Sokoban extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
  }

  _gameId() { return 'sokoban'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick', { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); }

  start(options = {}) {
    const mode = options.mode ?? 'basique';
    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode,
      levelIndex: 0,
    };
    this._loadLevel(0);
  }

  restart() {
    const idx = this.state.levelIndex ?? 0;
    this.state = { ...this._buildFullState(), status: 'idle', levelIndex: idx };
    this._loadLevel(idx);
    this.state.status = 'playing';
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  move(dr, dc) {
    const { grid, player } = this.state;
    if (this.state.status !== 'playing') return;

    const nr = player.r + dr;
    const nc = player.c + dc;
    if (!this._inBounds(nr, nc)) return;
    const dest = grid[nr][nc];
    if (dest === WALL) return;

    if (dest === BOX || dest === BOX_ON) {
      const br = nr + dr;
      const bc = nc + dc;
      if (!this._inBounds(br, bc)) return;
      const beyond = grid[br][bc];
      if (beyond === WALL || beyond === BOX || beyond === BOX_ON) return;
      this._saveUndo();
      grid[br][bc] = (beyond === TARGET) ? BOX_ON : BOX;
      grid[nr][nc] = (dest === BOX_ON) ? TARGET : FLOOR;
    } else {
      this._saveUndo();
    }

    const curCell = grid[player.r][player.c];
    grid[player.r][player.c] = (curCell === PLR_ON) ? TARGET : FLOOR;
    grid[nr][nc] = (grid[nr][nc] === TARGET) ? PLR_ON : PLAYER;
    this.state.player = { r: nr, c: nc };
    this.state.moves++;

    const pts = Math.max(0, this.config.scoring.pointsPerLevel - this.state.moves * this.config.scoring.penaltyPerMove);
    EventBus.emit('game:score-update', { score: this.state.score });
    EventBus.emit('game:tick', { state: this.state, action: 'move' });

    if (this._isLevelComplete()) {
      this.state.score += pts;
      this._nextLevel();
    }
  }

  undo() {
    if (!this.state.history.length) return;
    const snap = this.state.history.pop();
    this.state.grid   = snap.grid;
    this.state.player = snap.player;
    this.state.moves  = snap.moves;
    EventBus.emit('game:tick', { state: this.state, action: 'undo' });
  }

  _saveUndo() {
    this.state.history.push({
      grid:   this.state.grid.map(r => [...r]),
      player: { ...this.state.player },
      moves:  this.state.moves,
    });
    if (this.state.history.length > 50) this.state.history.shift();
  }

  _isLevelComplete() {
    return !this.state.grid.some(row => row.includes(BOX));
  }

  _nextLevel() {
    const levels = this.config.levels;
    const next   = this.state.levelIndex + 1;
    if (next >= levels.length) {
      this.state.status = 'won';
      ScoreService.submit(this._gameId(), this.state.score);
      EventBus.emit('game:won', {
        result: 'win', icon: '📦', title: 'TERMINÉ !',
        score: this.state.score,
        best:  ScoreService.getBest(this._gameId()),
      });
    } else {
      this.state.levelIndex = next;
      this._loadLevel(next);
      EventBus.emit('game:tick', { state: this.state, action: 'next-level' });
    }
  }

  _loadLevel(index) {
    const levelDef = this.config.levels[index];
    const rawMap   = levelDef.map;
    const grid     = rawMap.map(row => row.split(''));
    let player     = { r: 0, c: 0 };
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c] === PLAYER || grid[r][c] === PLR_ON) player = { r, c };
      }
    }
    this.state.grid    = grid;
    this.state.player  = player;
    this.state.moves   = 0;
    this.state.history = [];
    this.state.levelName = levelDef.name;
    EventBus.emit('game:score-update', { score: this.state.score });
  }

  _inBounds(r, c) {
    return r >= 0 && r < this.state.grid.length &&
           c >= 0 && c < this.state.grid[r].length;
  }

  _buildFullState() {
    return {
      status:     'loading',
      mode:       'basique',
      levelIndex: 0,
      levelName:  '',
      grid:       [],
      player:     { r: 0, c: 0 },
      moves:      0,
      score:      0,
      history:    [],
    };
  }
}
