/**
 * Router — Navigation SPA (Single Page Application)
 * Gère les routes via hash (#) pour compatibilité fichiers statiques.
 * Remplaçable par History API ou React Router si besoin.
 *
 * Usage:
 *   Router.register('home', () => renderHome())
 *   Router.navigate('home')
 */

import EventBus from './EventBus.js';

const Router = (() => {
  const routes = {};
  let currentRoute = null;

  /**
   * Enregistrer une route
   * @param {string} name
   * @param {Function} handler - appelé avec les params de la route
   */
  function register(name, handler) {
    routes[name] = handler;
  }

  /**
   * Naviguer vers une route
   * @param {string} name
   * @param {Object} params
   */
  function navigate(name, params = {}) {
    if (!routes[name]) {
      console.warn(`[Router] Route inconnue : "${name}"`);
      return;
    }

    const hash = params && Object.keys(params).length
      ? `#${name}?${new URLSearchParams(params).toString()}`
      : `#${name}`;

    window.location.hash = hash;
  }

  /**
   * Parser le hash courant
   */
  function parseHash() {
    const hash = window.location.hash.slice(1); // remove '#'
    if (!hash) return { name: 'home', params: {} };

    const [name, query] = hash.split('?');
    const params = query ? Object.fromEntries(new URLSearchParams(query)) : {};
    return { name, params };
  }

  /**
   * Résoudre la route courante
   */
  function resolve() {
    const { name, params } = parseHash();

    if (!routes[name]) {
      console.warn(`[Router] Route non enregistrée : "${name}", fallback → home`);
      navigate('home');
      return;
    }

    const previous = currentRoute;
    currentRoute = name;

    EventBus.emit('router:change', { from: previous, to: name, params });
    routes[name](params);
  }

  /**
   * Initialiser le router (écoute les changements de hash)
   */
  function init() {
    window.addEventListener('hashchange', resolve);
    resolve(); // résoudre la route initiale
  }

  /**
   * Obtenir la route courante
   */
  function current() {
    return currentRoute;
  }

  return { register, navigate, init, current };
})();

export default Router;