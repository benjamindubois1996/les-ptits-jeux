import EventBus     from '../../js/core/EventBus.js';
import ScoreService  from '../../js/services/ScoreService.js';
import BaseGame      from '../../js/core/BaseGame.js';
import { randInt }   from '../../js/utils/Random.js';

// Cell types
const EMPTY = 0, HARD = 1, SOFT = 2, EXIT = 3;
// Power-up types
const PU_BOMB = 'bomb', PU_RANGE = 'range', PU_SPEED = 'speed';

export default class Bomberman extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = this._buildFullState();
    this._loopId = null;
    this._last   = 0;
  }

  _gameId() { return 'bomberman'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); this._stopLoop(); }

  start(options = {}) {
    this.state        = this._buildFullState();
    this.state.status = 'playing';
    this.state.mode   = options.mode ?? 'basique';
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
    this._startLoop();
  }

  restart() {
    this._stopLoop();
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  { this._stopLoop(); }
  _onResume() { this._startLoop(); }

  // Input: direction (-1/0/1 for row/col delta)
  move(dc, dr) {
    const { state } = this;
    if (state.status !== 'playing') return;
    // Mémoriser la dernière direction pour poser la bombe devant soi
    if (dc !== 0 || dr !== 0) { state.player.dc = dc; state.player.dr = dr; }
    const spd  = state.player.speed;
    const nr   = state.player.r + dr * spd * 0.06;
    const nc   = state.player.c + dc * spd * 0.06;
    const { rows, cols } = this.config.gameplay;

    // Snap to integer for wall checks
    const iR = Math.round(nr), iC = Math.round(nc);
    if (iR >= 0 && iR < rows && iC >= 0 && iC < cols) {
      if (this._walkable(iR, iC, state)) {
        state.player.r = Math.max(0, Math.min(rows - 1, nr));
        state.player.c = Math.max(0, Math.min(cols - 1, nc));
      }
    }
  }

  placeBomb() {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (state.activeBombs >= state.player.maxBombs) return;

    const pr = Math.round(state.player.r);
    const pc = Math.round(state.player.c);

    // Essayer de poser la bombe devant le joueur (dans sa direction)
    const { rows, cols } = this.config.gameplay;
    const fR = pr + (state.player.dr ?? 0);
    const fC = pc + (state.player.dc ?? 0);
    const canFront = fR >= 0 && fR < rows && fC >= 0 && fC < cols
      && this._walkable(fR, fC, state)
      && !state.bombs.find(b => b.r === fR && b.c === fC);

    const r = canFront ? fR : pr;
    const c = canFront ? fC : pc;

    // Sur la cellule du joueur, on marque passable pour qu'il puisse partir
    const already = state.bombs.find(b => b.r === r && b.c === c);
    if (already) return;
    state.bombs.push({
      r, c,
      timer: this.config.gameplay.bombTimer,
      range: state.player.range,
      passable: r === pr && c === pc,
    });
    state.activeBombs++;
  }

  _startLoop() {
    this._last = performance.now();
    const tick = (t) => {
      if (this.state.status !== 'playing') return;
      const dt = Math.min((t - this._last) / 1000, 0.05);
      this._last = t;
      this._update(dt);
      EventBus.emit('game:tick', { state: this.state, action: 'tick' });
      this._loopId = requestAnimationFrame(tick);
    };
    this._loopId = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this._loopId) { cancelAnimationFrame(this._loopId); this._loopId = null; }
  }

  _update(dt) {
    const { state } = this;

    // Move enemies
    state.enemies.forEach(e => {
      e.moveTimer -= dt;
      if (e.moveTimer > 0) return;
      e.moveTimer = 0.4 / state.player.speed * 1.5;
      const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
      const valid = dirs.filter(([dc, dr]) => {
        const nr = e.r + dr, nc = e.c + dc;
        return this._walkable(nr, nc, state);
      });
      if (valid.length) {
        const [dc, dr] = valid[randInt(valid.length)];
        e.r += dr; e.c += dc;
      }
    });

    // Retirer passable quand le joueur quitte la cellule de la bombe
    const pr2 = Math.round(state.player.r), pc2 = Math.round(state.player.c);
    state.bombs.forEach(b => {
      if (b.passable && (b.r !== pr2 || b.c !== pc2)) b.passable = false;
    });

    // Count down bombs
    state.bombs.forEach(b => {
      b.timer -= dt;
      if (b.timer <= 0 && !b.exploding) {
        b.exploding = true;
        b.flashTimer = 0.8;
        state.activeBombs = Math.max(0, state.activeBombs - 1);
        this._explode(b);
      }
    });

    // Update explosions
    state.explosions = state.explosions.filter(ex => {
      ex.timer -= dt;
      return ex.timer > 0;
    });

    // Remove exploded bombs
    state.bombs = state.bombs.filter(b => !b.exploding || b.flashTimer > 0);
    state.bombs.forEach(b => { if (b.flashTimer) b.flashTimer -= dt; });

    // Player on exit?
    const pr = Math.round(state.player.r), pc = Math.round(state.player.c);
    if (state.grid[pr][pc] === EXIT && state.enemies.length === 0) {
      this._levelClear();
      return;
    }

    // Player on power-up?
    const puKey = `${pr},${pc}`;
    if (state.powerUps[puKey]) {
      const pu = state.powerUps[puKey];
      delete state.powerUps[puKey];
      if (pu === PU_BOMB)  state.player.maxBombs++;
      if (pu === PU_RANGE) state.player.range = Math.min(state.player.range + 1, 8);
      if (pu === PU_SPEED) state.player.speed = Math.min(state.player.speed + 0.5, 6);
    }

    // Explosion vs player
    const inExplosion = state.explosions.some(
      ex => ex.cells.some(([er, ec]) => er === pr && ec === pc)
    );
    if (inExplosion) this._loseLife();

    // Enemy vs player
    const hitByEnemy = state.enemies.some(
      e => Math.abs(e.r - state.player.r) < 0.8 && Math.abs(e.c - state.player.c) < 0.8
    );
    if (hitByEnemy) this._loseLife();
  }

  _explode(bomb) {
    const { state } = this;
    const { rows, cols } = this.config.gameplay;
    const cells = [[bomb.r, bomb.c]];

    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    dirs.forEach(([dc, dr]) => {
      for (let i = 1; i <= bomb.range; i++) {
        const nr = bomb.r + dr * i;
        const nc = bomb.c + dc * i;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break;
        if (state.grid[nr][nc] === HARD) break;
        cells.push([nr, nc]);
        if (state.grid[nr][nc] === SOFT) {
          const isExit = state.exitCell && state.exitCell[0] === nr && state.exitCell[1] === nc;
          state.grid[nr][nc] = isExit ? EXIT : EMPTY;
          state.score += this.config.scoring.wallDestroy;
          EventBus.emit('game:score-update', { score: state.score });
          break;
        }
      }
    });

    // Kill enemies in blast
    state.enemies = state.enemies.filter(e => {
      const hit = cells.some(([er, ec]) => er === e.r && ec === e.c);
      if (hit) {
        state.score += this.config.scoring.enemyKill;
        EventBus.emit('game:score-update', { score: state.score });
      }
      return !hit;
    });

    state.explosions.push({ cells, timer: 0.7 });
    EventBus.emit('game:tick', { state, action: 'explode' });
  }

  _loseLife() {
    const { state } = this;
    if (state._invincible) return;
    state.lives--;
    state._invincible = true;
    setTimeout(() => { state._invincible = false; }, 1500);
    EventBus.emit('game:lives-update', { lives: state.lives });
    if (state.lives <= 0) {
      state.status = 'over';
      this._stopLoop();
      const { best } = ScoreService.submit(this._gameId(), state.score);
      EventBus.emit('game:over', {
        result: 'lose', icon: '💣', title: 'BOOM !',
        score: state.score, best,
        extraInfo: `<div class="overlay-score">Niveau ${state.level}</div>`,
      });
    } else {
      // Respawn at start
      state.player.r = 1; state.player.c = 1;
      state.activeBombs = 0;
    }
  }

  _levelClear() {
    const { state } = this;
    state.level++;
    state.score += this.config.scoring.timeBonus;
    EventBus.emit('game:score-update', { score: state.score });
    if (state.level > 3) {
      state.status = 'won';
      this._stopLoop();
      const { best } = ScoreService.submit(this._gameId(), state.score);
      EventBus.emit('game:won', {
        result: 'win', icon: '🏆', title: 'VICTOIRE !',
        score: state.score, best,
        extraInfo: `<div class="overlay-score">Tous les niveaux franchis !</div>`,
      });
    } else {
      // Next level — rebuild grid
      const next = this._generateLevel(state.level);
      state.grid      = next.grid;
      state.enemies   = next.enemies;
      state.powerUps  = next.powerUps;
      state.exitCell  = next.exitCell;
      state.player.r  = 1; state.player.c = 1;
      state.activeBombs = 0;
      state.bombs       = [];
      state.explosions  = [];
      EventBus.emit('game:tick', { state, action: 'level-up' });
    }
  }

  _walkable(r, c, state) {
    const { rows, cols } = this.config.gameplay;
    if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
    const cell = state.grid[r][c];
    if (cell === HARD || cell === SOFT) return false;
    const bomb = state.bombs.find(b => b.r === r && b.c === c);
    if (bomb && !bomb.passable) return false;
    return true;
  }

  _generateLevel(level) {
    const { cols, rows, enemies: enemyCount } = this.config.gameplay;
    const grid = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return HARD;
        if (r % 2 === 0 && c % 2 === 0) return HARD;
        return EMPTY;
      })
    );

    // Soft walls (avoid player start area)
    const safeZone = new Set(['1,1','1,2','2,1']);
    const softCount = Math.floor(cols * rows * 0.25) + level * 5;
    let placed = 0;
    while (placed < softCount) {
      const r = 1 + randInt(rows - 2);
      const c = 1 + randInt(cols - 2);
      if (grid[r][c] === EMPTY && !safeZone.has(`${r},${c}`)) {
        grid[r][c] = SOFT;
        placed++;
      }
    }

    // Place exit under one soft wall
    const softCells = [];
    for (let r = 1; r < rows - 1; r++)
      for (let c = 1; c < cols - 1; c++)
        if (grid[r][c] === SOFT) softCells.push([r, c]);
    const exitCell = softCells[randInt(softCells.length)];
    // Exit is revealed when the soft wall is destroyed

    // Power-ups under soft walls
    const powerUps = {};
    const puTypes  = [PU_BOMB, PU_RANGE, PU_SPEED];
    const puCount  = 3 + level;
    const remainSoft = softCells.filter(([r,c]) => r !== exitCell[0] || c !== exitCell[1]);
    for (let i = 0; i < Math.min(puCount, remainSoft.length); i++) {
      const [r, c] = remainSoft[i];
      powerUps[`${r},${c}`] = puTypes[i % 3];
    }

    // Enemies spawned away from player
    const enList = [];
    const enemyCount2 = enemyCount + (level - 1) * 2;
    let tries = 0;
    while (enList.length < enemyCount2 && tries < 200) {
      tries++;
      const r = 1 + randInt(rows - 2);
      const c = 1 + randInt(cols - 2);
      if (grid[r][c] === EMPTY && (r > 3 || c > 3)) {
        enList.push({ r, c, moveTimer: 0.4 + Math.random() * 0.4 });
      }
    }

    return { grid, enemies: enList, powerUps, exitCell };
  }

  _buildFullState() {
    const lvl  = this._generateLevel(1);
    return {
      status: 'idle', mode: 'basique', score: 0, lives: 3, level: 1,
      player: { r: 1, c: 1, speed: 4, maxBombs: 1, range: 2, dc: 1, dr: 0 },
      ...lvl,
      bombs: [], explosions: [], activeBombs: 0,
      _invincible: false,
    };
  }
}
