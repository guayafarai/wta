/* ═══════════════════════════════════════════════════
   PlayCast PRO — App Bootstrap
   ═══════════════════════════════════════════════════ */

/* ── Anti pull-to-refresh (WebView) ─────────────── */
let _touchY = 0;
document.addEventListener('touchstart', e => { _touchY = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchmove', e => {
  if (e.touches[0].clientY - _touchY > 0 && window.scrollY === 0 && e.cancelable)
    e.preventDefault();
}, { passive: false });

/* ── Pages ───────────────────────────────────────── */
const Pages = {
  dashboard: document.getElementById('page-dashboard'),
  player:    document.getElementById('page-player'),
};

function showPage(id) {
  Object.entries(Pages).forEach(([key, el]) => {
    if (!el) return;
    if (key === id) {
      el.style.display = 'block';
      requestAnimationFrame(() => el.classList.add('active', 'slide-in'));
      setTimeout(() => el.classList.remove('slide-in'), 300);
    } else {
      el.classList.remove('active');
      setTimeout(() => { if (!el.classList.contains('active')) el.style.display = 'none'; }, 300);
    }
  });
}

/* ── Router ──────────────────────────────────────── */
Router.register('/', {
  title: 'PlayCast PRO — Deportes en vivo',
  onEnter() { showPage('dashboard'); ChannelsModule.mount(); },
  onLeave()  {}
});

Router.register('/player', {
  title: 'Reproduciendo — PlayCast PRO',
  onEnter(params) {
    showPage('player');
    PlayerModule.mount();

    const url  = params.url  || '';
    const name = params.name || '';
    const id   = params.id   || '';

    if (url) {
      PlayerModule.play(url, name, id);
    } else if (id) {
      const ch = ChannelsModule.getById(id);
      if (ch) PlayerModule.play(ch.url, ch.name, ch.id);
    }

    _renderSuggested(id || name);
  },
  onLeave() { PlayerModule.stop(); }
});

/* ── Sugeridos aleatorios / más vistos ───────────── */
function _renderSuggested(excludeId) {
  const list = document.getElementById('related-list');
  if (!list) return;

  const suggested = ChannelsModule.getSuggested(excludeId, 6);
  list.innerHTML = '';

  suggested.forEach(ch => {
    const logoHTML = ch.logo
      ? `<img src="${ch.logo}" alt="${ch.name}" loading="lazy" onerror="this.parentElement.textContent='⚽'">`
      : '⚽';

    const card = document.createElement('div');
    card.className = 'related-card';
    card.innerHTML = `
      <div class="related-logo">${logoHTML}</div>
      <span class="related-name">${ch.name}</span>
      <button class="btn-related-play">▶</button>
    `;
    card.querySelector('.btn-related-play').addEventListener('click', () => {
      Router.navigate('/player', { id: ch.id || '', name: ch.name, url: ch.url });
    });
    list.appendChild(card);
  });
}

/* ── Dashboard wiring ────────────────────────────── */
function _wireDashboard() {
  const searchInput = document.getElementById('channelSearch');
  const clearBtn    = document.getElementById('clearSearch');
  const notifBtn    = document.getElementById('notifBtn');

  searchInput?.addEventListener('input', () => {
    clearBtn?.classList.toggle('visible', searchInput.value.length > 0);
    ChannelsModule.setSearch(searchInput.value);
  });

  clearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.remove('visible');
    ChannelsModule.setSearch('');
  });

  notifBtn?.addEventListener('click', _requestNotifPermission);
}

/* ── Toast ───────────────────────────────────────── */
window.showToast = function(msg, ms = 2800) {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), ms);
};

/* ══════════════════════════════════════════════════
   NOTIFICACIONES PUSH — Guía completa
   ══════════════════════════════════════════════════
   
   OPCIÓN A — OneSignal (la más fácil, gratis)
   ─────────────────────────────────────────────────
   1. Ir a https://onesignal.com → Create App
   2. Elegir "Web" → poner tu dominio GitHub Pages
   3. Copiar tu App ID
   4. Descomentar el script de OneSignal en index.html:
   
      <script src="https://cdn.onesignal.com/sdks/OneSignalSDK.js" defer></script>
      <script>
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        OneSignalDeferred.push(async function(OneSignal) {
          await OneSignal.init({ appId: "TU_APP_ID_AQUI" });
        });
      </script>
   
   5. Para enviar notificación: vas al panel de OneSignal → New Push → escribes el mensaje → Send
   
   OPCIÓN B — Firebase Cloud Messaging (FCM)
   ─────────────────────────────────────────────────
   1. https://console.firebase.google.com → nuevo proyecto
   2. Project Settings → Cloud Messaging → copiar VAPID key
   3. En sw.js descomentar las líneas de importScripts + firebase.initializeApp
   4. Llamar subscribeUserToPush() desde aquí
   
   ══════════════════════════════════════════════════ */

async function _requestNotifPermission() {
  const badge = document.getElementById('notifBadge');

  if (!('Notification' in window)) {
    showToast('Las notificaciones no están disponibles en este browser');
    return;
  }

  if (Notification.permission === 'granted') {
    showToast('✅ Notificaciones ya activadas');
    // Mostrar instrucciones para enviar desde OneSignal
    setTimeout(() => showToast('📲 Envía desde onesignal.com → Dashboard → New Push'), 1500);
    return;
  }

  if (Notification.permission === 'denied') {
    showToast('🚫 Notificaciones bloqueadas — habilítalas en ajustes del navegador');
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    showToast('🔔 ¡Notificaciones activadas!');
    if (badge) badge.classList.remove('visible');
    _subscribeToNotifications();
  } else {
    showToast('Permiso denegado');
  }
}

async function _subscribeToNotifications() {
  try {
    const reg = await navigator.serviceWorker.ready;
    // ── OneSignal se encarga automáticamente si está configurado ──
    // ── FCM manual: descomentar cuando tengas VAPID key ──
    // const VAPID = 'TU_VAPID_KEY_PUBLICA';
    // const sub = await reg.pushManager.subscribe({
    //   userVisibleOnly: true,
    //   applicationServerKey: VAPID
    // });
    // await fetch('/api/subscribe', { method: 'POST', body: JSON.stringify(sub) });
    console.log('[Push] Suscripción lista');
  } catch (e) {
    console.warn('[Push]', e);
  }
}

/* ── Service Worker ──────────────────────────────── */
async function _registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    // Ruta relativa — funciona en GitHub Pages subdirectorios (/wta/, /repo/, etc.)
    const swUrl = new URL('sw.js', document.baseURI).href;
    const scope  = new URL('./', document.baseURI).pathname;
    const reg    = await navigator.serviceWorker.register(swUrl, { scope });
    console.log('[SW] Registrado:', reg.scope);

    navigator.serviceWorker.addEventListener('message', ev => {
      if (ev.data?.type === 'NAVIGATE') {
        const u = new URL(ev.data.url, location.origin);
        Router.navigate(u.pathname, Object.fromEntries(u.searchParams));
      }
    });

    if (Notification.permission === 'default') {
      document.getElementById('notifBadge')?.classList.add('visible');
    }
  } catch (err) {
    // No crashear la app si el SW falla (ej: file:// en dev local)
    console.warn('[SW] No registrado:', err.message);
  }
}

/* ── Bootstrap ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  _registerSW();

  const config = await ChannelsModule.load();
  if (config) {
    const ft = document.getElementById('footerText');
    if (ft) ft.textContent = config.footer_text || '';
  }

  _wireDashboard();
  Router.init();
});
