// Сборка версии для GitHub Pages: docs/ = полная страница-PWA из index.html (исходник артефакта)
// + офлайн-кэш sw.js, манифест и иконки. Запуск: node tools/build.mjs
// Версия = дата + хэш исходника, поднимается сама при любой правке index.html.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs');
mkdirSync(out, { recursive: true });

const src = readFileSync(join(root, 'index.html'), 'utf8');
const hash = createHash('sha1').update(src).digest('hex').slice(0, 6);
const d = new Date();
const VERSION = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}-${hash}`;

// исходник: <title>, <meta>, <link>, <style> … </style>, дальше тело страницы
const cut = src.indexOf('</style>') + '</style>'.length;
const headPart = src.slice(0, cut), bodyPart = src.slice(cut);

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#EDF1EB" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101512" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Рацион">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
<script>window.APP_VERSION = ${JSON.stringify(VERSION)};</script>
${headPart}
</head>
<body>
${bodyPart.trim()}
<script>
// офлайн-кэш; если версия уже работала и пришла новая — перезагрузиться в неё
if ('serviceWorker' in navigator) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) location.reload(); });
}
</script>
</body>
</html>
`;
writeFileSync(join(out, 'index.html'), html);

writeFileSync(join(out, 'sw.js'), `// «Рацион дня» — офлайн-кэш. Версия ставится сборкой (tools/build.mjs).
const VERSION = 'racion-${VERSION}';
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
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const own = new URL(req.url).origin === self.location.origin;
    const net = (own ? fetch(req.url, { cache: 'no-cache' }) : fetch(req)).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    return res || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error());
  }));
});
`);

writeFileSync(join(out, 'manifest.webmanifest'), JSON.stringify({
  name: 'Рацион дня',
  short_name: 'Рацион',
  description: 'План продуктов на день: приёмы пищи, замены, калории и БЖУ.',
  lang: 'ru',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#EDF1EB',
  theme_color: '#2E7A4B',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));

/* ---------- иконка: тарелка с кольцом Б/Ж/У на зелёном ---------- */
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#2E7A4B'), PLATE = hex('#F4F7F2'), CENTER = hex('#D6EADB');
const ARCS = [hex('#3461C9'), hex('#E0A21B'), hex('#C4532F')];
function colorAt(u, v) {
  const x = u - 0.5, y = v - 0.5, r = Math.hypot(x, y);
  if (r > 0.38) return BG;
  if (r > 0.31 || r < 0.2) return r < 0.2 ? CENTER : PLATE;
  let a = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360; // 0° — сверху, по часовой
  const seg = Math.floor(a / 120), inSeg = a - seg * 120;
  if (inSeg < 5 || inSeg > 115) return PLATE; // зазоры между дугами
  return ARCS[seg];
}
function png(size) {
  const SS = 4, raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = colorAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = y * (size * 3 + 1) + 1 + x * 3, n = SS * SS;
      raw[o] = Math.round(r / n); raw[o + 1] = Math.round(g / n); raw[o + 2] = Math.round(b / n);
    }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xFFFFFFFF; for (const byte of buf) c = crcT[(c ^ byte) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync(join(out, 'icon-192.png'), png(192));
writeFileSync(join(out, 'icon-512.png'), png(512));
writeFileSync(join(out, 'apple-touch-icon.png'), png(180));

console.log('docs/ собран, версия', VERSION);
