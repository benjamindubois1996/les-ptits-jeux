/**
 * BaseGame — Classe de base abstraite pour tous les jeux RetroVault
 *
 * Factorise le code commun à tous les jeux :
 *  - Bindings EventBus (game:pause-toggle, game:restart)
 *  - Machine à états pause/reprise via togglePause()
 *  - Cleanup destroy()
 *
 * Comment étendre :
 *
 *   import BaseGame from '../../js/core/BaseGame.js';
 *
 *   export default class MonJeu extends BaseGame {
 *     constructor(config) {
 *       super(config);
 *       // ... init spécifique
 *     }
 *
 *     init() {
 *       this._bindControls();     // implémenté dans la sous-classe
 *       this._setupEventBusBindings(); // appel OBLIGATOIRE
 *       EventBus.emit('game:ready', { gameId: this._gameId() });
 *     }
 *
 *     destroy() {
 *       super.destroy();          // cleanup EventBus commun
 *       this._unbindControls();   // cleanup spécifique
 *     }
 *
 *     // Optionnel — override pour gérer sa boucle lors de la pause
 *     _onPause()  { this._loop.stop();  }
 *     _onResume() { this._loop.start(this._getTickInterval()); }
 *
 *     _gameId() { return 'mon-jeu'; }
 *     _buildInitialState() { return { status: 'idle', score: 0 }; }
 *   }
 */

import EventBus from './EventBus.js';
import Timer    from './Timer.js';
import Lives    from './Lives.js';

export default class BaseGame {

  constructor(config) {
    this.config = config;
    this.state  = null;

    // Chronomètre — configuré via config.timer (défaut : mode 'up')
    const timerCfg  = config.timer  ?? {};
    this.timer = new Timer(timerCfg);

    // Vies — configuré via config.lives (défaut : 1 vie)
    const livesCfg  = config.lives  ?? {};
    this.lives = new Lives(livesCfg);

    // Références gardées pour pouvoir unsubscribe dans destroy()
    this._onPauseToggle = null;
    this._onRestart     = null;
  }

  /* ============================================================
     BINDINGS EVENBUS COMMUNS
     Appeler dans init() ou _bindControls() de chaque jeu
     ============================================================ */

  _setupEventBusBindings() {
    this._onPauseToggle   = () => this.togglePause();
    this._onRestart       = () => { this.timer.stop(); this.timer.reset(); this.restart(); this.start(); this.timer.start(); };
    this._onPlayRequested = () => { this.timer.reset(); this.timer.start(); };
    this._onGameOver      = () => this.timer.stop();
    EventBus.on('game:pause-toggle',   this._onPauseToggle);
    EventBus.on('game:restart',        this._onRestart);
    EventBus.on('game:play-requested', this._onPlayRequested);
    EventBus.on('game:over',           this._onGameOver);
    EventBus.on('game:won',            this._onGameOver);
    EventBus.on('game:win',            this._onGameOver);
  }

  /* ============================================================
     PAUSE — implémentation commune
     Les jeux avec boucle overrident _onPause() / _onResume()
     ============================================================ */

  togglePause() {
    if (this.state?.status === 'playing') {
      this.state.status = 'paused';
      this.timer.pause();
      this._onPause();
      EventBus.emit('game:paused',  { state: this.state });

    } else if (this.state?.status === 'paused') {
      this.state.status = 'playing';
      this.timer.resume();
      this._onResume();
      EventBus.emit('game:resumed', { state: this.state });
    }
  }

  /** Override pour stopper la boucle lors de la pause */
  _onPause()  {}

  /** Override pour relancer la boucle lors de la reprise */
  _onResume() {}

  /* ============================================================
     DESTROY — cleanup commun des listeners EventBus
     Chaque jeu appelle super.destroy() en premier
     ============================================================ */

  destroy() {
    this.timer.destroy();
    if (this._onPauseToggle)   EventBus.off('game:pause-toggle',   this._onPauseToggle);
    if (this._onRestart)       EventBus.off('game:restart',        this._onRestart);
    if (this._onPlayRequested) EventBus.off('game:play-requested', this._onPlayRequested);
    if (this._onGameOver) {
      EventBus.off('game:over', this._onGameOver);
      EventBus.off('game:won',  this._onGameOver);
      EventBus.off('game:win',  this._onGameOver);
    }
  }

  /* ============================================================
     ABSTRACTIONS — à implémenter dans chaque jeu
     ============================================================ */

  /** Identifiant unique du jeu (ex: 'snake', 'tetris') */
  _gameId() { return 'unknown'; }

  /** Construire l'état initial — appelé au démarrage et restart */
  _buildInitialState() { return {}; }
}
