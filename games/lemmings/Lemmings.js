import EventBus     from '../../js/core/EventBus.js';
import ScoreService  from '../../js/services/ScoreService.js';
import BaseGame      from '../../js/core/BaseGame.js';

// Terrain: Uint8Array (1=solid, 0=empty). Grid: 150 cols × 60 rows at cellSize=4px
const GW = 150, GH = 60;

const LEVELS = [
  {
    name: 'Juste passer',
    goal: 80, count: 10, spawnInterval: 2.0,
    available: { blocker: 2, digger: 1, builder: 2, basher: 0, floater: 1, climber: 0 },
    platforms: [
      { x: 0, y: 58, w: 150, h: 2 },       // floor
      { x: 0, y: 0,  w: 2,   h: 60 },       // left wall
      { x: 148, y: 0, w: 2,  h: 60 },       // right wall
      { x: 30, y: 45, w: 30, h: 2 },        // platform 1
      { x: 90, y: 33, w: 30, h: 2 },        // platform 2
    ],
    spawn: { col: 5, row: 20 }, exit: { col: 138, row: 54, w: 8, h: 4 }
  },
  {
    name: 'Le fossé',
    goal: 70, count: 12, spawnInterval: 1.8,
    available: { blocker: 2, digger: 0, builder: 5, basher: 0, floater: 2, climber: 0 },
    platforms: [
      { x: 0,   y: 58, w: 55, h: 2 },
      { x: 80,  y: 58, w: 70, h: 2 },
      { x: 0,   y: 0,  w: 2,  h: 60 },
      { x: 148, y: 0,  w: 2,  h: 60 },
    ],
    spawn: { col: 5, row: 15 }, exit: { col: 138, row: 54, w: 8, h: 4 }
  },
  {
    name: 'La falaise',
    goal: 75, count: 15, spawnInterval: 1.6,
    available: { blocker: 3, digger: 2, builder: 3, basher: 1, floater: 4, climber: 0 },
    platforms: [
      { x: 0, y: 30, w: 50, h: 2 },
      { x: 0, y: 0,  w: 2,  h: 60 },
      { x: 148, y: 0, w: 2, h: 60 },
      { x: 0, y: 58, w: 10, h: 2 },
      { x: 50, y: 58, w: 100, h: 2 },
      { x: 60, y: 44, w: 40, h: 2 },
    ],
    spawn: { col: 5, row: 10 }, exit: { col: 138, row: 54, w: 8, h: 4 }
  },
  {
    name: 'Creuser',
    goal: 65, count: 15, spawnInterval: 1.5,
    available: { blocker: 2, digger: 5, builder: 2, basher: 3, floater: 2, climber: 2 },
    platforms: [
      { x: 0,  y: 20, w: 150, h: 4 },
      { x: 0,  y: 58, w: 150, h: 2 },
      { x: 0,  y: 0,  w: 2,   h: 60 },
      { x: 148,y: 0,  w: 2,   h: 60 },
      { x: 20, y: 38, w: 110, h: 4 },
    ],
    spawn: { col: 5, row: 5 }, exit: { col: 138, row: 54, w: 8, h: 4 }
  },
  {
    name: 'Défi total',
    goal: 60, count: 20, spawnInterval: 1.2,
    available: { blocker: 3, digger: 4, builder: 5, basher: 3, floater: 5, climber: 3 },
    platforms: [
      { x: 0,   y: 58, w: 150, h: 2 },
      { x: 0,   y: 0,  w: 2,   h: 60 },
      { x: 148, y: 0,  w: 2,   h: 60 },
      { x: 0,   y: 15, w: 60,  h: 3 },
      { x: 80,  y: 15, w: 70,  h: 3 },
      { x: 30,  y: 30, w: 40,  h: 3 },
      { x: 90,  y: 30, w: 40,  h: 3 },
      { x: 55,  y: 44, w: 40,  h: 3 },
    ],
    spawn: { col: 5, row: 5 }, exit: { col: 138, row: 54, w: 8, h: 4 }
  },
];

let _lid = 0;

export default class Lemmings extends BaseGame {
  constructor(config) {
    super(config);
    this.state   = this._buildFullState(0);
    this._loopId = null;
    this._last   = 0;
    this._lid    = 0;
  }

  _gameId() { return 'lemmings'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() { super.destroy(); this._stopLoop(); }

  start(options = {}) {
    this.state        = this._buildFullState(0);
    this.state.status = 'playing';
    this.state.mode   = options.mode ?? 'basique';
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
    this._startLoop();
  }

  restart() {
    this._stopLoop();
    this.state = { ...this._buildFullState(0), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  { this._stopLoop(); }
  _onResume() { this._startLoop(); }

  selectSkill(skill) {
    if (this.state.status !== 'playing') return;
    this.state.selectedSkill = skill;
  }

  // px, py in canvas pixels
  assignSkill(px, py) {
    const { state } = this;
    if (state.status !== 'playing') return;
    const sk = state.selectedSkill;
    if (!sk || (state.available[sk] ?? 0) <= 0) return;
    const cfg  = this.config.gameplay;
    const cs   = cfg.cellSize;
    const col  = Math.floor(px / cs), row = Math.floor(py / cs);
    // Find nearest alive, actionable lemming
    const lem = state.lemmings
      .filter(l => l.alive && (l.action === 'walk' || l.action === 'fall'))
      .sort((a, b) => (Math.abs(a.col - col) + Math.abs(a.row - row)) - (Math.abs(b.col - col) + Math.abs(b.row - row)))[0];
    if (!lem) return;
    // Assign skill
    state.available[sk]--;
    if (sk === 'floater') { lem.floater = true; return; }
    if (sk === 'climber') { lem.climber = true; return; }
    lem.action = sk;
    if (sk === 'blocker')  lem.dir = 0;
    if (sk === 'builder') { lem.buildSteps = 12; lem.buildTimer = 0; }
    if (sk === 'digger')   lem.digTimer = 0;
    if (sk === 'basher')   lem.bashTimer = 0;
  }

  // Assigne le skill sélectionné au premier lemming disponible (pas besoin de clic précis)
  assignSkillToNearest() {
    const { state } = this;
    if (state.status !== 'playing') return false;
    const sk = state.selectedSkill;
    if (!sk || (state.available[sk] ?? 0) <= 0) return false;
    const lem = state.lemmings
      .filter(l => l.alive && (l.action === 'walk' || l.action === 'fall'))[0];
    if (!lem) return false;
    state.available[sk]--;
    if (sk === 'floater') { lem.floater = true; return true; }
    if (sk === 'climber') { lem.climber = true; return true; }
    lem.action = sk;
    if (sk === 'blocker')  lem.dir = 0;
    if (sk === 'builder') { lem.buildSteps = 12; lem.buildTimer = 0; }
    if (sk === 'digger')   lem.digTimer = 0;
    if (sk === 'basher')   lem.bashTimer = 0;
    return true;
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
    const lv  = LEVELS[state.levelIdx];
    const cfg = this.config.gameplay;

    // Spawn lemmings
    if (state.spawned < lv.count) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        state.spawnTimer = lv.spawnInterval;
        state.lemmings.push(this._spawnLemming(lv));
        state.spawned++;
      }
    }

    // Update each lemming
    state.lemmings.forEach(l => this._updateLemming(l, state, dt));

    // Count saved / dead
    const alive = state.lemmings.filter(l => l.alive).length;
    const saved = state.lemmings.filter(l => l.saved).length;
    const dead  = state.lemmings.filter(l => !l.alive && !l.saved).length;

    // Level over when all spawned and no non-blocker lemmings remain alive
    const activeAlive = state.lemmings.filter(l => l.alive && l.action !== 'blocker').length;
    if (state.spawned >= lv.count && activeAlive === 0) {
      // Blockers ne meurent jamais seuls — on les élimine proprement
      state.lemmings.filter(l => l.alive && l.action === 'blocker').forEach(l => { l.alive = false; });
      this._levelEnd(saved, lv);
    }

    state.saved = saved;
    state.dead  = dead;
  }

  _updateLemming(l, state, dt) {
    if (!l.alive) return;
    const lv = LEVELS[state.levelIdx];

    // Check exit
    const ex = lv.exit;
    if (l.col >= ex.col && l.col < ex.col + ex.w && l.row >= ex.row && l.row < ex.row + ex.h) {
      l.alive = false; l.saved = true; return;
    }

    l.stepT = (l.stepT || 0) + dt;

    switch (l.action) {
      case 'walk':    this._walkLemming(l, state, dt); break;
      case 'fall':    this._fallLemming(l, state, dt); break;
      case 'blocker': break;
      case 'digger':  this._digDown(l, state, dt);   break;
      case 'basher':  this._bash(l, state, dt);      break;
      case 'builder': this._build(l, state, dt);     break;
    }
  }

  _walkLemming(l, state, dt) {
    const terrain = state.terrain;

    l.walkTimer = (l.walkTimer || 0) + dt;
    if (l.walkTimer < 0.065) return;
    l.walkTimer = 0;

    const newCol = l.col + l.dir;
    if (newCol < 0 || newCol >= GW) { l.dir *= -1; return; }

    // Blocker ahead?
    if (state.lemmings.some(b => b !== l && b.action === 'blocker' && b.col === newCol && b.row === l.row)) {
      l.dir *= -1; return;
    }

    const wallAhead = this._isSolid(terrain, newCol, l.row) || this._isSolid(terrain, newCol, l.row - 1);
    if (wallAhead) {
      // Try 1-tile stair-up
      if (!this._isSolid(terrain, newCol, l.row - 1) && !this._isSolid(terrain, newCol, l.row - 2)) {
        l.row--; l.col = newCol;
      } else { l.dir *= -1; }
    } else {
      l.col = newCol;
      if (!this._isSolid(terrain, l.col, l.row + 1)) { l.fallDist = 0; l.action = 'fall'; }
    }
  }

  _fallLemming(l, state, dt) {
    const terrain = state.terrain;

    l.fallTimer = (l.fallTimer || 0) + dt;
    if (l.fallTimer < 0.045) return;
    l.fallTimer = 0;

    l.fallDist = (l.fallDist || 0) + 1;
    l.row++;
    if (l.row >= GH) { l.alive = false; return; }

    if (this._isSolid(terrain, l.col, l.row + 1)) {
      if (!l.floater && l.fallDist > this.config.gameplay.maxFallSplat) {
        l.alive = false;
      } else {
        l.action = 'walk'; l.fallDist = 0;
      }
    }
  }

  _digDown(l, state, dt) {
    l.digTimer = (l.digTimer || 0) + dt;
    if (l.digTimer < 0.09) return;
    l.digTimer = 0;

    const tr = l.row + 1;
    if (tr < GH && state.terrain[tr]) {
      for (let c = Math.max(0, l.col - 1); c <= Math.min(GW - 1, l.col + 1); c++)
        state.terrain[tr][c] = 0;
    }
    l.row++;
    if (l.row >= GH) { l.alive = false; return; }
    if (!this._isSolid(state.terrain, l.col, l.row + 1)) { l.action = 'fall'; l.fallDist = 0; }
  }

  _bash(l, state, dt) {
    l.bashTimer = (l.bashTimer || 0) + dt;
    if (l.bashTimer < 0.09) return;
    l.bashTimer = 0;

    const ahead = l.col + l.dir;
    if (ahead < 0 || ahead >= GW) { l.action = 'walk'; return; }

    let hit = false;
    for (let r = l.row - 1; r <= l.row; r++) {
      if (r >= 0 && r < GH && state.terrain[r]?.[ahead] === 1) {
        state.terrain[r][ahead] = 0; hit = true;
      }
    }
    if (!hit) { l.action = 'walk'; return; }
    if (!this._isSolid(state.terrain, ahead, l.row)) l.col = ahead;
  }

  _build(l, state, dt) {
    l.buildTimer = (l.buildTimer || 0) + dt;
    if (l.buildTimer < 0.14) return;
    l.buildTimer = 0;
    l.buildSteps = (l.buildSteps || 12) - 1;

    const bc = l.col + l.dir, br = l.row + 1;
    if (bc >= 0 && bc < GW && br >= 0 && br < GH && state.terrain[br])
      state.terrain[br][bc] = 1;
    l.col = bc;
    if (l.buildSteps <= 0) l.action = 'walk';
    if (l.col < 0 || l.col >= GW) l.alive = false;
  }

  _isSolid(terrain, col, row) {
    if (row < 0)              return true;   // plafond = solide
    if (col < 0 || col >= GW) return true;   // murs latéraux = solides
    if (row >= GH)            return false;  // sous la grille = vide → lemmings tombent à la mort
    return terrain[row] && terrain[row][col] === 1;
  }

  _spawnLemming(lv) {
    return {
      id: this._lid++,
      col: lv.spawn.col, row: lv.spawn.row,
      dir: 1, action: 'fall',
      alive: true, saved: false,
      fallDist: 0, floater: false, climber: false,
      walkTimer: 0, fallTimer: 0, digTimer: 0, bashTimer: 0, buildTimer: 0,
      buildSteps: 0, stepT: 0
    };
  }

  _levelEnd(saved, lv) {
    const { state } = this;
    this._stopLoop();
    const pct  = Math.round(saved / lv.count * 100);
    const won  = pct >= lv.goal;
    state.score += won ? saved * 10 + 100 : saved * 5;
    EventBus.emit('game:score-update', { score: state.score });

    if (won && state.levelIdx < LEVELS.length - 1) {
      // Next level
      state.levelIdx++;
      const next = this._buildFullState(state.levelIdx);
      Object.assign(state, { ...next, status: 'playing', score: state.score });
      EventBus.emit('game:tick', { state, action: 'level-up' });
      this._startLoop();
      return;
    }

    const { best } = ScoreService.submit(this._gameId(), state.score);
    if (won) {
      EventBus.emit('game:won', {
        result: 'win', icon: '🐾', title: 'VICTOIRE !', score: state.score, best,
        extraInfo: `<div class="overlay-score">Tous sauvés !</div>`
      });
    } else {
      EventBus.emit('game:over', {
        result: pct >= lv.goal - 20 ? 'draw' : 'lose',
        icon: '🐾', title: pct >= lv.goal ? 'NIVEAU SUIVANT' : 'TROP DE PERTES',
        score: state.score, best,
        extraInfo: `<div class="overlay-score">${pct}% sauvés (objectif ${lv.goal}%)</div>`
      });
    }
  }

  _buildTerrain(lv) {
    // Flat Uint8Array: row-major [row * GW + col]
    const t = Array.from({ length: GH }, () => new Uint8Array(GW));
    lv.platforms.forEach(p => {
      for (let r = p.y; r < Math.min(p.y + p.h, GH); r++) {
        for (let c = p.x; c < Math.min(p.x + p.w, GW); c++) {
          t[r][c] = 1;
        }
      }
    });
    return t;
  }

  _buildFullState(lvIdx = 0) {
    const lv  = LEVELS[lvIdx];
    const terrain = this._buildTerrain(lv);
    return {
      status: 'idle', mode: 'basique', score: 0, levelIdx: lvIdx,
      levelName: lv.name, goal: lv.goal,
      terrain,
      lemmings: [], spawned: 0, saved: 0, dead: 0,
      spawnTimer: lv.spawnInterval * 0.5,
      available: { ...lv.available },
      selectedSkill: null
    };
  }
}
