// Service Worker for Trucker Expense Tracker PWA
// Version 2.1.1 - Cache-First Strategy

const CACHE_VERSION = 'v2.1.1'; // IMPORTANT: Change this version number every time you deploy a new sw.js
const CACHE_NAME = `trucker-expense-tracker-${CACHE_VERSION}`;

// Your application shell - the files needed for the app to run offline.
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
  // Add any other critical assets here, like a logo or main CSS file if it's separate.
];

// 1. Install Event: Cache the application shell.
self.addEventListener('install', (event) => {
  console.log(`Service Worker: Installing version ${CACHE_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching application shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Force the new service worker to activate immediately.
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Caching failed', error);
      })
  );
});

// 2. Activate Event: Clean up old caches.
self.addEventListener('activate', (event) => {
  console.log(`Service Worker: Activating version ${CACHE_VERSION}`);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // If a cache's name is not our current one, delete it.
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all open clients (browser tabs) to ensure they use the new SW.
      return self.clients.claim();
    })
  );
});

// 3. Fetch Event: Serve from cache first, then fall back to network.
self.addEventListener('fetch', (event) => {
  // We only want to cache GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // If we have a cached response, return it immediately.
        if (cachedResponse) {
          return cachedResponse;
        }

        // If the request is not in the cache, fetch it from the network.
        return fetch(event.request)
          .then((networkResponse) => {
            // We don't cache everything, just basic responses.
            // For example, we don't want to cache opaque responses (from CDNs without CORS).
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need to clone it
            // so we have two streams.
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                // Cache the new response for future requests.
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          });
      })
  );
});
