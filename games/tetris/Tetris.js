/**
 * Tetris.js — Logique pure du jeu
 * Emplacement : /games/tetris/Tetris.js
 *
 * Mécanique :
 *  - Plateau 10×20, 7 tetrominos classiques
 *  - Gravité basée sur setInterval, vitesse progressive par niveau
 *  - Rotation simple (90° CW, sans wall kick)
 *  - Soft drop (accélération manuelle) et hard drop (chute instantanée)
 *  - Suppression des lignes complètes, scoring NES
 *  - Machine à états : idle → playing → paused → gameover
 *
 * Communication : uniquement via EventBus
 */

import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';

// Définition des 7 tetrominos — matrices + index de couleur (1-7)
const PIECES = {
  I: { matrix: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], colorIdx: 1 },
  O: { matrix: [[1,1],[1,1]],                              colorIdx: 2 },
  T: { matrix: [[0,1,0],[1,1,1],[0,0,0]],                  colorIdx: 3 },
  S: { matrix: [[0,1,1],[1,1,0],[0,0,0]],                  colorIdx: 4 },
  Z: { matrix: [[1,1,0],[0,1,1],[0,0,0]],                  colorIdx: 5 },
  J: { matrix: [[1,0,0],[1,1,1],[0,0,0]],                  colorIdx: 6 },
  L: { matrix: [[0,0,1],[1,1,1],[0,0,0]],                  colorIdx: 7 },
};

const PIECE_TYPES = Object.keys(PIECES);

export default class Tetris {

  constructor(config) {
    this.config = config;
    this.state  = this._buildInitialState();

    this._tickTimer = null;
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  init() {
    this._bindControls();
    EventBus.emit('game:ready', { gameId: 'tetris' });
  }

  start() {
    if (this.state.status === 'playing') return;

    this.state          = this._buildInitialState();
    this.state.status   = 'playing';
    this.state.nextType = this._randomType();

    this._spawnPiece();
    this._startTick();

    EventBus.emit('game:started', { state: this.state });
    EventBus.emit('game:score-update', { score: 0 });
  }

  togglePause() {
    if (this.state.status === 'playing') {
      this.state.status = 'paused';
      this._stopTick();
      EventBus.emit('game:paused', { state: this.state });

    } else if (this.state.status === 'paused') {
      this.state.status = 'playing';
      this._startTick();
      EventBus.emit('game:resumed', { state: this.state });
    }
  }

  restart() {
    this._stopTick();
    this.state = this._buildInitialState(); // retour à l'écran idle
    EventBus.emit('game:score-update', { score: 0 });
  }

  destroy() {
    this._stopTick();
    this._unbindControls();
    EventBus.off('game:pause-toggle', this._onPauseToggle);
    EventBus.off('game:restart',      this._onRestart);
  }

  /* ============================================================
     TICK — GRAVITÉ
     ============================================================ */

  _tick() {
    if (this.state.status !== 'playing') return;
    this._stepDown(false);
  }

  /**
   * Descendre la pièce d'une rangée.
   * @param {boolean} isSoftDrop — si vrai, ajoute des points bonus
   */
  _stepDown(isSoftDrop) {
    const { matrix, x, y } = this.state.current;

    if (!this._collides(matrix, x, y + 1)) {
      this.state.current.y++;
      if (isSoftDrop) {
        this.state.score += this.config.gameplay.softDropScore || 1;
        EventBus.emit('game:score-update', { score: this.state.score });
      }
    } else if (!isSoftDrop) {
      // Seule la gravité naturelle verrouille la pièce.
      // Le soft drop (touche bas) s'arrête juste en bas — empêche les cascades de locks
      // quand la touche est maintenue.
      this._lockPiece();
    }

    EventBus.emit('game:tick', { state: this.state });
  }

  /* ============================================================
     ACTIONS JOUEUR
     ============================================================ */

  moveLeft() {
    if (this.state.status !== 'playing') return;
    const { matrix, x, y } = this.state.current;
    if (!this._collides(matrix, x - 1, y)) {
      this.state.current.x--;
      EventBus.emit('game:tick', { state: this.state });
    }
  }

  moveRight() {
    if (this.state.status !== 'playing') return;
    const { matrix, x, y } = this.state.current;
    if (!this._collides(matrix, x + 1, y)) {
      this.state.current.x++;
      EventBus.emit('game:tick', { state: this.state });
    }
  }

  softDrop() {
    if (this.state.status !== 'playing') return;
    this._stepDown(true);
  }

  rotate() {
    if (this.state.status !== 'playing') return;
    const { matrix, x, y } = this.state.current;
    const rotated = this._rotateMatrix(matrix);

    if (!this._collides(rotated, x, y)) {
      this.state.current.matrix = rotated;
    } else if (!this._collides(rotated, x - 1, y)) {
      // Tentative de déplacement gauche (pseudo wall kick minimal)
      this.state.current.matrix = rotated;
      this.state.current.x--;
    } else if (!this._collides(rotated, x + 1, y)) {
      this.state.current.matrix = rotated;
      this.state.current.x++;
    }
    // Si toujours en collision, on ignore la rotation

    EventBus.emit('game:tick', { state: this.state });
  }

  hardDrop() {
    if (this.state.status !== 'playing') return;
    const { matrix, x } = this.state.current;
    let dropDist = 0;

    while (!this._collides(matrix, x, this.state.current.y + 1)) {
      this.state.current.y++;
      dropDist++;
    }

    if (dropDist > 0) {
      this.state.score += dropDist * (this.config.gameplay.hardDropScore || 2);
      EventBus.emit('game:score-update', { score: this.state.score });
    }

    this._lockPiece();
    EventBus.emit('game:tick', { state: this.state });
  }

  /* ============================================================
     PIÈCE — SPAWN & LOCK
     ============================================================ */

  _spawnPiece() {
    const type   = this.state.nextType;
    const def    = PIECES[type];
    const cols   = this.config.gameplay.cols;
    const matrix = def.matrix.map(row => [...row]);
    const startX = Math.floor((cols - matrix[0].length) / 2);

    this.state.current = {
      matrix,
      x:        startX,
      y:        0,
      colorIdx: def.colorIdx,
      type
    };

    // Game over si la pièce apparaît en collision
    if (this._collides(matrix, startX, 0)) {
      this._gameOver();
      return;
    }

    // Préparer la pièce suivante
    this.state.nextType = this._randomType();
    const nextDef = PIECES[this.state.nextType];
    this.state.next = {
      matrix:   nextDef.matrix.map(row => [...row]),
      colorIdx: nextDef.colorIdx,
      type:     this.state.nextType
    };

    EventBus.emit('game:piece-spawned', { current: this.state.current, next: this.state.next });
  }

  _lockPiece() {
    const { matrix, x, y, colorIdx } = this.state.current;

    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const row = y + r;
        if (row < 0) { this._gameOver(); return; }
        this.state.board[row][x + c] = colorIdx;
      }
    }

    EventBus.emit('game:lock', { state: this.state });
    this._clearLines();
    this._spawnPiece();
  }

  /* ============================================================
     LIGNES & SCORE
     ============================================================ */

  _clearLines() {
    const { rows, cols } = this.config.gameplay;
    let cleared = 0;

    for (let r = rows - 1; r >= 0; r--) {
      if (this.state.board[r].every(cell => cell !== 0)) {
        this.state.board.splice(r, 1);
        this.state.board.unshift(new Array(cols).fill(0));
        cleared++;
        r++; // re-vérifier la même rangée après le décalage
      }
    }

    if (cleared === 0) return;

    this.state.lines += cleared;

    // Mise à jour du niveau
    const newLevel = Math.floor(this.state.lines / this.config.gameplay.linesPerLevel)
                   + this.config.gameplay.startLevel;

    if (newLevel !== this.state.level) {
      this.state.level = newLevel;
      this._restartTick(); // recalculer la vitesse
    }

    // Points — scoring NES (×niveau)
    const linesScore = this.config.scoring.linesScore;
    const points     = (linesScore[cleared] || 0) * this.state.level;
    this.state.score += points;

    EventBus.emit('game:lines-cleared', {
      cleared,
      points,
      lines: this.state.lines,
      level: this.state.level
    });
    EventBus.emit('game:score-update', { score: this.state.score });
  }

  /* ============================================================
     GAME OVER
     ============================================================ */

  _gameOver() {
    this._stopTick();
    this.state.status = 'gameover';

    const result = ScoreService.submit('tetris', this.state.score, {
      level: this.state.level,
      lines: this.state.lines
    });

    if (result.isRecord) {
      EventBus.emit('score:record', { gameId: 'tetris', score: this.state.score });
    }

    EventBus.emit('game:over', {
      score:    this.state.score,
      best:     result.best,
      isRecord: result.isRecord,
      level:    this.state.level,
      lines:    this.state.lines,
      state:    this.state
    });
  }

  /* ============================================================
     CONTRÔLES CLAVIER
     ============================================================ */

  _bindControls() {
    const keys = this.config.controls.keyboard;

    // Construire des Sets pour chaque action
    this._keyActions = {
      left:      new Set(keys.left),
      right:     new Set(keys.right),
      softDrop:  new Set(keys.softDrop),
      rotate:    new Set(keys.rotate),
      hardDrop:  new Set(keys.hardDrop),
      pause:     new Set(keys.pause),
      restart:   new Set(keys.restart)
    };

    this._onKeyDown = (e) => {
      const code = e.code;

      if (this.state.status === 'gameover') {
        if (this._keyActions.restart.has(code) ||
            this._keyActions.left.has(code)    ||
            this._keyActions.right.has(code)) {
          e.preventDefault();
          EventBus.emit('game:restart'); // déclenche restart() + cache l'overlay GameShell
        }
        return;
      }

      if (this._keyActions.left.has(code)) {
        e.preventDefault();
        if (this.state.status === 'idle') this.start();
        this.moveLeft();
        return;
      }
      if (this._keyActions.right.has(code)) {
        e.preventDefault();
        if (this.state.status === 'idle') this.start();
        this.moveRight();
        return;
      }
      if (this._keyActions.softDrop.has(code)) {
        e.preventDefault();
        if (this.state.status === 'idle') this.start();
        this.softDrop();
        return;
      }
      if (this._keyActions.rotate.has(code)) {
        e.preventDefault();
        if (this.state.status === 'idle') this.start();
        this.rotate();
        return;
      }
      if (this._keyActions.hardDrop.has(code)) {
        e.preventDefault();
        if (this.state.status === 'idle') this.start();
        this.hardDrop();
        return;
      }
      if (this._keyActions.pause.has(code)) {
        e.preventDefault();
        this.togglePause();
        return;
      }
      if (this._keyActions.restart.has(code)) {
        e.preventDefault();
        EventBus.emit('game:restart');
      }
    };

    window.addEventListener('keydown', this._onKeyDown);

    this._onPauseToggle = () => this.togglePause();
    this._onRestart     = () => this.restart();
    EventBus.on('game:pause-toggle', this._onPauseToggle);
    EventBus.on('game:restart',      this._onRestart);
  }

  _unbindControls() {
    window.removeEventListener('keydown', this._onKeyDown);
  }

  /* ============================================================
     UTILITAIRES — PLATEAU & ROTATION
     ============================================================ */

  /**
   * Retourne true si la matrix en position (px, py) est en collision.
   */
  _collides(matrix, px, py) {
    const { rows, cols } = this.config.gameplay;

    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const nx = px + c;
        const ny = py + r;
        if (nx < 0 || nx >= cols) return true;
        if (ny >= rows)           return true;
        if (ny >= 0 && this.state.board[ny][nx]) return true;
      }
    }
    return false;
  }

  /**
   * Rotation 90° horaire : transpose puis inverse chaque ligne
   */
  _rotateMatrix(matrix) {
    const N = matrix.length;
    return matrix.map((row, r) =>
      row.map((_, c) => matrix[N - 1 - c][r])
    );
  }

  _randomType() {
    return PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
  }

  /* ============================================================
     TICK TIMER
     ============================================================ */

  _getLevelInterval() {
    const { baseInterval, minInterval } = this.config.gameplay;
    return Math.max(minInterval, baseInterval - (this.state.level - 1) * 85);
  }

  _startTick() {
    const interval = this._getLevelInterval();
    this._tickTimer = setInterval(() => this._tick(), interval);
  }

  _stopTick() {
    if (this._tickTimer) {
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }
  }

  _restartTick() {
    this._stopTick();
    this._startTick();
  }

  /* ============================================================
     ÉTAT INITIAL
     ============================================================ */

  _buildInitialState() {
    const { rows, cols, startLevel } = this.config.gameplay;

    return {
      status:   'idle',
      board:    Array.from({ length: rows }, () => new Array(cols).fill(0)),
      current:  null,
      next:     null,
      nextType: null,
      score:    0,
      level:    startLevel,
      lines:    0
    };
  }
}
