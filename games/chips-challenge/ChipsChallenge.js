import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

const WALL  = '#';
const FLOOR = ' ';
const CHIP  = 'c';
const DOOR  = 'D';
const PLAYER = '@';

export default class ChipsChallenge extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  _gameId() { return 'chips-challenge'; }

  _buildFullState() {
    return {
      status: 'idle',
      levelIndex: 0,
      grid: [],
      player: { r: 0, c: 0 },
      chipsTotal: 0,
      chipsCollected: 0,
      moves: 0,
      score: 0,
    };
  }

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  start() {
    this.state = { ...this._buildFullState(), status: 'playing', levelIndex: 0 };
    this._loadLevel(0);
    EventBus.emit('game:tick', { state: this.state, action: 'play' });
  }

  _loadLevel(index) {
    const levelDef = this.config.levels[index];
    const grid = levelDef.map.map(row => row.split(''));
    let player = { r: 0, c: 0 };
    let chipsTotal = 0;

    grid.forEach((row, r) => row.forEach((ch, c) => {
      if (ch === PLAYER) { player = { r, c }; grid[r][c] = FLOOR; }
      if (ch === CHIP)   chipsTotal++;
    }));

    this.state.grid           = grid;
    this.state.player         = player;
    this.state.chipsTotal     = chipsTotal;
    this.state.chipsCollected = 0;
    this.state.moves          = 0;
    this.state.levelIndex     = index;
    this.state.levelName      = levelDef.name;
  }

  move(dr, dc) {
    const s = this.state;
    if (s.status !== 'playing') return;

    const { r, c } = s.player;
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= s.grid.length || nc < 0 || nc >= s.grid[0].length) return;

    const dest = s.grid[nr][nc];
    if (dest === WALL) return;
    if (dest === DOOR && s.chipsCollected < s.chipsTotal) return;

    if (dest === CHIP) {
      s.grid[nr][nc] = FLOOR;
      s.chipsCollected++;
    }

    s.player = { r: nr, c: nc };
    s.moves++;

    if (dest === DOOR) {
      this._completeLevel();
      return;
    }

    EventBus.emit('game:tick', { state: s, action: 'move' });
  }

  _completeLevel() {
    const s = this.state;
    const pointsPerLevel = this.config.scoring?.pointsPerLevel ?? 200;
    const penaltyPerMove = this.config.scoring?.penaltyPerMove ?? 1;
    s.score += Math.max(20, pointsPerLevel - s.moves * penaltyPerMove);

    if (s.levelIndex + 1 >= this.config.levels.length) {
      s.status = 'won';
      const { isRecord, best } = ScoreService.submit(this._gameId(), s.score);
      EventBus.emit('game:won', { score: s.score, isRecord, best });
      return;
    }

    this._loadLevel(s.levelIndex + 1);
    s.status = 'playing';
    EventBus.emit('game:tick', { state: s, action: 'next-level' });
  }

  _bindControls() {
    document.addEventListener('keydown', this._onKeyDown);
  }

  _unbindControls() {
    document.removeEventListener('keydown', this._onKeyDown);
  }

  _onKeyDown(e) {
    if (e.key === 'p' || e.key === 'P') { EventBus.emit('game:pause-toggle'); return; }
    if (e.key === 'r' || e.key === 'R') { EventBus.emit('game:restart'); return; }
    if (this.state.status !== 'playing') return;
    if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') { e.preventDefault(); this.move(-1, 0); }
    if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') { e.preventDefault(); this.move(1, 0);  }
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') { e.preventDefault(); this.move(0, -1); }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); this.move(0, 1);  }
  }

  restart() {
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    this._unbindControls();
    super.destroy();
  }
}
