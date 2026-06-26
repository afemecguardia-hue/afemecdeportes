const CACHE = 'afemec-v1';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => {
      return cache.addAll([
        '.',
        './index.html',
        './style.css',
        './app.js',
        './logo2.png',
        'https://unpkg.com/lucide@latest',
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
        'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
        'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800;900&display=swap'
      ]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  var req = e.request;
  if (req.method !== 'GET') return;

  // Network-first for HTML (navegación) para recibir siempre la última versión
  if (req.mode === 'navigate' || req.headers.get('Accept').includes('text/html')) {
    e.respondWith(
      fetch(req).then(function(fetchRes) {
        var copy = fetchRes.clone();
        caches.open(CACHE).then(function(cache) { cache.put(req, copy); });
        return fetchRes;
      }).catch(function() {
        return caches.match(req).then(function(cacheRes) { return cacheRes || caches.match('./index.html'); });
      })
    );
    return;
  }

  // Cache-first para el resto (CSS, JS, imágenes, CDN)
  e.respondWith(
    caches.match(req).then(function(res) {
      return res || fetch(req).then(function(fetchRes) {
        var url = req.url;
        if ((url.startsWith(self.location.origin) && url.indexOf('supabase') === -1) || url.indexOf('cdn.') !== -1) {
          var copy = fetchRes.clone();
          caches.open(CACHE).then(function(cache) { cache.put(req, copy); });
        }
        return fetchRes;
      });
    }).catch(function() {
      return new Response('', { status: 503 });
    })
  );
});
