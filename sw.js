// Service Worker for Trucker Expense Tracker PWA
// Version 2.1.5 - Fixed Response cloning issue

const CACHE_NAME = 'trucker-expense-tracker-v2.1.7';
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

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_INDEX_CACHE') {
    // Clear cached index page when subscription status changes
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        // Clear all potential index page variations
        const indexUrls = [
          './',
          './index.html',
          self.registration.scope,
          self.registration.scope + 'index.html'
        ];

        return Promise.all(
          indexUrls.map(url => cache.delete(url))
        ).then(() => {
          // Notify all clients to reload
          return self.clients.matchAll().then((clients) => {
            clients.forEach((client) => {
              client.postMessage({ type: 'INDEX_CACHE_CLEARED' });
            });
          });
        });
      })
    );
  }

  if (event.data && event.data.type === 'CLEAR_ALL_CACHE') {
    // Clear all caches
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'ALL_CACHE_CLEARED' });
          });
        });
      })
    );
  }
});

// Fetch event - Network first for HTML, cache first for assets
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // CRITICAL: Handle HTML/navigation requests with network-first strategy
  if (event.request.mode === 'navigate' || 
      url.pathname.endsWith('.html') || 
      url.pathname === '/' ||
      event.request.headers.get('accept')?.includes('text/html')) {

    // Always try network first for HTML content to get fresh updates
    event.respondWith(
      fetch(event.request, { 
        cache: 'no-store' // Force fresh fetch, bypass HTTP cache
      }).then((networkResponse) => {
        if (networkResponse.ok) {
          // Only cache successful responses, and clone before caching
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          }).catch(err => {
            console.warn('Cache put failed:', err);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Only fallback to cache if network fails completely
        console.log('Network failed, trying cache for:', event.request.url);
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If no cache available, return a basic offline page
          return new Response(
            '<!DOCTYPE html><html><head><title>Offline</title><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="font-family: sans-serif; text-align: center; padding: 50px;"><h1>Offline</h1><p>Please check your internet connection and try again.</p><button onclick="window.location.reload()">Retry</button></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        });
      })
    );
  } else {
    // For static assets (CSS, JS, images), use cache first strategy
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Return cached version if available
        if (cachedResponse) {
          return cachedResponse;
        }

        // Otherwise fetch from network and cache
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            }).catch(err => {
              console.warn('Cache put failed:', err);
            });
          }
          return networkResponse;
        });
      })
    );
  }
});