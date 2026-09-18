// Offline cache. Bump CACHE when any file below changes.
const CACHE = 'playhouse-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/app.css',
  './src/main.js',
  './src/store.js',
  './src/util.js',
  './src/art/avatar.js',
  './src/art/furniture.js',
  './src/art/palette.js',
  './src/art/rooms.js',
  './src/art/scene.js',
  './src/screens/home.js',
  './src/screens/avatar.js',
  './src/screens/house.js',
  './src/screens/play.js',
  './src/ui/components.js',
  './src/ui/sound.js',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit || caches.match('./index.html'));
      return hit || network;
    }),
  );
});
