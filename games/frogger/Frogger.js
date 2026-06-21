import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class Frogger extends BaseGame {

  constructor(config) {
    super(config);
    this.state     = this._buildFullState();
    this._raf      = null;
    this._lastTime = null;
  }

  _gameId() { return 'frogger'; }

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
    this._startLoop();
  }

  destroy() {
    super.destroy();
    this._stopLoop();
    this._unbindControls();
  }

  start(options = {}) {
    const mode  = options.mode ?? 'basique';
    const cfg   = this.config.gameplay;
    this.state  = {
      ...this._buildFullState(),
      status: 'playing',
      mode,
      lives: 3,
    };
    this._initLanes();
    EventBus.emit('game:score-update', { score: 0, lives: 3 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  restart() {
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  {}
  _onResume() {}

  /* RAF */

  _startLoop() {
    const loop = (ts) => {
      if (!this._lastTime) this._lastTime = ts;
      const dt = Math.min(ts - this._lastTime, 50);
      this._lastTime = ts;
      this._update(dt);
      EventBus.emit('game:frame', { state: this.state });
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _stopLoop() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  /* Update */

  _update(dt) {
    const { state } = this;
    if (state.status !== 'playing') return;

    const cfg  = this.config.gameplay;
    const f    = dt / 16.667;
    const W    = cfg.W;
    const CELL = cfg.CELL;

    /* Move objects on each lane */
    for (const lane of state.lanes) {
      if (lane.type !== 'road' && lane.type !== 'water') continue;
      const dx = lane.dir * lane.speed * f;
      for (const obj of lane.objects) {
        obj.px += dx;
        const totalW = obj.w + CELL * 0.5;
        if (lane.dir > 0 && obj.px > W + 10)        obj.px = -obj.w - 10;
        if (lane.dir < 0 && obj.px + obj.w < -10)   obj.px = W + 10;
      }
    }

    /* Death timer */
    if (state.frog.dying) {
      state.frog.deathTimer -= dt;
      if (state.frog.deathTimer <= 0) this._respawnFrog();
      return;
    }

    /* Log riding — move frog with log if in water */
    const frog = state.frog;
    const frogLane = state.lanes[frog.row];

    if (frogLane?.type === 'water') {
      const log = this._getLog(frog.row, frog.px);
      if (log) {
        const dx = frogLane.dir * frogLane.speed * f;
        frog.px += dx;
        /* Drown if frog goes off-screen */
        if (frog.px < -cfg.frogW / 2 || frog.px > W + cfg.frogW / 2) {
          this._killFrog();
          return;
        }
      } else {
        /* Not on any log — drown */
        this._killFrog();
        return;
      }
    }

    /* Road collision */
    if (frogLane?.type === 'road') {
      if (this._carCollision(frog.row, frog.px)) {
        this._killFrog();
        return;
      }
    }

    /* Goal check */
    if (frog.row === 0) {
      this._checkGoal();
    }
  }

  /* Lane init */

  _initLanes() {
    const cfg  = this.config.gameplay;
    const CELL = cfg.CELL;
    const W    = cfg.W;

    this.state.lanes = cfg.lanes.map(ldef => {
      const lane = { ...ldef, objects: [] };
      if (ldef.type === 'road') {
        for (let i = 0; i < ldef.count; i++) {
          const carPx = (W / ldef.count) * i + (ldef.dir < 0 ? 0 : W / ldef.count * 0.5);
          lane.objects.push({ px: carPx, w: CELL * ldef.carW });
        }
      } else if (ldef.type === 'water') {
        const gap = W / ldef.count;
        for (let i = 0; i < ldef.count; i++) {
          lane.objects.push({ px: gap * i, w: CELL * ldef.logW });
        }
      }
      return lane;
    });
  }

  /* Collision helpers */

  _getLog(row, frogPx) {
    const lane = this.state.lanes[row];
    if (!lane || lane.type !== 'water') return null;
    const hw = this.config.gameplay.frogW / 2 - 4;
    return lane.objects.find(log => frogPx - hw >= log.px && frogPx + hw <= log.px + log.w) || null;
  }

  _carCollision(row, frogPx) {
    const lane = this.state.lanes[row];
    if (!lane || lane.type !== 'road') return false;
    const hw = this.config.gameplay.frogW / 2 - 2;
    return lane.objects.some(car => frogPx + hw > car.px && frogPx - hw < car.px + car.w);
  }

  /* Death / respawn */

  _killFrog() {
    const frog = this.state.frog;
    frog.dying     = true;
    frog.deathTimer = this.config.gameplay.deathDurationMs;
    EventBus.emit('game:frame', { state: this.state });
  }

  _respawnFrog() {
    const { state } = this;
    state.lives--;
    EventBus.emit('game:score-update', { lives: state.lives });
    if (state.lives <= 0) {
      state.status = 'gameover';
      ScoreService.submit(this._gameId(), state.score);
      EventBus.emit('game:over', {
        score: state.score,
        best:  ScoreService.getBest(this._gameId()),
      });
    } else {
      state.frog = this._buildFrog();
    }
  }

  /* Goal */

  _checkGoal() {
    const { state } = this;
    const cfg  = this.config.gameplay;
    const frog = state.frog;

    const idx = cfg.homeX.findIndex(hx => Math.abs(frog.px - hx) < cfg.homeHitR);
    if (idx === -1) { this._killFrog(); return; }
    if (state.homes[idx]) { this._killFrog(); return; }

    state.homes[idx] = true;
    state.score     += cfg.pointPerHome;
    EventBus.emit('game:score-update', { score: state.score });

    /* All homes filled — next level */
    if (state.homes.every(h => h)) {
      state.level++;
      state.homes = Array(5).fill(false);
      this._initLanes();
      /* Increase speed for next level */
      for (const lane of state.lanes) {
        if (lane.speed) lane.speed *= 1.12;
      }
    }

    state.frog = this._buildFrog();
  }

  /* Keyboard movement (called from controls, queued as events) */

  move(dir) {
    const { state } = this;
    if (state.status !== 'playing' || state.frog.dying) return;
    const cfg  = this.config.gameplay;
    const frog = state.frog;

    switch (dir) {
      case 'up':    frog.row = Math.max(0,            frog.row - 1); break;
      case 'down':  frog.row = Math.min(cfg.ROWS - 1, frog.row + 1); break;
      case 'left':  frog.px  = Math.max(cfg.frogW / 2,        frog.px - cfg.CELL); break;
      case 'right': frog.px  = Math.min(cfg.W - cfg.frogW / 2, frog.px + cfg.CELL); break;
    }

    EventBus.emit('game:frame', { state });
  }

  _buildFrog() {
    const cfg = this.config.gameplay;
    return {
      row:       cfg.ROWS - 1,
      px:        cfg.W / 2,
      dying:     false,
      deathTimer:0,
      dir:       'up',
    };
  }

  _buildFullState() {
    return {
      status: 'loading',
      frog:   this._buildFrog(),
      lanes:  [],
      homes:  Array(5).fill(false),
      score:  0,
      lives:  3,
      level:  1,
      mode:   'basique',
    };
  }

  /* Controls */

  _bindControls() {
    const keys = this.config.controls.keyboard;
    this._onKeyDown = (e) => {
      const s = this.state.status;
      if (keys.up.includes(e.code))    { e.preventDefault(); this.move('up');    return; }
      if (keys.down.includes(e.code))  { e.preventDefault(); this.move('down');  return; }
      if (keys.left.includes(e.code))  { e.preventDefault(); this.move('left');  return; }
      if (keys.right.includes(e.code)) { e.preventDefault(); this.move('right'); return; }
      if (keys.pause.includes(e.code))   { e.preventDefault(); EventBus.emit('game:pause-toggle'); }
      if (keys.restart.includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindControls() {
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
  }
}
