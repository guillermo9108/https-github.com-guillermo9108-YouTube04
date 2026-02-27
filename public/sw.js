const CACHE_NAME = 'streampay-static-v6';
const IMAGE_CACHE = 'streampay-images-v1';
const DATA_CACHE = 'streampay-data-v1';

const URLS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://ui-avatars.com/api/?name=S+P&background=4f46e5&color=fff&size=192&length=2'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (![CACHE_NAME, IMAGE_CACHE, DATA_CACHE].includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. IGNORAR STREAMS DE VIDEO (No se pueden cachear de forma simple por ser parciales)
  if (url.searchParams.get('action') === 'stream' || event.request.headers.get('Range')) {
    return;
  }

  // 2. ESTRATEGIA PARA IMÁGENES (Cache First, then Network)
  if (url.pathname.includes('/thumbnails/') || url.pathname.includes('/avatars/') || url.pathname.includes('/market/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(event.request).then((response) => {
          return response || fetch(event.request).then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 3. ESTRATEGIA PARA API (Network First, falling back to Cache)
  if (url.pathname.includes('api/index.php')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && event.request.method === 'GET') {
            const copy = response.clone();
            caches.open(DATA_CACHE).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // 4. ESTRATEGIA POR DEFECTO (Static Assets)
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});