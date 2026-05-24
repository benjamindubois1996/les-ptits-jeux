/**
 * Toast — Notifications légères
 *
 * Usage direct :
 *   Toast.show('Message', 'success')
 *   Toast.show('Erreur', 'error')
 *
 * Usage via EventBus :
 *   EventBus.emit('toast', { message: '🏆 Record !', type: 'success' })
 *
 * Types : 'info' | 'success' | 'error' | 'warning'
 */

import EventBus from '../core/EventBus.js';

const Toast = (() => {

  let container = null;

  /**
   * Initialiser le conteneur DOM et écouter l'EventBus
   */
  function init() {
    container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    // Écouter les toasts émis via EventBus
    EventBus.on('toast', ({ message, type = 'info', duration }) => {
      show(message, type, duration);
    });
  }

  /**
   * Afficher un toast
   * @param {string} message
   * @param {'info'|'success'|'error'|'warning'} type
   * @param {number} duration — ms avant disparition (défaut 3000)
   */
  function show(message, type = 'info', duration = 3000) {
    if (!container) init();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${_icon(type)}</span>
      <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Animer l'entrée
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('visible'));
    });

    // Disparition automatique
    setTimeout(() => dismiss(toast), duration);

    // Clic pour fermer manuellement
    toast.addEventListener('click', () => dismiss(toast));

    return toast;
  }

  /**
   * Fermer un toast
   * @param {HTMLElement} toast
   */
  function dismiss(toast) {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }

  /**
   * Raccourcis typés
   */
  const success = (msg, duration) => show(msg, 'success', duration);
  const error   = (msg, duration) => show(msg, 'error',   duration);
  const warning = (msg, duration) => show(msg, 'warning', duration);
  const info    = (msg, duration) => show(msg, 'info',    duration);

  /**
   * Icône selon le type
   * @private
   */
  function _icon(type) {
    const icons = {
      success: '✓',
      error:   '✕',
      warning: '⚠',
      info:    'ℹ'
    };
    return icons[type] || icons.info;
  }

  return { init, show, dismiss, success, error, warning, info };
})();

export default Toast;