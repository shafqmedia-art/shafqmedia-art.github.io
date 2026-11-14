// Service Worker — بيخلي شفق بوت يتثبّت كتطبيق ويفتح بسرعة
const VERSION = 'shafq-bot-v5';
const SHELL = ['/style.css?v=4', '/app.js?v=5', '/logo.png', '/icons/icon-192.png', '/fonts/Cairo-Regular.ttf', '/fonts/Cairo-Bold.ttf', '/fonts/Cairo-Black.ttf', '/offline.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // الصفحات: من الشبكة دايماً (البيانات لازم تكون جديدة)، وإذا ما في نت ← صفحة "ما في اتصال"
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  // الخطوط والصور والستايل: من الكاش أول
  if (/\.(css|js|png|jpg|jpeg|webp|ttf|woff2|svg)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && !url.pathname.startsWith('/uploads/')) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    })));
  }
});
