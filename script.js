const list = document.getElementById('channel-list');
const video = document.getElementById('video');
const container = document.getElementById('videoContainer');
const embedPlayer = document.getElementById('embedPlayer');
const searchInput = document.getElementById('channelSearch');
const playerTitle = document.getElementById('playerTitle');
const streamError = document.getElementById('streamError');

let hls;
let shakaPlayer;
let allChannels = [];
let lastStream = { url: '', name: '', type: '' };

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
    if (!url) return;
    lastStream = { url, name, type };
    playerTitle.textContent = name;
    container.style.display = 'flex';
    streamError.classList.remove('visible');

    // PANTALLA COMPLETA Y ROTACIÓN
    try {
        if (container.requestFullscreen) await container.requestFullscreen();
        if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock('landscape').catch(() => {});
        }
    } catch (e) { console.log("Fullscreen no soportado"); }

    // Limpiar reproductores anteriores
    video.style.display = 'none';
    embedPlayer.style.display = 'none';
    embedPlayer.src = '';
    if (hls) hls.destroy();
    if (shakaPlayer) await shakaPlayer.destroy();

    if (type === 'embed') {
        embedPlayer.style.display = 'block';
        embedPlayer.src = url;
    } else {
        video.style.display = 'block';
        if (type === 'dash' || url.includes('.mpd')) {
            shakaPlayer = new shaka.Player(video);
            shakaPlayer.addEventListener('error', () => streamError.classList.add('visible'));
            await shakaPlayer.load(url);
            video.play();
        } else {
            if (Hls.isSupported()) {
                hls = new Hls();
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
                hls.on(Hls.Events.ERROR, () => streamError.classList.add('visible'));
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.play();
            }
        }
    }
}

function stopStream() {
    container.style.display = 'none';
    video.pause();
    embedPlayer.src = '';
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
}

function renderChannels(channels) {
    list.innerHTML = '';
    channels.forEach(ch => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        card.innerHTML = `
            <div class="channel-info">
                <span class="channel-name">${ch.name}</span>
                <small style="color:gray; display:block;">${ch.category}</small>
            </div>
            <button class="btn-play" onclick="playStream('${ch.url}', '${ch.name}', '${ch.type || 'hls'}')">VER</button>
        `;
        list.appendChild(card);
    });
}

function renderCategories(cats) {
    const catContainer = document.getElementById('categoriesContainer');
    catContainer.innerHTML = '';
    cats.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'cat-btn';
        btn.textContent = cat;
        btn.onclick = () => {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filtered = cat === 'Todos' ? allChannels : allChannels.filter(c => c.category === cat);
            renderChannels(filtered);
        };
        catContainer.appendChild(btn);
    });
}