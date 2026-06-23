import EventBus     from '../../js/core/EventBus.js';
import ScoreService  from '../../js/services/ScoreService.js';
import BaseGame      from '../../js/core/BaseGame.js';

// Pyramid: 7 rows. Row r has r+1 cubes (col 0..r).
// Jump directions (diagonal iso): UR=(r-1,c), UL=(r-1,c-1), DR=(r+1,c+1), DL=(r+1,c)
const DIRS = {
  UR: { dr: -1, dc: 0  },
  UL: { dr: -1, dc: -1 },
  DR: { dr:  1, dc:  1 },
  DL: { dr:  1, dc:  0 },
};

export default class QBert extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = this._buildFullState();
    this._loopId = null;
    this._last   = 0;
    this._eid    = 0;
  }

  _gameId() { return 'qbert'; }

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

  // dir: 'UR' | 'UL' | 'DR' | 'DL'
  move(dir) {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (state.player.jumping) return;
    const d  = DIRS[dir];
    if (!d) return;
    const nr = state.player.row + d.dr;
    const nc = state.player.col + d.dc;
    state.player.jumping   = true;
    state.player.jumpT     = 0;
    state.player.jumpDir   = dir;
    state.player.targetRow = nr;
    state.player.targetCol = nc;
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

    if (state.player.dying) {
      state.player.deathT -= dt;
      if (state.player.deathT <= 0) {
        state.lives--;
        EventBus.emit('game:lives-update', { lives: state.lives });
        if (state.lives <= 0) {
          state.status = 'over';
          this._stopLoop();
          const { best } = ScoreService.submit(this._gameId(), state.score);
          EventBus.emit('game:over', {
            result: 'lose', icon: '🟠', title: 'GAME OVER',
            score: state.score, best,
            extraInfo: `<div class="overlay-score">Niveau ${state.level}</div>`
          });
        } else {
          this._respawnPlayer();
        }
      }
      this._updateEnemies(dt);
      return;
    }

    this._updatePlayer(dt);
    this._updateEnemies(dt);
    this._spawnEnemies(dt);

    // Check if all cubes flipped → round clear
    if (state.cubes.every(c => c.flipped)) this._roundClear();
  }

  _updatePlayer(dt) {
    const { state } = this;
    const cfg = this.config.gameplay;
    const p   = state.player;
    if (!p.jumping) return;

    p.jumpT += dt / cfg.jumpDuration;
    if (p.jumpT >= 1) {
      p.row   = p.targetRow;
      p.col   = p.targetCol;
      p.jumpT = 1;
      p.jumping = false;

      // Off pyramid?
      if (p.row < 0 || p.row >= cfg.rows || p.col < 0 || p.col > p.row) {
        this._playerDie(); return;
      }

      // Flip cube
      const cube = state.cubes.find(c => c.row === p.row && c.col === p.col);
      if (cube && !cube.flipped) {
        cube.flipped = true;
        state.score += this.config.scoring.cubeFlip;
        EventBus.emit('game:score-update', { score: state.score });
      }

      // Enemy collision on land
      this._checkPlayerEnemyCollision();
    }
  }

  _updateEnemies(dt) {
    const { state } = this;
    const cfg = this.config.gameplay;

    state.enemies.forEach(e => {
      if (e.dying) {
        e.deathT -= dt;
        if (e.deathT <= 0) {
          state.enemies = state.enemies.filter(x => x !== e);
          state.score += this.config.scoring.coilyKill;
          EventBus.emit('game:score-update', { score: state.score });
        }
        return;
      }

      e.jumpT += dt;
      if (e.jumpT >= e.jumpInterval) {
        e.jumpT = 0;
        this._moveEnemy(e);
        this._checkPlayerEnemyCollision();
      }
    });
  }

  _moveEnemy(e) {
    const { state } = this;
    const cfg = this.config.gameplay;

    // Coily: random walk but chases player when close
    const p = state.player;
    const possibleDirs = Object.entries(DIRS).filter(([, d]) => {
      const nr = e.row + d.dr, nc = e.col + d.dc;
      return nr >= 0 && nr < cfg.rows && nc >= 0 && nc <= nr;
    });

    if (!possibleDirs.length) {
      // Off edge — enemy dies
      e.dying  = true;
      e.deathT = 0.4;
      return;
    }

    let chosen;
    // 50% chance chase player
    if (Math.random() < 0.5) {
      chosen = possibleDirs.reduce((best, [, d]) => {
        const nr = e.row + d.dr, nc = e.col + d.dc;
        const dist = Math.abs(nr - p.row) + Math.abs(nc - p.col);
        return dist < best.dist ? { d, dir: d, dist } : best;
      }, { dist: Infinity, d: possibleDirs[0][1] }).d;
    } else {
      const pick = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
      chosen = pick[1];
    }

    e.prevRow = e.row;
    e.prevCol = e.col;
    e.row += chosen.dr;
    e.col += chosen.dc;

    // Off edge?
    if (e.row >= cfg.rows) { e.dying = true; e.deathT = 0.4; }
  }

  _checkPlayerEnemyCollision() {
    const { state } = this;
    const p = state.player;
    if (p.dying) return;
    for (const e of state.enemies) {
      if (e.dying) continue;
      if (e.row === p.row && e.col === p.col) { this._playerDie(); return; }
    }
  }

  _spawnEnemies(dt) {
    const { state } = this;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      const maxE = 1 + Math.floor(state.level / 2);
      if (state.enemies.filter(e => !e.dying).length < maxE) {
        state.enemies.push({
          id: this._eid++, type: 'coily',
          row: 0, col: 0,
          prevRow: 0, prevCol: 0,
          jumpT: 0, jumpInterval: 0.55 - state.level * 0.04,
          dying: false, deathT: 0
        });
      }
      state.spawnTimer = 5 - state.level * 0.3;
    }
  }

  _playerDie() {
    const { state } = this;
    if (state.player.dying) return;
    state.player.dying  = true;
    state.player.deathT = 0.9;
    state.player.jumping = false;
  }

  _respawnPlayer() {
    this.state.player = this._makePlayer();
    this.state.enemies = [];
    this.state.spawnTimer = 3;
  }

  _roundClear() {
    const { state } = this;
    this._stopLoop();
    state.score += this.config.scoring.roundBonus;
    EventBus.emit('game:score-update', { score: state.score });

    state.round = (state.round || 1) + 1;
    if (state.round > 2) {
      state.round = 1;
      state.level++;
      if (state.level > 5) {
        state.status = 'won';
        const { best } = ScoreService.submit(this._gameId(), state.score);
        EventBus.emit('game:won', {
          result: 'win', icon: '🟠', title: 'VICTOIRE !',
          score: state.score, best,
          extraInfo: `<div class="overlay-score">Tous les niveaux franchis !</div>`
        });
        return;
      }
      state.score += this.config.scoring.levelBonus;
      EventBus.emit('game:score-update', { score: state.score });
    }

    // Reset cubes with next target color, keep lives/score
    state.cubes   = this._buildCubes(state.level, state.round);
    state.player  = this._makePlayer();
    state.enemies = [];
    state.spawnTimer = 3;
    EventBus.emit('game:tick', { state, action: 'round-clear' });
    this._startLoop();
  }

  _makePlayer() {
    return { row: 0, col: 0, jumping: false, jumpT: 0, jumpDir: 'DL',
             targetRow: 0, targetCol: 0, dying: false, deathT: 0 };
  }

  _buildCubes(level, round) {
    const rows = this.config.gameplay.rows;
    const cubes = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c <= r; c++) {
        cubes.push({ row: r, col: c, flipped: false });
      }
    }
    return cubes;
  }

  _buildFullState() {
    return {
      status: 'idle', mode: 'basique', score: 0, lives: 3, level: 1, round: 1,
      cubes:   this._buildCubes(1, 1),
      player:  this._makePlayer(),
      enemies: [],
      spawnTimer: 4
    };
  }
}
