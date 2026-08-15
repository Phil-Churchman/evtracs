// Bump CACHE_NAME whenever ASSETS changes so clients refetch.
const CACHE_NAME = 'evtracs-v1';
const ASSETS = [
  '/',
  '/static/css/bootstrap.css',
  '/static/icons/font/bootstrap-icons.min.css',
  '/static/css/apple.css'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Fetch Event (Allows app to work offline)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});