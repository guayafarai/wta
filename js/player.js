/* ═══════════════════════════════════════════════════
   PlayCast PRO — Player Module
   
   Handles: HLS, DASH, iframe, error handling,
   fullscreen, landscape lock, overlay controls.
   ═══════════════════════════════════════════════════ */

const PlayerModule = (() => {
  // ── DOM refs ──────────────────────────────────────
  let videoEl, iframeEl, overlayEl, errorEl, loadingEl;
  let channelNameEl, backBtn, fullscreenBtn;

  // ── State ─────────────────────────────────────────
  let hlsInstance    = null;
  let dashInstance   = null;
  let lastUrl        = '';
  let lastName       = '';
  let overlayTimer   = null;
  let mounted        = false;

  // ── Mount ─────────────────────────────────────────
  function mount() {
    if (mounted) return;
    mounted = true;

    videoEl       = document.getElementById('video-player');
    iframeEl      = document.getElementById('iframe-player');
    overlayEl     = document.getElementById('player-overlay');
    errorEl       = document.getElementById('stream-error');
    loadingEl     = document.getElementById('stream-loading');
    channelNameEl = document.getElementById('player-channel-name');
    backBtn       = document.getElementById('btn-back-player');
    fullscreenBtn = document.getElementById('btn-fullscreen');

    // Back button → Router
    backBtn?.addEventListener('click', () => {
      stop();
      Router.navigate('/');
    });

    // Fullscreen toggle
    fullscreenBtn?.addEventListener('click', toggleFullscreen);

    // Retry button
    document.getElementById('btn-retry-stream')?.addEventListener('click', () => {
      play(lastUrl, lastName);
    });

    // Tap video area = toggle overlay
    document.getElementById('video-wrapper')?.addEventListener('click', toggleOverlay);

    // Keyboard (desktop debugging)
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { stop(); Router.navigate('/'); }
    });
  }

  // ── Play a stream ─────────────────────────────────
  function play(url, name) {
    if (!url) { showError('URL no disponible'); return; }

    lastUrl  = url;
    lastName = name || 'En vivo';
    proxyIndex = 0; // reset proxy en cada nueva reproducción

    if (channelNameEl) channelNameEl.textContent = lastName;

    _reset();
    showLoading(true);
    showError(false);

    // Detectar tipo de fuente
    const isIframe = /youtube\.com|youtu\.be|facebook\.com|twitch\.tv|dailymotion\.com|\/embed\/|\.html$/i.test(url);
    const isDash   = /\.mpd($|\?)/i.test(url);
    const isHLS    = /\.m3u8($|\?)/i.test(url);
    const isRTMP   = /^rtmp/i.test(url);

    if (isRTMP) {
      showError('RTMP no soportado en navegadores. Usa un URL .m3u8 o .mpd');
      return;
    }

    if (isIframe) {
      _playIframe(url);
    } else if (isDash) {
      _playDash(url);
    } else if (isHLS) {
      _playHLS(url, false);
    } else {
      _playDirect(url);
    }

    showOverlay();
  }

  // ── Stop / cleanup ────────────────────────────────
  function stop() {
    _reset();
    _exitFullscreen();
    _unlockOrientation();
  }

  // ── Internal: reset all players ──────────────────
  function _reset() {
    if (hlsInstance)   { hlsInstance.destroy();  hlsInstance  = null; }
    if (dashInstance)  { dashInstance.reset();   dashInstance = null; }

    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
      videoEl.style.display = 'none';
    }
    if (iframeEl) {
      iframeEl.src = '';
      iframeEl.style.display = 'none';
    }
    clearOverlayTimer();
  }

  // ── CORS Proxy list ──────────────────────────────
  // Probados en orden. Si todos fallan → intento iframe (último recurso).
  // Para agregar tu propio proxy: url => `https://tu-proxy.com/?url=${encodeURIComponent(url)}`
  const CORS_PROXIES = [
    null,  // 0: directo (sin proxy)
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    url => `https://proxy.cors.sh/${url}`,
    url => `https://thingproxy.freeboard.io/fetch/${url}`,
  ];
  let proxyIndex = 0;

  function _applyProxy(url) {
    if (proxyIndex === 0) return url;
    const fn = CORS_PROXIES[proxyIndex];
    return fn ? fn(url) : url;
  }

  // ── Playback methods ──────────────────────────────
  function _playHLS(url, retryAsProxy = false) {
    videoEl.style.display = 'block';

    if (retryAsProxy) {
      proxyIndex = Math.min(proxyIndex + 1, CORS_PROXIES.length - 1);
    } else {
      proxyIndex = 0;
    }

    const srcUrl = _applyProxy(url);
    if (proxyIndex > 0) {
      console.warn(`[Player] Intentando proxy ${proxyIndex}: ${srcUrl}`);
    }

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }

      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        xhrSetup(xhr) { xhr.withCredentials = false; }
      });
      hlsInstance.loadSource(srcUrl);
      hlsInstance.attachMedia(videoEl);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        showLoading(false);
        videoEl.play().catch(() => {});
      });
      hlsInstance.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;

        if (proxyIndex < CORS_PROXIES.length - 1) {
          // Quedan proxies por intentar
          _playHLS(url, true);
        } else {
          // Todos los proxies HLS fallaron — intentar iframe como último recurso
          console.warn('[Player] Todos los proxies HLS fallaron, intentando iframe embed...');
          _tryIframeEmbed(url);
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari/iOS)
      videoEl.src = srcUrl;
      videoEl.addEventListener('loadedmetadata', () => {
        showLoading(false);
        videoEl.play().catch(() => {});
      }, { once: true });
      videoEl.addEventListener('error', () => {
        if (proxyIndex < CORS_PROXIES.length - 1) {
          _playHLS(url, true);
        } else {
          _tryIframeEmbed(url);
        }
      }, { once: true });
    } else {
      showError('HLS no soportado en este dispositivo');
    }
  }

  // ── Iframe fallback: intenta cargar el m3u8 en un iframe embed ──
  // Útil cuando el propio sitio de origen tiene un player embebible.
  // Si la URL tiene un dominio conocido con player web, redirige allí.
  function _tryIframeEmbed(url) {
    try {
      const domain = new URL(url).hostname;

      // Mapa de CDNs conocidos → su player embed público
      const knownEmbeds = {
        'venevision': 'https://www.venevision.com/en-vivo',
        'rcntelevision': 'https://www.rcntelevision.com/envivo',
        'canalrcn': 'https://www.canalrcn.com/envivo',
        'caracoltv': 'https://caracoltv.com/envivo',
        'rpp': 'https://rpp.pe/envivo',
      };

      const matchKey = Object.keys(knownEmbeds).find(k => domain.includes(k));
      if (matchKey) {
        console.warn(`[Player] Redirigiendo a embed conocido: ${knownEmbeds[matchKey]}`);
        _playIframe(knownEmbeds[matchKey]);
        return;
      }
    } catch (e) {}

    // No hay embed conocido — mostrar error con instrucciones claras
    showError('CORS bloqueado — usa un embed o URL pública');
  }

  function _playDash(url) {
    videoEl.style.display = 'block';

    if (typeof dashjs === 'undefined') {
      showError('DASH player no disponible');
      return;
    }

    dashInstance = dashjs.MediaPlayer().create();
    dashInstance.initialize(videoEl, url, true);
    dashInstance.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => showLoading(false));
    dashInstance.on(dashjs.MediaPlayer.events.ERROR, () => showError('Error de conexión DASH'));
  }

  function _playIframe(url) {
    iframeEl.style.display = 'block';
    iframeEl.src = url;

    // Ocultar spinner después de 3s (iframes no disparan eventos fiables)
    const t = setTimeout(() => showLoading(false), 3000);

    // Si el iframe dispara error (raro pero posible en algunos browsers)
    iframeEl.onerror = () => {
      clearTimeout(t);
      showError('El sitio no permite ser embebido');
    };

    // Detectar si quedó en blanco (X-Frame-Options) después de carga
    iframeEl.onload = () => {
      clearTimeout(t);
      showLoading(false);
      try {
        // Si podemos leer contentDocument estamos en same-origin — OK
        // Si lanza SecurityError → cross-origin pero cargó (probablemente bien)
        void iframeEl.contentDocument;
      } catch (e) {
        // Cross-origin → normal, probablemente cargó correctamente
        showLoading(false);
      }
    };
  }

  function _playDirect(url) {
    videoEl.style.display = 'block';
    videoEl.src = url;
    videoEl.play()
      .then(() => showLoading(false))
      .catch(() => showError('No se pudo reproducir el canal'));
  }

  // ── Overlay controls ─────────────────────────────
  function showOverlay() {
    overlayEl?.classList.add('visible');
    clearOverlayTimer();
    overlayTimer = setTimeout(() => overlayEl?.classList.remove('visible'), 4000);
  }

  function toggleOverlay() {
    const isVisible = overlayEl?.classList.contains('visible');
    if (isVisible) {
      overlayEl.classList.remove('visible');
      clearOverlayTimer();
    } else {
      showOverlay();
    }
  }

  function clearOverlayTimer() {
    if (overlayTimer) { clearTimeout(overlayTimer); overlayTimer = null; }
  }

  // ── Error / Loading states ────────────────────────
  function showError(message) {
    showLoading(false);
    if (!errorEl) return;
    if (message) {
      const p = errorEl.querySelector('p');
      if (p) p.textContent = message;
      errorEl.classList.add('visible');
    } else {
      errorEl.classList.remove('visible');
    }
  }

  function showLoading(visible) {
    loadingEl?.classList.toggle('visible', visible);
  }

  // ── Fullscreen ────────────────────────────────────
  async function toggleFullscreen() {
    const wrapper = document.getElementById('video-wrapper');
    if (!wrapper) return;

    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (wrapper.requestFullscreen)         await wrapper.requestFullscreen();
        else if (wrapper.webkitRequestFullscreen) wrapper.webkitRequestFullscreen();
        _lockLandscape();
      } else {
        _exitFullscreen();
        _unlockOrientation();
      }
    } catch (e) {
      console.warn('[Player] Fullscreen error:', e);
    }
  }

  function _exitFullscreen() {
    try {
      if (document.fullscreenElement)        document.exitFullscreen?.();
      else if (document.webkitFullscreenElement) document.webkitExitFullscreen?.();
    } catch (e) {}
  }

  function _lockLandscape() {
    try {
      if (screen.orientation?.lock && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) {}
  }

  function _unlockOrientation() {
    try {
      screen.orientation?.unlock?.();
    } catch (e) {}
  }

  // ── Public API ────────────────────────────────────
  return { mount, play, stop, showOverlay };
})();

// Expose globally so Router can call stop() on back navigation
window.PlayerModule = PlayerModule;
