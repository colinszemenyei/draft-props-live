// Minimal service worker.
//
// Prior versions cached HTML pages and Next.js chunks, which caused a
// cache-poisoning problem: after a deploy, the SW could hand back an
// HTML document that referenced JS chunk URLs from the previous build,
// producing a "This page couldn't load" error on mobile. This version
// does nothing during fetch — it exists only so the app is installable
// as a PWA and so icons/manifest are served. The browser's own HTTP
// caching handles everything else correctly, with Next.js' content
// hashes driving invalidation.

const CACHE_NAME = 'draft-props-v3';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // Nuke ALL previously-created caches so no stale HTML / chunks survive.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Intentionally no 'fetch' handler — falls through to the network.
