/**
 * ConfigService — Lecture et cache des configurations
 *
 * Charge :
 *  - config.json              → catalogue global des jeux
 *  - games/{id}/{id}.config.json → config spécifique d'un jeu
 *
 * Met en cache les résultats pour éviter les fetch répétés.
 * Remplaçable par des appels API GET /api/games et GET /api/games/:id
 */

const ConfigService = (() => {

  /** Cache interne */
  const _cache = {
    global: null,       // config.json complet
    games:  {}          // { snake: {...}, tetris: {...} }
  };

  /**
   * Charger la config globale (config.json)
   * @returns {Promise<Object>}
   */
  async function getGlobal() {
    if (_cache.global) return _cache.global;

    try {
      const res = await fetch('./config.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      _cache.global = await res.json();
      return _cache.global;
    } catch (err) {
      console.error('[ConfigService] Impossible de charger config.json :', err);
      throw err;
    }
  }

  /**
   * Obtenir la liste de tous les jeux
   * @returns {Promise<Array>}
   */
  async function getAllGames() {
    const config = await getGlobal();
    return config.games || [];
  }

  /**
   * Obtenir les métadonnées d'un jeu depuis le catalogue global
   * @param {string} gameId
   * @returns {Promise<Object|null>}
   */
  async function getGame(gameId) {
    const games = await getAllGames();
    return games.find(g => g.id === gameId) || null;
  }

  /**
   * Obtenir les catégories
   * @returns {Promise<Array>}
   */
  async function getCategories() {
    const config = await getGlobal();
    return config.categories || [];
  }

  /**
   * Charger la config spécifique d'un jeu (snake.config.json)
   * @param {string} gameId
   * @returns {Promise<Object>}
   */
  async function getGameConfig(gameId) {
    if (_cache.games[gameId]) return _cache.games[gameId];

    try {
      const res = await fetch(`./games/${gameId}/${gameId}.config.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const config = await res.json();

      // Fusionner avec les valeurs par défaut
      _cache.games[gameId] = _mergeWithDefaults(config);
      return _cache.games[gameId];
    } catch (err) {
      console.warn(`[ConfigService] Config introuvable pour "${gameId}", utilisation des défauts`);
      return _getDefaults(gameId);
    }
  }

  /**
   * Obtenir les préférences utilisateur pour un jeu
   * (stockées dans localStorage via StorageService)
   * @param {string} gameId
   * @returns {Object}
   */
  async function getUserPrefs(gameId) {
    // Import dynamique pour éviter la dépendance circulaire
    const { default: StorageService } = await import('./StorageService.js');
    return StorageService.get('prefs', gameId, {});
  }

  /**
   * Sauvegarder des préférences utilisateur pour un jeu
   * @param {string} gameId
   * @param {Object} prefs
   */
  async function setUserPrefs(gameId, prefs) {
    const { default: StorageService } = await import('./StorageService.js');
    const existing = await getUserPrefs(gameId);
    StorageService.set('prefs', gameId, { ...existing, ...prefs });
  }

  /**
   * Vider le cache (utile en dev)
   */
  function clearCache() {
    _cache.global = null;
    _cache.games  = {};
  }

  /**
   * Fusionner une config avec les valeurs par défaut
   * @private
   */
  function _mergeWithDefaults(config) {
    const defaults = _getDefaults(config.id || 'unknown');
    return _deepMerge(defaults, config);
  }

  /**
   * Valeurs par défaut communes à tous les jeux
   * @private
   */
  function _getDefaults(gameId) {
    return {
      id: gameId,
      gameplay: {
        difficulty: 'normal'
      },
      scoring: {
        pointsPerAction: 10,
        bonusMultiplier: 1
      },
      design: {
        theme: 'neon'
      }
    };
  }

  /**
   * Deep merge de deux objets
   * @private
   */
  function _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        result[key] = _deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  return {
    getGlobal,
    getAllGames,
    getGame,
    getCategories,
    getGameConfig,
    getUserPrefs,
    setUserPrefs,
    clearCache
  };
})();

export default ConfigService;