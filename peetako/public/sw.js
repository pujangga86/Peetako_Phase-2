// Peetako service worker — makes the site installable and lets the page shell open offline.
// Strategy: network first, cache as fallback. Online players always get the latest deploy;
// the cache is only used when the network fails.
// The game API (/api/*) is never touched: pet state must always come live from the server.
const CACHE = 'peetako-p2-v13';
const SHELL = [
  '/',
  '/assets/style.css',
  '/assets/app.js',
  '/assets/art.js',
  '/assets/palettes.js',
  '/assets/sound.js',
  '/assets/mood.js',
  '/assets/sky.js',
  '/assets/antics.js',
  '/assets/social.js',
  '/assets/kelip.js',
  '/assets/arena.js',
  '/assets/flags.js',
  '/assets/qr.js',
  '/assets/vendor/qrcode.js',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/cdn-cgi/') || url.pathname.startsWith('/admin')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('/') : Response.error())),
  );
});

// ---------- care alerts ----------
// The server sends { title, body, tag, url }, encrypted end to end. Every push must show a
// notification (Safari and Chrome require it), so fall back to a generic one if the data is unreadable.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { /* not JSON */ }
  event.waitUntil(self.registration.showNotification(d.title || 'Peetako', {
    body: d.body || 'Your Peetako needs you.',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: d.tag || 'peetako-care',
    renotify: true,
    data: { url: d.url || '/' },
  }));
});

// Tapping an alert opens the game, reusing an open Peetako window if there is one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      if (open.url !== url && 'navigate' in open) await open.navigate(url).catch(() => {});
      return;
    }
    await self.clients.openWindow(url);
  })());
});
