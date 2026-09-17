// =============================================================
// Kampprogram — service worker
// Strategi: network-first med cache-fallback. Når hallen har net,
// får man altid nyeste version; uden net starter appen fra cachen.
// API-kald (/api/) røres ALDRIG — de degraderer selv pænt.
// =============================================================

const CACHE_NAME = 'kampprogram-v3';
const CORE_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './script.js',
    './icons.svg',
    './favicon.svg',
    './site.webmanifest',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== location.origin) return;
    if (url.pathname.includes('/api/')) return;   // aldrig cache API

    event.respondWith(
        fetch(req)
            .then((res) => {
                if (res && res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
                }
                return res;
            })
            .catch(() =>
                caches.match(req, {ignoreSearch: true}).then((hit) =>
                    hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())
                )
            )
    );
});
