// Service Worker for Trucker Expense Tracker PWA
// Version 2.1.3 - Fixed subscription handling

const CACHE_NAME = 'trucker-expense-tracker-v2.1.3';
const urlsToCache = [
  './manifest.json',
  './icon-72x72.png',
  './icon-96x96.png',
  './icon-144x144.png',
  './icon-192x192.png',
  './icon-512x512.png'
];

// Install event - cache static resources
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

// Fetch event - NEVER cache index.html with subscription tokens
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  
  // CRITICAL: Never cache HTML pages with token parameters
  if (event.request.mode === 'navigate' || 
      url.pathname.endsWith('.html') || 
      url.pathname === '/' ||
      url.searchParams.has('token')) {
    
    // Always fetch from network for HTML/navigation requests
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Only cache HTML if it doesn't contain subscription tokens
          if (networkResponse.ok && !url.searchParams.has('token')) {
            const cache = caches.open(CACHE_NAME);
            cache.then(c => c.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        })
        .catch(() => {
          // If network fails, try cache but only for non-token requests  
          if (!url.searchParams.has('token')) {
            return caches.match(event.request);
          }
          // For token requests, don't serve cached version
          throw new Error('Network required for subscription activation');
        })
    );
  } else {
    // For static assets, use cache first strategy
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
