import EventBus     from '../../js/core/EventBus.js';
import ScoreService  from '../../js/services/ScoreService.js';
import BaseGame      from '../../js/core/BaseGame.js';
import { randInt }   from '../../js/utils/Random.js';

export default class Centipede extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = this._buildFullState();
    this._loopId = null;
    this._last   = 0;
  }

  _gameId() { return 'centipede'; }

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

  // Player movement (called from renderer on key/touch)
  movePlayer(dx, dy) {
    const { state } = this;
    if (state.status !== 'playing') return;
    const cfg = this.config.gameplay;
    const minRow = cfg.rows - cfg.playerZoneRows;
    const speed = 3;
    state.player.x = Math.max(0, Math.min(cfg.cols - 1, state.player.x + dx * speed * 0.04));
    state.player.y = Math.max(minRow, Math.min(cfg.rows - 1, state.player.y + dy * speed * 0.04));
  }

  shoot() {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (state.bullet) return; // only 1 bullet at a time
    state.bullet = { x: state.player.x, y: state.player.y - 0.5 };
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

    // Move bullet
    if (state.bullet) {
      state.bullet.y -= cfg.bulletSpeed * dt;
      if (state.bullet.y < 0) { state.bullet = null; }
    }

    // Bullet vs mushroom
    if (state.bullet) {
      const bRow = Math.round(state.bullet.y);
      const bCol = Math.round(state.bullet.x);
      const key  = `${bRow},${bCol}`;
      if (state.mushrooms[key] !== undefined) {
        state.mushrooms[key]--;
        if (state.mushrooms[key] <= 0) delete state.mushrooms[key];
        state.bullet = null;
        state.score += this.config.scoring.mushroom;
        EventBus.emit('game:score-update', { score: state.score });
      }
    }

    // Move centipede segments
    state.centTimer += dt;
    if (state.centTimer >= cfg.centipedeSpeed) {
      state.centTimer = 0;
      this._stepCentipede();
    }

    // Spider
    state.spiderTimer -= dt;
    if (state.spiderTimer <= 0) {
      state.spiderTimer = cfg.spiderSpawnInterval + Math.random() * 4;
      if (!state.spider) this._spawnSpider();
    }
    if (state.spider) {
      state.spider.x += state.spider.vx * dt * 3;
      state.spider.y += state.spider.vy * dt * 2;
      if (state.spider.x < 0 || state.spider.x > cfg.cols - 1) {
        state.spider.vx *= -1;
        state.spider = null; // exit when bouncing out
      }
      if (state.spider) {
        // Remove random mushrooms in path
        const key = `${Math.round(state.spider.y)},${Math.round(state.spider.x)}`;
        delete state.mushrooms[key];
        // Spider vs player
        if (Math.abs(state.spider.x - state.player.x) < 1.2 &&
            Math.abs(state.spider.y - state.player.y) < 1.2) {
          state.spider = null;
          this._loseLife();
        }
      }
    }

    // Bullet vs centipede
    if (state.bullet) {
      const bRow = Math.round(state.bullet.y);
      const bCol = Math.round(state.bullet.x);
      let hit = false;
      for (let i = state.segments.length - 1; i >= 0; i--) {
        const s = state.segments[i];
        if (!s.alive) continue;
        if (Math.round(s.r) === bRow && Math.round(s.c) === bCol) {
          s.alive = false;
          state.bullet = null;
          const pts = (i === 0 || !state.segments[i-1].alive) ?
            this.config.scoring.head : this.config.scoring.body;
          state.score += pts;
          EventBus.emit('game:score-update', { score: state.score });
          // Leave a mushroom
          state.mushrooms[`${s.r},${s.c}`] = 4;
          // Split tail into new head
          if (i + 1 < state.segments.length && state.segments[i+1].alive) {
            state.segments[i+1].isHead = true;
          }
          hit = true;
          break;
        }
      }
      // Bullet vs spider
      if (!hit && state.spider) {
        if (Math.abs(state.bullet.x - state.spider.x) < 1.2 &&
            Math.abs(state.bullet.y - state.spider.y) < 1.2) {
          state.spider  = null;
          state.bullet  = null;
          state.score  += this.config.scoring.spider;
          EventBus.emit('game:score-update', { score: state.score });
        }
      }
    }

    // Centipede vs player zone
    state.segments.forEach(s => {
      if (!s.alive) return;
      if (Math.abs(s.r - state.player.y) < 0.8 && Math.abs(s.c - state.player.x) < 0.8) {
        this._loseLife();
      }
    });

    // Wave clear
    if (state.segments.filter(s => s.alive).length === 0) {
      state.wave++;
      this._spawnCentipede();
    }
  }

  _stepCentipede() {
    const { state } = this;
    const cfg = this.config.gameplay;

    // Snapshot old positions before any movement
    const old = state.segments.map(s => ({ r: s.r, c: s.c }));

    state.segments.forEach((s, i) => {
      if (!s.alive) return;
      const isHead = i === 0 || !state.segments[i - 1].alive;

      if (isHead) {
        const nextC = s.c + s.dir;
        if (nextC < 0 || nextC >= cfg.cols ||
            state.mushrooms[`${s.r},${nextC}`] !== undefined) {
          if (s.r + 1 < cfg.rows) { s.r++; }
          s.dir *= -1;
        } else {
          s.c = nextC;
        }
      } else {
        // Follow the segment ahead using its OLD position
        s.r = old[i - 1].r;
        s.c = old[i - 1].c;
      }
    });
  }

  _spawnCentipede() {
    const { state } = this;
    const cfg = this.config.gameplay;
    const len = cfg.centipedeLength + (state.wave - 1) * 2;
    state.segments = Array.from({ length: Math.min(len, cfg.cols) }, (_, i) => ({
      alive: true, isHead: i === 0,
      r: 0, c: i, dir: 1,
      prevR: 0, prevC: i,
    }));
    state.centTimer = 0;
  }

  _spawnSpider() {
    const { state } = this;
    const cfg = this.config.gameplay;
    const minRow = cfg.rows - cfg.playerZoneRows;
    state.spider = {
      x: 0, y: minRow + Math.random() * (cfg.playerZoneRows - 1),
      vx: 2, vy: (Math.random() - 0.5) * 2,
    };
  }

  _loseLife() {
    const { state } = this;
    state.lives--;
    EventBus.emit('game:lives-update', { lives: state.lives });
    if (state.lives <= 0) {
      state.status = 'over';
      this._stopLoop();
      const { best } = ScoreService.submit(this._gameId(), state.score);
      EventBus.emit('game:over', {
        result: 'lose', icon: '🐛', title: 'GAME OVER',
        score: state.score, best,
        extraInfo: `<div class="overlay-score">Vague ${state.wave}</div>`,
      });
    }
  }

  _buildFullState() {
    const cfg = this.config?.gameplay ?? {};
    const cols = cfg.cols ?? 16, rows = cfg.rows ?? 20;
    const len  = cfg.centipedeLength ?? 12;
    const mush = {};

    // Scatter mushrooms outside player zone
    const playerZone = rows - (cfg.playerZoneRows ?? 4);
    const total = cfg.mushroomCount ?? 30;
    let placed = 0;
    while (placed < total) {
      const r = randInt(playerZone);
      const c = randInt(cols);
      const k = `${r},${c}`;
      if (!mush[k]) { mush[k] = 4; placed++; }
    }

    const segments = Array.from({ length: len }, (_, i) => ({
      alive: true, isHead: i === 0,
      r: 0, c: i, dir: 1,
      prevR: 0, prevC: i,
    }));

    return {
      status: 'idle', mode: 'basique', score: 0, lives: 3, wave: 1,
      player: { x: Math.floor(cols / 2), y: rows - 2 },
      segments, mushrooms: mush, bullet: null, spider: null,
      centTimer: 0, spiderTimer: cfg.spiderSpawnInterval ?? 8,
    };
  }
}
