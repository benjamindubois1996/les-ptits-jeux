import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import { randInt }  from '../../js/utils/Random.js';

const TOTAL_LEVELS = 8;
const BASE_SIZE     = 7;
const SIZE_STEP      = 2;

function generateMaze(size) {
  const cells = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ top: true, bottom: true, left: true, right: true, visited: false }))
  );

  const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const stack = [{ r: 0, c: 0 }];
  cells[0][0].visited = true;

  while (stack.length) {
    const { r, c } = stack[stack.length - 1];
    const candidates = [];
    if (r > 0          && !cells[r - 1][c].visited) candidates.push({ r: r - 1, c, dir: 'top' });
    if (r < size - 1    && !cells[r + 1][c].visited) candidates.push({ r: r + 1, c, dir: 'bottom' });
    if (c > 0          && !cells[r][c - 1].visited) candidates.push({ r, c: c - 1, dir: 'left' });
    if (c < size - 1    && !cells[r][c + 1].visited) candidates.push({ r, c: c + 1, dir: 'right' });

    if (candidates.length === 0) { stack.pop(); continue; }

    const next = candidates[randInt(candidates.length)];
    cells[r][c][next.dir] = false;
    cells[next.r][next.c][opposite[next.dir]] = false;
    cells[next.r][next.c].visited = true;
    stack.push({ r: next.r, c: next.c });
  }

  return cells;
}

export default class Labyrinthe extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  _gameId() { return 'labyrinthe'; }

  _buildFullState() {
    return {
      status: 'idle',
      levelIndex: 0,
      size: BASE_SIZE,
      cells: null,
      player: { r: 0, c: 0 },
      exit: { r: 0, c: 0 },
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
    const size = BASE_SIZE + index * SIZE_STEP;
    this.state.size   = size;
    this.state.cells  = generateMaze(size);
    this.state.player = { r: 0, c: 0 };
    this.state.exit   = { r: size - 1, c: size - 1 };
    this.state.moves  = 0;
    this.state.levelIndex = index;
  }

  move(dr, dc) {
    const s = this.state;
    if (s.status !== 'playing') return;

    const { r, c } = s.player;
    const cell = s.cells[r][c];
    let blocked = false;
    if (dr === -1 && cell.top)    blocked = true;
    if (dr === 1  && cell.bottom) blocked = true;
    if (dc === -1 && cell.left)   blocked = true;
    if (dc === 1  && cell.right)  blocked = true;
    if (blocked) return;

    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= s.size || nc < 0 || nc >= s.size) return;

    s.player = { r: nr, c: nc };
    s.moves++;

    if (nr === s.exit.r && nc === s.exit.c) {
      this._completeLevel();
      return;
    }

    EventBus.emit('game:tick', { state: s, action: 'move' });
  }

  _completeLevel() {
    const s = this.state;
    const pointsPerLevel = this.config.scoring?.pointsPerLevel ?? 200;
    const penaltyPerMove = this.config.scoring?.penaltyPerMove ?? 1;
    const minMoves = (s.size - 1) * 2;
    const penalty  = Math.max(0, s.moves - minMoves) * penaltyPerMove;
    s.score += Math.max(20, pointsPerLevel - penalty);

    if (s.levelIndex + 1 >= TOTAL_LEVELS) {
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
