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

    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
      videoEl.style.display = 'none';
    }
    if (iframeEl) {
      iframeEl.src         = '';
      iframeEl.style.display = 'none';
    }
    if (adShield) adShield.style.display = 'none';
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

  // ── Iframe ────────────────────────────────────────
  function _playIframe(url) {
    iframeEl.style.display = 'block';
    // Mostrar escudo anti-ads sobre el iframe
    if (adShield) {
      adShield.style.display = 'block';
      // Ocultar el escudo tras 5s para no bloquear los controles del player embebido
      setTimeout(() => { if (adShield) adShield.style.display = 'none'; }, 5000);
    }
    iframeEl.src = url;

    const t = setTimeout(() => _showLoading(false), 3500);
    iframeEl.onload = () => { clearTimeout(t); _showLoading(false); };
    iframeEl.onerror = () => { clearTimeout(t); _tryFallbackEmbed(url); };
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
