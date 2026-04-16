const list = document.getElementById('channel-list');
const video = document.getElementById('video');
const container = document.getElementById('videoContainer');
const searchInput = document.getElementById('channelSearch');
let hls;
let allChannels = [];

// Cargar canales
fetch('config.json')
    .then(res => res.json())
    .then(data => {
        document.getElementById('footer-text').innerText = data.footer_text;
        allChannels = data.channels;
        renderChannels(allChannels);
    });

function renderChannels(channels) {
    list.innerHTML = ''; // Limpiar lista
    
    if (channels.length === 0) {
        list.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:50px; color:#aaa;">No se encontraron canales</td></tr>';
        return;
    }

    // Etiqueta de sección
    const tagRow = document.createElement('tr');
    tagRow.className = 'cat-tag';
    tagRow.innerHTML = '<td colspan="3" style="padding: 10px 0;">Canales Disponibles</td>';
    list.appendChild(tagRow);

    channels.forEach(ch => {
        const row = document.createElement('tr');
        const isVip = ch.is_vip;
        row.className = isVip ? 'channel-row vip-row' : 'channel-row';
        
        row.innerHTML = `
            <td style="width:50px; text-align:center; font-size: 20px;">${isVip ? '⭐' : '📺'}</td>
            <td style="padding: 20px 10px;">
                <div style="font-weight: 700; color: ${isVip ? 'var(--primary)' : 'var(--text-dark)'}; cursor:pointer;" 
                     onclick="${isVip ? `window.open('${ch.url}', '_blank')` : `playStream('${ch.url}')`}">
                    ${ch.name}
                </div>
            </td>
            <td style="text-align:right; padding-right: 15px;">
                <button class="btn-play ${isVip ? 'btn-vip' : ''}" 
                        onclick="${isVip ? `window.open('${ch.url}', '_blank')` : `playStream('${ch.url}')`}">
                    ${isVip ? 'PREMIUM' : 'VER'}
                </button>
            </td>
        `;
        list.appendChild(row);
    });
}

// Buscador con delay mínimo para rendimiento
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
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
    } else {
        video.src = url;
        video.play();
    }
}

function stopStream() {
    document.body.classList.remove('playing-now');
    container.style.display = 'none';
    video.pause();
    video.src = "";
    if (hls) hls.destroy();
}