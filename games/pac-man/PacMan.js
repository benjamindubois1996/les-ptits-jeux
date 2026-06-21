/**
 * PacMan — Logique de jeu (V1 BASIQUE — correction bugs)
 *
 * Corrections v1.1 :
 *  - Latence contrôles : inversion immédiate de direction
 *  - Fantômes : canMove vérifié avant chaque déplacement (plus de traverse-mur)
 *  - Fantômes : wrapping tunnel + bounds-check
 *  - Fantômes : porte à sens unique (ghosts ne rentrent plus spontanément)
 *  - 2 labyrinthes alternés + vitesse progressive par niveau
 */

import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

// ─── Cellules ─────────────────────────────────────────────────────────
// 0 = vide passable   1 = mur   2 = pastille
// 3 = super-pastille  4 = porte fantômes (sens unique : sortie uniquement)

// ─── Labyrinthe 1 — classique ─────────────────────────────────────────
const MAZE_1 = [
//  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27
  [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0
  [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1], // 1
  [ 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1], // 2
  [ 1, 3, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 3, 1], // 3
  [ 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1], // 4
  [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1], // 5
  [ 1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1], // 6
  [ 1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1], // 7
  [ 1, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 1], // 8
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 9
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 10
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 11
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 4, 4, 1, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 12
  [ 0, 0, 0, 0, 0, 0, 2, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 2, 0, 0, 0, 0, 0, 0], // 13 ← tunnel
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 14
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 15
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 16
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 17
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 18
  [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1], // 19
  [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1], // 20
  [ 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1], // 21
  [ 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1], // 22
  [ 1, 3, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 0, 0, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 3, 1], // 23
  [ 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1], // 24
  [ 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 1], // 25
  [ 1, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 1], // 26
  [ 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1], // 27
  [ 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1], // 28
  [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1], // 29
  [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 30
];

// ─── Labyrinthe 2 — corridors larges ──────────────────────────────────
// Même structure de base (tunnel, ghost house) mais blocs intérieurs différents
// Les gros blocs latéraux (cols 2-5 / 22-25) sont divisés en couloirs plus fins
const MAZE_2 = [
  [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0
  [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1], // 1
  [ 1, 2, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 2, 1], // 2  ← col3/23 ouverts
  [ 1, 3, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 3, 1], // 3
  [ 1, 2, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 2, 1], // 4
  [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1], // 5
  [ 1, 2, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 2, 1, 1, 2, 1], // 6  ← plus ouvert au centre
  [ 1, 2, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 2, 1, 1, 2, 1], // 7
  [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1], // 8  ← cols 7-8 ouverts
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 9
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 10
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 11
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 4, 4, 1, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 12
  [ 0, 0, 0, 0, 0, 0, 2, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 2, 0, 0, 0, 0, 0, 0], // 13 ← tunnel (inchangé)
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 14
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 15
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 16
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 17
  [ 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1], // 18
  [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1], // 19
  [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1], // 20
  [ 1, 2, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 2, 1], // 21
  [ 1, 2, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 2, 1], // 22
  [ 1, 3, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 0, 0, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 3, 1], // 23
  [ 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 2, 2, 1, 1, 1], // 24
  [ 1, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 2, 2, 1, 1, 1], // 25
  [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1], // 26
  [ 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1], // 27
  [ 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1], // 28
  [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1], // 29
  [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 30
];

const MAZES = [MAZE_1, MAZE_2];

function countDots(maze) {
  let n = 0;
  for (const row of maze) for (const c of row) if (c === 2 || c === 3) n++;
  return n;
}

const COLS = 28;
const ROWS = 31;
const TUNNEL_ROW = 13;

const DIRS = {
  right: { dc:  1, dr:  0 },
  left:  { dc: -1, dr:  0 },
  up:    { dc:  0, dr: -1 },
  down:  { dc:  0, dr:  1 },
};
const OPPOSITE = { right: 'left', left: 'right', up: 'down', down: 'up' };

const GHOST_DEFS = [
  { id: 'blinky', color: '#ff2d2d', startCol: 13, startRow: 11, scatter: { col: 25, row: -3  }, inHouse: false, exitDelay:    0 },
  { id: 'pinky',  color: '#ffb8ff', startCol: 13, startRow: 14, scatter: { col:  2, row: -3  }, inHouse: true,  exitDelay: 2000 },
  { id: 'inky',   color: '#00ffff', startCol: 11, startRow: 14, scatter: { col: 27, row:  34 }, inHouse: true,  exitDelay: 4000 },
  { id: 'clyde',  color: '#ffb852', startCol: 15, startRow: 14, scatter: { col:  0, row:  34 }, inHouse: true,  exitDelay: 6000 },
];

export default class PacMan extends BaseGame {

  constructor(config) {
    super(config);
    this._raf      = null;
    this._lastTime = null;
    this.state     = this._buildIdleState();
  }

  // ─── CYCLE DE VIE ──────────────────────────────────────────────────

  _gameId() { return 'pac-man'; }

  init() {
    this._bindControls();
    this._setupEventBusBindings();
    EventBus.emit('game:ready', { gameId: 'pac-man' });
    EventBus.emit('game:tick',  { state: this.state, action: 'init' });
    this._startLoop();
  }

  destroy() {
    super.destroy();
    this._stopLoop();
    this._unbindControls();
  }

  // ─── DÉMARRAGE ─────────────────────────────────────────────────────

  start() {
    this.state = this._buildPlayState(1, 0, this.config.gameplay.lives);
    EventBus.emit('game:score-update', { lives: this.state.lives });
    EventBus.emit('game:start', { state: this.state });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  restart() {
    this.state = this._buildIdleState();
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  togglePause() {
    const s = this.state;
    if (s.status === 'playing') {
      s.status = 'paused';
      EventBus.emit('game:paused',  { state: s });
    } else if (s.status === 'paused') {
      s.status = 'playing';
      EventBus.emit('game:resumed', { state: s });
    }
  }

  // ─── ÉTATS ─────────────────────────────────────────────────────────

  _buildIdleState() {
    return { status: 'idle', score: 0, level: 1, lives: this.config.gameplay.lives, maze: null, pacman: null, ghosts: [] };
  }

  _buildPlayState(level, score, lives) {
    const mazeTemplate = MAZES[(level - 1) % MAZES.length];
    const maze         = mazeTemplate.map(row => [...row]);
    const totalDots    = countDots(maze);

    const ghosts = GHOST_DEFS.map(def => ({
      id: def.id, color: def.color,
      col: def.startCol, row: def.startRow,
      prevCol: def.startCol, prevRow: def.startRow,
      progress: 0,
      dir: 'up', nextDir: 'up',
      mode:     def.inHouse ? 'house' : 'scatter',
      inHouse:  def.inHouse,
      scatter:  def.scatter,
      exitDelay: def.exitDelay,
    }));

    const s = {
      status: 'ready',
      score, level, lives,
      dotsEaten: 0, totalDots,
      maze,
      pacman: {
        col: 13, row: 23, prevCol: 13, prevRow: 23,
        progress: 0,
        dir: 'left', nextDir: null,
        mouthOpen: 0.25, mouthDir: 1,
      },
      ghosts,
      ghostModeIdx: 0, ghostModeTimer: 0,
      frightened: false, frightenTimer: 0, frightenFlash: false,
      ghostEatMult: 1,
      readyTimer: this.config.gameplay.readyDuration,
      deathTimer: 0, levelTimer: 0, levelFlash: false,
    };
    return s;
  }

  // ─── BOUCLE ────────────────────────────────────────────────────────

  _startLoop() {
    this._lastTime = null;
    const loop = (ts) => {
      if (!this._lastTime) this._lastTime = ts;
      const dt = Math.min((ts - this._lastTime) / 16.667, 3);
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

  // ─── MISE À JOUR PRINCIPALE ────────────────────────────────────────

  _update(dt) {
    const s = this.state;

    if (s.status === 'ready') {
      s.readyTimer -= dt * 16.667;
      if (s.readyTimer <= 0) {
        s.status = 'playing';
        EventBus.emit('game:tick', { state: s, action: 'playing' });
      }
      return;
    }
    if (s.status === 'dying') {
      s.deathTimer -= dt * 16.667;
      if (s.deathTimer <= 0) this._afterDeath();
      return;
    }
    if (s.status === 'levelcomplete') {
      s.levelTimer -= dt * 16.667;
      s.levelFlash = Math.floor(s.levelTimer / 200) % 2 === 0;
      if (s.levelTimer <= 0) this._nextLevel();
      return;
    }
    if (s.status !== 'playing') return;

    this._updateGhostMode(dt);
    this._updateFrightened(dt);
    this._updatePacman(dt);
    this._updateGhosts(dt);
    this._checkCollisions();
    this._animateMouth(dt);
  }

  // ─── MODE GLOBAL FANTÔMES ──────────────────────────────────────────

  _updateGhostMode(dt) {
    const s = this.state;
    if (s.frightened) return;
    const schedule = this.config.gameplay.ghostModeSchedule;
    if (s.ghostModeIdx >= schedule.length) return;

    s.ghostModeTimer += dt * 16.667;
    if (s.ghostModeTimer >= schedule[s.ghostModeIdx].duration) {
      s.ghostModeTimer = 0;
      s.ghostModeIdx++;
      const newMode = this._currentGlobalMode();
      for (const g of s.ghosts) {
        if (g.mode === 'scatter' || g.mode === 'chase') {
          // Demi-tour lors d'un changement de mode global
          g.nextDir = OPPOSITE[g.dir] || g.dir;
          g.mode    = newMode;
        }
      }
    }
  }

  _currentGlobalMode() {
    const schedule = this.config.gameplay.ghostModeSchedule;
    const idx = this.state.ghostModeIdx;
    return idx < schedule.length ? schedule[idx].mode : 'chase';
  }

  _updateFrightened(dt) {
    const s = this.state;
    if (!s.frightened) return;
    s.frightenTimer -= dt * 16.667;
    s.frightenFlash  = s.frightenTimer < 2000 && Math.floor(s.frightenTimer / 300) % 2 === 0;
    if (s.frightenTimer <= 0) {
      s.frightened    = false;
      s.frightenFlash = false;
      s.ghostEatMult  = 1;
      for (const g of s.ghosts)
        if (g.mode === 'frightened') g.mode = this._currentGlobalMode();
    }
  }

  // ─── PAC-MAN ───────────────────────────────────────────────────────

  _updatePacman(dt) {
    const s  = this.state;
    const pm = s.pacman;
    const spd = this._getPacmanSpeed() / 60;

    // Inversion immédiate (sans attendre le centre de la case)
    if (pm.nextDir && pm.nextDir === OPPOSITE[pm.dir]) {
      [pm.col, pm.prevCol] = [pm.prevCol, pm.col];
      [pm.row, pm.prevRow] = [pm.prevRow, pm.row];
      pm.progress = 1 - pm.progress;
      pm.dir      = pm.nextDir;
      pm.nextDir  = null;
    }

    pm.progress += spd * dt;

    if (pm.progress >= 1) {
      pm.prevCol  = pm.col;
      pm.prevRow  = pm.row;
      pm.progress -= 1;

      this._eatCell(pm.col, pm.row);

      // Appliquer la direction demandée si possible
      if (pm.nextDir && this._canPacmanMove(pm.col, pm.row, pm.nextDir)) {
        pm.dir = pm.nextDir;
      }

      // Avancer
      if (this._canPacmanMove(pm.col, pm.row, pm.dir)) {
        const { dc, dr } = DIRS[pm.dir];
        pm.col = this._wrapCol(pm.col + dc, pm.row + dr);
        pm.row = pm.row + dr;
      } else if (pm.nextDir && this._canPacmanMove(pm.col, pm.row, pm.nextDir)) {
        pm.dir = pm.nextDir;
        const { dc, dr } = DIRS[pm.dir];
        pm.col = this._wrapCol(pm.col + dc, pm.row + dr);
        pm.row = pm.row + dr;
      } else {
        pm.progress = 1; // bloqué
      }
    }
  }

  _canPacmanMove(col, row, dir) {
    const { dc, dr } = DIRS[dir];
    const nc = this._wrapCol(col + dc, row + dr);
    const nr = row + dr;
    if (nr < 0 || nr >= ROWS) return false;
    const cell = this.state.maze[nr]?.[nc];
    return cell !== undefined && cell !== 1 && cell !== 4;
  }

  _eatCell(col, row) {
    const s = this.state;
    const cell = s.maze[row]?.[col];
    if (cell === 2) {
      s.maze[row][col] = 0;
      s.score     += this.config.scoring.dot;
      s.dotsEaten++;
      EventBus.emit('game:score-update', { score: s.score });
      this._checkLevelComplete();
    } else if (cell === 3) {
      s.maze[row][col] = 0;
      s.score     += this.config.scoring.powerPellet;
      s.dotsEaten++;
      EventBus.emit('game:score-update', { score: s.score });
      this._activateFrightened();
      this._checkLevelComplete();
    }
  }

  _activateFrightened() {
    const s = this.state;
    s.frightened    = true;
    s.frightenTimer = this._getFrightenedDuration();
    s.ghostEatMult  = 1;
    for (const g of s.ghosts) {
      if (g.mode === 'chase' || g.mode === 'scatter') {
        g.nextDir = OPPOSITE[g.dir] || g.dir;
        g.mode    = 'frightened';
      }
    }
  }

  _animateMouth(dt) {
    const pm = this.state.pacman;
    pm.mouthOpen += pm.mouthDir * 0.12 * dt;
    if (pm.mouthOpen >= 1)  { pm.mouthOpen = 1;  pm.mouthDir = -1; }
    if (pm.mouthOpen <= 0)  { pm.mouthOpen = 0;  pm.mouthDir =  1; }
  }

  // ─── FANTÔMES ──────────────────────────────────────────────────────

  _updateGhosts(dt) {
    for (const g of this.state.ghosts) this._updateGhost(g, dt);
  }

  _updateGhost(g, dt) {
    if (g.mode === 'house') {
      g.exitDelay -= dt * 16.667;
      if (g.exitDelay <= 0) {
        g.mode = 'leaving';
      } else {
        this._bounceInHouse(g, dt);
      }
      return;
    }
    if (g.mode === 'leaving') {
      this._leaveHouse(g, dt);
      return;
    }

    const spd = (g.mode === 'eaten'      ? this.config.gameplay.eatenSpeed :
                 g.mode === 'frightened' ? this.config.gameplay.frightenedSpeed :
                 this._getGhostSpeed()) / 60;

    g.progress += spd * dt;
    if (g.progress < 1) return;
    g.progress -= 1;

    g.prevCol = g.col;
    g.prevRow = g.row;

    // Fantôme mangé arrivé à l'entrée de la maison → retour en maison
    if (g.mode === 'eaten' && g.col === 13 && g.row === 11) {
      g.col      = 13;
      g.row      = 14;
      g.prevCol  = 13;
      g.prevRow  = 14;
      g.mode     = 'house';
      g.inHouse  = true;
      g.exitDelay = 1500;
      return;
    }

    // Appliquer la direction pré-calculée
    const wantedDir = g.nextDir || g.dir;
    if (this._canGhostMove(g.col, g.row, wantedDir, g.mode)) {
      g.dir = wantedDir;
    } else if (!this._canGhostMove(g.col, g.row, g.dir, g.mode)) {
      // Direction courante bloquée → chercher une alternative
      const alts = this._possibleGhostDirs(g.col, g.row, OPPOSITE[g.dir], g.mode);
      g.dir = alts[0] || OPPOSITE[g.dir];
    }

    // Déplacer seulement si la case est libre
    if (this._canGhostMove(g.col, g.row, g.dir, g.mode)) {
      const { dc, dr } = DIRS[g.dir];
      g.col = this._wrapCol(g.col + dc, g.row + dr);
      g.row = g.row + dr;
    }

    // Calculer la prochaine direction depuis la nouvelle position
    this._computeNextDir(g);
  }

  _bounceInHouse(g, dt) {
    g.progress += (3 / 60) * dt;
    if (g.progress < 1) return;
    g.progress -= 1;
    g.prevCol = g.col;
    g.prevRow = g.row;
    g.row     = (g.row === 13) ? 14 : 13;
  }

  _leaveHouse(g, dt) {
    g.progress += (this._getGhostSpeed() / 60) * dt;
    if (g.progress < 1) return;
    g.progress -= 1;

    g.prevCol = g.col;
    g.prevRow = g.row;

    if (g.row >= 12) {
      // Pas encore sorti : d'abord aller sur col 13, ensuite monter
      if (g.col !== 13) {
        g.col += (g.col < 13) ? 1 : -1;
      } else {
        g.row--;
      }
    } else {
      // Sorti !
      g.inHouse  = false;
      g.mode     = this._currentGlobalMode();
      g.dir      = 'left';
      g.nextDir  = 'left';
      this._computeNextDir(g);
    }
  }

  _computeNextDir(g) {
    const s   = this.state;
    const col = g.col;
    const row = g.row;

    if (g.mode === 'frightened') {
      const dirs = this._possibleGhostDirs(col, row, g.dir, g.mode);
      g.nextDir  = dirs.length > 0 ? dirs[Math.floor(Math.random() * dirs.length)] : OPPOSITE[g.dir];
      return;
    }

    const target = (g.mode === 'eaten')   ? { col: 13, row: 11 } :
                   (g.mode === 'scatter') ? g.scatter :
                   this._chaseTarget(g);

    const possible = this._possibleGhostDirs(col, row, g.dir, g.mode);
    if (possible.length === 0) { g.nextDir = OPPOSITE[g.dir]; return; }

    let best = possible[0], bestDist = Infinity;
    for (const dir of possible) {
      const { dc, dr } = DIRS[dir];
      const nc   = this._wrapCol(col + dc, row + dr);
      const nr   = row + dr;
      const dist = (nc - target.col) ** 2 + (nr - target.row) ** 2;
      if (dist < bestDist) { bestDist = dist; best = dir; }
    }
    g.nextDir = best;
  }

  _possibleGhostDirs(col, row, currentDir, mode) {
    const rev = OPPOSITE[currentDir];
    return Object.keys(DIRS).filter(dir => {
      if (dir === rev) return false;
      if (!this._canGhostMove(col, row, dir, mode)) return false;
      return true;
    });
  }

  _canGhostMove(col, row, dir, mode) {
    const { dc, dr } = DIRS[dir];
    const nc   = this._wrapCol(col + dc, row + dr);
    const nr   = row + dr;
    if (nr < 0 || nr >= ROWS) return false;
    const cell = this.state.maze[nr]?.[nc];
    if (cell === undefined || cell === 1) return false;
    if (cell === 4) {
      // Porte : uniquement pour les fantômes qui sortent (leaving) ou rentrent (eaten)
      return mode === 'leaving' || mode === 'eaten';
    }
    return true;
  }

  _chaseTarget(g) {
    const s  = this.state;
    const pm = s.pacman;
    switch (g.id) {
      case 'blinky':
        return { col: pm.col, row: pm.row };
      case 'pinky': {
        const { dc, dr } = DIRS[pm.dir] ?? DIRS.up;
        return { col: pm.col + dc * 4, row: pm.row + dr * 4 };
      }
      case 'inky': {
        const blinky = s.ghosts.find(x => x.id === 'blinky');
        const { dc, dr } = DIRS[pm.dir] ?? DIRS.up;
        const px = pm.col + dc * 2, py = pm.row + dr * 2;
        const bx = blinky?.col ?? pm.col, by = blinky?.row ?? pm.row;
        return { col: px + (px - bx), row: py + (py - by) };
      }
      case 'clyde': {
        const dist2 = (g.col - pm.col) ** 2 + (g.row - pm.row) ** 2;
        return dist2 > 64 ? { col: pm.col, row: pm.row } : g.scatter;
      }
      default:
        return { col: pm.col, row: pm.row };
    }
  }

  // ─── COLLISIONS ────────────────────────────────────────────────────

  _checkCollisions() {
    const s  = this.state;
    const pm = s.pacman;

    for (const g of s.ghosts) {
      if (g.mode === 'house' || g.mode === 'leaving' || g.mode === 'eaten') continue;

      const same    = g.col === pm.col && g.row === pm.row;
      const crossed = g.col === pm.prevCol && g.row === pm.prevRow
                   && g.prevCol === pm.col  && g.prevRow === pm.row;

      if (same || crossed) {
        if (g.mode === 'frightened') {
          this._eatGhost(g);
        } else {
          this._pacmanDie();
          return;
        }
      }
    }
  }

  _eatGhost(g) {
    const s      = this.state;
    const points = this.config.scoring.ghost * s.ghostEatMult;
    s.score       += points;
    s.ghostEatMult *= 2;
    g.mode         = 'eaten';
    g.prevCol      = g.col;
    g.prevRow      = g.row;
    g.progress     = 0;
    EventBus.emit('game:score-update', { score: s.score });
    EventBus.emit('pacman:ghost-eaten', { ghost: g.id, points });
  }

  _pacmanDie() {
    const s  = this.state;
    s.status     = 'dying';
    s.deathTimer = this.config.gameplay.deathDuration;
    EventBus.emit('pacman:death', {});
  }

  _afterDeath() {
    const s = this.state;
    s.lives--;
    EventBus.emit('game:score-update', { lives: s.lives });
    if (s.lives <= 0) {
      s.status = 'gameover';
      const best    = ScoreService.getBest('pac-man');
      const isRecord = s.score > best;
      if (isRecord) ScoreService.submit('pac-man', s.score);
      EventBus.emit('game:over', { score: s.score, isRecord });
    } else {
      this._resetPositions();
      s.status     = 'ready';
      s.readyTimer = this.config.gameplay.readyDuration;
      EventBus.emit('game:tick', { state: s, action: 'ready' });
    }
  }

  _resetPositions() {
    const s = this.state;
    s.pacman = {
      col: 13, row: 23, prevCol: 13, prevRow: 23,
      progress: 0, dir: 'left', nextDir: null,
      mouthOpen: 0.25, mouthDir: 1,
    };
    s.frightened    = false;
    s.frightenTimer = 0;
    s.ghostEatMult  = 1;
    s.ghosts = GHOST_DEFS.map(def => ({
      id: def.id, color: def.color,
      col: def.startCol, row: def.startRow,
      prevCol: def.startCol, prevRow: def.startRow,
      progress: 0,
      dir: 'up', nextDir: 'up',
      mode:     def.inHouse ? 'house' : 'scatter',
      inHouse:  def.inHouse,
      scatter:  def.scatter,
      exitDelay: def.exitDelay,
    }));
  }

  _checkLevelComplete() {
    const s = this.state;
    if (s.dotsEaten >= s.totalDots) {
      s.status     = 'levelcomplete';
      s.levelTimer = this.config.gameplay.levelCompleteDuration;
      s.levelFlash = false;
      EventBus.emit('pacman:level-complete', { level: s.level });
    }
  }

  _nextLevel() {
    const s = this.state;
    this.state = this._buildPlayState(s.level + 1, s.score, s.lives);
    EventBus.emit('game:tick', { state: this.state, action: 'nextlevel' });
  }

  // ─── HELPERS VITESSE ───────────────────────────────────────────────

  _getGhostSpeed() {
    const lvl = this.state?.level ?? 1;
    return Math.min(
      this.config.gameplay.ghostSpeed + (lvl - 1) * 0.25,
      this.config.gameplay.ghostSpeed + 3
    );
  }

  _getPacmanSpeed() {
    const lvl = this.state?.level ?? 1;
    return Math.min(
      this.config.gameplay.pacmanSpeed + (lvl - 1) * 0.1,
      this.config.gameplay.pacmanSpeed + 1
    );
  }

  _getFrightenedDuration() {
    const lvl = this.state?.level ?? 1;
    return Math.max(
      this.config.gameplay.frightenedDuration - (lvl - 1) * 400,
      2000
    );
  }

  // ─── HELPERS DÉPLACEMENT ───────────────────────────────────────────

  _wrapCol(col, row) {
    if (row === TUNNEL_ROW) {
      if (col < 0)    return COLS - 1;
      if (col >= COLS) return 0;
    }
    // Hors tunnel : ne pas sortir de la grille (sécurité)
    return Math.max(0, Math.min(COLS - 1, col));
  }

  // ─── CONTRÔLES ─────────────────────────────────────────────────────

  _bindControls() {
    const kb = this.config.controls.keyboard;

    this._onKeyDown = (e) => {
      const s = this.state;

      if (kb.restart?.includes(e.code)) { e.preventDefault(); this.restart(); return; }
      if (kb.pause?.includes(e.code)) {
        e.preventDefault();
        if (s.status === 'playing' || s.status === 'paused') this.togglePause();
        return;
      }

      if (s.status === 'idle') {
        if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.start(); }
        return;
      }
      if (s.status === 'gameover') {
        if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.restart(); }
        return;
      }

      const dirMap = {
        ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
        ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      };
      const d = dirMap[e.code];
      if (d) { e.preventDefault(); if (s.pacman) s.pacman.nextDir = d; }
    };

    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindControls() {
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
