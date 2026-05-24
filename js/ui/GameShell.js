/**
 * GameShell — Conteneur DOM universel pour tous les jeux
 *
 * Responsabilités :
 *  - Construire le squelette HTML commun (header, viewport, controls)
 *  - Exposer le viewport où chaque jeu rend son contenu
 *  - Gérer les boutons pause / restart via EventBus
 *  - Afficher le score en temps réel
 *  - Afficher les écrans : loading, error, game-over
 *
 * Dépendances : EventBus, ScoreService
 */

import EventBus    from '../core/EventBus.js';
import ScoreService from '../services/ScoreService.js';

const GameShell = (() => {

  const ROOT_ID    = 'game-shell';
  const VIEWPORT_ID = 'game-viewport';

  let _currentGameId = null;
  let _scoreEl       = null;
  let _bestEl        = null;

  /**
   * Construire le shell autour d'un jeu
   * @param {Object} meta    — métadonnées du catalogue (titre, thumbnail…)
   * @param {Object} config  — config spécifique du jeu
   * @returns {HTMLElement}  — le viewport où le jeu doit se rendre
   */
  function build(meta, config) {
    _currentGameId = meta.id;
    const best     = ScoreService.getBest(meta.id);

    const app = document.getElementById('app');
    app.innerHTML = `
      <nav class="nav">
        <div class="nav-logo" id="nav-home-btn">
          RETRO<span>VAULT</span>
        </div>
        <ul class="nav-links">
          <li><span class="nav-link" id="nav-back-btn">← Accueil</span></li>
        </ul>
      </nav>

      <div class="game-shell" id="${ROOT_ID}">

        <!-- Header du jeu -->
        <div class="game-shell__header">
          <div class="game-shell__title">
            <span class="game-shell__thumbnail">${meta.thumbnail}</span>
            <span class="game-shell__name">${meta.title}</span>
          </div>

          <div class="game-shell__scores">
            <div class="game-shell__score-item">
              <span class="game-shell__score-label">Score</span>
              <span class="game-shell__score-value" id="gs-score">0</span>
            </div>
            <div class="game-shell__score-item">
              <span class="game-shell__score-label">Record</span>
              <span class="game-shell__score-value game-shell__score-value--best" id="gs-best">${best}</span>
            </div>
          </div>

          <div class="game-shell__controls">
            <button class="btn btn-ghost btn-sm" id="gs-pause-btn" title="Pause (P)">⏸</button>
            <button class="btn btn-ghost btn-sm" id="gs-restart-btn" title="Restart (R)">↺</button>
          </div>
        </div>

        <!-- Zone de rendu du jeu -->
        <div class="game-shell__viewport" id="${VIEWPORT_ID}"></div>

        <!-- Overlay (pause, game-over, loading) -->
        <div class="game-shell__overlay hidden" id="gs-overlay">
          <div class="game-shell__overlay-content" id="gs-overlay-content"></div>
        </div>

      </div>
    `;

    // Cacher le footer pendant le jeu
    const footer = document.querySelector('.footer');
    if (footer) footer.style.display = 'none';

    // Références
    _scoreEl = document.getElementById('gs-score');
    _bestEl  = document.getElementById('gs-best');

    // Boutons nav
    document.getElementById('nav-home-btn').addEventListener('click', _goHome);
    document.getElementById('nav-back-btn').addEventListener('click', _goHome);

    // Boutons jeu
    document.getElementById('gs-pause-btn').addEventListener('click', () => {
      EventBus.emit('game:pause-toggle');
    });
    document.getElementById('gs-restart-btn').addEventListener('click', () => {
      EventBus.emit('game:restart');
    });

    // Écouter les mises à jour de score depuis le jeu
    EventBus.on('game:score-update', _onScoreUpdate);
    EventBus.on('game:over',         _onGameOver);
    EventBus.on('game:paused',       _onPaused);
    EventBus.on('game:resumed',      _onResumed);

    return document.getElementById(VIEWPORT_ID);
  }

  /**
   * Nettoyer le shell (appelé par Loader avant de charger un nouveau jeu)
   */
  function clear() {
    EventBus.off('game:score-update', _onScoreUpdate);
    EventBus.off('game:over',         _onGameOver);
    EventBus.off('game:paused',       _onPaused);
    EventBus.off('game:resumed',      _onResumed);

    _currentGameId = null;
    _scoreEl       = null;
    _bestEl        = null;

    // Remettre le footer
    const footer = document.querySelector('.footer');
    if (footer) footer.style.display = '';
  }

  /**
   * Afficher un message d'erreur dans le shell
   * @param {string} message
   */
  function showError(message) {
    const app = document.getElementById('app');
    app.innerHTML += `
      <div style="text-align:center; padding: 4rem; color: var(--neon-pink);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">⚠</div>
        <div style="font-family: var(--font-display); font-size: 1.2rem;">${message}</div>
        <button class="btn btn-outline" style="margin-top: 2rem;" onclick="location.hash='#home'">
          ← Retour à l'accueil
        </button>
      </div>
    `;
  }

  /**
   * Afficher l'overlay pause
   * @private
   */
  function _onPaused() {
    _showOverlay(`
      <div class="overlay-icon">⏸</div>
      <div class="overlay-title">PAUSE</div>
      <button class="btn btn-primary" id="overlay-resume-btn">Reprendre</button>
    `);
    document.getElementById('overlay-resume-btn')
      ?.addEventListener('click', () => EventBus.emit('game:pause-toggle'));
  }

  /**
   * Cacher l'overlay quand on reprend
   * @private
   */
  function _onResumed() {
    _hideOverlay();
  }

  /**
   * Afficher l'écran Game Over
   * @private
   */
  function _onGameOver({ score, isRecord }) {
    _showOverlay(`
      <div class="overlay-icon">💀</div>
      <div class="overlay-title">GAME OVER</div>
      <div class="overlay-score">Score final : <strong>${score}</strong></div>
      ${isRecord ? '<div class="overlay-record">🏆 Nouveau record !</div>' : ''}
      <div class="overlay-actions">
        <button class="btn btn-primary" id="overlay-restart-btn">Rejouer</button>
        <button class="btn btn-ghost"   id="overlay-home-btn">Accueil</button>
      </div>
    `);
    document.getElementById('overlay-restart-btn')
      ?.addEventListener('click', () => {
        _hideOverlay();
        EventBus.emit('game:restart');
      });
    document.getElementById('overlay-home-btn')
      ?.addEventListener('click', _goHome);
  }

  /**
   * Mettre à jour l'affichage du score
   * @private
   */
  function _onScoreUpdate({ score }) {
    if (_scoreEl) _scoreEl.textContent = score;
    const best = ScoreService.getBest(_currentGameId);
    if (_bestEl) _bestEl.textContent = best;
  }

  /**
   * Afficher l'overlay avec un contenu HTML
   * @private
   */
  function _showOverlay(html) {
    const overlay = document.getElementById('gs-overlay');
    const content = document.getElementById('gs-overlay-content');
    if (!overlay || !content) return;
    content.innerHTML = html;
    overlay.classList.remove('hidden');
  }

  /**
   * Cacher l'overlay
   * @private
   */
  function _hideOverlay() {
    const overlay = document.getElementById('gs-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  /**
   * Retourner à l'accueil
   * @private
   */
  function _goHome() {
    EventBus.emit('game:exit');
    window.location.hash = '#home';
  }

  return { build, clear, showError };
})();

export default GameShell;