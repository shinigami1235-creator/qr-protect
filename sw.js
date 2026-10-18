/* QR Protect service worker. Bump VERSION on every deploy. */
const VERSION = 'qr-protect-v1';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'analyze.js', 'vendor/jsQR.js', 'vendor/zxing/zxing-reader.js', 'vendor/zxing/zxing_reader.wasm', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== 'qr-protect-share'; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  const url = new URL(req.url);

  // Pictures and links shared to QR Protect from another app.
  if (req.method === 'POST' && url.pathname.endsWith('/share')) {
    event.respondWith((async function () {
      const cache = await caches.open('qr-protect-share');
      try {
        const form = await req.formData();
        const file = form.get('image');
        const text = [form.get('url'), form.get('text'), form.get('title')].filter(Boolean).join(' ').trim();
        if (file && typeof file !== 'string' && file.size) {
          await cache.put('shared-image', new Response(file, { headers: { 'Content-Type': file.type || 'image/png' } }));
        } else if (text) {
          await cache.put('shared-text', new Response(text));
        }
      } catch (e) { /* the page opens empty */ }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }

  if (req.method !== 'GET' || url.origin !== location.origin) return;

  event.respondWith(caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(function (hit) {
    return hit || fetch(req);
  }));
});
