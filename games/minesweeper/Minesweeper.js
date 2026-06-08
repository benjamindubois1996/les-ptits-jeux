/**
 * Minesweeper.js — Logique pure du jeu
 * Emplacement : /games/minesweeper/Minesweeper.js
 *
 * Mécanique :
 *  - Grille avec mines cachées, cases révélées et drapeaux
 *  - Premier clic toujours sûr (mines générées après)
 *  - Flood-fill automatique sur les cases vides (0 mine adjacente)
 *  - Chord : révèle les voisins si le compte de drapeaux est exact
 *  - Timer et score basé sur le temps
 *  - Machine à états : idle → playing → paused → won | gameover
 *
 * Communication : uniquement via EventBus
 */

import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';
import { randInt }  from '../../js/utils/Random.js';
import { getNeighbors } from '../../js/utils/GridUtils.js';

export default class Minesweeper extends BaseGame {

  constructor(config) {
    super(config);
    this.state  = this._buildInitialState();
    this._timer = null;
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  _gameId() { return 'minesweeper'; }

  init() {
    this._bindControls();
    this._setupEventBusBindings();
    EventBus.emit('game:ready', { gameId: 'minesweeper' });
  }

  /**
   * Premier clic : générer les mines en évitant la zone safe,
   * puis révéler la case cliquée.
   */
  start(safeCol, safeRow) {
    if (this.state.status !== 'idle') return;
    this.state.status = 'playing';

    this._generateMines(safeCol, safeRow);
    this._computeAdjacency();
    this._startTimer();
    this._revealCell(safeCol, safeRow);

    EventBus.emit('game:started', { state: this.state });
    EventBus.emit('game:tick',    { state: this.state });
  }

  /**
   * Révéler une case — si idle, démarre la partie au premier clic.
   */
  reveal(col, row) {
    if (this.state.status === 'idle') {
      this.start(col, row);
      return;
    }
    if (this.state.status !== 'playing') return;

    const cell = this.state.grid[row][col];
    if (cell.isRevealed || cell.isFlagged) return;

    this._revealCell(col, row);
    EventBus.emit('game:tick', { state: this.state });
  }

  /**
   * Poser / enlever un drapeau sur une case cachée.
   */
  toggleFlag(col, row) {
    if (this.state.status !== 'playing') return;

    const cell = this.state.grid[row][col];
    if (cell.isRevealed) return;

    cell.isFlagged = !cell.isFlagged;
    this.state.flagCount += cell.isFlagged ? 1 : -1;

    EventBus.emit('game:tick', { state: this.state });
  }

  /**
   * Chord : si une case révélée a autant de drapeaux voisins que ses mines
   * adjacentes, révéler tous les voisins non-drapeau.
   */
  chord(col, row) {
    if (this.state.status !== 'playing') return;

    const cell = this.state.grid[row][col];
    if (!cell.isRevealed || cell.adjacentMines === 0) return;

    const neighbors      = this._getNeighbors(col, row);
    const flaggedCount   = neighbors.filter(
      ([nc, nr]) => this.state.grid[nr][nc].isFlagged
    ).length;

    if (flaggedCount !== cell.adjacentMines) return;

    for (const [nc, nr] of neighbors) {
      const n = this.state.grid[nr][nc];
      if (!n.isRevealed && !n.isFlagged) {
        this._revealCell(nc, nr);
      }
    }

    EventBus.emit('game:tick', { state: this.state });
  }

  /**
   * Basculer pause / reprise
   */
  _onPause()  { this._stopTimer(); }
  _onResume() { this._startTimer(); }

  restart() {
    this._stopTimer();
    this.state = this._buildInitialState();
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state });
  }

  /**
   * Changer la difficulté et redémarrer proprement.
   * @param {'easy'|'medium'|'hard'} diff
   */
  setDifficulty(diff) {
    if (!this.config.gameplay.difficulties[diff]) return;
    this._stopTimer();
    this.config.gameplay.difficulty = diff;
    this.state = this._buildInitialState();
    EventBus.emit('game:difficulty-changed', { difficulty: diff });
    EventBus.emit('game:score-update', { score: 0 });
    EventBus.emit('game:tick', { state: this.state });
  }

  destroy() {
    super.destroy();
    this._stopTimer();
    this._unbindControls();
  }

  /* ============================================================
     MÉCANIQUE INTERNE
     ============================================================ */

  _revealCell(col, row) {
    const cell = this.state.grid[row][col];
    if (cell.isRevealed || cell.isFlagged) return;

    cell.isRevealed = true;
    this.state.revealedCount++;

    if (cell.isMine) {
      this._gameOver(col, row);
      return;
    }

    // Flood-fill : si aucune mine autour, révéler tous les voisins
    if (cell.adjacentMines === 0) {
      for (const [nc, nr] of this._getNeighbors(col, row)) {
        const n = this.state.grid[nr][nc];
        if (!n.isRevealed && !n.isFlagged) {
          this._revealCell(nc, nr);
        }
      }
    }

    // Victoire : toutes les cases sans mine sont révélées
    const { cols, rows, mineCount } = this.state;
    if (this.state.revealedCount === cols * rows - mineCount) {
      this._win();
    }
  }

  _generateMines(safeCol, safeRow) {
    const { cols, rows, mineCount } = this.state;

    // Zone safe = case cliquée + ses 8 voisins
    const safe = new Set();
    safe.add(`${safeCol},${safeRow}`);
    for (const [nc, nr] of this._getNeighbors(safeCol, safeRow)) {
      safe.add(`${nc},${nr}`);
    }

    let placed = 0;
    while (placed < mineCount) {
      const c   = randInt(cols);
      const r   = randInt(rows);
      const key = `${c},${r}`;
      if (!safe.has(key) && !this.state.grid[r][c].isMine) {
        this.state.grid[r][c].isMine = true;
        placed++;
      }
    }
  }

  _computeAdjacency() {
    const { cols, rows } = this.state;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.state.grid[r][c].isMine) continue;
        let count = 0;
        for (const [nc, nr] of getNeighbors(c, r, cols, rows)) {
          if (this.state.grid[nr][nc].isMine) count++;
        }
        this.state.grid[r][c].adjacentMines = count;
      }
    }
  }

  /** Délègue à GridUtils — gardé pour compatibilité interne */
  _getNeighbors(col, row) {
    const { cols, rows } = this.state;
    return getNeighbors(col, row, cols, rows);
  }

  /* ============================================================
     GAME OVER / VICTOIRE
     ============================================================ */

  _gameOver(triggerCol, triggerRow) {
    this._stopTimer();
    this.state.status      = 'gameover';
    this.state.triggerMine = { col: triggerCol, row: triggerRow };

    // Compter les mines correctement drapautées (AVANT de tout révéler)
    let correctFlags = 0;
    for (let r = 0; r < this.state.rows; r++) {
      for (let c = 0; c < this.state.cols; c++) {
        if (this.state.grid[r][c].isMine && this.state.grid[r][c].isFlagged) {
          correctFlags++;
        }
      }
    }

    // Score partiel : mines trouvées × pointsPerMine (pas de bonus temps)
    const { pointsPerMine } = this.config.scoring;
    const partialScore = correctFlags * pointsPerMine;
    this.state.score        = partialScore;
    this.state.minePoints   = partialScore;
    this.state.timeBonus    = 0;
    this.state.correctFlags = correctFlags;

    // Révéler toutes les mines non-drapeau + marquer les faux drapeaux
    for (let r = 0; r < this.state.rows; r++) {
      for (let c = 0; c < this.state.cols; c++) {
        const cell = this.state.grid[r][c];
        if (cell.isMine && !cell.isFlagged)  cell.isRevealed = true;
        if (cell.isFlagged && !cell.isMine)  cell.wrongFlag  = true;
      }
    }

    const result = ScoreService.submit('minesweeper', partialScore, {
      difficulty: this.config.gameplay.difficulty,
      time:       this.state.time,
      won:        false
    });

    EventBus.emit('game:score-update', { score: partialScore });
    EventBus.emit('game:over', {
      score:    partialScore,
      best:     result.best,
      isRecord: result.isRecord,
      state:    this.state
    });
  }

  _win() {
    this._stopTimer();
    this.state.status = 'won';

    // Auto-drapeau sur les mines restantes
    for (let r = 0; r < this.state.rows; r++) {
      for (let c = 0; c < this.state.cols; c++) {
        const cell = this.state.grid[r][c];
        if (cell.isMine && !cell.isFlagged) {
          cell.isFlagged = true;
          this.state.flagCount++;
        }
      }
    }

    // Score = points par mine + bonus temps (0 si trop lent)
    const { pointsPerMine, timeBonusBase, timePenaltyPerSecond } = this.config.scoring;
    const minePoints = this.state.mineCount * pointsPerMine;
    const timeBonus  = Math.max(0, timeBonusBase - this.state.time * timePenaltyPerSecond);

    this.state.score     = minePoints + timeBonus;
    this.state.minePoints = minePoints;
    this.state.timeBonus  = timeBonus;

    const result = ScoreService.submit('minesweeper', this.state.score, {
      difficulty: this.config.gameplay.difficulty,
      time:       this.state.time
    });

    EventBus.emit('game:score-update', { score: this.state.score });
    EventBus.emit('game:won', {
      score:      this.state.score,
      minePoints,
      timeBonus,
      best:       result.best,
      isRecord:   result.isRecord,
      time:       this.state.time,
      state:      this.state
    });
  }

  /* ============================================================
     TIMER
     ============================================================ */

  _startTimer() {
    this._timer = setInterval(() => {
      this.state.time++;
      EventBus.emit('game:timer', { time: this.state.time });
    }, 1000);
  }

  _stopTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /* ============================================================
     CONTRÔLES
     ============================================================ */

  _bindControls() {
    const keys = this.config.controls.keyboard;

    this._onKeyDown = (e) => {
      if (this.state.status === 'gameover' || this.state.status === 'won') {
        if (keys.restart.includes(e.code)) {
          e.preventDefault();
          EventBus.emit('game:restart');
        }
        return;
      }

      if (keys.pause.includes(e.code)) {
        e.preventDefault();
        this.togglePause();
        return;
      }

      if (keys.restart.includes(e.code)) {
        e.preventDefault();
        EventBus.emit('game:restart');
      }
    };

    window.addEventListener('keydown', this._onKeyDown);

    // EventBus (boutons GameShell) — gérés par BaseGame._setupEventBusBindings()
  }

  _unbindControls() {
    window.removeEventListener('keydown', this._onKeyDown);
  }

  /* ============================================================
     ÉTAT INITIAL
     ============================================================ */

  _buildInitialState() {
    const diff = this.config.gameplay.difficulty;
    const { cols, rows, mines: mineCount } = this.config.gameplay.difficulties[diff];

    const grid = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({
        isMine:        false,
        isRevealed:    false,
        isFlagged:     false,
        wrongFlag:     false,
        adjacentMines: 0
      }))
    );

    return {
      status:       'idle',
      cols,
      rows,
      mineCount,
      grid,
      revealedCount: 0,
      flagCount:     0,
      time:          0,
      score:         0,
      triggerMine:   null
    };
  }
}
