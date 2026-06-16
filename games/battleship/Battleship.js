import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class Battleship extends BaseGame {

  constructor(config) {
    super(config);
    this._G           = this._sizeFromId(config.gameplay.defaultGridSize);
    this.state        = this._buildInitialState();
    this._aiMode      = 'hunt';
    this._aiQueue     = [];
    this._aiTimeoutId = null;
  }

  _gameId() { return 'battleship'; }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: 'battleship' });
    EventBus.emit('game:tick',  { state: this.state, action: 'ready' });
  }

  destroy() {
    super.destroy();
    this._unbindControls();
    if (this._aiTimeoutId) clearTimeout(this._aiTimeoutId);
  }

  /* ============================================================
     ACTIONS
     ============================================================ */

  start(options = {}) {
    if (this._aiTimeoutId) { clearTimeout(this._aiTimeoutId); this._aiTimeoutId = null; }
    this._G       = this._sizeFromId(options.gridSizeId);
    this._aiMode  = 'hunt';
    this._aiQueue = [];

    const playerShips = this._buildShipList();
    const enemyShips  = this._placeShipsRandom(this._buildShipList());
    const enemyGrid   = this._gridFromShips(enemyShips);

    this.state = {
      ...this._buildInitialState(),
      status:          'placing',
      playerShips,
      enemyShips,
      enemyGrid,
      currentShipIdx:  0,
    };

    EventBus.emit('game:tick', { state: this.state, action: 'start-placing' });
  }

  rotateOrientation() {
    if (this.state.status !== 'placing') return;
    this.state.orientation = this.state.orientation === 'h' ? 'v' : 'h';
    this._refreshPreview();
    EventBus.emit('game:tick', { state: this.state, action: 'rotate' });
  }

  previewPlacement(cell) {
    if (this.state.status !== 'placing') return;
    const ship  = this.state.playerShips[this.state.currentShipIdx];
    const cells = this._shipCells(cell, ship.size, this.state.orientation);
    this.state.previewCells = cells || [];
    this.state.previewValid = cells ? this._canPlace(cells, this.state.playerGrid) : false;
    EventBus.emit('game:tick', { state: this.state, action: 'preview' });
  }

  clearPreview() {
    if (this.state.status !== 'placing') return;
    this.state.previewCells = [];
    this.state.previewValid = false;
    EventBus.emit('game:tick', { state: this.state, action: 'preview-clear' });
  }

  placeShip(cell) {
    if (this.state.status !== 'placing') return;
    const ship  = this.state.playerShips[this.state.currentShipIdx];
    const cells = this._shipCells(cell, ship.size, this.state.orientation);
    if (!cells || !this._canPlace(cells, this.state.playerGrid)) return;

    ship.cells       = cells;
    ship.orientation = this.state.orientation;
    const newGrid    = [...this.state.playerGrid];
    cells.forEach(c => newGrid[c] = 'ship');
    this.state.playerGrid   = newGrid;
    this.state.previewCells = [];

    const nextIdx = this.state.currentShipIdx + 1;
    if (nextIdx >= this.state.playerShips.length) {
      this.state.currentShipIdx = -1;
      this.state.status         = 'playing';
      this.state.turn           = 'player';
      EventBus.emit('game:tick', { state: this.state, action: 'placement-done' });
    } else {
      this.state.currentShipIdx = nextIdx;
      EventBus.emit('game:tick', { state: this.state, action: 'ship-placed' });
    }
  }

  shoot(cell) {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (state.turn  !== 'player')   return;
    const v = state.enemyGrid[cell];
    if (v === 'hit' || v === 'miss') return;

    const newGrid = [...state.enemyGrid];
    const isHit   = v === 'ship';
    newGrid[cell] = isHit ? 'hit' : 'miss';
    state.enemyGrid = newGrid;

    let sunkShip = null;
    if (isHit) {
      state.score += this.config.scoring.hitBonus;
      const ship = state.enemyShips.find(s => s.cells.includes(cell));
      if (ship && ship.cells.every(c => newGrid[c] === 'hit')) {
        ship.sunk = true;
        sunkShip  = ship;
        state.enemiesRemaining--;
        state.score += this.config.scoring.sinkBonus;
      }
    }

    EventBus.emit('game:score-update', { score: state.score });
    EventBus.emit('game:tick', {
      state,
      action: isHit ? 'player-hit' : 'player-miss',
      cell,
      sunkShip,
    });

    if (state.enemiesRemaining <= 0) {
      state.score  += this.config.scoring.winBonus;
      state.status  = 'won';
      const prevBest = ScoreService.getBest('battleship');
      ScoreService.submit('battleship', state.score);
      EventBus.emit('game:score-update', { score: state.score });
      EventBus.emit('game:won', {
        score:    state.score,
        isRecord: state.score > prevBest,
        best:     ScoreService.getBest('battleship'),
      });
      return;
    }

    state.turn = 'enemy';
    EventBus.emit('game:tick', { state, action: 'enemy-turn' });
    this._aiTimeoutId = setTimeout(() => this._aiShoot(), this.config.gameplay.ai.thinkDelay);
  }

  restart() {
    if (this._aiTimeoutId) { clearTimeout(this._aiTimeoutId); this._aiTimeoutId = null; }
    this._G       = this._sizeFromId(this.config.gameplay.defaultGridSize);
    this._aiMode  = 'hunt';
    this._aiQueue = [];
    this.state    = { ...this._buildInitialState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  /* ============================================================
     IA
     ============================================================ */

  _aiShoot() {
    this._aiTimeoutId = null;
    const { state } = this;
    if (state.status !== 'playing') return;

    let cell;

    if (this._aiMode === 'target') {
      while (this._aiQueue.length > 0) {
        const c = this._aiQueue.shift();
        if (state.playerGrid[c] !== 'hit' && state.playerGrid[c] !== 'miss') {
          cell = c;
          break;
        }
      }
      if (cell === undefined) this._aiMode = 'hunt';
    }

    if (cell === undefined) {
      const available = [];
      state.playerGrid.forEach((v, i) => {
        if (v !== 'hit' && v !== 'miss') available.push(i);
      });
      if (!available.length) return;
      cell = available[Math.floor(Math.random() * available.length)];
    }

    const newGrid = [...state.playerGrid];
    const isHit   = newGrid[cell] === 'ship';
    newGrid[cell]  = isHit ? 'hit' : 'miss';
    state.playerGrid = newGrid;

    let sunkShip = null;
    if (isHit) {
      this._aiMode = 'target';
      this._getAdjacent(cell).forEach(a => {
        if (!this._aiQueue.includes(a) && newGrid[a] !== 'hit' && newGrid[a] !== 'miss') {
          this._aiQueue.push(a);
        }
      });
      const ship = state.playerShips.find(s => s.cells.includes(cell));
      if (ship && ship.cells.every(c => newGrid[c] === 'hit')) {
        ship.sunk = true;
        sunkShip  = ship;
        state.playerRemaining--;
        this._aiMode  = 'hunt';
        this._aiQueue = [];
      }
    }

    EventBus.emit('game:tick', {
      state,
      action: isHit ? 'enemy-hit' : 'enemy-miss',
      cell,
      sunkShip,
    });

    if (state.playerRemaining <= 0) {
      state.status = 'gameover';
      const prevBest = ScoreService.getBest('battleship');
      ScoreService.submit('battleship', state.score);
      EventBus.emit('game:over', {
        score:    state.score,
        isRecord: state.score > 0 && state.score > prevBest,
      });
      return;
    }

    state.turn = 'player';
    EventBus.emit('game:tick', { state, action: 'player-turn' });
  }

  /* ============================================================
     UTILITAIRES GRILLE
     ============================================================ */

  _shipCells(start, size, orientation) {
    const G   = this._G;
    const row = Math.floor(start / G);
    const col = start % G;
    const cells = [];
    for (let i = 0; i < size; i++) {
      if (orientation === 'h') {
        if (col + i >= G) return null;
        cells.push(row * G + col + i);
      } else {
        if (row + i >= G) return null;
        cells.push((row + i) * G + col);
      }
    }
    return cells;
  }

  /* Vérifie qu'aucune case occupée et aucune case adjacente (8 directions) */
  _canPlace(cells, grid) {
    const G = this._G;
    if (!cells) return false;
    const cellSet = new Set(cells);
    for (const c of cells) {
      if (c < 0 || c >= G * G) return false;
      if (grid[c] === 'ship') return false;
    }
    for (const c of cells) {
      const row = Math.floor(c / G);
      const col = c % G;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = row + dr, nc = col + dc;
          if (nr >= 0 && nr < G && nc >= 0 && nc < G) {
            const ni = nr * G + nc;
            if (!cellSet.has(ni) && grid[ni] === 'ship') return false;
          }
        }
      }
    }
    return true;
  }

  _getAdjacent(cell) {
    const G   = this._G;
    const row = Math.floor(cell / G);
    const col = cell % G;
    const adj = [];
    if (row > 0)     adj.push(cell - G);
    if (row < G - 1) adj.push(cell + G);
    if (col > 0)     adj.push(cell - 1);
    if (col < G - 1) adj.push(cell + 1);
    return adj;
  }

  _placeShipsRandom(ships) {
    const G    = this._G;
    const grid = new Array(G * G).fill(null);
    for (const ship of ships) {
      let placed = false;
      for (let attempts = 0; attempts < 500 && !placed; attempts++) {
        const orientation = Math.random() < 0.5 ? 'h' : 'v';
        const start       = Math.floor(Math.random() * G * G);
        const cells       = this._shipCells(start, ship.size, orientation);
        if (cells && this._canPlace(cells, grid)) {
          ship.cells       = cells;
          ship.orientation = orientation;
          cells.forEach(c => grid[c] = 'ship');
          placed = true;
        }
      }
    }
    return ships;
  }

  _gridFromShips(ships) {
    const G    = this._G;
    const grid = new Array(G * G).fill(null);
    ships.forEach(s => s.cells.forEach(c => grid[c] = 'ship'));
    return grid;
  }

  _refreshPreview() {
    if (!this.state.previewCells.length) return;
    const ship = this.state.playerShips[this.state.currentShipIdx];
    const c0   = this.state.previewCells[0];
    const cells = this._shipCells(c0, ship.size, this.state.orientation);
    this.state.previewCells = cells || [];
    this.state.previewValid = cells ? this._canPlace(cells, this.state.playerGrid) : false;
  }

  /* ============================================================
     ÉTAT INITIAL
     ============================================================ */

  _sizeFromId(sizeId) {
    const obj = this.config.gameplay.gridSizes?.find(s => s.id === (sizeId ?? this.config.gameplay.defaultGridSize));
    return obj?.size ?? this.config.gameplay.gridSize ?? 10;
  }

  _buildShipList() {
    return this.config.gameplay.ships.map(s => ({
      ...s, cells: [], orientation: 'h', sunk: false,
    }));
  }

  _buildInitialState() {
    const G   = this._G;
    const n   = this.config.gameplay.ships.length;
    return {
      status:          'loading',
      gridSize:        G,
      playerGrid:      new Array(G * G).fill(null),
      enemyGrid:       new Array(G * G).fill(null),
      playerShips:     [],
      enemyShips:      [],
      currentShipIdx:  0,
      orientation:     'h',
      previewCells:    [],
      previewValid:    false,
      turn:            'player',
      score:           0,
      playerRemaining: n,
      enemiesRemaining: n,
    };
  }

  /* ============================================================
     CONTRÔLES CLAVIER
     ============================================================ */

  _bindControls() {
    this._onKeyDown = (e) => {
      if (this.state.status === 'placing' && e.code === 'KeyR') {
        e.preventDefault();
        this.rotateOrientation();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindControls() {
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
  }
}
