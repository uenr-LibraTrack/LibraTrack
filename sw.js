const CACHE_NAME = 'libratrack-v3-safe';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First Strategy for all requests
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) {
    return;
  }
  
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Clone and cache the successful network response
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, resClone);
        });
        return response;
      })
      .catch(() => {
        // Fallback to cache ONLY if network completely fails (offline)
        return caches.match(e.request, { ignoreSearch: true });
      })
  );
});
