const CACHE_NAME = 'themecad-pwa-v2';
const ASSETS = [
    './',
    './index.html',
    './theme.tcad',
    './preview.html',
    './preview.css',
    './manifest.webmanifest',
    './icon.svg',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            Promise.all(
                ASSETS.map((url) =>
                    cache.add(url).catch((err) => console.warn(`[sw] Failed to pre-cache "${url}":`, err))
                )
            )
        )
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
    event.respondWith(
        fetch(req)
            .then((resp) => {
                if (resp && resp.ok) {
                    const copy = resp.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch((err) => {
                        console.warn('[sw] Cache put failed:', err);
                    });
                }
                return resp;
            })
            .catch(async (err) => {
                const hit = (await caches.match(req)) ?? (req.mode === 'navigate' ? await caches.match('./index.html') : null);
                if (hit) return hit;
                console.error('[sw] Network failed and no cached response for', req.url, err);
                return Response.error();
            })
    );
});