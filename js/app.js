/* ═══════════════════════════════════════════════════
   PlayCast PRO — App Bootstrap
   
   Wires together: Router, ChannelsModule, PlayerModule
   Service Worker registration & push permission flow.
   ═══════════════════════════════════════════════════ */

/* ── Prevent pull-to-refresh (WebView) ──────────── */
let touchStartY = 0;
document.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchmove', e => {
  const dy = e.touches[0].clientY - touchStartY;
  // Block native pull-to-refresh when user pulls down at top of page
  if (dy > 0 && window.scrollY === 0 && e.cancelable) {
    e.preventDefault();
  }
}, { passive: false });

/* ── Page registry ───────────────────────────────── */
const Pages = {
  dashboard: document.getElementById('page-dashboard'),
  player:    document.getElementById('page-player')
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

/* ── Router setup ────────────────────────────────── */
Router.register('/', {
  title: 'PlayCast PRO',
  onEnter() {
    showPage('dashboard');
    ChannelsModule.mount();
  },
  onLeave() {}
});

Router.register('/player', {
  title: 'Reproduciendo — PlayCast PRO',
  onEnter(params) {
    showPage('player');
    PlayerModule.mount();

    // Params can come from URL or from in-app navigation
    const url  = params.url  || decodeURIComponent(params.url  || '');
    const name = params.name || decodeURIComponent(params.name || '');

    if (url) {
      PlayerModule.play(url, name);
    } else if (params.id) {
      const ch = ChannelsModule.getById(params.id);
      if (ch) PlayerModule.play(ch.url, ch.name);
    }

    // Render related channels in sidebar
    renderRelated(params.id, params.name);
  },
  onLeave() {
    PlayerModule.stop();
  }
});

/* ── Related channels in player sidebar ─────────── */
function renderRelated(currentId, currentName) {
  const relatedList = document.getElementById('related-list');
  const relatedTitle = document.getElementById('related-title');
  if (!relatedList) return;

  const ch = ChannelsModule.getById(currentId);
  const category = ch?.category;

  let related = category
    ? ChannelsModule.getByCategory(category).filter(c => (c.id || c.url) !== currentId)
    : ChannelsModule.all.filter(c => (c.id || c.url) !== currentId).slice(0, 5);

  related = related.slice(0, 6);

  const infoPanel = document.querySelector('.player-info-panel');
  if (infoPanel) {
    const h2 = infoPanel.querySelector('h2');
    const badge = infoPanel.querySelector('.player-cat-badge');
    if (h2) h2.textContent = currentName || 'En vivo';
    if (badge && category) badge.textContent = category;
  }

  if (relatedTitle) relatedTitle.style.display = related.length ? 'block' : 'none';

  relatedList.innerHTML = '';
  related.forEach(c => {
    if (!c.url) return;
    const emoji = ChannelsModule.getCategoryEmoji(c.category);
    const logoHTML = c.logo
      ? `<img src="${c.logo}" alt="${c.name}" loading="lazy" onerror="this.textContent='${emoji}'">`
      : emoji;

    const card = document.createElement('div');
    card.className = 'related-card';
    card.innerHTML = `
      <div class="related-logo">${logoHTML}</div>
      <span class="related-name">${c.name}</span>
      <button class="btn-related-play">▶</button>
    `;
    card.querySelector('.btn-related-play').addEventListener('click', () => {
      Router.navigate('/player', { id: c.id || '', name: c.name, url: c.url });
    });
    relatedList.appendChild(card);
  });
}

/* ── Dashboard UI wiring ─────────────────────────── */
function wireDashboardUI() {
  const searchInput  = document.getElementById('channelSearch');
  const clearBtn     = document.getElementById('clearSearch');
  const viewToggleBtn = document.getElementById('viewToggleBtn');
  const notifBtn     = document.getElementById('notifBtn');

  searchInput?.addEventListener('input', () => {
    clearBtn?.classList.toggle('visible', searchInput.value.length > 0);
    ChannelsModule.setSearch(searchInput.value);
  });

  clearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.classList.remove('visible');
    ChannelsModule.setSearch('');
  });

  viewToggleBtn?.addEventListener('click', () => {
    const newView = ChannelsModule.toggleView();
    viewToggleBtn.textContent = newView === 'grid' ? '☰' : '⊞';
    viewToggleBtn.title = newView === 'grid' ? 'Vista lista' : 'Vista cuadrícula';
  });

  notifBtn?.addEventListener('click', requestPushPermission);
}

/* ── Toast system ────────────────────────────────── */
window.showToast = function(message, duration = 2800) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), duration);
};

/* ── Push Notifications (FCM ready) ─────────────── */
async function requestPushPermission() {
  if (!('Notification' in window)) {
    showToast('Las notificaciones no están disponibles');
    return;
  }

  const badge = document.getElementById('notifBadge');

  if (Notification.permission === 'granted') {
    showToast('✅ Notificaciones ya activadas');
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    showToast('🔔 Notificaciones activadas');
    if (badge) badge.classList.remove('visible');
    // TODO: Subscribe to FCM push here using VAPID key from sw.js
    // const reg = await navigator.serviceWorker.ready;
    // const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_KEY });
    // await sendSubscriptionToServer(sub);
  } else {
    showToast('Notificaciones bloqueadas');
  }
}

/* ── Service Worker registration ─────────────────── */
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  try {
    // Detect base path automatically (works in root AND GitHub Pages subdirs like /wta/)
    // e.g. guayafarai.github.io/wta/ → scope = /wta/
    const swPath = new URL('sw.js', document.baseURI).href;
    const scope  = new URL('./', document.baseURI).pathname;
    const reg = await navigator.serviceWorker.register(swPath, { scope });
    console.log('[SW] Registered:', reg.scope);

    // Handle messages from SW (e.g. NAVIGATE command)
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'NAVIGATE') {
        const url = new URL(event.data.url, location.origin);
        const path = url.pathname;
        const params = Object.fromEntries(url.searchParams.entries());
        Router.navigate(path, params);
      }
    });

    // Show notification bell if permission not yet granted
    if (Notification.permission === 'default') {
      const badge = document.getElementById('notifBadge');
      if (badge) badge.classList.add('visible');
    }
  } catch (err) {
    console.warn('[SW] Registration failed:', err);
  }
}

/* ── Prevent accidental app close on Android ─────── */
// The Router handles popstate, but we add an extra guard:
// if user is on home and presses back, show a "exit?" prompt
window.addEventListener('popstate', event => {
  // If no state and we're at root, router already handled it
  // This is a safety net for Android WebView clients that
  // send a synthetic 'back' event before popstate fires
});

/* ── WebView bridge (optional native integration) ── */
// Android: window.PlayCastBridge?.onChannelStarted(channelId)
// iOS:     window.webkit.messageHandlers.PlayCast.postMessage({...})
window.PlayCastWebBridge = {
  notifyChannelStarted(id, name) {
    try {
      // Android
      if (window.PlayCastBridge?.onChannelStarted) {
        window.PlayCastBridge.onChannelStarted(id, name);
      }
      // iOS
      if (window.webkit?.messageHandlers?.PlayCast) {
        window.webkit.messageHandlers.PlayCast.postMessage({ event: 'channelStarted', id, name });
      }
    } catch (e) {}
  },
  notifyChannelStopped() {
    try {
      if (window.PlayCastBridge?.onChannelStopped) window.PlayCastBridge.onChannelStopped();
      if (window.webkit?.messageHandlers?.PlayCast) {
        window.webkit.messageHandlers.PlayCast.postMessage({ event: 'channelStopped' });
      }
    } catch (e) {}
  }
};

/* ── Bootstrap ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Register service worker
  registerSW();

  // 2. Load config / channels data
  const config = await ChannelsModule.load();

  // 3. Set app name / footer
  if (config) {
    const footer = document.getElementById('footerText');
    if (footer) footer.textContent = config.footer_text || '';
  }

  // 4. Wire static UI events (search, view toggle, etc.)
  wireDashboardUI();

  // 5. Initialize Router (parses URL, activates first route)
  Router.init();
});
