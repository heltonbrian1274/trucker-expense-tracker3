// Service Worker for Trucker Expense Tracker PWA
// Version 2.1.5 - Fixed Response cloning issue

const CACHE_NAME = 'trucker-expense-tracker-v2.1.5';
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

// Listen for skip waiting message (iOS compatibility)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  
  // Existing message handling code continues below...
  const messageType = event.data?.type || event.data?.action;

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

// Continue with existing message handling logic...
  
  if (['CLEAR_ALL_CACHE', 'clearCache', 'CLEAR_INDEX_CACHE'].includes(messageType)) {
    const isFullClear = messageType === 'CLEAR_ALL_CACHE' || messageType === 'clearCache';
    
    event.waitUntil(
      (isFullClear ? 
        // Clear all caches
        caches.keys().then(cacheNames => 
          Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)))
        ) :
        // Clear only index cache
        caches.open(CACHE_NAME).then(cache => {
          const indexUrls = [
            './',
            './index.html',
            self.registration.scope,
            self.registration.scope + 'index.html'
          ];
          return Promise.all(indexUrls.map(url => cache.delete(url)));
        })
      ).then(() => {
        // Notify all clients
        return self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            const responseType = isFullClear ? 'ALL_CACHE_CLEARED' : 'INDEX_CACHE_CLEARED';
            client.postMessage({ type: responseType });
            client.postMessage({ type: 'FORCE_REFRESH_UI' });
            // Legacy support
            if (messageType === 'clearCache') {
              client.postMessage({ type: 'CACHE_CLEARED' });
            }
          });
        });
      })
    );
  }
});

// Fetch event - Handle subscription state changes
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // CRITICAL: Handle HTML/navigation requests specially
  if (event.request.mode === 'navigate' || 
      url.pathname.endsWith('.html') || 
      url.pathname === '/') {

    // For token requests, always fetch from network and don't cache
    if (url.searchParams.has('token')) {
      event.respondWith(
        fetch(event.request).then((networkResponse) => {
          // Don't cache token responses - return directly
          return networkResponse;
        }).catch(() => {
          throw new Error('Network required for subscription activation');
        })
      );
    } else {
      // For regular navigation, check localStorage for subscription changes
      event.respondWith(
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
            // FIXED: Clone the response before caching to avoid "Response body is already used" error
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            }).catch(err => {
              console.warn('Cache put failed:', err);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Fallback to cache for offline access
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If no cache available, return a basic offline page
            return new Response(
              '<!DOCTYPE html><html><head><title>Offline</title></head><body><h1>Offline</h1><p>Please check your internet connection.</p></body></html>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          });
        })
      );
    }
  } else {
    // For static assets, use cache first strategy
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
            // FIXED: Clone the response before caching
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