// Service Worker for Trucker Expense Tracker PWA
// Version 2.1.5 - Implemented Stale-While-Revalidate for robust caching

// Use a new cache name to ensure the service worker updates properly on install
const CACHE_NAME = 'trucker-expense-tracker-v2.1.5';
const urlsToCache = [
  '/',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-72x72.png',
  './icon-96x96.png',
  './icon-144x144.png',
  './icon-192x192.png',
  './icon-512x512.png'
];

// Install event - cache the core shell of the application
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching all: app shell and content');
      return cache.addAll(urlsToCache);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // If the cache name is different from our current one, delete it
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Tell the active service worker to take control of the page immediately
  return self.clients.claim();
});

// Fetch event - This is where the caching strategy is defined
self.addEventListener('fetch', (event) => {
  // Use a "Stale-While-Revalidate" strategy for most requests.
  // This provides a fast response from the cache while updating it in the background.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        // Fetch from the network in the background
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // If we get a valid response, update the cache
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });

        // Return the cached response immediately if it exists, otherwise wait for the network
        return cachedResponse || fetchPromise;
      });
    })
  );
});

// Listen for messages from the main app to trigger a skipWaiting
// This helps new service workers activate faster
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
