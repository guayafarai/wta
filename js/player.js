const Player = (() => {
    let lastUrl = '';
    let lastName = '';
    let lastId = '';
    let hls = null;
    let dash = null;

    /**
     * Limpia el contenedor del reproductor y destruye instancias previas
     * para evitar fugas de memoria o superposición de audio.
     */
    const _reset = () => {
        if (hls) {
            hls.destroy();
            hls = null;
        }
        if (dash) {
            dash.reset();
            dash = null;
        }
        
        const container = document.getElementById('player-container');
        if (container) {
            // Reestablecemos el HTML base con una etiqueta de video limpia
            container.innerHTML = '<video id="main-video" controls playsinline></video>';
        }
    };

    /**
     * Función principal para reproducir un canal.
     * @param {string} url - URL del stream o iframe.
     * @param {string} name - Nombre del canal para mostrar en la UI.
     * @param {string} id - ID único del canal.
     */
    const play = (url, name, id) => {
        if (!url) return;
        
        lastUrl = url;
        lastName = name || lastName;
        lastId = id || lastId;

        // Actualizar nombres en la interfaz
        const channelNameEl = document.getElementById('current-channel-name');
        const sidebarNameEl = document.getElementById('sidebar-channel-name');
        if (channelNameEl) channelNameEl.textContent = lastName;
        if (sidebarNameEl) sidebarNameEl.textContent = lastName;

        // --- SOLUCIÓN PARA ERROR DE CORS ---
        // Si es un archivo .m3u8 o .mpd, usamos el proxy AllOrigins para saltar el bloqueo
        const isStreamFile = url.toLowerCase().includes('.m3u8') || url.toLowerCase().includes('.mpd');
        let finalUrl = url;

        if (isStreamFile && !url.includes('api.allorigins.win')) {
            finalUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        }
        // ------------------------------------

        _reset();

        // Determinar el método de reproducción según la extensión o dominio
        if (finalUrl.includes('.m3u8')) {
            _playHLS(finalUrl);
        } else if (finalUrl.includes('.mpd')) {
            _playDASH(finalUrl);
        } else if (finalUrl.includes('youtube.com') || finalUrl.includes('youtu.be')) {
            _playYoutube(finalUrl);
        } else {
            // Si no es un archivo directo, se carga como Iframe (ej. Twitch, reproductores externos)
            _playIframe(finalUrl);
        }
    };

    /**
     * Reproducción de HLS (.m3u8) usando hls.js
     */
    const _playHLS = (url) => {
        const video = document.getElementById('main-video');
        
        if (Hls.isSupported()) {
            hls = new Hls({
                xhrSetup: xhr => {
                    // Evita problemas de autenticación cruzada con el proxy
                    xhr.withCredentials = false;
                }
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(e => console.log("Autoplay bloqueado:", e));
            });
            
            // Manejo básico de errores de red
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.error("Error fatal en HLS:", data.type);
                }
            });
        } 
        // Soporte nativo para Safari/iOS
        else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            video.addEventListener('loadedmetadata', () => {
                video.play().catch(e => console.log("Autoplay bloqueado:", e));
            });
        }
    };

    /**
     * Reproducción de DASH (.mpd) usando dash.js
     */
    const _playDASH = (url) => {
        const video = document.getElementById('main-video');
        dash = dashjs.MediaPlayer().create();
        dash.initialize(video, url, true);
    };

    /**
     * Formatea links de YouTube para que funcionen en el reproductor
     */
    const _playYoutube = (url) => {
        let videoId = '';
        if (url.includes('v=')) {
            videoId = url.split('v=')[1].split('&')[0];
        } else {
            videoId = url.split('/').pop();
        }
        _playIframe(`https://www.youtube.com/embed/${videoId}?autoplay=1`);
    };

    /**
     * Carga de contenido externo mediante iframes
     */
    const _playIframe = (url) => {
        const container = document.getElementById('player-container');
        if (container) {
            container.innerHTML = `
                <iframe 
                    src="${url}" 
                    frameborder="0" 
                    allowfullscreen 
                    allow="autoplay; encrypted-media"
                    style="width:100%; height:100%; background:#000;">
                </iframe>`;
        }
    };

    /**
     * Recarga el canal actual (útil para errores de conexión)
     */
    const refresh = () => {
        if (lastUrl) play(lastUrl, lastName, lastId);
    };

    return { play, refresh };
})();

export default Player;
