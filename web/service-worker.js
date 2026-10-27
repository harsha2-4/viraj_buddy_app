// Increment when releasing changes so existing installations receive a fresh shell.
const VERSION = 'v26';
// Include scope: two deployments on the same github.io origin must not delete each other's caches.
const PREFIX = `viraj-buddy:${self.registration.scope}:`;
const CACHE = `${PREFIX}${VERSION}`;
const SHELL = [
  './', './index.html', './css/styles.css', './js/config.js', './js/app.js',
  './js/animations.js', './js/navigation.js', './js/onboarding.js', './js/profiles.js', './js/voice.js', './js/voiceProfile.js', './js/audioConfig.js', './js/wakeLock.js', './js/scenes.js', './js/history.js', './manifest.json',
  './assets/images/placeholder-avatar.svg', './assets/icons/icon-192.png',
  './assets/icons/icon-512.png', './assets/icons/apple-touch-icon.png'
].map((path) => new URL(path, self.registration.scope).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // An exact local allowlist; never intercept or store ChatGPT, authentication, or third-party requests.
  if (request.method !== 'GET' || url.origin !== self.location.origin || !SHELL.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Network-first config and HTML keep the URL current; cached versions work offline.
    if (request.mode === 'navigate' || url.pathname.endsWith('/js/config.js')) {
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response.ok && response.type !== 'opaque' && !response.redirected) {
          await cache.put(request, response.clone());
          return response;
        }
      } catch { /* Use the installed launcher while offline. */ }
      return (await cache.match(request)) || Response.error();
    }
    return (await cache.match(request)) || fetch(request);
  })());
});
