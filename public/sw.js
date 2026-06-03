
// Eventos de ciclo de vida
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handler de push
self.addEventListener('push', function(event) {
  if (event.data) {
    let data = {};
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Nueva notificación', body: event.data.text() };
    }

    const options = {
      body: data.body,
      icon: data.icon || '/icon-192x192.png',
      badge: data.badge || '/badge-72x72.png',
      data: {
        url: data.url || '/'
      },
      vibrate: [100, 50, 100],
      requireInteraction: true,
      renotify: true,
      tag: 'streampay-notification-' + (data.tag || Date.now()),
      actions: [
        { action: 'open', title: 'Ver ahora' },
        { action: 'close', title: 'Cerrar' }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'StreamPay', options)
    );
  }
});

// Handler de click en notificación
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'close') return;

  const urlToOpen = event.notification.data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Estrategia de caché mejorada
const CACHE_NAME = 'streampay-cache-v1.0.4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/index.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Variable de descargas de vídeo activas para evitar colisiones
const activeVideoFetches = new Set();

function returnRangeResponse(request, cachedResponse) {
  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) {
    return cachedResponse;
  }
  return cachedResponse.arrayBuffer().then((arrayBuffer) => {
    const bytes = /^bytes\=(\d+)\-(\d+)?$/g.exec(rangeHeader);
    if (bytes) {
      const start = parseInt(bytes[1], 10);
      const end = bytes[2] ? parseInt(bytes[2], 10) : arrayBuffer.byteLength - 1;
      const chunk = arrayBuffer.slice(start, end + 1);
      return new Response(chunk, {
        status: 206,
        statusText: 'Partial Content',
        headers: new Headers({
          'Content-Range': `bytes ${start}-${end}/${arrayBuffer.byteLength}`,
          'Content-Length': chunk.byteLength,
          'Content-Type': cachedResponse.headers.get('content-type') || 'video/mp4',
          'Accept-Ranges': 'bytes'
        })
      });
    }
    return new Response(arrayBuffer, {
      status: 200,
      headers: cachedResponse.headers
    });
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorar requests que no sean GET o sean extensiones
  if (event.request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }

  // Identificar uploads de imágenes/miniaturas/etc
  const isUploadFile = url.pathname.includes('/uploads/');
  
  // Identificar si es un video/audio de stream
  const isVideoStream = url.searchParams.get('action') === 'stream' || 
                        url.pathname.match(/\.(mp4|mp3|ogg|webm|wav|aac)(\?.*)?$/i);

  // Si es una llamada general a la API de datos dinámicos, no la cachamos
  if (url.pathname.startsWith('/api/') && !isUploadFile && !isVideoStream) {
    return;
  }

  // Estrategia Network First para navegación (asegura index.html actualizado)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request) || caches.match('/index.html'))
    );
    return;
  }

  // Si es un video/audio de stream, manejar Range-Requests para la cache
  if (isVideoStream) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return returnRangeResponse(event.request, cachedResponse);
        }

        // Si no está en caché: descargarlo en segundo plano de manera completa
        const cleanUrl = event.request.url;
        if (!activeVideoFetches.has(cleanUrl)) {
          activeVideoFetches.add(cleanUrl);
          const cleanRequest = new Request(cleanUrl, {
            method: 'GET',
            headers: new Headers(event.request.headers)
          });
          cleanRequest.headers.delete('range');

          fetch(cleanRequest).then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 206)) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(cleanRequest, copy));
            }
          }).catch((err) => {
            console.warn('Silent background cache payload failure for media:', err);
          }).finally(() => {
            activeVideoFetches.delete(cleanUrl);
          });
        }

        // Continuar transmisión normal mediante red para reproducir enseguida
        return fetch(event.request);
      })
    );
    return;
  }

  // Estrategia Stale-While-Revalidate para el resto (imágenes, miniaturas, estáticos)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return networkResponse;
      });
      return cachedResponse || fetchPromise;
    })
  );
});
