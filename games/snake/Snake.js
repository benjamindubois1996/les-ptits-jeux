/**
 * Snake.js — Logique pure du jeu
 * Emplacement : /games/snake/Snake.js
 *
 * Aucun rendu ici. Que de la mécanique :
 *  - Grille & positions
 *  - Déplacement & file de directions
 *  - Collisions (murs, soi-même, obstacles)
 *  - Nourriture & croissance
 *  - Score & système de combo
 *  - Machine à états (idle → playing → paused → gameover)
 *
 * Communication : uniquement via EventBus
 * Le SnakeRenderer écoute les events et lit this.state
 */

import EventBus from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';

export default class Snake {

  constructor(config) {
    this.config = config;
    this.state  = this._buildInitialState();

    // File de directions (évite les retournements rapides multi-touches)
    this._directionQueue = [];

    // Référence au setInterval du tick
    this._tickTimer = null;

    // Timestamp du dernier repas (pour le combo)
    this._lastEatTime = null;
  }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  /**
   * Initialiser — appelé par Loader après instanciation
   */
  init() {
    this._bindControls();
    EventBus.emit('game:ready', { gameId: 'snake' });
  }

  /**
   * Démarrer une partie
   */
  start() {
    if (this.state.status === 'playing') return;

    this.state          = this._buildInitialState();
    this._directionQueue      = [];
    this._lastEatTime         = null;
    this._currentTickInterval = null; // reset vitesse
    this.state.status         = 'playing';

    this._spawnFood();
    this._spawnObstacles();
    this._startTick();

    EventBus.emit('game:started', { state: this.state });
    EventBus.emit('game:score-update', { score: 0 });
  }

  /**
   * Basculer pause / reprise
   */
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

  /**
   * Redémarrer
   */
  restart() {
    this._stopTick();
    this.state             = this._buildInitialState(); // retour à idle
    this._directionQueue   = [];
    this._lastEatTime      = null;
    this._currentTickInterval = null;
    EventBus.emit('game:ready', { gameId: 'snake' });
  }

  /**
   * Détruire proprement (appelé par Loader)
   */
  destroy() {
    this._stopTick();
    this._unbindControls();
    EventBus.off('game:pause-toggle', this._onPauseToggle);
    EventBus.off('game:restart',      this._onRestart);
  }

  /* ============================================================
     TICK — CŒUR DU JEU
     ============================================================ */

  /**
   * Un tick = un pas du serpent
   * Appelé à intervalle régulier selon la difficulté
   */
  _tick() {
    if (this.state.status !== 'playing') return;

    // Consommer la prochaine direction en queue
    if (this._directionQueue.length > 0) {
      const next = this._directionQueue.shift();
      if (this._isValidDirection(next)) {
        this.state.direction = next;
      }
    }

    // Calculer la nouvelle tête
    const head    = this.state.snake[0];
    const newHead = this._move(head, this.state.direction);

    // --- Collisions murs ---
    const diffConfig = this._getDiffConfig();
    if (diffConfig.wallsKill) {
      if (this._isOutOfBounds(newHead)) {
        this._gameOver();
        return;
      }
    } else {
      // Téléportation
      newHead.x = (newHead.x + this.state.gridSize) % this.state.gridSize;
      newHead.y = (newHead.y + this.state.gridSize) % this.state.gridSize;
    }

    // --- Collision avec soi-même ---
    if (this._hitsItself(newHead)) {
      this._gameOver();
      return;
    }

    // --- Collision avec obstacles ---
    if (this._hitsObstacle(newHead)) {
      this._gameOver();
      return;
    }

    // --- Manger ? ---
    const ate = this._posEquals(newHead, this.state.food);

    // Déplacer le serpent
    this.state.snake.unshift(newHead);
    if (!ate) {
      this.state.snake.pop(); // pas de croissance
    } else {
      this._onEat();
    }

    // Émettre le tick pour le renderer
    EventBus.emit('game:tick', { state: this.state, ate });
  }

  /* ============================================================
     MÉCANIQUE — NOURRITURE & SCORE
     ============================================================ */

  /**
   * Gérer le fait de manger
   */
  _onEat() {
    const now      = Date.now();
    const scoring  = this.config.scoring;

    // Calcul combo
    if (this._lastEatTime && (now - this._lastEatTime) < scoring.comboWindowMs) {
      this.state.combo = Math.min(
        this.state.combo + 1,
        scoring.comboThresholds.length - 1
      );
    } else {
      this.state.combo = 0;
    }
    this._lastEatTime = now;

    // Multiplicateur selon seuils
    const multiplier = this._getComboMultiplier();

    // Points
    const points = Math.round(scoring.pointsPerFood * multiplier);
    this.state.score += points;

    // Sauvegarder via ScoreService
    const result = ScoreService.submit('snake', this.state.score, {
      difficulty: this.config.gameplay.difficulty,
      length:     this.state.snake.length
    });

    if (result.isRecord) {
      EventBus.emit('score:record', { gameId: 'snake', score: this.state.score });
    }

    EventBus.emit('game:score-update', { score: this.state.score });
    EventBus.emit('game:eat', {
      points,
      multiplier,
      combo:  this.state.combo,
      score:  this.state.score
    });

    // Faire apparaître une nouvelle nourriture
    this._spawnFood();

    // Accélérer légèrement à chaque repas (optionnel)
    this._maybeAccelerate();
  }

  /**
   * Spawner la nourriture sur une cellule libre
   */
  _spawnFood() {
    let pos;
    do {
      pos = {
        x: Math.floor(Math.random() * this.state.gridSize),
        y: Math.floor(Math.random() * this.state.gridSize)
      };
    } while (
      this._hitsItself(pos) ||
      this._hitsObstacle(pos)
    );

    // Si food avec emoji, choisir aléatoirement
    const foodTheme = this._getFoodTheme();
    if (foodTheme.type === 'emoji' && foodTheme.emoji?.length) {
      this.state.foodEmoji = foodTheme.emoji[
        Math.floor(Math.random() * foodTheme.emoji.length)
      ];
    }

    this.state.food = pos;
    EventBus.emit('game:food-spawned', { food: pos });
  }

  /**
   * Spawner les obstacles (mode hard)
   */
  _spawnObstacles() {
    const count = this._getDiffConfig().obstaclesCount || 0;
    this.state.obstacles = [];

    for (let i = 0; i < count; i++) {
      let pos;
      do {
        pos = {
          x: Math.floor(Math.random() * this.state.gridSize),
          y: Math.floor(Math.random() * this.state.gridSize)
        };
      } while (
        this._hitsItself(pos) ||
        this._posEquals(pos, this.state.food)
      );
      this.state.obstacles.push(pos);
    }
  }

  /* ============================================================
     GAME OVER
     ============================================================ */

  _gameOver() {
    this._stopTick();
    this.state.status = 'gameover';

    const best = ScoreService.getBest('snake');
    const isRecord = this.state.score >= best;

    EventBus.emit('game:over', {
      score:    this.state.score,
      best,
      isRecord,
      length:   this.state.snake.length,
      state:    this.state
    });
  }

  /* ============================================================
     CONTRÔLES
     ============================================================ */

  _bindControls() {
    const keys = this.config.controls.keyboard;

    // Construire une map rapide key → direction
    this._keyMap = {};
    keys.up.forEach(k    => this._keyMap[k] = 'UP');
    keys.down.forEach(k  => this._keyMap[k] = 'DOWN');
    keys.left.forEach(k  => this._keyMap[k] = 'LEFT');
    keys.right.forEach(k => this._keyMap[k] = 'RIGHT');

    this._onKeyDown = (e) => {
      const dir = this._keyMap[e.code];

      // Game over : toute touche → retour idle (overlay caché)
      if (this.state.status === 'gameover') {
        if (dir || keys.restart.includes(e.code) || keys.pause.includes(e.code)) {
          e.preventDefault();
          EventBus.emit('game:restart'); // cache overlay + appelle restart() via _onRestart → idle
        }
        return;
      }

      // Direction — ignorée si en pause
      if (dir) {
        e.preventDefault();
        const s = this.state.status;
        if (s === 'playing' || s === 'idle') {
          this._directionQueue.push(dir);
        }
        if (s === 'idle') this.start();
        return;
      }

      // Pause
      if (keys.pause.includes(e.code)) {
        e.preventDefault();
        this.togglePause();
        return;
      }

      // Restart explicite (pendant jeu ou pause) → retour idle
      if (keys.restart.includes(e.code)) {
        e.preventDefault();
        EventBus.emit('game:restart'); // cache overlay + appelle restart() via _onRestart → idle
      }
    };

    window.addEventListener('keydown', this._onKeyDown);

    // EventBus (boutons GameShell)
    this._onPauseToggle = () => this.togglePause();
    this._onRestart     = () => this.restart();
    EventBus.on('game:pause-toggle', this._onPauseToggle);
    EventBus.on('game:restart',      this._onRestart);

    // Touch / Swipe
    if (this.config.controls.touch?.enabled) {
      this._bindTouch();
    }
  }

  _unbindControls() {
    window.removeEventListener('keydown', this._onKeyDown);
    if (this._touchStart) {
      window.removeEventListener('touchstart', this._touchStart);
      window.removeEventListener('touchend',   this._touchEnd);
    }
  }

  _bindTouch() {
    const minPx = this.config.controls.touch.swipeMinPx || 30;
    let startX, startY;

    this._touchStart = (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    this._touchEnd = (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;

      if (Math.abs(dx) < minPx && Math.abs(dy) < minPx) return;

      let dir;
      if (Math.abs(dx) > Math.abs(dy)) {
        dir = dx > 0 ? 'RIGHT' : 'LEFT';
      } else {
        dir = dy > 0 ? 'DOWN' : 'UP';
      }

      const s = this.state.status;
      if (s === 'playing' || s === 'idle') {
        this._directionQueue.push(dir);
      }
      if (s === 'idle') this.start();
    };

    window.addEventListener('touchstart', this._touchStart, { passive: true });
    window.addEventListener('touchend',   this._touchEnd,   { passive: true });
  }

  /* ============================================================
     UTILITAIRES — DÉPLACEMENT & COLLISION
     ============================================================ */

  _move(pos, direction) {
    const moves = {
      UP:    { x: 0,  y: -1 },
      DOWN:  { x: 0,  y:  1 },
      LEFT:  { x: -1, y:  0 },
      RIGHT: { x:  1, y:  0 }
    };
    const delta = moves[direction];
    return { x: pos.x + delta.x, y: pos.y + delta.y };
  }

  _isOutOfBounds({ x, y }) {
    return x < 0 || x >= this.state.gridSize ||
           y < 0 || y >= this.state.gridSize;
  }

  _hitsItself(pos) {
    return this.state.snake.some(seg => this._posEquals(seg, pos));
  }

  _hitsObstacle(pos) {
    return this.state.obstacles.some(obs => this._posEquals(obs, pos));
  }

  _posEquals(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  /**
   * Direction valide = pas de demi-tour
   */
  _isValidDirection(next) {
    const opposites = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
    const current   = this._directionQueue.length > 0
      ? this._directionQueue[this._directionQueue.length - 1]
      : this.state.direction;
    return opposites[next] !== current;
  }

  /* ============================================================
     UTILITAIRES — CONFIG & THÈME
     ============================================================ */

  _getDiffConfig() {
    const diff = this.config.gameplay.difficulty || 'normal';
    return this.config.gameplay.difficulties[diff];
  }

  _getFoodTheme() {
    const foodThemeKey = this.config.theme.food.style || this.config.theme.food.theme;
    return this.config.theme.food[foodThemeKey] || this.config.theme.food.neon;
  }

  _getComboMultiplier() {
    const { comboThresholds, comboMultipliers } = this.config.scoring;
    let idx = 0;
    for (let i = 0; i < comboThresholds.length; i++) {
      if (this.state.combo >= comboThresholds[i]) idx = i;
    }
    return comboMultipliers[idx];
  }

  /**
   * Accélérer très légèrement à chaque repas
   */
  _maybeAccelerate() {
    const diff      = this._getDiffConfig();
    const increment = this.config.gameplay.speedIncrement || 0;
    if (increment === 0) return; // pas d'accélération si non configuré

    const minTick = Math.max(50, diff.tickInterval * 0.5);
    const current = this._currentTickInterval || diff.tickInterval;
    const next    = Math.max(minTick, current - increment);

    if (next !== current) {
      this._currentTickInterval = next;
      this._stopTick();
      this._startTick();
    }
  }

  /* ============================================================
     TICK TIMER
     ============================================================ */

  _startTick() {
    const diff     = this._getDiffConfig();
    const interval = this._currentTickInterval || diff.tickInterval;
    this._tickTimer = setInterval(() => this._tick(), interval);
  }

  _stopTick() {
    if (this._tickTimer) {
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }
  }

  /* ============================================================
     ÉTAT INITIAL
     ============================================================ */

  _buildInitialState() {
    const size   = this.config.gameplay.gridSize;
    const length = this.config.gameplay.initialLength;
    const midX   = Math.floor(size / 2);
    const midY   = Math.floor(size / 2);

    // Serpent centré, orienté à droite
    const snake = Array.from({ length }, (_, i) => ({
      x: midX - i,
      y: midY
    }));

    return {
      status:    'idle',        // idle | playing | paused | gameover
      gridSize:  size,
      snake,
      direction: this.config.gameplay.initialDirection || 'RIGHT',
      food:      { x: 0, y: 0 },
      foodEmoji: null,
      obstacles: [],
      score:     0,
      combo:     0
    };
  }
}