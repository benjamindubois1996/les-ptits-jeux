/**
 * 2048.js — Logique pure du jeu
 * Emplacement : /games/2048/2048.js
 *
 * Mécanique :
 *  - Grille 4×4, tuiles fusionnent quand elles sont égales
 *  - Glissement dans les 4 directions (flèches / WASD / swipe)
 *  - Spawn d'une tuile 2 (90%) ou 4 (10%) après chaque coup valide
 *  - Victoire en atteignant 2048 (peut continuer après)
 *  - Game over quand aucun coup n'est possible
 *  - Machine à états : idle → playing → won | gameover | paused
 *
 * Communication : uniquement via EventBus
 */

import EventBus    from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class Game2048 extends BaseGame {

  constructor(config) {
    super(config);
    this.state  = this._buildInitialState();
    this._onKey = null;
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  _gameId() { return '2048'; }

  init() {
    this._bindControls();
    this._setupEventBusBindings();
    EventBus.emit('game:ready', { gameId: '2048' });
  }

  start() {
    this.state = this._buildInitialState();
    this.state.status = 'playing';

    const t1 = this._spawnTile();
    const t2 = this._spawnTile();

    EventBus.emit('game:started', { state: this.state });
    EventBus.emit('game:tick',    { state: this.state, newTile: t2, merged: [] });
  }

  destroy() {
    super.destroy();
    if (this._onKey) window.removeEventListener('keydown', this._onKey);
  }

  /** Sur game:restart, soumettre le score avant de repartir */
  restart() {
    this._submitScoreIfPlaying();
    this.start();
  }

  /* ============================================================
     CONTRÔLES
     ============================================================ */

  _bindControls() {
    const kb = this.config.controls.keyboard;

    this._onKey = (e) => {
      // Démarrer depuis idle
      if (this.state.status === 'idle') {
        const allKeys = [...kb.up, ...kb.down, ...kb.left, ...kb.right];
        if (allKeys.includes(e.code)) {
          e.preventDefault();
          this.start();
        }
        return;
      }

      if (kb.restart.includes(e.code)) {
        e.preventDefault();
        this._submitScoreIfPlaying();
        this.start();
        return;
      }

      if (kb.pause.includes(e.code)) {
        e.preventDefault();
        this.togglePause();
        return;
      }

      if (this.state.status !== 'playing') return;

      if (kb.up.includes(e.code))    { e.preventDefault(); this.move('up');    return; }
      if (kb.down.includes(e.code))  { e.preventDefault(); this.move('down');  return; }
      if (kb.left.includes(e.code))  { e.preventDefault(); this.move('left');  return; }
      if (kb.right.includes(e.code)) { e.preventDefault(); this.move('right'); return; }
    };

    window.addEventListener('keydown', this._onKey);

    // EventBus (boutons GameShell) — gérés par BaseGame._setupEventBusBindings()
  }

  togglePause() {
    super.togglePause();
    // Le renderer a besoin d'un tick pour mettre à jour l'affichage
    EventBus.emit('game:tick', { state: this.state, merged: [] });
  }

  _submitScoreIfPlaying() {
    const s = this.state.status;
    if ((s === 'playing' || s === 'paused') && this.state.score > 0) {
      ScoreService.submit('2048', this.state.score);
    }
  }

  continueAfterWin() {
    this.state.wonAcknowledged = true;
    EventBus.emit('game:tick', { state: this.state, merged: [] });
  }

  /* ============================================================
     LOGIQUE DE JEU
     ============================================================ */

  move(dir) {
    if (this.state.status !== 'playing') return;

    const { moved, score, merged } = this._slide(dir);
    if (!moved) return;

    this.state.score += score;
    if (this.state.score > this.state.best) {
      this.state.best = this.state.score;
    }

    const newTile = this._spawnTile();

    // Victoire (première fois seulement)
    if (!this.state.won && this._hasWon()) {
      this.state.won = true;
      EventBus.emit('game:won', { state: this.state });
    }

    // Game over
    if (this._isGameOver()) {
      this.state.status = 'gameover';
      const { isRecord } = ScoreService.submit('2048', this.state.score);
      EventBus.emit('game:over', { state: this.state, score: this.state.score, isRecord });
    }

    EventBus.emit('game:tick', { state: this.state, newTile, merged });
  }

  /* ============================================================
     MÉCANIQUE DE GLISSEMENT
     ============================================================ */

  _slide(dir) {
    const rows     = this._getRows(dir);
    let   anyMoved = false;
    let   total    = 0;
    const merged   = [];

    const processed = rows.map((row, ri) => {
      const { result, score, mergedAt } = this._slideRow(row);
      if (result.join(',') !== row.join(',')) anyMoved = true;
      total += score;
      mergedAt.forEach(pos => {
        const [r, c] = this._mapPos(ri, pos, dir);
        merged.push({ row: r, col: c, value: result[pos] });
      });
      return result;
    });

    if (anyMoved) {
      this.state.grid = this._setRows(processed, dir);
    }

    return { moved: anyMoved, score: total, merged };
  }

  _slideRow(row) {
    const tiles    = row.filter(v => v !== 0);
    const result   = [];
    const mergedAt = [];
    let   score    = 0;
    let   i        = 0;

    while (i < tiles.length) {
      if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
        const val = tiles[i] * 2;
        result.push(val);
        mergedAt.push(result.length - 1);
        score += val;
        i += 2;
      } else {
        result.push(tiles[i]);
        i++;
      }
    }

    while (result.length < 4) result.push(0);
    return { result, score, mergedAt };
  }

  // Extrait les lignes selon la direction (tout se glisse vers la gauche)
  _getRows(dir) {
    const g = this.state.grid;
    if (dir === 'left')  return g.map(r => [...r]);
    if (dir === 'right') return g.map(r => [...r].reverse());
    if (dir === 'up')    return [0,1,2,3].map(c => g.map(r => r[c]));
    if (dir === 'down')  return [0,1,2,3].map(c => g.map(r => r[c]).reverse());
  }

  // Réinjecte les lignes dans la grille selon la direction
  _setRows(rows, dir) {
    const g = Array.from({ length: 4 }, () => Array(4).fill(0));
    if (dir === 'left') {
      rows.forEach((row, r) => row.forEach((v, c) => { g[r][c] = v; }));
    } else if (dir === 'right') {
      rows.forEach((row, r) => [...row].reverse().forEach((v, c) => { g[r][c] = v; }));
    } else if (dir === 'up') {
      rows.forEach((col, c) => col.forEach((v, r) => { g[r][c] = v; }));
    } else if (dir === 'down') {
      rows.forEach((col, c) => [...col].reverse().forEach((v, r) => { g[r][c] = v; }));
    }
    return g;
  }

  // Convertit (rowIndex, posInRow) → (gridRow, gridCol) selon la direction
  _mapPos(ri, pos, dir) {
    if (dir === 'left')  return [ri, pos];
    if (dir === 'right') return [ri, 3 - pos];
    if (dir === 'up')    return [pos, ri];
    if (dir === 'down')  return [3 - pos, ri];
  }

  /* ============================================================
     UTILITAIRES
     ============================================================ */

  _spawnTile() {
    const empty = [];
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        if (this.state.grid[r][c] === 0) empty.push([r, c]);

    if (empty.length === 0) return null;

    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    const value  = Math.random() < 0.9 ? 2 : 4;
    this.state.grid[r][c] = value;

    return { row: r, col: c, value };
  }

  _hasWon() {
    const winTile = this.config.gameplay.winTile;
    return this.state.grid.some(row => row.some(v => v >= winTile));
  }

  _isGameOver() {
    const g = this.state.grid;
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        if (g[r][c] === 0) return false;
        if (c < 3 && g[r][c] === g[r][c+1]) return false;
        if (r < 3 && g[r][c] === g[r+1][c]) return false;
      }
    return true;
  }

  _buildInitialState() {
    return {
      status:          'idle',
      grid:            Array.from({ length: 4 }, () => Array(4).fill(0)),
      score:           0,
      best:            ScoreService.getBest('2048'),
      won:             false,
      wonAcknowledged: false,
    };
  }
}
