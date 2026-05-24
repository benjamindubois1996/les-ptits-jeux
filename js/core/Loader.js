/**
 * Loader — Chargement dynamique des jeux
 *
 * Responsabilités :
 *  1. Vérifier la disponibilité du jeu (config)
 *  2. Importer dynamiquement les modules du jeu
 *  3. Déléguer la construction visuelle à GameShell
 *  4. Initialiser le jeu dans son conteneur
 *  5. Gérer les erreurs de chargement proprement
 *
 * Dépendances : EventBus, ConfigService, GameShell
 */

import EventBus     from './EventBus.js';
import ConfigService from '../services/ConfigService.js';
import GameShell     from '../ui/GameShell.js';

const Loader = (() => {

  /** Jeu actuellement chargé (pour cleanup) */
  let currentGame = null;

  /**
   * Charger un jeu par son id
   * @param {string} gameId  — ex: "snake"
   * @returns {Promise<void>}
   */
  async function load(gameId) {
    try {
      EventBus.emit('loader:start', { gameId });

      // 1. Récupérer la config du jeu depuis config.json
      const gameMeta = await ConfigService.getGame(gameId);

      if (!gameMeta) {
        throw new Error(`Jeu introuvable : "${gameId}"`);
      }

      if (!gameMeta.available) {
        EventBus.emit('loader:unavailable', { gameId, gameMeta });
        return;
      }

      // 2. Cleanup de l'éventuel jeu précédent
      await unload();

      // 3. Charger la config spécifique du jeu (snake.config.json)
      const gameConfig = await ConfigService.getGameConfig(gameId);

      // 4. Import dynamique des modules du jeu
      //    Le navigateur ne télécharge ces fichiers qu'ici (lazy loading)
      const basePath  = `/games/${gameId}/`;
      const LogicModule    = await import(`${basePath}${capitalize(gameId)}.js`);
      const RendererModule = await import(`${basePath}${capitalize(gameId)}Renderer.js`);

      const GameLogic    = LogicModule.default;
      const GameRenderer = RendererModule.default;

      // 5. Préparer le conteneur visuel (GameShell construit le DOM)
      const container = GameShell.build(gameMeta, gameConfig);

      // 6. Instancier et démarrer le jeu
      const game = new GameLogic(gameConfig);
      const renderer = new GameRenderer(game, container, gameConfig);

      currentGame = { game, renderer, gameId };

      game.init();
      renderer.init();

      EventBus.emit('loader:ready', { gameId, gameMeta, gameConfig });

    } catch (err) {
      console.error(`[Loader] Erreur lors du chargement de "${gameId}" :`, err);
      EventBus.emit('loader:error', { gameId, error: err.message });
      GameShell.showError(err.message);
    }
  }

  /**
   * Décharger le jeu courant proprement
   * Appelle destroy() si le jeu l'implémente
   */
  async function unload() {
    if (!currentGame) return;

    const { game, renderer, gameId } = currentGame;

    if (typeof renderer.destroy === 'function') renderer.destroy();
    if (typeof game.destroy    === 'function') game.destroy();

    GameShell.clear();
    currentGame = null;

    EventBus.emit('loader:unloaded', { gameId });
  }

  /**
   * Retourner le jeu actuellement chargé (pour debug)
   */
  function getCurrent() {
    return currentGame;
  }

  /**
   * Utilitaire — capitalize "snake" → "Snake"
   */
  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  return { load, unload, getCurrent };
})();

export default Loader;