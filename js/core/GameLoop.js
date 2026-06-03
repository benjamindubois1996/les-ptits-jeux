/**
 * GameLoop — Moteur de tick centralisé (setInterval)
 *
 * Remplace le pattern _tickTimer / _startTick() / _stopTick()
 * dupliqué dans chaque jeu basé sur un tick discret.
 *
 * Usage :
 *   this._loop = new GameLoop(() => this._tick());
 *   this._loop.start(200);      // démarre à 200ms/tick
 *   this._loop.stop();           // arrête
 *   this._loop.setSpeed(100);   // accélère (redémarre si actif)
 *   this._loop.isRunning        // true/false
 *   this._loop.destroy();        // cleanup final
 */
export default class GameLoop {

  constructor(tickFn) {
    this._tickFn   = tickFn;
    this._timer    = null;
    this._interval = null;
  }

  /** Démarrer la boucle à l'intervalle donné (ms) */
  start(interval) {
    this.stop();
    this._interval = interval;
    this._timer    = setInterval(this._tickFn, interval);
  }

  /** Arrêter la boucle */
  stop() {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * Changer la vitesse.
   * Si la boucle tournait, elle redémarre immédiatement à la nouvelle vitesse.
   */
  setSpeed(interval) {
    const wasRunning = this._timer !== null;
    this.stop();
    this._interval = interval;
    if (wasRunning) this.start(interval);
  }

  /** Vrai si la boucle est en cours d'exécution */
  get isRunning() {
    return this._timer !== null;
  }

  /** Cleanup final — appeler dans destroy() du jeu */
  destroy() {
    this.stop();
    this._tickFn = null;
  }
}
