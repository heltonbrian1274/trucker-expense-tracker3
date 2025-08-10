
// Service Worker for Trucker Expense Tracker PWA
// Version 2.1.4 - REVERT TO WORKING VERSION (Simple and Clean)

const CACHE_NAME = 'trucker-expense-tracker-v2.1.4-restored';
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
});

// Fetch event - SIMPLE APPROACH THAT WORKED
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  
  // Handle HTML/navigation requests specially (NO iOS-specific complexity)
  if (event.request.mode === 'navigate' || 
      url.pathname.endsWith('.html') || 
      url.pathname === '/') {
    
    // For token requests, always fetch from network and don't cache
    if (url.searchParams.has('token')) {
      event.respondWith(
        fetch(event.request).then((networkResponse) => {
          // Don't cache token responses - simple and clean
          return networkResponse;
        }).catch(() => {
          throw new Error('Network required for subscription activation');
        })
      );
    } else {
      // For regular navigation, simple network-first approach
      event.respondWith(
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
            // Cache the response for offline access
            const cache = caches.open(CACHE_NAME);
            cache.then(c => c.put(event.request, networkResponse.clone()));
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
