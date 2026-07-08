const CACHE_NAME = 'libratrack-v9';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './admin.html',
  './checkin.html',
  './notifications.html',
  './login.html',
  './style.css?v=2',
  './app.js?v=2',
  './admin.js',
  './notifications.js?v=2',
  './supabaseClient.js?v=2',
  './manifest.json',
  './uenr.png',
  './backdrop.jpg',
  './JOEY-SHOT-IT-10-1024x683.jpg',
  './images.jfif',
  './images (1).jfif',
  './images (2).jfif',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).catch(err => console.warn('Pre-caching failed:', err))
  );
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
  if (e.request.method !== 'GET') {
    return;
  }
  // Ignore extensions and non-http/https requests
  if (!e.request.url.startsWith('http')) return;
  
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

// Push Notifications Listener
self.addEventListener('push', function(e) {
  let payload = { title: 'New Update', message: 'You have a new library notification!' };
  
  if (e.data) {
    try {
      payload = JSON.parse(e.data.text());
    } catch (err) {
      payload.message = e.data.text();
    }
  }

  const options = {
    body: payload.message || payload.body,
    icon: './uenr.png',
    badge: './uenr.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '2'
    }
  };

  e.waitUntil(
    self.registration.showNotification(payload.title || 'Library System', options)
  );
});

// Notification Click Listener
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        if (client.url.includes('notifications.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow('./notifications.html');
      }
    })
  );
});
