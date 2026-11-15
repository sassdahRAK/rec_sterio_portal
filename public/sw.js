// RecSterio portal service worker.
//
// The shell is what makes the app open offline, so it is precached on install
// and refreshed from the network when a navigation succeeds. Everything else
// is cached on first use. API traffic is never intercepted: a stale dataset
// or auth response is worse than a visible network error, and the portal's
// fetch layer already owns its own retry and error states.

const CACHE = 'recsterio-portal-shell-v1';

// Resolved against the worker location rather than the origin, so the same
// file works whether the portal is served from / or from a subpath.
const SHELL = [
  '.',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

function shellUrl(path) {
  return new URL(path, self.location).toString();
}

// Cache.put is skipped for anything that is not a clean same origin 200: an
// opaque or error response would poison the cache and be served forever.
function isCacheable(response) {
  return Boolean(response) && response.status === 200 && response.type !== 'opaque';
}

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(
    SHELL.map(async (path) => {
      const url = shellUrl(path);
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (isCacheable(response)) await cache.put(url, response);
      } catch {
        // One missing shell file must not block the rest of the install.
      }
    }),
  );
  await self.skipWaiting();
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      // Only this app's own older cache versions are removed. The console runs
      // its own worker on the same origin, so its cache must survive.
      await Promise.all(
        names
          .filter((name) => name.startsWith('recsterio-portal-shell-') && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(CACHE);
    const index = await cache.match(shellUrl('./index.html'));
    if (index) return index;
    const offline = await cache.match(shellUrl('./offline.html'));
    if (offline) return offline;
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Resource unavailable offline', {
      status: 504,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Non GET requests and API calls pass straight through to the browser.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.pathname.includes('/api/')) return;
  if (url.origin !== self.location.origin) return;

  // The console is served from /console/ on the same origin in production and
  // has its own worker. Intercepting its assets here would fill this shell with
  // files this app never renders, so those requests go straight to the browser.
  if (url.pathname === '/console' || url.pathname.startsWith('/console/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
