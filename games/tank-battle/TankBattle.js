import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';

// Tuiles : 0=vide, 1=brique, 2=acier
const COLS = 17, ROWS = 13;
const TILE = 0, BRICK = 1, STEEL = 2;

const BASE_MAP = [
  [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
  [2,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,2],
  [2,0,1,1,0,1,0,0,0,1,0,0,0,1,1,0,2],
  [2,0,0,0,0,1,1,2,2,1,1,0,0,0,0,0,2],
  [2,1,0,1,0,0,0,2,0,2,0,0,0,1,0,1,2],
  [2,0,0,1,1,0,0,2,0,2,0,0,1,1,0,0,2],
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
  [2,0,0,1,1,0,0,2,0,2,0,0,1,1,0,0,2],
  [2,1,0,1,0,0,0,2,0,2,0,0,0,1,0,1,2],
  [2,0,0,0,0,1,1,2,2,1,1,0,0,0,0,0,2],
  [2,0,1,1,0,1,0,0,0,1,0,0,0,1,1,0,2],
  [2,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,2],
  [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
];

const DIRS = {
  UP:    { dx: 0, dy: -1, angle: -Math.PI / 2 },
  DOWN:  { dx: 0, dy:  1, angle:  Math.PI / 2 },
  LEFT:  { dx: -1, dy: 0, angle:  Math.PI },
  RIGHT: { dx:  1, dy: 0, angle: 0 },
};
const DIR_KEYS = Object.keys(DIRS);
const BULLET_SPEED = 8; // tuiles/s
const PLAYER_SPEED = 3.5; // tuiles/s
const ENEMY_SPEED  = 2.0;
const FIRE_COOLDOWN = 600;  // ms
const ENEMY_FIRE_CD = 1200;
const ENEMY_MOVE_CD = 400;
const MAX_BULLETS = 3;

function cloneMap() { return BASE_MAP.map(row => [...row]); }

function tileFree(map, col, row) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
  return map[row][col] === TILE;
}

// Tank positions en tuiles (flottant)
function mkTank(col, row, dir, lives) {
  return { col: col + 0.5, row: row + 0.5, dir, lives, speed: 0, fireMs: 0 };
}

export default class TankBattle extends BaseGame {
  constructor(config) {
    super(config);
    this.state     = null;
    this._loop     = new GameLoop(this._tick.bind(this));
    this._lastTick = null;
    this._keys     = new Set();
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
  }

  _gameId() { return 'tank-battle'; }

  _buildFullState() {
    return {
      status: 'idle',
      map:    cloneMap(),
      player: mkTank(1, 1, 'RIGHT', 3),
      enemy:  mkTank(COLS - 3, ROWS - 3, 'LEFT', 3),
      bullets: [],   // { col, row, dx, dy, owner:'player'|'enemy', dist }
      score:  0,
      enemyMoveMs: 0,
      enemyThinkMs: 0,
    };
  }

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state = this._buildFullState();
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  _bindControls() {
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup',   this._onKeyUp);
  }

  _unbindControls() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup',   this._onKeyUp);
  }

  _onKeyDown(e) {
    this._keys.add(e.key);
    if (e.key === 'p' || e.key === 'P') EventBus.emit('game:pause-toggle');
    if (e.key === 'r' || e.key === 'R') EventBus.emit('game:restart');
    if ([' ', 'ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
  }

  _onKeyUp(e) { this._keys.delete(e.key); }

  start() {
    const s = this.state;
    s.status = 'playing';
    this._lastTick = null;
    this._loop.start(16);
    EventBus.emit('game:tick', { state: s, action: 'play' });
  }

  _tick() {
    const now = performance.now();
    if (this._lastTick === null) this._lastTick = now;
    const dt = Math.min(now - this._lastTick, 50);
    this._lastTick = now;

    const s = this.state;
    if (s.status !== 'playing') return;

    this._movePlayer(s, dt);
    this._playerFire(s, dt);
    this._moveEnemy(s, dt);
    this._enemyAI(s, dt);
    this._moveBullets(s, dt);
    this._checkWin(s);

    EventBus.emit('game:tick', { state: s, action: 'tick' });
  }

  _movePlayer(s, dt) {
    const tank = s.player;
    tank.fireMs = Math.max(0, tank.fireMs - dt);

    let newDir = null;
    if (this._keys.has('ArrowUp')    || this._keys.has('w') || this._keys.has('W')) newDir = 'UP';
    if (this._keys.has('ArrowDown')  || this._keys.has('s') || this._keys.has('S')) newDir = 'DOWN';
    if (this._keys.has('ArrowLeft')  || this._keys.has('a') || this._keys.has('A')) newDir = 'LEFT';
    if (this._keys.has('ArrowRight') || this._keys.has('d') || this._keys.has('D')) newDir = 'RIGHT';

    if (newDir) {
      const d = DIRS[newDir];
      const nc = tank.col + d.dx * PLAYER_SPEED * (dt / 1000);
      const nr = tank.row + d.dy * PLAYER_SPEED * (dt / 1000);
      if (this._canMove(s.map, nc, nr, s.enemy)) {
        tank.col = nc;
        tank.row = nr;
      }
      tank.dir = newDir;
    }
  }

  _playerFire(s, dt) {
    if (!this._keys.has(' ')) return;
    const tank = s.player;
    if (tank.fireMs > 0) return;
    const own = s.bullets.filter(b => b.owner === 'player');
    if (own.length >= MAX_BULLETS) return;
    const d = DIRS[tank.dir];
    s.bullets.push({ col: tank.col, row: tank.row, dx: d.dx, dy: d.dy, owner: 'player', dist: 0 });
    tank.fireMs = FIRE_COOLDOWN;
  }

  _canMove(map, nc, nr, other) {
    const r  = 0.38; // rayon du tank en tuiles
    const corners = [
      { c: nc - r, r: nr - r }, { c: nc + r, r: nr - r },
      { c: nc - r, r: nr + r }, { c: nc + r, r: nr + r },
    ];
    for (const pt of corners) {
      const tc = Math.floor(pt.c), tr = Math.floor(pt.r);
      if (tc < 0 || tc >= COLS || tr < 0 || tr >= ROWS) return false;
      if (map[tr][tc] !== TILE) return false;
    }
    // Collision avec l'autre tank
    const dx = nc - other.col, dy = nr - other.row;
    if (Math.abs(dx) < 0.85 && Math.abs(dy) < 0.85) return false;
    return true;
  }

  _moveBullets(s, dt) {
    const speed = BULLET_SPEED * (dt / 1000);
    for (let i = s.bullets.length - 1; i >= 0; i--) {
      const b = s.bullets[i];
      b.col += b.dx * speed;
      b.row += b.dy * speed;
      b.dist += speed;

      const tc = Math.floor(b.col), tr = Math.floor(b.row);

      // Hors carte
      if (tc < 0 || tc >= COLS || tr < 0 || tr >= ROWS) { s.bullets.splice(i, 1); continue; }

      const tile = s.map[tr][tc];
      if (tile === BRICK) { s.map[tr][tc] = TILE; s.bullets.splice(i, 1); continue; }
      if (tile === STEEL) { s.bullets.splice(i, 1); continue; }

      // Hit tank ennemi ou joueur
      const target = b.owner === 'player' ? s.enemy : s.player;
      if (Math.abs(b.col - target.col) < 0.5 && Math.abs(b.row - target.row) < 0.5) {
        target.lives--;
        s.bullets.splice(i, 1);
        if (b.owner === 'player') {
          s.score += 500;
          ScoreService.update(this._gameId(), s.score);
          if (target.lives <= 0) {
            s.score += 2000;
            ScoreService.update(this._gameId(), s.score);
            s.status = 'won';
            this._loop.stop();
            const best = ScoreService.update(this._gameId(), s.score);
            EventBus.emit('game:won', { score: s.score, best });
            return;
          }
        } else if (target.lives <= 0) {
          s.status = 'over';
          this._loop.stop();
          const best = ScoreService.update(this._gameId(), s.score);
          EventBus.emit('game:over', { score: s.score, best });
          return;
        }
      }
    }
  }

  _moveEnemy(s, dt) {
    const tank = s.enemy;
    tank.fireMs = Math.max(0, tank.fireMs - dt);
    s.enemyMoveMs -= dt;
    if (s.enemyMoveMs > 0) return;
    s.enemyMoveMs = ENEMY_MOVE_CD;

    const d = DIRS[tank.dir];
    const nc = tank.col + d.dx * ENEMY_SPEED * (ENEMY_MOVE_CD / 1000);
    const nr = tank.row + d.dy * ENEMY_SPEED * (ENEMY_MOVE_CD / 1000);
    if (this._canMove(s.map, nc, nr, s.player)) {
      tank.col = nc;
      tank.row = nr;
    } else {
      // Choisir nouvelle direction
      this._enemyPickDir(s);
    }
  }

  _enemyPickDir(s) {
    const tank = s.enemy;
    const p    = s.player;
    const dx = p.col - tank.col;
    const dy = p.row - tank.row;

    // Préférer la direction vers le joueur
    let preferred;
    if (Math.abs(dx) > Math.abs(dy)) {
      preferred = dx > 0 ? 'RIGHT' : 'LEFT';
    } else {
      preferred = dy > 0 ? 'DOWN' : 'UP';
    }

    // Essayer preferred d'abord, puis autres
    const dirs = [preferred, ...DIR_KEYS.filter(k => k !== preferred)].sort(() => Math.random() - 0.35);
    for (const dir of dirs) {
      const d = DIRS[dir];
      const nc = tank.col + d.dx, nr = tank.row + d.dy;
      if (this._canMove(s.map, nc, nr, s.player)) {
        tank.dir = dir;
        break;
      }
    }
  }

  _enemyAI(s, dt) {
    const tank = s.enemy;
    s.enemyThinkMs -= dt;
    if (s.enemyThinkMs > 0) return;
    s.enemyThinkMs = ENEMY_FIRE_CD + Math.random() * 400;

    // Re-orienter vers joueur et tirer
    this._enemyPickDir(s);

    if (tank.fireMs <= 0) {
      const own = s.bullets.filter(b => b.owner === 'enemy');
      if (own.length < 2) {
        const d = DIRS[tank.dir];
        s.bullets.push({ col: tank.col, row: tank.row, dx: d.dx, dy: d.dy, owner: 'enemy', dist: 0 });
        tank.fireMs = ENEMY_FIRE_CD;
      }
    }
  }

  _checkWin(s) {
    if (s.player.lives <= 0 && s.status === 'playing') {
      s.status = 'over';
      this._loop.stop();
      const best = ScoreService.update(this._gameId(), s.score);
      EventBus.emit('game:over', { score: s.score, best });
    }
  }

  restart() {
    this._loop.stop();
    this._keys.clear();
    this.state = this._buildFullState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  destroy() {
    this._loop.stop();
    this._unbindControls();
    super.destroy();
  }
}
