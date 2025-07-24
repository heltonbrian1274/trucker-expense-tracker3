// Service Worker for Trucker Expense Tracker PWA
// Version 2.1.2 - Network First Strategy for HTML

const CACHE_NAME = 'trucker-expense-tracker-v2.1.2'; // IMPORTANT: New version number
const urlsToCache = [
  // We no longer cache index.html initially, as we always fetch it from the network first.
  // We will cache other static assets if you add them later (like CSS files, etc.)
];

// Install event - cache other resources if any
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  self.clients.claim();
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - The core of the new logic
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Strategy: Network First for HTML, Cache First for everything else.
  if (event.request.mode === 'navigate') {
    // This is a page navigation. Always try the network first.
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // If we get a good response, cache it for offline use and return it.
          if (networkResponse.ok) {
            const cache = caches.open(CACHE_NAME);
            cache.then(c => c.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        })
        .catch(() => {
          // If the network fails, try to serve the page from the cache.
          return caches.match(event.request);
        })
    );
  } else {
    // This is a request for a static asset (image, script, etc.).
    // Use a Cache First strategy for speed.
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
            const cache = caches.open(CACHE_NAME);
            cache.then(c => c.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        });
      })
    );
  }
});
