// オフライン対応：ネットワーク優先（3秒でタイムアウト）→ キャッシュにフォールバック
const VERSION = 'tadoku-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/store.js', 'js/db.js', 'js/books.js', 'js/levels.js', 'js/stats.js',
  'js/ui.js', 'js/tts.js', 'js/charts.js', 'js/reader.js',
  'js/views/home.js', 'js/views/library.js', 'js/views/stats.js', 'js/views/words.js', 'js/views/settings.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'books/index.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    try {
      const idx = await (await fetch('books/index.json', { cache: 'no-cache' })).json();
      await cache.addAll(idx.books.map((f) => `books/${f}`));
    } catch (e) { /* 教材は次回アクセス時にキャッシュされる */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 辞書APIなど外部は対象外
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([
        fetch(req),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = (await cache.match(req, { ignoreSearch: true }))
        || (req.mode === 'navigate' ? await cache.match('index.html') : null);
      if (hit) return hit;
      throw err;
    }
  })());
});
