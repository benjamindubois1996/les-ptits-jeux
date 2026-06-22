import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import GameLoop     from '../../js/core/GameLoop.js';
import { randInt }  from '../../js/utils/Random.js';

// Fixed path waypoints as [row, col] — enemies move along these
const PATH_WAYPOINTS = [
  [1,0],[1,1],[1,2],[1,3],[1,4],[1,5],
  [2,5],[3,5],[4,5],[5,5],[6,5],
  [6,6],[6,7],[6,8],[6,9],[6,10],
  [5,10],[4,10],[3,10],[2,10],[1,10],
  [1,11],[1,12],[1,13],[1,14],[1,15],
  [2,15],[3,15],[4,15],[5,15],[6,15],
  [6,16],[6,17],[6,18],[6,19],
  [7,19],[8,19],[9,19],[10,19],[11,19],
];

// Build path set for quick lookup
const PATH_SET = new Set(PATH_WAYPOINTS.map(([r,c]) => `${r},${c}`));

const WAVES = [
  { count:10, hp:40,  speed:1.2, reward:8  },
  { count:14, hp:70,  speed:1.4, reward:10 },
  { count:18, hp:120, speed:1.6, reward:12 },
  { count:22, hp:200, speed:1.8, reward:15 },
  { count:28, hp:350, speed:2.0, reward:20 },
  { count:35, hp:600, speed:2.2, reward:25 },
  { count:20, hp:1200,speed:1.5, reward:40 },
];

export default class TowerDefense extends BaseGame {
  constructor(config) {
    super(config);
    this.state = this._buildFullState();
    this._loop  = new GameLoop(() => this._tick());
    this._waveTimer = null;
    this._eid = 0;
    this._pid = 0;
  }

  _gameId() { return 'tower-defense'; }

  async init() {
    this._setupEventBusBindings();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    this._loop.stop();
    clearTimeout(this._waveTimer);
  }

  start(options = {}) {
    this._loop.stop();
    clearTimeout(this._waveTimer);
    this._eid = 0; this._pid = 0;
    this.state = {
      ...this._buildFullState(),
      status:    'playing',
      mode:      options.mode ?? 'basique',
      gold:      this.config.gameplay.startGold,
      lives:     this.config.gameplay.startLives,
      wave:      0,
      waveState: 'waiting', // 'waiting','spawning','active'
      towers:    [],
      enemies:   [],
      projectiles:[],
      score:     0,
      selectedTower: 'gun',
    };
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
    this._loop.start(16);
    this._startNextWave();
  }

  restart() {
    this._loop.stop();
    clearTimeout(this._waveTimer);
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  placeTower(r, c) {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (PATH_SET.has(`${r},${c}`)) return;
    if (state.towers.find(t => t.r === r && t.c === c)) return;
    const cfg = this.config.towers[state.selectedTower];
    if (!cfg || state.gold < cfg.cost) return;
    state.gold -= cfg.cost;
    state.towers.push({ r, c, type: state.selectedTower, lastFire: 0, ...cfg });
    EventBus.emit('game:tick', { state, action: 'place-tower' });
  }

  selectTower(type) {
    if (this.state.status !== 'playing') return;
    this.state.selectedTower = type;
    EventBus.emit('game:tick', { state: this.state, action: 'select-tower' });
  }

  _startNextWave() {
    if (this.state.status !== 'playing') return;
    const waveIdx = this.state.wave;
    if (waveIdx >= WAVES.length) { this._win(); return; }
    this.state.waveState = 'waiting';
    EventBus.emit('game:tick', { state: this.state, action: 'wave-incoming' });

    this._waveTimer = setTimeout(() => {
      if (this.state.status !== 'playing') return;
      this.state.waveState = 'spawning';
      const waveData = WAVES[waveIdx];
      let spawned = 0;
      const spawnInterval = setInterval(() => {
        if (this.state.status !== 'playing') { clearInterval(spawnInterval); return; }
        if (spawned >= waveData.count) { clearInterval(spawnInterval); this.state.waveState = 'active'; return; }
        this._spawnEnemy(waveData);
        spawned++;
      }, 600);
    }, this.config.gameplay.wavePause);
  }

  _spawnEnemy({ hp, speed, reward }) {
    const start = PATH_WAYPOINTS[0];
    this.state.enemies.push({
      id: this._eid++,
      pathIdx: 0,
      x: start[1] + 0.5,  // pixel center in cells
      y: start[0] + 0.5,
      hp, maxHp: hp, speed, reward,
    });
  }

  _tick() {
    if (this.state.status !== 'playing') return;
    const dt = 16 / 1000;
    const { state } = this;

    // Move enemies
    const dead = [];
    for (const e of state.enemies) {
      const target = PATH_WAYPOINTS[e.pathIdx + 1];
      if (!target) { dead.push(e); continue; }
      const tx = target[1] + 0.5, ty = target[0] + 0.5;
      const dx = tx - e.x, dy = ty - e.y;
      const dist = Math.hypot(dx, dy);
      const step = e.speed * dt * 2.5;
      if (dist <= step) { e.x = tx; e.y = ty; e.pathIdx++; }
      else { e.x += (dx / dist) * step; e.y += (dy / dist) * step; }
    }
    for (const e of dead) {
      state.enemies = state.enemies.filter(x => x !== e);
      state.lives--;
      EventBus.emit('game:lives-update', { lives: state.lives });
      if (state.lives <= 0) { this._gameOver(); return; }
    }

    // Tower shooting
    const now = Date.now();
    for (const tower of state.towers) {
      if (now - tower.lastFire < tower.fireRate) continue;
      const rangeSq = tower.range ** 2;
      const target = state.enemies.find(e => (e.x - tower.c - 0.5) ** 2 + (e.y - tower.r - 0.5) ** 2 <= rangeSq);
      if (!target) continue;
      tower.lastFire = now;
      state.projectiles.push({ id: this._pid++, x: tower.c + 0.5, y: tower.r + 0.5, tx: target.x, ty: target.y, targetId: target.id, damage: tower.damage, color: tower.color });
    }

    // Move projectiles
    const hitProjs = [];
    for (const p of state.projectiles) {
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const step = 8 * dt * 2.5;
      if (dist <= step || dist < 0.2) {
        hitProjs.push(p);
        const enemy = state.enemies.find(e => e.id === p.targetId);
        if (enemy) {
          enemy.hp -= p.damage;
          if (enemy.hp <= 0) {
            state.enemies = state.enemies.filter(e => e !== enemy);
            state.gold  += enemy.reward;
            state.score += enemy.reward * 10;
            EventBus.emit('game:score-update', { score: state.score });
          }
        }
      } else {
        p.x += (dx / dist) * step; p.y += (dy / dist) * step;
      }
    }
    state.projectiles = state.projectiles.filter(p => !hitProjs.includes(p));

    // Check wave done
    if (state.waveState === 'active' && state.enemies.length === 0) {
      state.wave++;
      this._startNextWave();
    }

    EventBus.emit('game:tick', { state, action: 'tick' });
  }

  _win() {
    this._loop.stop();
    this.state.status = 'won';
    const { best } = ScoreService.submit(this._gameId(), this.state.score);
    EventBus.emit('game:won', {
      result: 'win', icon: '🏰', title: 'VICTOIRE !',
      score: this.state.score, best,
      extraInfo: `<div class="overlay-score">Toutes les vagues repoussées !</div>`,
    });
  }

  _gameOver() {
    this._loop.stop();
    clearTimeout(this._waveTimer);
    this.state.status = 'over';
    const { best } = ScoreService.submit(this._gameId(), this.state.score);
    EventBus.emit('game:over', {
      result: 'lose', icon: '💥', title: 'BASE DÉTRUITE !',
      score: this.state.score, best,
    });
  }

  _buildFullState() {
    return {
      status:'idle', mode:'basique', gold:0, lives:0, wave:0, waveState:'waiting',
      towers:[], enemies:[], projectiles:[], score:0, selectedTower:'gun',
    };
  }

  static get PATH() { return PATH_WAYPOINTS; }
  static get PATH_SET() { return PATH_SET; }
}
