/* ═══════════════════════════════════════════════════
   PlayCast PRO — Player Module
   Soporta: HLS (.m3u8), DASH (.mpd), iframe, MP4
   HTTP y HTTPS sin proxies
   ═══════════════════════════════════════════════════ */

const PlayerModule = (() => {
  let videoEl, iframeEl, overlayEl, errorEl, loadingEl;
  let channelNameEl, sidebarNameEl, backBtn, fullscreenBtn;

  let hlsInstance  = null;
  let dashInstance = null;
  let lastUrl      = '';
  let lastName     = '';
  let lastId       = '';
  let lastReferer  = '';  // Referer del canal para bypass de hotlink
  let overlayTimer = null;
  let mounted      = false;

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
    sidebarNameEl = document.getElementById('sidebar-channel-name');
    backBtn       = document.getElementById('btn-back-player');
    fullscreenBtn = document.getElementById('btn-fullscreen');

    backBtn?.addEventListener('click', () => { stop(); Router.navigate('/'); });
    fullscreenBtn?.addEventListener('click', toggleFullscreen);
    document.getElementById('btn-retry-stream')?.addEventListener('click', () => play(lastUrl, lastName, lastId));
    document.getElementById('video-wrapper')?.addEventListener('click', toggleOverlay);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { stop(); Router.navigate('/'); }
    });
  }

  // ── Play ──────────────────────────────────────────
  function play(url, name, id, referer) {
    if (!url) { _showError('URL no disponible', 'Agrega la URL del canal en su archivo .json'); return; }

    lastUrl     = url;
    lastName    = name    || 'En vivo';
    lastId      = id      || '';
    lastReferer = referer || '';

    if (channelNameEl) channelNameEl.textContent = lastName;
    if (sidebarNameEl) sidebarNameEl.textContent = lastName;

    _reset();
    _showLoading(true);
    _showError(false);

    // ── Proxy fix ─────────────────────────────────
    const PROXY_BASE = 'https://playcast-proxy.elblogdevictorlam.workers.dev';

    let streamUrl = url;
    const needsProxy = url.startsWith('http://') ||
                       (url.startsWith('https://') && /\.m3u8|\.mpd|\.ts/i.test(url));

    if (needsProxy) {
      // Pasar referer del canal si existe (bypass de hotlink protection)
      let proxyUrl = `${PROXY_BASE}?url=${encodeURIComponent(url)}`;
      if (lastReferer) {
        proxyUrl += `&referer=${encodeURIComponent(lastReferer)}`;
      }
      streamUrl = proxyUrl;
    }

    // Detectar tipo por URL original (no por la URL del proxy)
    const isIframe = /youtube\.com|youtu\.be|facebook\.com|twitch\.tv|dailymotion\.com|\/embed\//i.test(url)
                  || /\.html?($|\?)/i.test(url);
    const isDash   = /\.mpd($|\?)/i.test(url);
    const isHLS    = /\.m3u8($|\?)/i.test(url);

    if (/^rtmp/i.test(url)) {
      _showError('RTMP no soportado', 'Usa una URL .m3u8, .mpd o embed de YouTube/Twitch');
      return;
    }

    if      (isIframe) _playIframe(streamUrl);
    else if (isDash)   _playDash(streamUrl);
    else if (isHLS)    _playHLS(streamUrl);
    else               _playDirect(streamUrl);

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

  // ── HLS (.m3u8) — http y https ────────────────────
  function _playHLS(url) {
    videoEl.style.display = 'block';

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      hlsInstance = new Hls({
        enableWorker:    true,
        lowLatencyMode:  true,
        backBufferLength: 30,
        // Permite URLs http:// aunque la página sea https://
        // (el navegador bloquea mixed content; para http puro
        //  sirve desde un WebView Android donde no aplica esa restricción)
        xhrSetup: xhr => { xhr.withCredentials = false; }
      });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoEl);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        _showLoading(false);
        videoEl.play().catch(() => {});
      });
      hlsInstance.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        _showError('Sin señal', 'No se pudo cargar el stream. Verifica la URL en el .json');
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // HLS nativo (Safari / iOS)
      videoEl.src = url;
      videoEl.addEventListener('loadedmetadata', () => {
        _showLoading(false);
        videoEl.play().catch(() => {});
      }, { once: true });
      videoEl.addEventListener('error', () =>
        _showError('Sin señal', 'Error cargando el stream HLS')
      , { once: true });
    } else {
      _showError('HLS no soportado', 'Tu navegador no puede reproducir streams .m3u8');
    }
  }

  // ── DASH (.mpd) ───────────────────────────────────
  function _playDash(url) {
    videoEl.style.display = 'block';
    if (typeof dashjs === 'undefined') {
      _showError('Player no disponible', 'dash.js no cargó correctamente');
      return;
    }
    dashInstance = dashjs.MediaPlayer().create();
    dashInstance.initialize(videoEl, url, true);
    dashInstance.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => _showLoading(false));
    dashInstance.on(dashjs.MediaPlayer.events.ERROR, () =>
      _showError('Sin señal', 'Error cargando el stream DASH'));
  }

  // ── Iframe (YouTube, Twitch, embeds) ─────────────
  // El sandbox en el HTML bloquea popups sin necesitar JS extra
  function _playIframe(url) {
    iframeEl.style.display = 'block';
    iframeEl.src = url;

    const t = setTimeout(() => _showLoading(false), 3500);
    iframeEl.onload  = () => { clearTimeout(t); _showLoading(false); };
    iframeEl.onerror = () => { clearTimeout(t); _showError('Sin señal', 'El embed no pudo cargarse'); };
  }

  // ── Directo (MP4, etc.) ───────────────────────────
  function _playDirect(url) {
    videoEl.style.display = 'block';
    videoEl.src = url;
    videoEl.play()
      .then(() => _showLoading(false))
      .catch(() => _showError('Sin señal', 'No se pudo reproducir el canal'));
  }

  // ── Error / Loading ───────────────────────────────
  function _showError(title, msg) {
    _showLoading(false);
    if (!errorEl) return;
    if (title === false) { errorEl.classList.remove('visible'); return; }
    const tEl = document.getElementById('error-title');
    const mEl = document.getElementById('error-msg');
    if (tEl) tEl.textContent = title || 'Sin señal';
    if (mEl) mEl.textContent = msg   || 'El canal no está disponible';
    errorEl.classList.add('visible');
  }

  function _showLoading(v) { loadingEl?.classList.toggle('visible', v); }

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
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      }
    } catch (e) {}
  }

  function _lockLandscape() {
    if (/Android|iPhone|iPad/i.test(navigator.userAgent))
      screen.orientation?.lock('landscape').catch(() => {});
  }

  function _unlockOrientation() { screen.orientation?.unlock?.(); }

  return { mount, play, stop, showOverlay };
})();

window.PlayerModule = PlayerModule;
