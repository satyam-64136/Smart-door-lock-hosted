/* Service worker: offline app shell. Never touches MQTT (WebSocket traffic bypasses fetch). */
const VER = 'door-v2';
const SHELL = ['./', 'index.html', 'unlock.html', 'manifest.webmanifest', 'mqtt.min.js',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-48.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);

  // Pages: network first so updates arrive, cache when offline or slow
  if (r.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(VER);
      try {
        const res = await Promise.race([fetch(new Request(r.url, { cache: 'no-cache', credentials: 'same-origin' })), new Promise((_, rej) => setTimeout(rej, 4000))]);
        if (res && res.ok) c.put(u.pathname.endsWith('/') ? './' : r, res.clone());
        return res;
      } catch (_) {
        return (await c.match(r, { ignoreSearch: true })) || (await c.match('index.html')) || Response.error();
      }
    })());
    return;
  }

  // Same-origin assets and the CDN fallback copy of the MQTT library: cache first
  if (u.origin === location.origin || u.hostname === 'cdn.jsdelivr.net' || u.hostname === 'unpkg.com') {
    e.respondWith((async () => {
      const c = await caches.open(VER);
      const hit = await c.match(r, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(r);
      if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone());
      return res;
    })());
  }
});
