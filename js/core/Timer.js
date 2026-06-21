/**
 * Timer — Chronomètre partagé pour tous les jeux RetroVault
 *
 * Le chrono est TOUJOURS croissant (affiche le temps écoulé).
 * L'effet sur le score varie selon le type de jeu :
 *
 *  scoreEffect: 'positive' (survie)
 *    → bonus = secondes écoulées × pointsPerSecond
 *    → survivre longtemps rapporte plus
 *
 *  scoreEffect: 'negative' (tâche à accomplir)
 *    → bonus = (maxSeconds - secondes écoulées) × pointsPerSecond
 *    → finir vite rapporte plus, traîner coûte des points
 *
 * Utilisation dans un jeu :
 *
 *   this.timer.start();
 *   const bonus = this.timer.scoreBonus(config.scoring.pointsPerSecond);
 *   this.timer.pause() / resume() / stop() / reset() / destroy()
 *
 * Émet game:score-update { timer: '01:23' } chaque seconde → header GameShell.
 */

import EventBus from './EventBus.js';

export default class Timer {

  /**
   * @param {object} opts
   * @param {'positive'|'negative'} opts.scoreEffect   - effet sur le score (défaut: 'positive')
   * @param {number}                opts.maxSeconds     - plafond pour le calcul négatif (défaut: 300)
   * @param {boolean}               opts.emitUpdates    - émettre game:score-update (défaut: true)
   */
  constructor({ scoreEffect = 'positive', maxSeconds = 300, emitUpdates = true } = {}) {
    this.scoreEffect = scoreEffect;
    this.maxSeconds  = maxSeconds;
    this._emit       = emitUpdates;

    this._seconds    = 0;
    this._running    = false;
    this._intervalId = null;
  }

  /* ============================================================
     LECTURE
     ============================================================ */

  get seconds()  { return this._seconds; }
  get running()  { return this._running; }

  get formatted() {
    const s = Math.floor(this._seconds);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  /**
   * Bonus de score basé sur le temps.
   * @param {number} pointsPerSecond
   * @returns {number}
   */
  scoreBonus(pointsPerSecond = 1) {
    if (this.scoreEffect === 'positive') {
      return Math.floor(this._seconds) * pointsPerSecond;
    }
    // Négatif : plus tu as été rapide, plus le bonus est grand
    const remaining = Math.max(0, this.maxSeconds - Math.floor(this._seconds));
    return remaining * pointsPerSecond;
  }

  /* ============================================================
     CONTRÔLE
     ============================================================ */

  start() {
    if (this._running) return;
    this._running    = true;
    this._intervalId = setInterval(() => this._tick(), 1000);
  }

  pause() {
    if (!this._running) return;
    this._running = false;
    clearInterval(this._intervalId);
    this._intervalId = null;
  }

  resume() {
    if (this._running) return;
    this.start();
  }

  stop()    { this.pause(); }

  reset() {
    this.stop();
    this._seconds = 0;
    this._emitUpdate();
  }

  destroy() { this.stop(); }

  /* ============================================================
     INTERNE
     ============================================================ */

  _tick() {
    this._seconds++;
    this._emitUpdate();
  }

  _emitUpdate() {
    if (this._emit) {
      EventBus.emit('game:score-update', { timer: this.formatted });
    }
  }
}
