/* Subscriber-only offline support. Never cache navigation HTML, API, accounts or sessions. */
const BASE = new URL(self.registration.scope).pathname;
const CACHE_PREFIX = `bhru-subscriber-${BASE}-`;
const CACHE = `${CACHE_PREFIX}static-v2`;
const OFFLINE = `${BASE}pwa/offline.html`;
const PUBLIC_PAGES = new Set(['/', '/dashboard', '/login', '/register', '/settings']);
function subscriberPage(url) {
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return false;
  const path = `/${url.pathname.slice(BASE.length)}`;
  return PUBLIC_PAGES.has(path) || path.startsWith('/m/');
}
function publicAsset(url) {
  if (url.origin !== self.location.origin || url.search) return false;
  const path = url.pathname;
  return (
    path.startsWith(`${BASE}assets/`) && /\.(?:js|css|woff2?|png|webp|jpe?g|svg|ico)$/.test(path)
  ) || (
    (path.startsWith(`${BASE}brand/`) || path.startsWith(`${BASE}pwa/`)) &&
    /\.(?:png|webp|svg|ico)$/.test(path)
  );
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([OFFLINE, `${BASE}pwa/icon-192.png`, `${BASE}pwa/icon-512.png`,
      `${BASE}pwa/icon-maskable-512.png`, `${BASE}pwa/apple-touch-icon.png`].map(url =>
        new Request(url, { credentials: 'omit', cache: 'reload' })));
    // No forced takeover during a user's active session. New windows get the updated worker.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Explicitly bypass API, external requests, Vite development modules, and every private route.
  if (url.origin !== self.location.origin || url.pathname.startsWith(`${BASE}api/`) ||
      url.pathname === `${BASE}api` || request.headers.has('Authorization')) return;
  if (request.mode === 'navigate') {
    if (!subscriberPage(url)) return;
    // Force a real network navigation: HTTP-cache HTML can otherwise load offline
    // without its uncached JS and leave a blank app instead of the offline notice.
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(OFFLINE)) || Response.error();
    }));
    return;
  }
  if (!publicAsset(url)) return;
  event.respondWith((async () => {
    // A worker's root scope can include private admin pages. Do not intercept their assets.
    if (!event.clientId) return fetch(request);
    const client = await self.clients.get(event.clientId);
    if (!client || !subscriberPage(new URL(client.url))) return fetch(request);
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic' && !/no-store|private/i.test(response.headers.get('Cache-Control') || '')) {
      try {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        // Bound old hashed build assets without discarding the offline page or install icons.
        const assets = keys.filter(key => new URL(key.url).pathname.startsWith(`${BASE}assets/`));
        if (assets.length > 80) await Promise.all(assets.slice(0, assets.length - 80).map(key => cache.delete(key)));
      } catch (error) {
        // Cache storage is optional; a full disk must not break an online static request.
        console.warn('BHRU static asset could not be saved for offline use:', error);
      }
    }
    return response;
  })());
});