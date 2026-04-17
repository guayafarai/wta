/* ═══════════════════════════════════════════════════
   PlayCast PRO — Service Worker
   Firebase Cloud Messaging (FCM) Ready
   ═══════════════════════════════════════════════════ */

const CACHE_NAME = 'playcast-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/player.html',
  '/config.json',
  '/css/base.css',
  '/css/dashboard.css',
  '/css/player.css',
  '/js/app.js',
  '/js/router.js',
  '/js/player.js',
  '/js/channels.js'
];

/* ── Install: pre-cache static assets ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/* ── Activate: clean old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── Fetch: network-first for config, cache-first for assets ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept stream URLs or external CDNs
  if (url.hostname !== location.hostname) return;

  if (url.pathname === '/config.json') {
    // Network first for config (always fresh channels)
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
  } else {
    // Cache first for static assets
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
  }
});

/* ══════════════════════════════════════════════════
   FIREBASE CLOUD MESSAGING — Push Notification Handler
   
   SETUP INSTRUCTIONS:
   1. Go to https://console.firebase.google.com
   2. Create project → Project Settings → Cloud Messaging
   3. Copy your VAPID key and Firebase config
   4. Replace the placeholder below with your config
   5. In your app, call: Notification.requestPermission()
      then: registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_KEY })
   ══════════════════════════════════════════════════ */

// Import Firebase scripts (uncomment when ready to integrate)
// importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
// importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

// firebase.initializeApp({
//   apiKey: "YOUR_API_KEY",
//   authDomain: "YOUR_PROJECT.firebaseapp.com",
//   projectId: "YOUR_PROJECT_ID",
//   storageBucket: "YOUR_PROJECT.appspot.com",
//   messagingSenderId: "YOUR_SENDER_ID",
//   appId: "YOUR_APP_ID"
// });

// const messaging = firebase.messaging();

// messaging.onBackgroundMessage(payload => {
//   const { title, body, icon, data } = payload.notification;
//   self.registration.showNotification(title, {
//     body,
//     icon: icon || '/icon-192.png',
//     badge: '/badge-72.png',
//     data: data || {},
//     actions: [
//       { action: 'watch', title: '▶ Ver ahora' },
//       { action: 'dismiss', title: 'Cerrar' }
//     ],
//     vibrate: [200, 100, 200],
//     tag: 'playcast-live'
//   });
// });

/* ── Manual Push Handler (without Firebase) ── */
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'PlayCast PRO', body: event.data.text() }; }

  const options = {
    body: payload.body || '¡Partido en vivo ahora!',
    icon: payload.icon || '/icon-192.png',
    badge: '/badge-72.png',
    image: payload.image,
    data: payload.data || {},
    actions: [
      { action: 'watch', title: '▶ Ver ahora' },
      { action: 'dismiss', title: 'Cerrar' }
    ],
    vibrate: [200, 100, 200],
    requireInteraction: true,
    tag: 'playcast-match'
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'PlayCast PRO', options)
  );
});

/* ── Notification Click Handler ── */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const channelId = event.notification.data?.channelId;
  const action = event.action;

  if (action === 'dismiss') return;

  const targetUrl = channelId
    ? `/?channel=${channelId}`
    : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return client.focus();
        }
      }
      // Open new window
      return clients.openWindow(targetUrl);
    })
  );
});
