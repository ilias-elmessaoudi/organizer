// Hält die App offline bereit. Erst Netz (neueste Version), ohne Netz aus dem Speicher.
const CACHE = 'organizer-v11';
const HUELLE = ['./', 'index.html', 'style.css', 'app.js', 'galaxie.js', 'diktat.js', 'wochenplan.js', 'berichtsheft.js', 'mitteilungen.js', 'zeitparser.js', 'config.js', 'manifest.webmanifest', 'icons/icon.svg', 'vendor/supabase.min.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(HUELLE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim())); });
// Mitteilungen vom Server (Supabase-Funktion „erinnern")
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { titel: 'Organizer', text: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titel || 'Organizer', { body: d.text || '', tag: d.tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', renotify: true }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((l) => {
    const offen = l.find((c) => c.url.includes('/organizer/'));
    return offen ? offen.focus() : self.clients.openWindow('./');
  }));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then((r) => { const k = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, k)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
