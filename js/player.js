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

    if (channelNameEl) channelNameEl.textContent = lastName;

    _reset();
    showLoading(true);
    showError(false);

    const isIframe = /youtube\.com|youtu\.be|facebook\.com|\/embed\/|\.html$/i.test(url);
    const isDash   = /\.mpd$/i.test(url);
    const isHLS    = /\.m3u8/i.test(url);

    if (isIframe) {
      _playIframe(url);
    } else if (isDash) {
      _playDash(url);
    } else if (isHLS) {
      _playHLS(url);
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

  // ── Playback methods ──────────────────────────────
  function _playHLS(url) {
    videoEl.style.display = 'block';

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30
      });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoEl);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        showLoading(false);
        videoEl.play().catch(() => {});
      });
      hlsInstance.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) showError('Error de conexión HLS');
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari/iOS)
      videoEl.src = url;
      videoEl.addEventListener('loadedmetadata', () => {
        showLoading(false);
        videoEl.play().catch(() => {});
      }, { once: true });
      videoEl.addEventListener('error', () => showError('Error al cargar el stream'), { once: true });
    } else {
      showError('HLS no soportado en este dispositivo');
    }
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
    // Iframes don't fire reliable load events; just hide spinner after timeout
    setTimeout(() => showLoading(false), 2000);
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
