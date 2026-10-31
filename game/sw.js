// Service worker: the installed app (PWA) and offline play. Template: the build (vite.config.ts, offlinePlugin)
// writes it to dist/sw.js behind a line `self.__BUILD__ = {core, media, coreVersion, mediaVersion}` listing every
// built file (paths relative to this file) and hashes of their contents. The core (about 2 MB) is cached on
// install. The music (music/, about 25 MB) goes in its own cache, best effort, so a code update doesn't download it
// again; what's missing comes from the network and is cached then.
// Cache first: an update installs in the background and takes over; main.ts (registerOffline) looks for one on
// every start and when the app comes back to the screen. (After Dark Planet's sw.js.)

const { core, media = [], coreVersion, mediaVersion = 'none' } = self.__BUILD__;
const CORE_CACHE = `wunioid-core-${coreVersion}`;
const MEDIA_CACHE = `wunioid-media-${mediaVersion}`;
const INDEX = new URL('index.html', self.location).href;
const MEDIA_URLS = new Set(media.map((p) => new URL(p, self.location).href));
const filling = new Set(); // music URLs being cached

/** Bypass the HTTP cache: index.html and data/ have no hash in their names. */
const fresh = (path) => new Request(new URL(path, self.location), { cache: 'reload' });

async function cacheMedia(cache, url) {
  if (filling.has(url) || (await cache.match(url))) return;
  filling.add(url);
  try {
    await cache.add(fresh(url));
  } finally {
    filling.delete(url);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await (await caches.open(CORE_CACHE)).addAll(core.map(fresh));
    const mediaCache = await caches.open(MEDIA_CACHE);
    await Promise.allSettled([...MEDIA_URLS].map((url) => cacheMedia(mediaCache, url)));
    await self.skipWaiting(); // a running game has loaded everything it needs from the old version at boot
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('wunioid-') && name !== CORE_CACHE && name !== MEDIA_CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    // every page in the scope is the game (start_url "./" and index.html)
    const key = request.mode === 'navigate' ? INDEX : request.url;
    const cached = await caches.match(key, { ignoreSearch: true });
    if (cached) return cached;
    const url = new URL(request.url);
    url.search = '';
    if (MEDIA_URLS.has(url.href)) {
      event.waitUntil(caches.open(MEDIA_CACHE).then((cache) => cacheMedia(cache, url.href)).catch(() => undefined));
    }
    return fetch(request);
  })());
});
