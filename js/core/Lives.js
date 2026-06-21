/**
 * Lives — Gestionnaire de vies partagé pour tous les jeux RetroVault
 *
 * Défaut : 1 vie (jeux sans notion de vies multiples = 1 seule chance)
 *
 * Utilisation dans un jeu :
 *
 *   this.lives.lose();          // perd 1 vie → émet game:no-lives si 0
 *   this.lives.gain();          // gagne 1 vie
 *   this.lives.count            // nombre de vies restantes
 *   this.lives.reset();         // retour à initial
 *
 * Le module émet automatiquement game:score-update { lives } à chaque changement
 * pour mettre à jour l'affichage dans le header de GameShell.
 */

import EventBus from './EventBus.js';

export default class Lives {

  /**
   * @param {object} opts
   * @param {number}  opts.initial      - vies de départ (défaut: 1)
   * @param {number}  opts.max          - plafond de vies (défaut: initial)
   * @param {boolean} opts.emitUpdates  - émettre game:score-update chaque changement (défaut: true)
   */
  constructor({ initial = 1, max, emitUpdates = true } = {}) {
    this._initial = initial;
    this._max     = max ?? initial;
    this._count   = initial;
    this._emit    = emitUpdates;
  }

  /* ============================================================
     LECTURE
     ============================================================ */

  get count() { return this._count; }
  get isAlive() { return this._count > 0; }

  /* ============================================================
     CONTRÔLE
     ============================================================ */

  /**
   * Perd n vies. Émet game:no-lives si le compteur atteint 0.
   * @param {number} n
   * @returns {number} vies restantes
   */
  lose(n = 1) {
    this._count = Math.max(0, this._count - n);
    this._emitUpdate();
    if (this._count === 0) EventBus.emit('game:no-lives');
    return this._count;
  }

  /**
   * Gagne n vies (plafonné à max).
   * @param {number} n
   * @returns {number} vies restantes
   */
  gain(n = 1) {
    this._count = Math.min(this._max, this._count + n);
    this._emitUpdate();
    return this._count;
  }

  /** Remet les vies à la valeur initiale. */
  reset() {
    this._count = this._initial;
    this._emitUpdate();
  }

  /* ============================================================
     INTERNE
     ============================================================ */

  _emitUpdate() {
    if (this._emit) {
      EventBus.emit('game:score-update', { lives: this._count });
    }
  }
}
