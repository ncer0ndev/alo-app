const CACHE = 'alo-mobile-v1';
const shell = ['./offline.html', './manifest.webmanifest', './assets/pwa-192.png', './assets/pwa-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(shell))); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('alo-mobile-') && key !== CACHE).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const base = new URL('./', self.location.href);
  if (event.request.method !== 'GET' || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  // Never cache authenticated API responses, uploads or Socket.IO traffic.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL('./offline.html', base).href)));
  }
});
