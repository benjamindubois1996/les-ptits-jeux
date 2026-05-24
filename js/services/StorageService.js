/**
 * StorageService — Abstraction de la persistance des données
 *
 * Aujourd'hui : localStorage
 * Demain      : remplacer les méthodes par des appels fetch() vers une API REST
 *
 * Convention de clés : "retrovault:{namespace}:{key}"
 * Exemple           : "retrovault:scores:snake"
 */

const StorageService = (() => {

  const PREFIX = 'retrovault';

  /**
   * Construire la clé complète
   * @param {string} namespace  — ex: "scores", "prefs"
   * @param {string} key        — ex: "snake"
   */
  function buildKey(namespace, key) {
    return `${PREFIX}:${namespace}:${key}`;
  }

  /**
   * Écrire une valeur (sérialisée en JSON)
   * @param {string} namespace
   * @param {string} key
   * @param {*}      value
   * @returns {boolean} succès
   */
  function set(namespace, key, value) {
    try {
      localStorage.setItem(buildKey(namespace, key), JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('[StorageService] set() échoué :', err);
      return false;
    }
  }

  /**
   * Lire une valeur (désérialisée depuis JSON)
   * @param {string} namespace
   * @param {string} key
   * @param {*}      defaultValue — retourné si la clé n'existe pas
   * @returns {*}
   */
  function get(namespace, key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(buildKey(namespace, key));
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch (err) {
      console.error('[StorageService] get() échoué :', err);
      return defaultValue;
    }
  }

  /**
   * Supprimer une valeur
   * @param {string} namespace
   * @param {string} key
   */
  function remove(namespace, key) {
    try {
      localStorage.removeItem(buildKey(namespace, key));
      return true;
    } catch (err) {
      console.error('[StorageService] remove() échoué :', err);
      return false;
    }
  }

  /**
   * Vérifier si une clé existe
   * @param {string} namespace
   * @param {string} key
   * @returns {boolean}
   */
  function has(namespace, key) {
    return localStorage.getItem(buildKey(namespace, key)) !== null;
  }

  /**
   * Récupérer toutes les entrées d'un namespace
   * @param {string} namespace
   * @returns {Object} { key: value, ... }
   */
  function getAll(namespace) {
    const result = {};
    const nsPrefix = `${PREFIX}:${namespace}:`;

    for (let i = 0; i < localStorage.length; i++) {
      const fullKey = localStorage.key(i);
      if (fullKey.startsWith(nsPrefix)) {
        const shortKey = fullKey.replace(nsPrefix, '');
        try {
          result[shortKey] = JSON.parse(localStorage.getItem(fullKey));
        } catch {
          result[shortKey] = localStorage.getItem(fullKey);
        }
      }
    }
    return result;
  }

  /**
   * Effacer tout un namespace
   * @param {string} namespace
   */
  function clearNamespace(namespace) {
    const nsPrefix = `${PREFIX}:${namespace}:`;
    const toDelete = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(nsPrefix)) toDelete.push(key);
    }

    toDelete.forEach(k => localStorage.removeItem(k));
    return toDelete.length;
  }

  /**
   * Effacer TOUTES les données RetroVault
   * ⚠️ Irréversible — à utiliser avec confirmation
   */
  function clearAll() {
    const toDelete = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(PREFIX)) toDelete.push(key);
    }

    toDelete.forEach(k => localStorage.removeItem(k));
    return toDelete.length;
  }

  /**
   * Debug — afficher tout le contenu RetroVault
   */
  function debug() {
    const all = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(PREFIX)) {
        try { all[key] = JSON.parse(localStorage.getItem(key)); }
        catch { all[key] = localStorage.getItem(key); }
      }
    }
    console.table(all);
  }

  return { set, get, remove, has, getAll, clearNamespace, clearAll, debug };
})();

export default StorageService;