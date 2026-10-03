/* Film Awards service worker: works offline after the first visit.
 * - App files + data: network first (so a yearly data update shows up straight away), cache as fallback.
 * - TMDB posters: cache first, capped.
 * TMDB API calls are never intercepted. */
const VERSION = 'v1';
const SHELL = 'fa-shell-' + VERSION;
const IMGS = 'fa-img-' + VERSION;
const FILES = ['./', 'index.html', 'css/app.css', 'js/store.js', 'js/tmdb.js', 'js/app.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'data/oscars.json', 'data/goyas.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== IMGS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'image.tmdb.org') {
    e.respondWith(
      caches.open(IMGS).then((cache) =>
        cache.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') {
            cache.put(req, res.clone());
            cache.keys().then((keys) => { if (keys.length > 800) cache.delete(keys[0]); });
          }
          return res;
        }))
      )
    );
    return;
  }

  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
