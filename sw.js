// Service Worker for Trucker Expense Tracker PWA
// Version 2.1.4

const CACHE_NAME = 'trucker-expense-tracker-v2.1.4';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon-72x72.png',
  './icon-96x96.png',
  './icon-144x144.png',
  './icon-192x192.png',
  './icon-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js'
];

// Install: Caches the app shell and static assets.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activate: Cleans up old, unused caches to save space.
self.addEventListener('activate', (event) => {
  self.clients.claim();
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch: Intercepts network requests to serve cached content when offline.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Use network-first for HTML/navigation to get the latest app version.
  // CRITICAL: Never serve a cached page if a subscription token is present.
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // If the fetch is successful, cache the response unless a token is present.
          if (networkResponse.ok && !url.searchParams.has('subscription_success')) {
            const cache = caches.open(CACHE_NAME);
            cache.then(c => c.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        })
        .catch(() => {
          // If the network fails, serve the cached version (if available).
          return caches.match(event.request);
        })
    );
  } else {
    // For all other requests (CSS, JS, images), use a cache-first strategy.
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request);
      })
    );
  }
});
