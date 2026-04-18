/* ═══════════════════════════════════════════════════
   PlayCast PRO — Player Module
   Soporta: HLS (.m3u8), DASH (.mpd), iframe, MP4
   CORREGIDO: Salto de CORS con Proxy de Cloudflare
   ═══════════════════════════════════════════════════ */

const PlayerModule = (() => {
  let videoEl, iframeEl, overlayEl, errorEl, loadingEl;
  let channelNameEl, sidebarNameEl, backBtn, fullscreenBtn;

  let hlsInstance  = null;
  let dashInstance = null;
  let lastUrl      = '';
  let lastName     = '';
  let lastId       = '';
  let overlayTimer = null;
  let mounted      = false;

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
    
    document.getElementById('btn-retry-stream')?.addEventListener('click', () => {
      play(lastUrl, lastName, lastId);
    });

    document.getElementById('video-wrapper')?.addEventListener('click', toggleOverlay);
  }

  function play(url, name, id) {
    if (!url) return;
    lastUrl = url; lastName = name || 'En vivo'; lastId = id || '';

    if (channelNameEl) channelNameEl.textContent = lastName;
    _reset();
    _showLoading(true);
    _showError(false);

    // ─── LÓGICA DE PROXY (SOLUCIÓN CORS) ───
    const isStreamFile = /\.m3u8($|\?)/i.test(url) || /\.mpd($|\?)/i.test(url);
    let finalUrl = url;

    if (isStreamFile && !url.includes('workers.dev')) {
      // Usando tu Worker de Cloudflare
      finalUrl = `https://playcast-proxy.elblogdevictorlam.workers.dev/?url=${encodeURIComponent(url)}`;
    }

    const isIframe = /youtube\.com|youtu\.be|facebook\.com|twitch\.tv|\/embed\//i.test(finalUrl);
    
    if (isIframe) {
      _playIframe(finalUrl);
    } else if (finalUrl.includes('.mpd')) {
      _playDash(finalUrl);
    } else if (finalUrl.includes('.m3u8')) {
      _playHLS(finalUrl);
    } else {
      _playDirect(finalUrl);
    }

    showOverlay();
  }

  function _playHLS(url) {
    videoEl.style.display = 'block';
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      hlsInstance = new Hls({ xhrSetup: xhr => { xhr.withCredentials = false; } });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoEl);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        _showLoading(false);
        videoEl.play().catch(() => {});
      });
      hlsInstance.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) _showError('Sin señal', 'Error de red o CORS'); });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = url;
      videoEl.addEventListener('loadedmetadata', () => { 
        _showLoading(false); 
        videoEl.play().catch(() => {}); 
      }, { once: true });
    }
  }

  function _reset() {
    hlsInstance?.destroy(); hlsInstance = null;
    dashInstance?.reset(); dashInstance = null;
    if (videoEl) { 
      videoEl.pause(); videoEl.removeAttribute('src'); 
      videoEl.load(); videoEl.style.display = 'none'; 
    }
    if (iframeEl) { iframeEl.src = ''; iframeEl.style.display = 'none'; }
    clearOverlayTimer();
  }

  function stop() { _reset(); }

  function _playDash(url) {
    videoEl.style.display = 'block';
    dashInstance = dashjs.MediaPlayer().create();
    dashInstance.initialize(videoEl, url, true);
    dashInstance.on('streamInitialized', () => _showLoading(false));
  }

  function _playIframe(url) {
    iframeEl.style.display = 'block';
    iframeEl.src = url;
    setTimeout(() => _showLoading(false), 3000);
  }

  function _playDirect(url) {
    videoEl.style.display = 'block';
    videoEl.src = url;
    videoEl.play().then(() => _showLoading(false)).catch(() => {});
  }

  function _showError(t, m) {
    _showLoading(false);
    if (!errorEl) return;
    if (t === false) { errorEl.classList.remove('visible'); return; }
    document.getElementById('error-title').textContent = t;
    document.getElementById('error-msg').textContent = m;
    errorEl.classList.add('visible');
  }

  function _showLoading(v) { loadingEl?.classList.toggle('visible', v); }
  function showOverlay() { overlayEl?.classList.add('visible'); clearOverlayTimer(); overlayTimer = setTimeout(() => overlayEl?.classList.remove('visible'), 4000); }
  function toggleOverlay() { overlayEl?.classList.contains('visible') ? overlayEl.classList.remove('visible') : showOverlay(); }
  function clearOverlayTimer() { if (overlayTimer) { clearTimeout(overlayTimer); overlayTimer = null; } }
  
  async function toggleFullscreen() {
    const w = document.getElementById('video-wrapper');
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      await (w.requestFullscreen || w.webkitRequestFullscreen).call(w);
    } else {
      document.exitFullscreen();
    }
  }

  return { mount, play, stop, showOverlay };
})();

// Exportación global para que app.js lo reconozca
window.PlayerModule = PlayerModule;
