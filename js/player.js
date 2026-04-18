const PlayerModule = (() => {
  let videoEl, iframeEl, overlayEl, errorEl, loadingEl, channelNameEl;
  let hlsInstance = null, dashInstance = null, lastUrl = '', lastId = '', overlayTimer = null, mounted = false;

  function mount() {
    if (mounted) return;
    mounted = true;
    
    videoEl = document.getElementById('video-player');
    iframeEl = document.getElementById('iframe-player');
    overlayEl = document.getElementById('player-overlay');
    errorEl = document.getElementById('stream-error');
    loadingEl = document.getElementById('stream-loading');
    channelNameEl = document.getElementById('player-channel-name');

    document.getElementById('btn-back-player')?.addEventListener('click', () => { stop(); Router.navigate('/'); });
    document.getElementById('btn-fullscreen')?.addEventListener('click', toggleFullscreen);
    document.getElementById('btn-retry-stream')?.addEventListener('click', () => play(lastUrl, '', lastId));
    document.getElementById('video-wrapper')?.addEventListener('click', toggleOverlay);
  }

  function play(url, name, id) {
    if (!url) return;
    lastUrl = url; lastId = id;
    if (name && channelNameEl) channelNameEl.textContent = name;

    _reset();
    _showLoading(true);

    // SOLUCIÓN CORS: Solo aplica a archivos de video (.m3u8, .mpd)
    let finalUrl = url;
    if ((url.includes('.m3u8') || url.includes('.mpd')) && !url.includes('workers.dev')) {
      finalUrl = `https://playcast-proxy.elblogdevictorlam.workers.dev/?url=${encodeURIComponent(url)}`;
    }

    const isIframe = /youtube\.com|youtu\.be|facebook\.com|twitch\.tv|\/embed\//i.test(finalUrl);

    if (isIframe) {
      _playIframe(finalUrl);
    } else if (finalUrl.includes('.mpd')) {
      _playDash(finalUrl);
    } else {
      _playHLS(finalUrl);
    }
    showOverlay();
    
    // Actualiza la lista de recomendados sin recargar la página
    if (window.ChannelsModule) {
      const suggested = ChannelsModule.getSuggested(id || name);
      const list = document.getElementById('suggested-list');
      if (list) {
        list.innerHTML = '';
        suggested.forEach(ch => list.appendChild(ChannelsModule.createCard(ch, true)));
      }
    }
  }

  function _playHLS(url) {
    videoEl.style.display = 'block';
    if (Hls.isSupported()) {
      hlsInstance = new Hls({ xhrSetup: xhr => { xhr.withCredentials = false; } });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoEl);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => { _showLoading(false); videoEl.play().catch(() => {}); });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = url;
      videoEl.addEventListener('loadedmetadata', () => { _showLoading(false); videoEl.play(); });
    }
  }

  function _playIframe(url) {
    iframeEl.style.display = 'block';
    iframeEl.src = url;
    setTimeout(() => _showLoading(false), 2000);
  }

  function _reset() {
    if (hlsInstance) hlsInstance.destroy();
    if (dashInstance) dashInstance.reset();
    if (videoEl) { videoEl.pause(); videoEl.src = ""; videoEl.style.display = 'none'; }
    if (iframeEl) { iframeEl.src = ""; iframeEl.style.display = 'none'; }
    _showError(false);
  }

  function stop() { _reset(); }
  function _showLoading(v) { loadingEl?.classList.toggle('visible', v); }
  function _showError(v) { errorEl?.classList.toggle('visible', !!v); }
  
  function showOverlay() {
    overlayEl?.classList.add('visible');
    if (overlayTimer) clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => overlayEl?.classList.remove('visible'), 4000);
  }

  function toggleOverlay() { overlayEl?.classList.contains('visible') ? overlayEl.classList.remove('visible') : showOverlay(); }

  async function toggleFullscreen() {
    const w = document.getElementById('video-wrapper');
    if (!document.fullscreenElement) await w.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  }

  return { mount, play, stop };
})();

window.PlayerModule = PlayerModule;
