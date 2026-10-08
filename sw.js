// Retro Frisbee service worker: cache-first so the game works offline.
// Bump CACHE_VERSION whenever you change game files to force a refresh.
const CACHE_VERSION = 'retro-frisbee-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/config.js',
  './js/data.js',
  './js/schedule.js',
  './js/input.js',
  './js/game.js',
  './js/manager.js',
  './js/renderer.js',
  './js/manager_renderer.js',
  './js/main.js',
  './img/disc.png',
  './img/playing_field.png',
  './img/running1.png',
  './img/running2.png',
  './img/standing.png',
  './img/thrower.png',
  './img/throwing.png',
  './img/opp_running1.png',
  './img/opp_running2.png',
  './img/opp_standing.png',
  './img/running1_inv.png',
  './img/running2_inv.png',
  './img/opp_running1_inv.png',
  './img/opp_running2_inv.png',
  './img/marker.png',
  './img/icons/icon-192.png',
  './img/icons/icon-512.png',
  './img/icons/icon-maskable-192.png',
  './img/icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Cache successful same-origin responses for next time
        if (response.ok && new URL(request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});