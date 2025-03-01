// Service Worker para o app de Lembretes por Voz

const CACHE_NAME = 'voice-reminder-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'styles.css',
  'script.js',
  'manifest.json',
  'favicon.ico'
];

// Install event - cache key files
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Caching app shell assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - serve from cache if available, otherwise fetch from network
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      // Cache hit - return response
      if (response) {
        console.log('Serving from cache:', event.request.url);
        return response;
      }

      // Not in cache - fetch and cache
      return fetch(event.request).then(function(response) {
        // Check if we received a valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response - one to cache, one to return
        var responseToCache = response.clone();

        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseToCache);
        });

        return response;
      });
    })
  );
});

// Push event handler
self.addEventListener('push', function(event) {
  const notificationData = event.data ? JSON.parse(event.data.text()) : {};
  const notificationOptions = {
    body: notificationData.body || 'Você tem um lembrete!',
    icon: notificationData.icon || 'favicon.ico',
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification('Lembrete', notificationOptions)
  );
});

// Notification click handler
self.addEventListener('notificationclick', function(event) {
  console.log('On notification click: ', event.notification.tag);

  event.notification.close();

  // Focus or reopen the window
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(function(clientList) {
      if (clientList.length > 0) {
        // If already open, focus
        return clientList[0].focus();
      }
      // If not open, reopen the app
      return clients.openWindow('/');
    })
  );
});