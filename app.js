/**
 * app.js — Point d'entrée RetroVault
 * Emplacement : /retro-games/app.js (racine)
 *
 * Initialise tous les modules et enregistre les routes.
 * C'est le seul fichier importé par index.html.
 */

import EventBus     from './js/core/EventBus.js';
import Router       from './js/core/Router.js';
import Loader       from './js/core/Loader.js';
import ConfigService from './js/services/ConfigService.js';
import ScoreService  from './js/services/ScoreService.js';
import Toast        from './js/ui/Toast.js';

/* ============================================================
   ERROR BOUNDARY — crashes mid-game
   ============================================================ */

let _errorHandled = false;

function _setupErrorBoundary() {
  const handleCrash = (message) => {
    if (_errorHandled) return;
    _errorHandled = true;
    setTimeout(() => { _errorHandled = false; }, 3000);

    console.error('[ErrorBoundary]', message);

    try { Loader.unload(); } catch {}

    const app = document.getElementById('app');
    if (!app) return;
    app.classList.remove('app--in-game');
    app.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  min-height:100vh;gap:1.5rem;font-family:'Orbitron',monospace;
                  text-align:center;padding:2rem;box-sizing:border-box;">
        <div style="font-size:3rem;">⚠️</div>
        <div style="color:#ff2d78;font-size:1.1rem;font-weight:900;letter-spacing:0.12em;">
          ERREUR INATTENDUE
        </div>
        <div style="color:#8899aa;font-size:0.72rem;max-width:380px;line-height:1.7;">
          ${message}
        </div>
        <button onclick="location.reload()"
                style="font-family:'Orbitron',monospace;font-size:0.72rem;font-weight:900;
                       letter-spacing:0.15em;padding:10px 28px;border-radius:6px;
                       border:2px solid #ff2d78;background:transparent;color:#ff2d78;cursor:pointer;">
          RECHARGER
        </button>
      </div>
    `;
  };

  window.addEventListener('error', (e) => {
    handleCrash(e.message || 'erreur JavaScript inconnue');
  });

  window.addEventListener('unhandledrejection', (e) => {
    e.preventDefault();
    handleCrash(e.reason?.message || String(e.reason) || 'promesse rejetée');
  });
}

/* ============================================================
   SERVICE WORKER
   ============================================================ */

function _registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js')
    .then(reg => console.log('[SW] Enregistré, portée :', reg.scope))
    .catch(err => console.warn('[SW] Échec enregistrement :', err));
}

/* ============================================================
   INITIALISATION
   ============================================================ */

async function init() {
  // 0. Error boundary + Service Worker (avant tout)
  _setupErrorBoundary();
  _registerServiceWorker();

  // 1. Toast en premier (capte les erreurs des autres modules)
  Toast.init();

  // 2. Charger la config globale
  let globalConfig;
  try {
    globalConfig = await ConfigService.getGlobal();
  } catch {
    Toast.error('Impossible de charger la configuration.');
    return;
  }

  // 3. Enregistrer les routes
  Router.register('home', () => renderHome(globalConfig));
  Router.register('game', ({ id }) => {
    if (!id) { Router.navigate('home'); return; }
    Loader.load(id);
  });

  // 4. Écouter les événements globaux
  _bindGlobalEvents();

  // 5. Démarrer le router (résout la route initiale)
  Router.init();
}

/* ============================================================
   RENDU — PAGE D'ACCUEIL
   ============================================================ */

async function renderHome(globalConfig) {
  // Cleanup éventuel d'un jeu en cours
  await Loader.unload();

  const games      = globalConfig.games      || [];
  const categories = globalConfig.categories || [];
  const platform   = globalConfig.platform   || {};

  const app = document.getElementById('app');
  app.innerHTML = `
    <nav class="nav">
      <div class="nav-logo">RETRO<span>VAULT</span></div>
      <ul class="nav-links">
        <li><span class="nav-link active">Jeux</span></li>
        <li><span class="nav-badge">${games.length} jeu${games.length > 1 ? 'x' : ''}</span></li>
      </ul>
    </nav>

    <main class="main">
      <!-- Hero -->
      <section class="hero">
        <p class="hero-eyebrow">// Classiques remis au goût du jour</p>
        <h1 class="hero-title">RETRO<span class="accent">VAULT</span></h1>
        <p class="hero-subtitle">${platform.description || 'Anciens jeux, nouvelle vie.'}</p>
        <div class="hero-stats">
          <div class="hero-stat">
            <div class="hero-stat-value">${games.length}</div>
            <div class="hero-stat-label">Jeux</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-value">${games.filter(g => g.available).length}</div>
            <div class="hero-stat-label">Disponibles</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-value">${categories.length}</div>
            <div class="hero-stat-label">Catégories</div>
          </div>
        </div>
      </section>

      <!-- Filtres -->
      <div class="filters" id="filters">
        <button class="filter-btn active" data-filter="all">Tous</button>
        ${categories.map(cat => `
          <button class="filter-btn" data-filter="${cat.id}">
            ${cat.icon} ${cat.label}
          </button>
        `).join('')}
      </div>

      <!-- Grille des jeux -->
      <p class="games-section-title">Catalogue</p>
      <div class="games-grid" id="games-grid">
        ${games.map((game, i) => _renderCard(game, i)).join('')}
      </div>
    </main>

    <footer class="footer">
      RETROVAULT <span>v${platform.version || '0.1.0'}</span>
      &nbsp;·&nbsp; Anciens jeux, nouvelle vie.
    </footer>
  `;

  // Animer les cards avec délai progressif
  document.querySelectorAll('.game-card').forEach((card, i) => {
    card.style.animationDelay = `${0.05 * i + 0.5}s`;
  });

  // Bind filtres
  _bindFilters(games);

  // Bind cards
  _bindCards(games);

  // Précache silencieux de tous les jeux disponibles en arrière-plan
  _prefetchGames(games);
}

/* ============================================================
   PRÉCACHE — téléchargement silencieux de tous les jeux
   Le SW intercepte chaque fetch et met les fichiers en cache.
   L'utilisateur ne voit rien, ça se passe en fond.
   ============================================================ */

async function _prefetchGames(games) {
  if (!('serviceWorker' in navigator)) return;

  const available = games.filter(g => g.available);

  // Attendre que le SW soit prêt avant de commencer
  await navigator.serviceWorker.ready;

  // Traiter par lots de 3 jeux pour ne pas saturer Live Server
  const BATCH = 3;
  for (let i = 0; i < available.length; i += BATCH) {
    const batch = available.slice(i, i + BATCH);
    await Promise.all(batch.map(game => {
      const pascal = game.id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
      const base   = `./games/${game.id}/`;
      return Promise.all([
        fetch(`${base}${pascal}.js`).catch(() => {}),
        fetch(`${base}${pascal}Renderer.js`).catch(() => {}),
        fetch(`${base}${game.id}.config.json`).catch(() => {}),
      ]);
    }));
    // Petite pause entre chaque lot
    await new Promise(r => setTimeout(r, 200));
  }
}

/* ============================================================
   RENDU — CARD DE JEU
   ============================================================ */

function _renderCard(game, index) {
  const unavailable = !game.available;
  const best        = ScoreService.getBest(game.id);

  const badge = game.comingSoon
    ? `<span class="badge badge-coming-soon card-badge">Bientôt</span>`
    : best > 0
    ? `<span class="badge badge-new card-badge">✓ Joué</span>`
    : '';

  const features = (game.features || []).slice(0, 3).map(f =>
    `<span class="feature-tag">${f}</span>`
  ).join('');

  const controls = game.controls?.keyboard
    ? game.controls.keyboard.slice(0, 2).map(k =>
        `<span class="control-chip">${k}</span>`
      ).join('')
    : '';

  return `
    <div
      class="game-card ${unavailable ? 'unavailable' : ''}"
      data-game-id="${game.id}"
      data-category="${game.category}"
      style="animation-delay: ${0.05 * index + 0.5}s"
    >
      ${badge}
      <span class="card-thumbnail">${game.thumbnail}</span>
      <div class="card-category">${game.category}</div>
      <h2 class="card-title">${game.title}</h2>
      <p class="card-description">${game.description}</p>
      ${features ? `<div class="card-features">${features}</div>` : ''}
      <div class="card-footer">
        <div class="card-controls">${controls}</div>
        ${best > 0
          ? `<div class="card-score">Record : <span>${best}</span></div>`
          : `<div class="card-score">${unavailable ? 'Bientôt disponible' : 'Pas encore joué'}</div>`
        }
      </div>
    </div>
  `;
}

/* ============================================================
   BIND — FILTRES
   ============================================================ */

function _bindFilters(games) {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const grid       = document.getElementById('games-grid');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter;
      const filtered = filter === 'all'
        ? games
        : games.filter(g => g.category === filter);

      grid.innerHTML = filtered.map((g, i) => _renderCard(g, i)).join('');
      grid.querySelectorAll('.game-card').forEach((card, i) => {
        card.style.animationDelay = `${0.05 * i}s`;
      });

      _bindCards(filtered);
    });
  });
}

/* ============================================================
   BIND — CARDS (clic pour lancer un jeu)
   ============================================================ */

function _bindCards(games) {
  document.querySelectorAll('.game-card:not(.unavailable)').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.gameId;
      Router.navigate('game', { id });
    });
  });

  // Clic sur carte indisponible → toast
  document.querySelectorAll('.game-card.unavailable').forEach(card => {
    card.addEventListener('click', () => {
      const id    = card.dataset.gameId;
      const game  = games.find(g => g.id === id);
      Toast.info(`${game?.title || id} arrive bientôt !`, 2500);
    });
  });
}

/* ============================================================
   ÉVÉNEMENTS GLOBAUX
   ============================================================ */

function _bindGlobalEvents() {
  // Jeu indisponible tenté via Loader
  EventBus.on('loader:unavailable', ({ gameMeta }) => {
    Toast.warning(`${gameMeta.title} n'est pas encore disponible.`);
    Router.navigate('home');
  });

  // Erreur de chargement
  EventBus.on('loader:error', ({ gameId, error }) => {
    Toast.error(`Erreur lors du chargement de ${gameId} : ${error}`);
  });

  // Record battu
  EventBus.on('score:record', ({ gameId, score }) => {
    Toast.success(`🏆 Nouveau record sur ${gameId} : ${score} pts !`, 4000);
  });

  // Retour accueil depuis un jeu
  EventBus.on('game:exit', async () => {
    const config = await ConfigService.getGlobal();
    renderHome(config);
  });
}

/* ============================================================
   DÉMARRAGE
   ============================================================ */

document.addEventListener('DOMContentLoaded', init);