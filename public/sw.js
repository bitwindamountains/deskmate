// App-shell service worker, hand-written (Serwist targets webpack; Next 16 builds with Turbopack).
// ponytail: only the shell and two pages work offline; move to Serwist or a fuller strategy if offline needs grow.
const CACHE = 'scholar-shell-v1';
const OFFLINE_PAGES = ['/today', '/study/review'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Hashed build assets (JS, CSS, self-hosted fonts) never change under the same URL: cache first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  if (req.mode === 'navigate' && OFFLINE_PAGES.includes(url.pathname)) {
    event.respondWith(fetch(req).then((res) => {
      // Only cache a real page: a redirect (e.g. to /login) must not become the offline copy.
      if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, copy)); }
      return res;
    }).catch(async () => (await caches.match(url.pathname)) || Response.error()));
  }
});
