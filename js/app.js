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
  const catButtons  = document.querySelectorAll('.cat-btn'); // [NUEVO] Botones MLB/NBA

  // Lógica de búsqueda
  searchInput?.addEventListener('input', () => {
    clearBtn?.classList.toggle('visible', searchInput.value.length > 0);
    ChannelsModule.setSearch(searchInput.value);
  });

  clearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.remove('visible');
    ChannelsModule.setSearch('');
  });

  // [NUEVO] Lógica de filtrado por categoría
  catButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Estilo visual activo
      catButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Filtrar datos
      const category = btn.getAttribute('data-cat');
      ChannelsModule.setCategory(category);
    });
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

/* ── Notificaciones ── */
async function _requestNotifPermission() {
  const badge = document.getElementById('notifBadge');

  if (!('Notification' in window)) {
    showToast('Las notificaciones no están disponibles en este browser');
    return;
  }

  if (Notification.permission === 'granted') {
    showToast('✅ Notificaciones ya activadas');
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
    console.log('[Push] Suscripción lista');
  } catch (e) {
    console.warn('[Push]', e);
  }
}

/* ── Service Worker ──────────────────────────────── */
async function _registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
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

  _wireDashboard(); // Configura búsqueda y categorías
  Router.init();
});
