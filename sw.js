/* ═══════════════════════════════════════════════════
   PlayCast PRO — Service Worker
   - Cache-first para assets estáticos
   - Network-first para config.json
   - Página offline propia (nunca muestra error de GitHub)
   - FCM push ready
   ═══════════════════════════════════════════════════ */

const CACHE   = 'playcast-v3';
const OFFLINE_URL = '/offline.html'; // fallback inline (ver abajo)

const STATIC = [
  './',
  './index.html',
  './config.json',
  './css/base.css',
  './css/dashboard.css',
  './css/player.css',
  './js/router.js',
  './js/channels.js',
  './js/player.js',
  './js/app.js',
];

/* ─── Install ────────────────────────────────────── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      // addAll con manejo de error por archivo — si uno falla no bloquea todo
      return Promise.allSettled(STATIC.map(url => c.add(url).catch(() => {})));
    })
  );
  self.skipWaiting();
});

/* ─── Activate ───────────────────────────────────── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ─── Fetch ──────────────────────────────────────── */
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // No interceptar: streams de video, CDNs externos, APIs externas
  if (
    req.method !== 'GET' ||
    !url.hostname.includes(self.location.hostname) ||
    url.hostname !== self.location.hostname
  ) return;

  // config.json → network first (datos frescos), fallback a cache
  if (url.pathname.endsWith('config.json')) {
    e.respondWith(_networkFirst(req));
    return;
  }

  // Assets estáticos → cache first, fallback a network
  e.respondWith(_cacheFirst(req));
});

async function _networkFirst(req) {
  try {
    const res = await fetch(req);
    // Solo cachear respuestas válidas (no 404, no 500)
    if (res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
    }
    // Si el servidor devuelve error (500, 503, etc.) y hay cache, usar cache
    if (!res.ok) {
      const cached = await caches.match(req);
      if (cached) return cached;
      // Si no hay cache y hubo error de servidor, devolver JSON vacío seguro
      return new Response('{"channels":[],"footer_text":"Sin conexión"}', {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return res;
  } catch (_) {
    // Sin internet
    const cached = await caches.match(req);
    if (cached) return cached;
    return new Response('{"channels":[],"footer_text":"Sin conexión"}', {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function _cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;

  try {
    const res = await fetch(req);
    // No cachear errores de servidor
    if (res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
    }
    // Si es 404/500 para el HTML principal → página offline propia
    if (!res.ok && req.destination === 'document') {
      return _offlinePage();
    }
    return res;
  } catch (_) {
    // Sin internet → página offline propia (nunca muestra página de GitHub)
    if (req.destination === 'document') return _offlinePage();
    return new Response('', { status: 503 });
  }
}

/* ─── Página offline inline ──────────────────────── */
// No depende de ningún archivo externo — siempre funciona
function _offlinePage() {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PlayCast PRO — Sin conexión</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'DM Sans', system-ui, sans-serif;
      background: #0b0d12;
      color: #eaecf2;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      padding: 40px 20px;
      text-align: center;
    }
    .icon { font-size: 4rem; }
    h1 { font-size: 1.4rem; font-weight: 700; }
    p  { color: #6b7280; font-size: 0.92rem; max-width: 280px; line-height: 1.6; }
    button {
      background: #e63946;
      color: #fff;
      border: none;
      padding: 12px 32px;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="icon">📡</div>
  <h1>Sin conexión</h1>
  <p>Verifica tu internet e intenta de nuevo. Tus canales te esperan.</p>
  <button onclick="location.reload()">🔄 Reintentar</button>
</body>
</html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

/* ═══════════════════════════════════════════════════
   PUSH NOTIFICATIONS (FCM / OneSignal)
   ═══════════════════════════════════════════════════
   
   OPCIÓN RECOMENDADA: OneSignal (sin servidor propio)
   1. Registrarse en https://onesignal.com (gratis)
   2. Crear App → Web → poner dominio de GitHub Pages
   3. Descargar el archivo OneSignalSDKWorker.js que te dan
   4. Subirlo a la RAÍZ de tu repositorio
   5. Añadir en index.html antes de </body>:
   
      <script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
      <script>
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        OneSignalDeferred.push(async function(OneSignal) {
          await OneSignal.init({
            appId: "TU-APP-ID-DE-ONESIGNAL",
            notifyButton: { enable: false }, // usamos nuestro botón 🔔
          });
        });
      </script>
   
   6. Para enviar notificación de partido:
      Panel OneSignal → New Push → escribes título + mensaje → Send to All
   
   ──────────────────────────────────────────────────
   OPCIÓN AVANZADA: Firebase Cloud Messaging (FCM)
   Requiere servidor propio para enviar notificaciones.
   Descomentar el bloque de abajo cuando tengas config.
   ═══════════════════════════════════════════════════ */

// importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
// importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');
// firebase.initializeApp({ apiKey:'', authDomain:'', projectId:'', messagingSenderId:'', appId:'' });
// const messaging = firebase.messaging();
// messaging.onBackgroundMessage(payload => {
//   self.registration.showNotification(payload.notification.title, {
//     body: payload.notification.body,
//     icon: payload.notification.icon || '/icon.png',
//     data: payload.data,
//     actions: [{ action:'watch', title:'▶ Ver ahora' }]
//   });
// });

/* ─── Push manual (sin Firebase) ────────────────── */
self.addEventListener('push', e => {
  if (!e.data) return;
  let p;
  try { p = e.data.json(); } catch { p = { title:'PlayCast PRO', body: e.data.text() }; }

  e.waitUntil(
    self.registration.showNotification(p.title || 'PlayCast PRO', {
      body:    p.body || '¡Partido en vivo ahora!',
      icon:    p.icon || './favicon.ico',
      badge:   p.badge,
      data:    p.data || {},
      actions: [{ action:'watch', title:'▶ Ver ahora' }, { action:'close', title:'Cerrar' }],
      vibrate: [200, 100, 200],
      tag:     'playcast-live',
      requireInteraction: true,
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'close') return;

  const target = e.notification.data?.url || './';
  e.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.postMessage({ type:'NAVIGATE', url: target });
          return c.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
