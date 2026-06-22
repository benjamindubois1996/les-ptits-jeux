/**
 * sw.js — Service Worker RetroVault
 *
 * Stratégie :
 *  - config.json       → network-first  (pour voir les nouveaux jeux sans vider le cache)
 *  - tout le reste     → cache-first    (assets statiques, fichiers jeux)
 *
 * Pour invalider le cache après un déploiement majeur :
 * incrémenter CACHE_NAME (ex: retrovault-v2).
 */

const CACHE_NAME = 'retrovault-v4';

const SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icons/icon.svg',
  './css/design-system.css',
  './css/layout.css',
  './css/components.css',
  './js/core/EventBus.js',
  './js/core/Router.js',
  './js/core/Loader.js',
  './js/core/BaseGame.js',
  './js/core/Timer.js',
  './js/core/Lives.js',
  './js/core/Grid.js',
  './js/core/Vector2.js',
  './js/core/Physics2D.js',
  './js/core/Particles.js',
  './js/core/GameLoop.js',
  './js/utils/GridUtils.js',
  './js/utils/Random.js',
  './js/services/ConfigService.js',
  './js/services/ScoreService.js',
  './js/services/StorageService.js',
  './js/ui/GameShell.js',
  './js/ui/Toast.js',
  './js/ui/CanvasGrid.js',
  './js/ui/components/GameOverlay.js',
  './config.json',
];

/* ─── Install ─────────────────────────────────────────────── */

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache =>
        // allSettled : un échec individuel ne bloque pas l'install
        Promise.allSettled(SHELL.map(url => cache.add(url).catch(() => {})))
      )
      .then(() => self.skipWaiting())
  );
});

/* ─── Activate ────────────────────────────────────────────── */

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ─── Fetch ───────────────────────────────────────────────── */

self.addEventListener('fetch', e => {
  const { request } = e;

  // Ignorer les requêtes non-GET et les ressources cross-origin
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;

  // config.json → network-first pour toujours avoir la liste de jeux à jour
  if (request.url.includes('config.json')) {
    e.respondWith(networkFirst(request));
    return;
  }

  // Tout le reste → cache-first (la majorité du jeu)
  e.respondWith(cacheFirst(request));
});

/* ─── Stratégies ──────────────────────────────────────────── */

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Hors-ligne — ressource indisponible.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response('Hors-ligne — config indisponible.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}
