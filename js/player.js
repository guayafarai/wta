/* ═══════════════════════════════════════════════════
   PlayCast PRO — Player Module
   HLS / DASH / iframe con:
   - Proxy en cascada anti-CORS
   - Capa bloqueadora de anuncios sobre iframe
   - Mensajes de error claros (sin texto de GitHub)
   ═══════════════════════════════════════════════════ */

const PlayerModule = (() => {
  let videoEl, iframeEl, adShield, overlayEl, errorEl, loadingEl;
  let channelNameEl, sidebarNameEl, backBtn, fullscreenBtn;

  let hlsInstance  = null;
  let dashInstance = null;
  let lastUrl      = '';
  let lastName     = '';
  let lastId       = '';
  let overlayTimer = null;
  let mounted      = false;
  let proxyIndex   = 0;

  // ── CORS Proxy chain ─────────────────────────────
  // Si el stream HLS falla por CORS, se prueban en orden.
  const CORS_PROXIES = [
    null,   // 0: directo
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    url => `https://proxy.cors.sh/${url}`,
    url => `https://thingproxy.freeboard.io/fetch/${url}`,
  ];

  function _proxied(url) {
    if (proxyIndex === 0) return url;
    const fn = CORS_PROXIES[proxyIndex];
    return fn ? fn(url) : url;
  }

  // ── Mount ─────────────────────────────────────────
  function mount() {
    if (mounted) return;
    mounted = true;

    videoEl       = document.getElementById('video-player');
    iframeEl      = document.getElementById('iframe-player');
    adShield      = document.getElementById('ad-shield');
    overlayEl     = document.getElementById('player-overlay');
    errorEl       = document.getElementById('stream-error');
    loadingEl     = document.getElementById('stream-loading');
    channelNameEl = document.getElementById('player-channel-name');
    sidebarNameEl = document.getElementById('sidebar-channel-name');
    backBtn       = document.getElementById('btn-back-player');
    fullscreenBtn = document.getElementById('btn-fullscreen');

    backBtn?.addEventListener('click', () => { stop(); Router.navigate('/'); });
    fullscreenBtn?.addEventListener('click', toggleFullscreen);
    document.getElementById('btn-retry-stream')?.addEventListener('click', () => play(lastUrl, lastName));
    document.getElementById('video-wrapper')?.addEventListener('click', toggleOverlay);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { stop(); Router.navigate('/'); }
    });
  }

  // ── Play ──────────────────────────────────────────
  function play(url, name, id) {
    if (!url) { _showError('URL no disponible', 'Configura la URL del canal en config.json'); return; }

    lastUrl  = url;
    lastName = name || 'En vivo';
    lastId   = id   || '';
    proxyIndex = 0;

    if (channelNameEl) channelNameEl.textContent = lastName;
    if (sidebarNameEl) sidebarNameEl.textContent = lastName;

    _reset();
    _showLoading(true);
    _showError(false);

    const isIframe = /youtube\.com|youtu\.be|facebook\.com|twitch\.tv|dailymotion\.com|\/embed\/|\.html$/i.test(url);
    const isDash   = /\.mpd($|\?)/i.test(url);
    const isHLS    = /\.m3u8($|\?)/i.test(url);

    if (/^rtmp/i.test(url)) {
      _showError('Formato no soportado', 'Usa una URL .m3u8, .mpd o un embed de YouTube/Twitch');
      return;
    }

    if      (isIframe) _playIframe(url);
    else if (isDash)   _playDash(url);
    else if (isHLS)    _playHLS(url, false);
    else               _playDirect(url);

    showOverlay();
  }

  // ── Stop ──────────────────────────────────────────
  function stop() {
    _reset();
    _exitFullscreen();
    _unlockOrientation();
  }

  // ── Reset ─────────────────────────────────────────
  function _reset() {
    hlsInstance?.destroy();  hlsInstance  = null;
    dashInstance?.reset();   dashInstance = null;

    // Limpiar bloqueadores de ads del iframe anterior
    _removeAdBlockers();

    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
      videoEl.style.display = 'none';
    }
    if (iframeEl) {
      iframeEl.src           = '';
      iframeEl.style.display = 'none';
    }
    clearOverlayTimer();
  }

  // ── HLS ───────────────────────────────────────────
  function _playHLS(url, isRetry) {
    videoEl.style.display = 'block';

    if (isRetry) proxyIndex = Math.min(proxyIndex + 1, CORS_PROXIES.length - 1);
    const src = _proxied(url);

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      hlsInstance?.destroy();
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        xhrSetup: xhr => { xhr.withCredentials = false; }
      });
      hlsInstance.loadSource(src);
      hlsInstance.attachMedia(videoEl);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        _showLoading(false);
        videoEl.play().catch(() => {});
      });
      hlsInstance.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (proxyIndex < CORS_PROXIES.length - 1) {
          _playHLS(url, true);
        } else {
          _tryFallbackEmbed(url);
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = src;
      videoEl.onloadedmetadata = () => { _showLoading(false); videoEl.play().catch(() => {}); };
      videoEl.onerror = () => proxyIndex < CORS_PROXIES.length - 1 ? _playHLS(url, true) : _tryFallbackEmbed(url);
    } else {
      _showError('HLS no soportado', 'Tu navegador no soporta streams HLS');
    }
  }

  // ── DASH ──────────────────────────────────────────
  function _playDash(url) {
    videoEl.style.display = 'block';
    if (typeof dashjs === 'undefined') { _showError('Player no disponible', 'Error cargando dash.js'); return; }
    dashInstance = dashjs.MediaPlayer().create();
    dashInstance.initialize(videoEl, url, true);
    dashInstance.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => _showLoading(false));
    dashInstance.on(dashjs.MediaPlayer.events.ERROR, () =>
      _showError('Error de conexión', 'No se pudo cargar el stream DASH'));
  }

  // ── Iframe con bloqueo total de publicidad ────────
  function _playIframe(url) {
    iframeEl.style.display = 'block';
    iframeEl.src = url;

    // 1) Activar escudo permanente en bordes
    _activateAdShield();

    // 2) Interceptar popups ANTES de que el iframe cargue
    _installPopupBlocker();

    // 3) Detectar cuando el iframe roba foco (popup intento)
    _installBlurGuard();

    const t = setTimeout(() => _showLoading(false), 3500);
    iframeEl.onload = () => { clearTimeout(t); _showLoading(false); };
    iframeEl.onerror = () => { clearTimeout(t); _tryFallbackEmbed(url); };
  }

  // ── Ad Shield: capas físicas permanentes en bordes ─
  // Los ads en iframes casi siempre aparecen en:
  //   - Barra superior (overlay sobre el video)
  //   - Barra inferior (botón "saltar" o banner)
  //   - Esquinas (banners flotantes)
  // Ponemos divs encima de esas zonas que bloquean clics
  function _activateAdShield() {
    if (!adShield) return;

    // Limpiar escudos anteriores
    adShield.innerHTML = '';
    adShield.style.display = 'block';
    adShield.style.cssText = `
      display: block !important;
      position: absolute !important;
      inset: 0 !important;
      z-index: 8 !important;        /* encima del iframe(2), debajo del overlay(10) */
      pointer-events: none !important;
      background: transparent !important;
    `;

    // Franjas que bloquean clics en zonas de anuncios
    const zones = [
      // top banner (60px)
      { top:'0',    left:'0',   width:'100%', height:'60px' },
      // bottom banner (70px)
      { top:'auto', bottom:'0', left:'0',   width:'100%', height:'70px' },
      // esquina top-left (botones de share/logo)
      { top:'0',    left:'0',   width:'120px', height:'100%' },
      // esquina top-right (botón X de ad)
      { top:'0',    right:'0',  width:'80px',  height:'80px' },
    ];

    zones.forEach(z => {
      const div = document.createElement('div');
      div.style.cssText = `
        position: absolute;
        top:    ${z.top    || 'auto'};
        bottom: ${z.bottom || 'auto'};
        left:   ${z.left   || 'auto'};
        right:  ${z.right  || 'auto'};
        width:  ${z.width};
        height: ${z.height};
        pointer-events: all;
        background: transparent;
        z-index: 1;
        cursor: default;
      `;
      // Bloquear cualquier evento de clic en estas zonas
      div.addEventListener('click',       e => e.stopPropagation(), true);
      div.addEventListener('mousedown',   e => e.stopPropagation(), true);
      div.addEventListener('touchstart',  e => e.stopPropagation(), true);
      div.addEventListener('touchend',    e => e.stopPropagation(), true);
      adShield.appendChild(div);
    });
  }

  // ── Popup Blocker: sobrescribe window.open ─────────
  // Los iframes heredan el contexto de la página padre.
  // Sobrescribimos open() y los métodos de navegación
  // para que nunca puedan abrir ventanas externas.
  let _origOpen   = null;
  let _origAssign = null;

  function _installPopupBlocker() {
    // Solo instalar una vez
    if (_origOpen) return;

    // Bloquear window.open (popups directos)
    _origOpen = window.open;
    window.open = function(url, target, features) {
      // Permitir solo si lo llama el propio código de la app (no el iframe)
      if (_isTrustedCall()) return _origOpen.call(window, url, target, features);
      console.warn('[AdBlock] window.open bloqueado:', url);
      return null; // devolver null = popup bloqueado
    };

    // Bloquear location.assign y href desde el iframe
    _origAssign = window.location.assign.bind(window.location);
    try {
      Object.defineProperty(window, 'location', {
        get: () => window._safeLocation || location,
        configurable: true
      });
    } catch (e) { /* algunos browsers no permiten redefine de location */ }

    // Escuchar mensajes maliciosos del iframe (postMessage phishing)
    window.addEventListener('message', _onIframeMessage, true);
  }

  function _isTrustedCall() {
    // Detectar si el llamador es el código de la app o el iframe
    try {
      const stack = new Error().stack || '';
      return stack.includes('app.js') || stack.includes('player.js') || stack.includes('channels.js');
    } catch (e) { return false; }
  }

  function _onIframeMessage(e) {
    // Bloquear mensajes de redireccionamiento típicos de ad networks
    const data = typeof e.data === 'string' ? e.data : JSON.stringify(e.data || '');
    const isAd = /doubleclick|googlesyndication|adservice|pagead|popunder|clickunder/i.test(data);
    if (isAd) {
      e.stopImmediatePropagation();
      console.warn('[AdBlock] postMessage de ad bloqueado');
    }
  }

  // ── Blur Guard: detecta cuando el iframe intenta popup ─
  // Cuando un iframe abre un popup, la ventana pierde foco
  // (window blur). Lo detectamos y cerramos el popup inmediatamente.
  let _blurGuardActive = false;

  function _installBlurGuard() {
    if (_blurGuardActive) return;
    _blurGuardActive = true;

    window.addEventListener('blur', _onWindowBlur, true);
  }

  function _onWindowBlur() {
    // Pequeño delay para que el popup se abra antes de cerrarlo
    setTimeout(() => {
      try {
        // Forzar foco de vuelta a nuestra ventana
        window.focus();
      } catch (e) {}
    }, 0);
  }

  // ── Cleanup del bloqueador al salir del player ─────
  function _removeAdBlockers() {
    // Restaurar window.open original
    if (_origOpen) {
      window.open = _origOpen;
      _origOpen   = null;
    }
    window.removeEventListener('message', _onIframeMessage, true);
    window.removeEventListener('blur',    _onWindowBlur,    true);
    _blurGuardActive = false;

    if (adShield) {
      adShield.innerHTML   = '';
      adShield.style.display = 'none';
    }
  }

  // ── Direct MP4/etc ────────────────────────────────
  function _playDirect(url) {
    videoEl.style.display = 'block';
    videoEl.src = url;
    videoEl.play()
      .then(() => _showLoading(false))
      .catch(() => _showError('Sin señal', 'No se pudo reproducir el canal'));
  }

  // ── Fallback embed cuando HLS falla por CORS ──────
  function _tryFallbackEmbed(url) {
    try {
      const domain = new URL(url).hostname;
      const KNOWN = {
        'venevision':   'https://www.venevision.com/en-vivo',
        'rcntelevision':'https://www.rcntelevision.com/envivo',
        'caracoltv':    'https://caracoltv.com/envivo',
        'espn':         'https://www.espn.com/watch',
        'foxsports':    'https://www.foxsports.com/live',
        'directvsports':'https://www.directvsports.com',
      };
      const key = Object.keys(KNOWN).find(k => domain.includes(k));
      if (key) { _playIframe(KNOWN[key]); return; }
    } catch (e) {}

    _showError(
      'Canal bloqueado por CORS',
      'Reemplaza la URL .m3u8 por un embed de YouTube o Twitch en config.json'
    );
  }

  // ── Error display ─────────────────────────────────
  function _showError(title, msg) {
    _showLoading(false);
    if (!errorEl) return;
    if (title === false) { errorEl.classList.remove('visible'); return; }

    const tEl = document.getElementById('error-title');
    const mEl = document.getElementById('error-msg');
    if (tEl) tEl.textContent = title || 'Sin señal';
    if (mEl) mEl.textContent = msg   || 'El canal no está disponible en este momento';
    errorEl.classList.add('visible');
  }

  function _showLoading(visible) {
    loadingEl?.classList.toggle('visible', visible);
  }

  // ── Overlay ───────────────────────────────────────
  function showOverlay() {
    overlayEl?.classList.add('visible');
    clearOverlayTimer();
    overlayTimer = setTimeout(() => overlayEl?.classList.remove('visible'), 4000);
  }

  function toggleOverlay() {
    const vis = overlayEl?.classList.contains('visible');
    if (vis) { overlayEl.classList.remove('visible'); clearOverlayTimer(); }
    else showOverlay();
  }

  function clearOverlayTimer() {
    if (overlayTimer) { clearTimeout(overlayTimer); overlayTimer = null; }
  }

  // ── Fullscreen ────────────────────────────────────
  async function toggleFullscreen() {
    const w = document.getElementById('video-wrapper');
    if (!w) return;
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        await (w.requestFullscreen || w.webkitRequestFullscreen).call(w);
        _lockLandscape();
      } else {
        _exitFullscreen();
        _unlockOrientation();
      }
    } catch (e) {}
  }

  function _exitFullscreen() {
    try {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    } catch (e) {}
  }

  function _lockLandscape() {
    if (/Android|iPhone|iPad/i.test(navigator.userAgent))
      screen.orientation?.lock('landscape').catch(() => {});
  }

  function _unlockOrientation() {
    screen.orientation?.unlock?.();
  }

  return { mount, play, stop, showOverlay };
})();

window.PlayerModule = PlayerModule;
