/* ═══════════════════════════════════════════════════
   PlayCast PRO — Router (History API / SPA)
   
   Manages navigation WITHOUT page reloads.
   Android/iOS back button intercepted via popstate.
   ═══════════════════════════════════════════════════ */

const Router = (() => {
  // ── Route registry ──────────────────────────────
  const routes = {};
  let currentRoute = null;
  let isTransitioning = false;

  // ── Register a route ────────────────────────────
  function register(path, { onEnter, onLeave, title = 'PlayCast PRO' }) {
    routes[path] = { onEnter, onLeave, title };
  }

  // ── Navigate to a path ──────────────────────────
  function navigate(path, params = {}, { replace = false } = {}) {
    if (isTransitioning) return;
    if (currentRoute === path && !Object.keys(params).length) return;

    const state = { path, params, ts: Date.now() };
    const url = buildUrl(path, params);

    if (replace) {
      history.replaceState(state, '', url);
    } else {
      history.pushState(state, '', url);
    }

    _activate(path, params);
  }

  // ── Go back (Android hardware back button) ──────
  function back() {
    history.back();
  }

  // ── Build URL with query params ─────────────────
  function buildUrl(path, params) {
    const base = path === '/' ? '/' : path;
    const query = new URLSearchParams(params).toString();
    return query ? `${base}?${query}` : base;
  }

  // ── Activate a route ────────────────────────────
  async function _activate(path, params = {}) {
    isTransitioning = true;
    const route = routes[path] || routes['/'];

    if (!route) {
      console.warn(`[Router] No route for: ${path}`);
      isTransitioning = false;
      return;
    }

    // Leave current route
    if (currentRoute && routes[currentRoute]?.onLeave) {
      await routes[currentRoute].onLeave();
    }

    // Update page title
    document.title = route.title;

    // Enter new route
    currentRoute = path;
    await route.onEnter(params);

    isTransitioning = false;
  }

  // ── Handle popstate (hardware back/forward) ─────
  window.addEventListener('popstate', (event) => {
    const state = event.state;

    if (!state) {
      // No state = initial load or true home
      _activate('/', {});
      return;
    }

    const { path, params } = state;

    // If navigating back to home while player is active,
    // stop the stream cleanly
    if (path === '/' && currentRoute === '/player') {
      if (window.PlayerModule) {
        window.PlayerModule.stop();
      }
    }

    _activate(path, params);
  });

  // ── Bootstrap: parse initial URL ────────────────
  function init() {
    const url = new URL(location.href);
    const path = url.pathname || '/';
    const params = Object.fromEntries(url.searchParams.entries());

    // Push initial state so back button works on first screen
    history.replaceState({ path, params, ts: Date.now() }, '', location.href);

    _activate(path, params);
  }

  // ── Expose public API ────────────────────────────
  return { register, navigate, back, init, get current() { return currentRoute; } };
})();
