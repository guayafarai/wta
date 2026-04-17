const list = document.getElementById('channel-list');
const video = document.getElementById('video');
const embedPlayer = document.getElementById('embedPlayer');
const container = document.getElementById('videoContainer');
const searchInput = document.getElementById('channelSearch');
const playerTitle = document.getElementById('playerTitle');
const streamError = document.getElementById('streamError');

let hls;
let shakaInstance;
let allChannels = [];
let lastStream = { url: '', name: '', type: '' };

// Configuración inicial de Shaka
shaka.polyfill.installAll();

fetch('config.json')
    .then(r => r.json())
    .then(data => {
        allChannels = data.channels || [];
        document.getElementById('footerText').textContent = data.footer_text;
        renderCategories(data.categories);
        renderChannels(allChannels);
    });

async function playStream(url, name, type) {
    lastStream = { url, name, type };
    playerTitle.textContent = name;
    container.style.display = 'flex';
    streamError.classList.remove('visible');

    // --- PANTALLA COMPLETA Y ROTACIÓN ---
    try {
        if (container.requestFullscreen) {
            await container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
            await container.webkitRequestFullscreen();
        }
        
        if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock('landscape').catch(() => {});
        }
    } catch (e) { console.warn("Fullscreen no disponible"); }

    // Limpiar reproductores previos
    video.style.display = 'none';
    embedPlayer.style.display = 'none';
    embedPlayer.src = '';
    if (hls) hls.destroy();
    if (shakaInstance) await shakaInstance.destroy();

    if (type === 'embed') {
        embedPlayer.style.display = 'block';
        embedPlayer.src = url;
    } else {
        video.style.display = 'block';
        if (type === 'dash' || url.includes('.mpd')) {
            shakaInstance = new shaka.Player(video);
            shakaInstance.addEventListener('error', () => showStreamError());
            await shakaInstance.load(url);
            video.play();
        } else {
            if (Hls.isSupported()) {
                hls = new Hls();
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.play();
            }
        }
    }
}

async function stopStream() {
    container.style.display = 'none';
    video.pause();
    video.src = '';
    embedPlayer.src = '';

    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(() => {});
    
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();

    if (hls) hls.destroy();
    if (shakaInstance) await shakaInstance.destroy();
}

function showStreamError() {
    streamError.classList.add('visible');
}

function retryStream() {
    playStream(lastStream.url, lastStream.name, lastStream.type);
}

// --- FUNCIONES DE RENDERIZADO (Simplificadas) ---
function renderChannels(channels) {
    list.innerHTML = '';
    channels.forEach(ch => {
        const card = document.createElement('div');
        card.className = `channel-card ${ch.is_vip ? 'is-vip' : ''}`;
        card.innerHTML = `
            <div class="channel-info">
                <span class="channel-name">${ch.name}</span>
                <span class="channel-category">${ch.category}</span>
            </div>
            <button class="btn-play" onclick="playStream('${ch.url}', '${ch.name}', '${ch.type}')">VER</button>
        `;
        list.appendChild(card);
    });
}
// (Agrega aquí tus funciones de renderCategories, toggleView y búsqueda del script original)