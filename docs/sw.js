// «Рацион дня» — офлайн-кэш. Версия ставится сборкой (tools/build.mjs).
const VERSION = 'racion-25.11-7423b5';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // кэшируем только своё, библиотеку чтения PDF и шрифты; отчёты FatSecret всегда свежие, мимо кэша
  const host = new URL(req.url).host;
  if (host !== self.location.host && !/cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(host)) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const own = new URL(req.url).origin === self.location.origin;
    const net = (own ? fetch(req.url, { cache: 'no-cache' }) : fetch(req)).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    return res || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error());
  }));
});
