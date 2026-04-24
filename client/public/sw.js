/*
 * public/sw.js — Minimal app-shell service worker.
 *
 * Strategy:
 *   - App shell (HTML, JS, CSS, images): cache-first with background revalidate.
 *   - /api/*: network-only (do NOT cache API responses — mutations are handled
 *     client-side via IndexedDB queue; caching GETs would risk stale state).
 *
 * Versioning:
 *   Bump CACHE_NAME to invalidate the old cache on deploy.
 */

const CACHE_NAME = 'tidum-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim()),
  );
});

function isShellRequest(req) {
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname.startsWith('/ws')) return false;
  if (url.pathname.startsWith('/sw.js')) return false;
  if (req.method !== 'GET') return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never touch API: the client-side queue handles offline writes and we want
  // fresh reads when online.
  if (req.method !== 'GET' || !isShellRequest(req)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const networkPromise = fetch(req).then((res) => {
      if (res && res.ok && res.status === 200) {
        cache.put(req, res.clone()).catch(() => { /* ignore quota errors */ });
      }
      return res;
    }).catch(() => null);

    // If we have a cached version, serve it fast and update in the background.
    if (cached) {
      networkPromise; // fire and forget
      return cached;
    }

    // Otherwise wait on the network.
    const net = await networkPromise;
    if (net) return net;

    // Fully offline and uncached — return a lightweight fallback HTML for navigation requests.
    if (req.mode === 'navigate') {
      return new Response(
        `<!doctype html><html><head><meta charset="utf-8"><title>Offline — Tidum</title></head>
         <body style="font-family:system-ui;padding:40px;background:#fef3c7;color:#78350f;">
           <h1>Du er frakoblet</h1>
           <p>Tidum fungerer også uten nett — registreringer lagres lokalt og synkes når du er tilbake på nett.</p>
         </body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }
    return Response.error();
  })());
});
