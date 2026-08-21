// Bump CACHE_NAME whenever ASSETS changes so clients refetch.
const CACHE_NAME = 'evtracs-static-v1';
const ASSETS = [
  './',
  './index.html',
  './static/css/bootstrap.css',
  './static/icons/font/bootstrap-icons.min.css',
  './static/css/apple.css'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Fetch Event (allows the site to work offline once it has been visited)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
