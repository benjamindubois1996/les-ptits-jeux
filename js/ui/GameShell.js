/**
 * GameShell — Conteneur DOM universel pour tous les jeux
 *
 * Layout :
 *  - Header : titre | score/record | pause/restart | burger(mobile)
 *  - Body   : zone jeu (gauche, flex:1) | panneau latéral (droite, 260px)
 *
 * Le panneau latéral est toujours visible sur desktop.
 * Sur mobile il se comporte comme un drawer (burger pour ouvrir).
 *
 * Onglets du panneau : Paramètres | But du jeu | Contrôles | 💡 (si roadmap)
 * Les options de jeu (chips) sont injectées par game:sidebar-register.
 * Le bouton JOUER reste affiché sur le canvas via GameOverlay.
 */

import EventBus   from '../core/EventBus.js';
import GameOverlay from './components/GameOverlay.js';

const GameShell = (() => {

  const ROOT_ID     = 'game-shell';
  const VIEWPORT_ID = 'game-viewport';

  let _currentGameId     = null;
  let _scoreEl           = null;
  let _timerEl           = null;
  let _livesEl           = null;
  let _sidebarOnPlay     = null;
  let _sidebarSelections = {};

  /* ============================================================
     BUILD
     ============================================================ */

  function build(meta, config) {
    _currentGameId = meta.id;

    const app = document.getElementById('app');
    app.innerHTML = `
      <nav class="nav">
        <div class="nav-logo" id="nav-home-btn">RETRO<span>VAULT</span></div>
        <ul class="nav-links">
          <li><span class="nav-link" id="nav-back-btn">← Accueil</span></li>
        </ul>
      </nav>

      <div class="game-shell" id="${ROOT_ID}">

        <div class="game-shell__header">

          <!-- Bloc au-dessus de la zone jeu -->
          <div class="gs-header-game">
            <span class="game-shell__thumbnail">${meta.thumbnail}</span>
            <span class="game-shell__name">${meta.title}</span>
            <div class="game-shell__spacer"></div>
            <div class="game-shell__stats">
              <div class="gs-stat" title="Score">
                <span class="gs-stat-icon" aria-hidden="true">🏆</span>
                <span id="gs-score">0</span>
              </div>
              <div class="gs-stat" title="Chrono">
                <span class="gs-stat-icon" aria-hidden="true">⏱</span>
                <span id="gs-timer">00:00</span>
              </div>
              <div class="gs-stat" title="Vies">
                <span class="gs-stat-icon" aria-hidden="true">❤️</span>
                <span id="gs-lives">1</span>
              </div>
            </div>
            <div class="game-shell__spacer"></div>
            <button class="btn btn-ghost btn-sm" id="gs-pause-btn" title="Pause (P)">⏸</button>
            <button class="btn btn-ghost btn-sm" id="gs-restart-btn" title="Restart (R)">↺</button>
            <button class="gs-burger" id="gs-burger-btn" title="Paramètres">☰</button>
          </div>

          <!-- Bloc au-dessus de la sidebar (caché sur mobile) -->
          <div class="gs-header-sidebar">
            <button class="gs-htab gs-htab--active" data-tab="params" title="Paramètres">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <circle cx="8" cy="8" r="2.2"/>
                <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>
              </svg>
            </button>
            <button class="gs-htab" data-tab="but" title="But du jeu">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <circle cx="8" cy="8" r="6"/>
                <line x1="8" y1="7.5" x2="8" y2="11"/>
                <circle cx="8" cy="5.2" r="0.6" fill="currentColor" stroke="none"/>
              </svg>
            </button>
            <button class="gs-htab" data-tab="ctrl" title="Contrôles">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <rect x="1" y="4.5" width="14" height="7" rx="2.5"/>
                <line x1="4.5" y1="6.5" x2="4.5" y2="9.5"/>
                <line x1="3" y1="8" x2="6" y2="8"/>
                <circle cx="11" cy="7.5" r="0.7" fill="currentColor" stroke="none"/>
                <circle cx="12.5" cy="8.8" r="0.7" fill="currentColor" stroke="none"/>
              </svg>
            </button>
            ${meta.roadmap?.length ? `
            <button class="gs-htab" data-tab="road" title="Améliorations prévues">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 2a3.5 3.5 0 0 1 2 6.4V10H6V8.4A3.5 3.5 0 0 1 8 2z"/>
                <line x1="6.5" y1="12" x2="9.5" y2="12"/>
                <line x1="7" y1="14" x2="9" y2="14"/>
              </svg>
            </button>` : ''}
          </div>

        </div>

        <div class="game-shell__body">

          <!-- Zone jeu -->
          <div class="game-shell__game-area">
            <div class="game-shell__viewport" id="${VIEWPORT_ID}"></div>
            <div class="game-shell__overlay hidden" id="gs-overlay">
              <div class="game-shell__overlay-content" id="gs-overlay-content"></div>
            </div>
          </div>

          <!-- Panneau latéral -->
          <aside class="game-shell__sidebar" id="gs-sidebar">

            <div class="gs-sidebar-mobile-header">
              <span class="game-shell__name" style="font-size:var(--text-base)">Paramètres</span>
              <div class="gs-sidebar-mobile-tabs">
                <button class="gs-htab gs-htab--active" data-tab="params" title="Paramètres">⚙️</button>
                <button class="gs-htab" data-tab="but" title="But du jeu">ℹ️</button>
                <button class="gs-htab" data-tab="ctrl" title="Contrôles">🎮</button>
                ${meta.roadmap?.length ? '<button class="gs-htab" data-tab="road" title="Améliorations prévues">💡</button>' : ''}
              </div>
              <button class="btn btn-ghost btn-sm" id="gs-sidebar-close">✕</button>
            </div>

            <div class="gs-tab-pane" id="gs-tab-params">
              <p class="gs-hint">Lance une partie pour voir les options.</p>
            </div>

            <div class="gs-tab-pane gs-tab-pane--hidden" id="gs-tab-but">
              <p class="gs-objective">${meta.longDescription || meta.description || ''}</p>
            </div>

            <div class="gs-tab-pane gs-tab-pane--hidden" id="gs-tab-ctrl">
              ${_renderControlsHtml(meta.controls)}
            </div>

            ${meta.roadmap?.length ? `
            <div class="gs-tab-pane gs-tab-pane--hidden" id="gs-tab-road">
              <ul class="gs-roadmap-list">
                ${meta.roadmap.map(r => `<li>${r}</li>`).join('')}
              </ul>
            </div>
            ` : ''}

          </aside>
        </div>

        <!-- Backdrop mobile -->
        <div class="gs-sidebar-backdrop hidden" id="gs-sidebar-backdrop"></div>

      </div>
    `;

    document.getElementById('app')?.classList.add('app--in-game');

    const footer = document.querySelector('.footer');
    if (footer) footer.style.display = 'none';

    _scoreEl = document.getElementById('gs-score');
    _timerEl = document.getElementById('gs-timer');
    _livesEl = document.getElementById('gs-lives');

    // Navigation
    document.getElementById('nav-home-btn').addEventListener('click', _goHome);
    document.getElementById('nav-back-btn').addEventListener('click', _goHome);

    // Contrôles jeu
    document.getElementById('gs-pause-btn').addEventListener('click',   () => EventBus.emit('game:pause-toggle'));
    document.getElementById('gs-restart-btn').addEventListener('click', () => EventBus.emit('game:restart'));

    // Burger / drawer mobile
    document.getElementById('gs-burger-btn').addEventListener('click',      _openSidebar);
    document.getElementById('gs-sidebar-close')?.addEventListener('click',  _closeSidebar);
    document.getElementById('gs-sidebar-backdrop')?.addEventListener('click', _closeSidebar);

    // Tabs : icônes dans le header + dupliquées dans le drawer mobile
    document.addEventListener('click', e => {
      const tab = e.target.closest('.gs-htab');
      if (!tab) return;
      _switchTab(tab.dataset.tab);
    });

    // Events jeu
    EventBus.on('game:sidebar-register', _onSidebarRegister);
    EventBus.on('game:play-requested',   _onPlayRequested);
    EventBus.on('game:score-update',     _onScoreUpdate);
    EventBus.on('game:over',             _onGameOver);
    EventBus.on('game:paused',           _onPaused);
    EventBus.on('game:resumed',          _onResumed);
    EventBus.on('game:restart',          _onGameRestart);

    return document.getElementById(VIEWPORT_ID);
  }

  /* ============================================================
     CLEAR
     ============================================================ */

  function clear() {
    EventBus.off('game:sidebar-register', _onSidebarRegister);
    EventBus.off('game:play-requested',   _onPlayRequested);
    EventBus.off('game:score-update',     _onScoreUpdate);
    EventBus.off('game:over',             _onGameOver);
    EventBus.off('game:paused',           _onPaused);
    EventBus.off('game:resumed',          _onResumed);
    EventBus.off('game:restart',          _onGameRestart);

    _currentGameId     = null;
    _scoreEl           = null;
    _timerEl           = null;
    _livesEl           = null;
    _sidebarOnPlay     = null;
    _sidebarSelections = {};

    document.getElementById('app')?.classList.remove('app--in-game');

    const footer = document.querySelector('.footer');
    if (footer) footer.style.display = '';
  }

  /* ============================================================
     PANNEAU LATÉRAL
     ============================================================ */

  function _onSidebarRegister({ groups, onPlay }) {
    _sidebarOnPlay     = onPlay;
    _sidebarSelections = {};
    groups.forEach(g => { _sidebarSelections[g.key] = g.default; });

    const paramsPane = document.getElementById('gs-tab-params');
    if (!paramsPane) return;

    paramsPane.innerHTML = groups.map(group => `
      <div class="gs-opt-group">
        <div class="gs-opt-label">${group.label}</div>
        <div class="ov-chips" data-key="${group.key}">
          ${group.options.map(o => `
            <button class="ov-chip${o.value === group.default ? ' ov-chip--on' : ''}"
                    data-value="${o.value}">${o.label}</button>
          `).join('')}
        </div>
      </div>
    `).join('');

    paramsPane.querySelectorAll('.ov-chips').forEach(chipsEl => {
      chipsEl.addEventListener('click', e => {
        const btn = e.target.closest('.ov-chip');
        if (!btn) return;
        const raw       = btn.dataset.value;
        const isNumeric = raw !== '' && !isNaN(Number(raw));
        _sidebarSelections[chipsEl.dataset.key] = isNumeric ? Number(raw) : raw;
        chipsEl.querySelectorAll('.ov-chip').forEach(b => b.classList.remove('ov-chip--on'));
        btn.classList.add('ov-chip--on');
      });
    });

    // Revenir sur l'onglet Params si on était ailleurs
    _switchTab('params');
  }

  function _onPlayRequested() {
    if (_sidebarOnPlay) _sidebarOnPlay({ ..._sidebarSelections });
  }

  function _switchTab(name) {
    document.querySelectorAll('.gs-htab').forEach(t => {
      t.classList.toggle('gs-htab--active', t.dataset.tab === name);
    });
    document.querySelectorAll('.gs-tab-pane').forEach(p => {
      p.classList.toggle('gs-tab-pane--hidden', p.id !== `gs-tab-${name}`);
    });
  }

  function _openSidebar() {
    document.getElementById('gs-sidebar')?.classList.add('gs-sidebar--open');
    document.getElementById('gs-sidebar-backdrop')?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function _closeSidebar() {
    document.getElementById('gs-sidebar')?.classList.remove('gs-sidebar--open');
    document.getElementById('gs-sidebar-backdrop')?.classList.add('hidden');
    document.body.style.overflow = '';
  }

  /* ============================================================
     HELPERS
     ============================================================ */

  function _renderControlsHtml(controls) {
    if (!controls) return '<p class="gs-hint">Aucun contrôle défini.</p>';
    const keys = Array.isArray(controls.keyboard) ? controls.keyboard : [];
    if (!keys.length) return '<p class="gs-hint">Voir les indications en jeu.</p>';
    return `<ul class="gs-ctrl-list">${keys.map(k => `<li class="gs-ctrl-row"><span class="gs-ctrl-key">${k}</span></li>`).join('')}</ul>`;
  }

  /* ============================================================
     EVENTS JEU
     ============================================================ */

  function _onScoreUpdate({ score, timer, lives }) {
    if (_scoreEl && score !== undefined) _scoreEl.textContent = score;
    if (_timerEl && timer !== undefined) _timerEl.textContent = timer;
    if (_livesEl && lives !== undefined) _livesEl.textContent = lives;
  }

  function _onGameOver({ score, isRecord }) {
    const overlay = document.getElementById('gs-overlay');
    const content = document.getElementById('gs-overlay-content');
    if (!overlay || !content) return;
    GameOverlay.renderGameOver(content, { result: 'lose', score, isRecord },
      () => { _hideOverlay(); EventBus.emit('game:restart'); },
      _goHome
    );
    overlay.classList.remove('hidden');
  }

  function _onPaused() {
    const overlay = document.getElementById('gs-overlay');
    const content = document.getElementById('gs-overlay-content');
    if (!overlay || !content) return;
    GameOverlay.renderPause(content, () => EventBus.emit('game:pause-toggle'));
    overlay.classList.remove('hidden');
  }

  function _onResumed()     { _hideOverlay(); }
  function _onGameRestart() { _hideOverlay(); }

  function _hideOverlay() {
    document.getElementById('gs-overlay')?.classList.add('hidden');
  }

  function _goHome() {
    EventBus.emit('game:exit');
    window.location.hash = '#home';
  }

  /* ============================================================
     ERROR
     ============================================================ */

  function showError(message) {
    const app = document.getElementById('app');
    app.innerHTML += `
      <div style="text-align:center;padding:4rem;color:var(--neon-pink);">
        <div style="font-size:3rem;margin-bottom:1rem;">⚠</div>
        <div style="font-family:var(--font-display);font-size:1.2rem;">${message}</div>
        <button class="btn btn-outline" style="margin-top:2rem;" onclick="location.hash='#home'">
          ← Retour à l'accueil
        </button>
      </div>
    `;
  }

  return { build, clear, showError };
})();

export default GameShell;
