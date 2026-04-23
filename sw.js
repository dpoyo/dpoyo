// D'POYO — sw.js
const CACHE = 'dpoyo-v4';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('admin')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (r && r.status === 200) {
          const clone = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return r;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
self.addEventListener('push', e => {
  const payload = e.data ? e.data.json() : {};
  const title = payload.notification?.title || payload.title || "D'Poyo";
  const body  = payload.notification?.body  || payload.body  || '¡Estás cerca! Ven a sumar tu compra.';
  e.waitUntil(self.registration.showNotification(title, {
    body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    tag: 'dpoyo-push', vibrate: [200,100,200], data: { url: '/' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window'}).then(list => {
    const w = list.find(c => c.url.includes('/'));
    if (w) return w.focus();
    return clients.openWindow('/');
  }));
});

// VAPID - Push notifications
const VAPID_KEY = 'BFIvFqfHVKX94eFettJrUvKIoYIcfvX6-m_ZvRgfHV3CUw8Uf9dPGZWnpgr_LoGMjP_b-vOcwClUKzkNYwf4UIw';
