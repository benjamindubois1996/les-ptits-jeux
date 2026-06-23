import EventBus     from '../../js/core/EventBus.js';
import ScoreService  from '../../js/services/ScoreService.js';
import BaseGame      from '../../js/core/BaseGame.js';

const COLS = 15, ROWS = 13;

export default class DigDug extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = this._buildFullState();
    this._loopId = null;
    this._last   = 0;
    this._keys   = new Set();
    this._eid    = 0;
  }

  _gameId() { return 'dig-dug'; }

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

  pressKey(code, down) {
    if (down) this._keys.add(code);
    else      this._keys.delete(code);
  }

  setPumping(on) {
    if (this.state.status !== 'playing') return;
    this.state.player.pumping = on;
    if (!on) { this.state.player.pumpDist = 0; this.state.enemies.forEach(e => { e.pumped = false; }); }
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
    const cfg = this.config.gameplay;

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
            result: 'lose', icon: '⛏️', title: 'GAME OVER',
            score: state.score, best,
            extraInfo: `<div class="overlay-score">Niveau ${state.level}</div>`
          });
        } else {
          state.player = { ...this._makePlayer(), invincible: 2 };
        }
      }
      return;
    }

    this._updatePlayer(dt);
    this._updatePump(dt);
    state.enemies.forEach(e => this._updateEnemy(e, dt));
    this._updateRocks(dt);

    // Player-enemy collision
    if (state.player.invincible > 0) {
      state.player.invincible -= dt;
    } else {
      const ts = cfg.tileSize;
      for (const e of state.enemies) {
        if (e.state === 'dead' || e.state === 'inflated') continue;
        if (Math.abs(e.px - state.player.px) < ts * 0.72 &&
            Math.abs(e.py - state.player.py) < ts * 0.72) {
          this._playerDie(); return;
        }
      }
    }

    if (state.enemies.every(e => e.state === 'dead')) this._levelClear();
  }

  _updatePlayer(dt) {
    const { state } = this;
    const cfg = this.config.gameplay;
    const ts  = cfg.tileSize;
    const p   = state.player;

    // Tween move
    if (p.moving) {
      p.moveT += dt * cfg.playerSpeed;
      if (p.moveT >= 1) {
        p.col = p.tc; p.row = p.tr;
        p.px  = (p.col + 0.5) * ts;
        p.py  = (p.row + 0.5) * ts;
        p.moveT = 0; p.moving = false;
        state.terrain[p.row][p.col] = 'empty';
      } else {
        p.px = (p.col + 0.5) * ts + (p.tc - p.col) * p.moveT * ts;
        p.py = (p.row + 0.5) * ts + (p.tr - p.row) * p.moveT * ts;
      }
      return;
    }

    let dc = 0, dr = 0;
    if (this._keys.has('ArrowLeft')  || this._keys.has('KeyA')) { dc = -1; p.face = 'left'; }
    if (this._keys.has('ArrowRight') || this._keys.has('KeyD')) { dc =  1; p.face = 'right'; }
    if (!dc && (this._keys.has('ArrowUp')   || this._keys.has('KeyW'))) { dr = -1; p.face = 'up'; }
    if (!dc && (this._keys.has('ArrowDown') || this._keys.has('KeyS'))) { dr =  1; p.face = 'down'; }
    if (dc === 0 && dr === 0) return;

    const nc = p.col + dc, nr = p.row + dr;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return;
    if (state.rocks.some(r => !r.falling && r.col === nc && r.row === nr)) return;

    p.tc = nc; p.tr = nr; p.moving = true; p.moveT = 0;
  }

  _updatePump(dt) {
    const { state } = this;
    const cfg = this.config.gameplay;
    const ts  = cfg.tileSize;
    const p   = state.player;

    if (p.pumping) {
      p.pumpDist = Math.min(p.pumpDist + cfg.pumpSpeed * dt, cfg.pumpRange);
    } else {
      p.pumpDist = Math.max(0, p.pumpDist - cfg.pumpSpeed * 2 * dt);
    }

    if (p.pumpDist > 0) {
      const end = this._pumpEnd(p);
      let hit = false;
      for (const e of state.enemies) {
        if (e.state === 'dead') continue;
        if (Math.abs(e.px - end.x) < ts * 0.75 && Math.abs(e.py - end.y) < ts * 0.75) {
          hit = true;
          if (!e.pumped) {
            e.pumped    = true;
            e.state     = 'inflated';
            e.inflated  = Math.min((e.inflated || 0) + 1, cfg.pumpsToKill);
            e.deflateT  = 1.6;
            if (e.inflated >= cfg.pumpsToKill) this._killEnemy(e);
          }
        } else {
          e.pumped = false;
        }
      }
      if (!hit) state.enemies.forEach(e => { e.pumped = false; });
    }

    // Deflate enemies
    state.enemies.forEach(e => {
      if (e.state !== 'inflated') return;
      if (e.pumped) { e.deflateT = 1.6; return; }
      e.deflateT -= dt;
      if (e.deflateT <= 0) {
        e.inflated = Math.max(0, e.inflated - 1);
        if (e.inflated === 0) { e.state = 'wandering'; e.pumped = false; }
        else e.deflateT = 1.3;
      }
    });
  }

  _pumpEnd(p) {
    const d = p.pumpDist;
    if (p.face === 'right') return { x: p.px + d, y: p.py };
    if (p.face === 'left')  return { x: p.px - d, y: p.py };
    if (p.face === 'down')  return { x: p.px, y: p.py + d };
    return                         { x: p.px, y: p.py - d };
  }

  _killEnemy(e) {
    if (e.state === 'dead') return;
    const pts = this.config.scoring[e.type] ?? 200;
    e.state   = 'dead';
    e.deadT   = 0.8;
    this.state.score += pts;
    EventBus.emit('game:score-update', { score: this.state.score });
  }

  _updateEnemy(e, dt) {
    if (e.state === 'dead')     { e.deadT -= dt; return; }
    if (e.state === 'inflated') return;

    const cfg = this.config.gameplay;
    const ts  = cfg.tileSize;
    const { state } = this;

    // Tween move
    if (e.moving) {
      e.moveT += dt * e.speed;
      if (e.moveT >= 1) {
        e.col = e.tc; e.row = e.tr;
        e.px  = (e.col + 0.5) * ts;
        e.py  = (e.row + 0.5) * ts;
        e.moveT = 0; e.moving = false;
        if (e.ghost) state.terrain[e.row][e.col] = 'empty';
      } else {
        e.px = (e.col + 0.5) * ts + (e.tc - e.col) * e.moveT * ts;
        e.py = (e.row + 0.5) * ts + (e.tr - e.row) * e.moveT * ts;
      }
      return;
    }

    e.thinkT = (e.thinkT || 0) + dt;
    if (e.thinkT < 0.18) return;
    e.thinkT = 0;

    // Ghost mode toggle
    if (!e.ghost && Math.random() < 0.05) { e.ghost = true; e.ghostT = 2 + Math.random() * 3; }
    if (e.ghost) { e.ghostT -= 0.18; if (e.ghostT <= 0) e.ghost = false; }

    const p     = state.player;
    const pcol  = Math.round(p.px / ts - 0.5);
    const prow  = Math.round(p.py / ts - 0.5);
    const dirs  = [
      { dc: 1, dr: 0, face: 'right' }, { dc: -1, dr: 0, face: 'left' },
      { dc: 0, dr: 1, face: 'down'  }, { dc: 0,  dr: -1, face: 'up' }
    ].filter(d => {
      const nc = e.col + d.dc, nr = e.row + d.dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return false;
      if (state.rocks.some(r => !r.falling && r.col === nc && r.row === nr)) return false;
      if (!e.ghost && state.terrain[nr][nc] === 'dirt') return false;
      return true;
    });

    if (!dirs.length) return;

    dirs.sort((a, b) => {
      const ad = Math.abs(e.col + a.dc - pcol) + Math.abs(e.row + a.dr - prow);
      const bd = Math.abs(e.col + b.dc - pcol) + Math.abs(e.row + b.dr - prow);
      return (ad - bd) + (Math.random() - 0.5) * 2.4;
    });

    const d = dirs[0];
    e.tc = e.col + d.dc; e.tr = e.row + d.dr;
    e.moving = true; e.moveT = 0; e.face = d.face;
  }

  _updateRocks(dt) {
    const { state } = this;
    const cfg = this.config.gameplay;
    const ts  = cfg.tileSize;

    for (const rock of state.rocks) {
      if (!rock.falling) {
        const br = rock.row + 1;
        if (br < ROWS &&
            state.terrain[br][rock.col] === 'empty' &&
            !state.rocks.some(r => r !== rock && !r.falling && r.col === rock.col && r.row === br)) {
          rock.falling = true;
          rock.vy = 60;
          rock.py = (rock.row + 0.5) * ts;
        }
        continue;
      }

      rock.vy  = Math.min(rock.vy + cfg.rockFallAcc * dt, cfg.rockMaxSpeed);
      rock.py += rock.vy * dt;

      const curRow  = Math.floor(rock.py / ts);
      const below   = curRow + 1;
      const willLand = below >= ROWS ||
        (state.terrain[below]?.[rock.col] === 'dirt') ||
        state.rocks.some(r => r !== rock && !r.falling && r.col === rock.col && r.row === below);

      if (willLand && rock.py >= (curRow + 0.5) * ts) {
        rock.falling = false;
        rock.row     = curRow;
        rock.py      = (curRow + 0.5) * ts;
        rock.vy      = 0;
      }

      // Crush
      const rcx = (rock.col + 0.5) * ts;
      if (!state.player.dying && state.player.invincible <= 0) {
        if (Math.abs(state.player.px - rcx) < ts * 0.68 && Math.abs(state.player.py - rock.py) < ts * 0.68)
          this._playerDie();
      }
      state.enemies.forEach(e => {
        if (e.state === 'dead') return;
        if (Math.abs(e.px - rcx) < ts * 0.72 && Math.abs(e.py - rock.py) < ts * 0.72) {
          e.state = 'dead'; e.deadT = 0.6;
          this.state.score += this.config.scoring.rockCrush;
          EventBus.emit('game:score-update', { score: this.state.score });
        }
      });
    }
  }

  _playerDie() {
    const p = this.state.player;
    if (p.dying) return;
    p.dying   = true;
    p.deathT  = 1.0;
    p.pumping = false;
    p.pumpDist = 0;
  }

  _levelClear() {
    const { state } = this;
    this._stopLoop();
    state.level++;

    if (state.level > 5) {
      state.status = 'won';
      const { best } = ScoreService.submit(this._gameId(), state.score);
      EventBus.emit('game:won', {
        result: 'win', icon: '⛏️', title: 'VICTOIRE !',
        score: state.score, best,
        extraInfo: `<div class="overlay-score">Tous les niveaux franchis !</div>`
      });
      return;
    }

    const lv = this._buildLevel(state.level);
    state.terrain = lv.terrain;
    state.rocks   = lv.rocks;
    state.enemies = lv.enemies;
    state.player  = { ...this._makePlayer(), invincible: 2 };
    EventBus.emit('game:tick', { state, action: 'level-up' });
    this._startLoop();
  }

  _makePlayer() {
    const ts = this.config.gameplay.tileSize;
    return {
      col: 1, row: 1, px: 1.5 * ts, py: 1.5 * ts,
      tc: 1, tr: 1, moving: false, moveT: 0,
      face: 'right', pumping: false, pumpDist: 0,
      dying: false, deathT: 0, invincible: 1.5
    };
  }

  _buildLevel(level) {
    const cfg = this.config.gameplay;
    const ts  = cfg.tileSize;

    // All dirt; surface + starter tunnel = empty
    const terrain = Array.from({ length: ROWS }, () => Array(COLS).fill('dirt'));
    for (let c = 0; c < COLS; c++) terrain[0][c] = 'empty';
    for (let c = 0; c < 3; c++)   terrain[1][c] = 'empty';

    // Rocks
    const rocks   = [];
    const count   = Math.min(cfg.rocksPerLevel + level - 1, 6);
    const usedC   = new Set([0, 1, 2]);
    for (let i = 0; i < count; i++) {
      let col;
      do { col = 2 + Math.floor(Math.random() * (COLS - 4)); } while (usedC.has(col));
      usedC.add(col);
      const row = 2 + Math.floor(Math.random() * 4);
      rocks.push({ id: i, col, row, falling: false, py: (row + 0.5) * ts, vy: 0 });
    }

    // Enemies
    const enemies = [];
    const ecount  = Math.min(cfg.enemiesPerLevel + level - 1, 8);
    const spd     = cfg.enemySpeed * 0.55 + (level - 1) * 0.06;
    for (let i = 0; i < ecount; i++) {
      const col = 4 + Math.floor(Math.random() * (COLS - 8));
      const row = 3 + Math.floor(Math.random() * (ROWS - 5));
      enemies.push({
        id: this._eid++, type: i % 2 === 0 ? 'pooka' : 'fygar',
        col, row, px: (col + 0.5) * ts, py: (row + 0.5) * ts,
        tc: col, tr: row, moving: false, moveT: 0, face: 'left',
        state: 'wandering', inflated: 0, deflateT: 0,
        pumped: false, ghost: false, ghostT: 0, thinkT: 0, deadT: 0,
        speed: spd
      });
    }

    return { terrain, rocks, enemies };
  }

  _buildFullState() {
    const lv = this._buildLevel(1);
    return {
      status: 'idle', mode: 'basique', score: 0, lives: 3, level: 1,
      terrain: lv.terrain, rocks: lv.rocks, enemies: lv.enemies,
      player: this._makePlayer()
    };
  }
}
