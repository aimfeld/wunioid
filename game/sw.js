// Service worker: the installed app (PWA) and offline play. Template: the build (vite.config.ts, offlinePlugin)
// writes it to dist/sw.js behind a line `self.__BUILD__ = {core, coreVersion}` listing every built file (paths
// relative to this file) and a hash of their contents. Everything (about 2 MB) is cached on install.
// Cache first: an update installs in the background and takes over; main.ts (registerOffline) looks for one on
// every start and when the app comes back to the screen. (After Dark Planet's sw.js.)

const { core, coreVersion } = self.__BUILD__;
const CORE_CACHE = `wunioid-core-${coreVersion}`;
const INDEX = new URL('index.html', self.location).href;

/** Bypass the HTTP cache: index.html and data/ have no hash in their names. */
const fresh = (path) => new Request(new URL(path, self.location), { cache: 'reload' });

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await (await caches.open(CORE_CACHE)).addAll(core.map(fresh));
    await self.skipWaiting(); // a running game has loaded everything it needs from the old version at boot
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('wunioid-') && name !== CORE_CACHE) await caches.delete(name);
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
    return (await caches.match(key, { ignoreSearch: true })) ?? fetch(request);
  })());
});
