// Hält die App offline bereit. Erst Netz (neueste Version), ohne Netz aus dem Speicher.
const CACHE = 'organizer-v3';
const HUELLE = ['./', 'index.html', 'style.css', 'app.js', 'galaxie.js', 'config.js', 'manifest.webmanifest', 'icons/icon.svg', 'vendor/supabase.min.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(HUELLE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then((r) => { const k = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, k)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
