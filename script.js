const list = document.getElementById('channel-list');
const video = document.getElementById('video');
const container = document.getElementById('videoContainer');
const searchInput = document.getElementById('channelSearch');
let hls;
let allChannels = [];

// Cargar configuración
fetch('config.json')
    .then(res => res.json())
    .then(data => {
        allChannels = data.channels;
        renderChannels(allChannels);
    })
    .catch(() => {
        list.innerHTML = '<div style="text-align:center; padding:20px;">Error al cargar canales</div>';
    });

function renderChannels(channels) {
    list.innerHTML = '';
    
    if (channels.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:40px; color:#999;">No se encontraron resultados</div>';
        return;
    }

    channels.forEach(ch => {
        const isVip = ch.is_vip;
        const card = document.createElement('div');
        card.className = 'channel-card';
        if(isVip) card.style.borderLeft = '4px solid var(--primary)';

        card.innerHTML = `
            <div class="channel-info">
                <span>${isVip ? '⭐' : '📺'}</span>
                <span class="channel-name">${ch.name}</span>
            </div>
            <button class="btn-play" 
                style="background:${isVip ? 'var(--primary)' : '#2b2d42'}; color:#fff;" 
                onclick="${isVip ? `window.open('${ch.url}', '_blank')` : `playStream('${ch.url}')`}">
                ${isVip ? 'PREMIUM' : 'VER'}
            </button>
        `;
        list.appendChild(card);
    });
}

// Escuchar búsqueda
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allChannels.filter(ch => ch.name.toLowerCase().includes(term));
    renderChannels(filtered);
});

function playStream(url) {
    if(!url) return;
    document.body.classList.add('playing-now');
    container.style.display = 'flex';
    
    if (Hls.isSupported()) {
        if (hls) hls.destroy();
        hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.play().catch(() => {});
    }
}

function stopStream() {
    document.body.classList.remove('playing-now');
    container.style.display = 'none';
    video.pause();
    video.src = "";
    if (hls) hls.destroy();
}