const CACHE = 'grimhollow-v1.0.3-347503';
const ASSETS = ["./","./index.html","./manifest.json","./icon.svg","./icon-192.png","./icon-512.png","./icon-maskable-192.png","./icon-maskable-512.png","./apple-touch-icon.png"];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => {
    if (cached) return cached;
    return fetch(event.request).then(response => {
      if (response && response.status === 200 && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : new Response('', {status: 504, statusText: 'offline'}));
  }));
});
