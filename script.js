const list = document.getElementById('channel-list');
const video = document.getElementById('video');
const container = document.getElementById('videoContainer');
const searchInput = document.getElementById('channelSearch');
let hls;
let allChannels = []; // Guardará la lista completa para filtrar

// Cargar configuración y canales
fetch('config.json')
    .then(res => res.json())
    .then(data => {
        document.getElementById('footer-text').innerText = data.footer_text;
        allChannels = data.channels;
        renderChannels(allChannels); // Carga inicial
    })
    .catch(err => {
        list.innerHTML = '<tr class="cat-tag"><td colspan="3">Error cargando canales</td></tr>';
    });

// Función para mostrar canales en la tabla
function renderChannels(channelsToRender) {
    list.innerHTML = '<tr class="cat-tag"><td colspan="3">Canales de Venezuela</td></tr>';

    if (channelsToRender.length === 0) {
        list.innerHTML += '<tr><td colspan="3" style="text-align:center; padding:20px; color:#999;">No hay resultados</td></tr>';
        return;
    }

    channelsToRender.forEach(ch => {
        const row = document.createElement('tr');
        const isVip = ch.is_vip;
        row.className = isVip ? 'channel-row vip-row' : 'channel-row';
        
        const rPad = isVip ? Math.floor(Math.random() * (70 - 30 + 1)) + 30 : 15;

        row.innerHTML = `
            <td style="width:40px; text-align:center;">${isVip ? '⭐' : '📺'}</td>
            <td style="padding-top:${rPad}px; padding-bottom:${rPad}px;">
                <span class="channel-link" style="${isVip ? 'color:var(--rd-red)' : ''}" 
                    onclick="${isVip ? `window.open('${ch.url}', '_blank')` : `playStream('${ch.url}')`}">
                    ${ch.name}
                </span>
            </td>
            <td style="text-align:right">
                <button class="btn-play ${isVip ? 'btn-vip' : ''}" 
                    onclick="${isVip ? `window.open('${ch.url}', '_blank')` : `playStream('${ch.url}')`}">
                    ${isVip ? 'GO' : 'VER'}
                </button>
            </td>
        `;
        list.appendChild(row);
    });
}

// Lógica del BUSCADOR
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allChannels.filter(ch => 
        ch.name.toLowerCase().includes(term)
    );
    renderChannels(filtered);
});

// Reproductor HLS
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

// Cerrar Reproductor
function stopStream() {
    document.body.classList.remove('playing-now');
    container.style.display = 'none';
    video.pause();
    video.src = "";
    if (hls) hls.destroy();
}