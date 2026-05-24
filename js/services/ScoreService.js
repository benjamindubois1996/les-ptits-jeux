/**
 * ScoreService — Gestion des scores et records par jeu
 *
 * Dépendances : StorageService
 *
 * Structure stockée pour chaque jeu :
 * {
 *   best: 1500,
 *   history: [
 *     { score: 1500, date: "2025-01-01T10:00:00Z", meta: { level: "hard" } },
 *     ...
 *   ]
 * }
 */

import StorageService from './StorageService.js';

const ScoreService = (() => {

  const NS           = 'scores';    // namespace StorageService
  const MAX_HISTORY  = 10;          // nb de scores conservés par jeu

  /**
   * Soumettre un score après une partie
   * @param {string} gameId   — ex: "snake"
   * @param {number} score
   * @param {Object} meta     — données supplémentaires (level, durée…)
   * @returns {{ isRecord: boolean, previous: number }}
   */
  function submit(gameId, score, meta = {}) {
    const data    = _load(gameId);
    const previous = data.best;
    const isRecord = score > previous;

    if (isRecord) data.best = score;

    // Ajouter à l'historique
    data.history.unshift({
      score,
      date: new Date().toISOString(),
      meta
    });

    // Garder seulement les N meilleurs
    data.history = data.history
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_HISTORY);

    StorageService.set(NS, gameId, data);

    return { isRecord, previous, best: data.best };
  }

  /**
   * Obtenir le meilleur score d'un jeu
   * @param {string} gameId
   * @returns {number}
   */
  function getBest(gameId) {
    return _load(gameId).best;
  }

  /**
   * Obtenir l'historique des scores d'un jeu
   * @param {string} gameId
   * @returns {Array}
   */
  function getHistory(gameId) {
    return _load(gameId).history;
  }

  /**
   * Obtenir le classement global (meilleur score par jeu)
   * @returns {Array<{ gameId, best }>} trié par score décroissant
   */
  function getLeaderboard() {
    const all = StorageService.getAll(NS);
    return Object.entries(all)
      .map(([gameId, data]) => ({ gameId, best: data.best || 0 }))
      .sort((a, b) => b.best - a.best);
  }

  /**
   * Réinitialiser les scores d'un jeu
   * @param {string} gameId
   */
  function reset(gameId) {
    StorageService.remove(NS, gameId);
  }

  /**
   * Réinitialiser tous les scores
   */
  function resetAll() {
    StorageService.clearNamespace(NS);
  }

  /**
   * Charger les données d'un jeu (avec valeurs par défaut)
   * @private
   */
  function _load(gameId) {
    return StorageService.get(NS, gameId, { best: 0, history: [] });
  }

  return { submit, getBest, getHistory, getLeaderboard, reset, resetAll };
})();

export default ScoreService;