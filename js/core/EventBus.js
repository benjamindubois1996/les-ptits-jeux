/**
 * EventBus — Communication inter-modules découplée
 * Permet aux modules de communiquer sans se connaître directement.
 * Remplaçable par un store Redux/Zustand si besoin.
 *
 * Usage:
 *   EventBus.on('game:start', handler)
 *   EventBus.emit('game:start', { gameId: 'snake' })
 *   EventBus.off('game:start', handler)
 */

const EventBus = (() => {
  const listeners = {};

  return {
    /**
     * S'abonner à un événement
     * @param {string} event
     * @param {Function} callback
     */
    on(event, callback) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
    },

    /**
     * Se désabonner d'un événement
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(cb => cb !== callback);
    },

    /**
     * Émettre un événement
     * @param {string} event
     * @param {*} data
     */
    emit(event, data) {
      if (!listeners[event]) return;
      listeners[event].forEach(cb => cb(data));
    },

    /**
     * S'abonner une seule fois
     * @param {string} event
     * @param {Function} callback
     */
    once(event, callback) {
      const wrapper = (data) => {
        callback(data);
        this.off(event, wrapper);
      };
      this.on(event, wrapper);
    },

    /**
     * Debug — lister tous les listeners actifs
     */
    debug() {
      console.table(
        Object.entries(listeners).map(([event, cbs]) => ({
          event,
          listeners: cbs.length
        }))
      );
    }
  };
})();

export default EventBus;