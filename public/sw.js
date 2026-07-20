// Apna Tutor service worker
// Caches the app shell so the app opens instantly and can be installed.
// API calls (/api/*) always go to the network - tutoring and quizzes need
// a live connection, so this does NOT try to fake offline AI responses.

const CACHE_NAME = 'apna-tutor-shell-v2';
const SHELL_FILES = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/images/teacher-avatar.jpg',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API calls - always hit the network live.
  if (url.pathname.startsWith('/api/')) {
    return; // let the browser handle it normally
  }

  // App shell: cache-first, falling back to network, falling back to offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});