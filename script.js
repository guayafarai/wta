/* ── Estado global original ── */
const list        = document.getElementById('channel-list');
const video       = document.getElementById('video');
const container   = document.getElementById('videoContainer');
const embedPlayer = document.getElementById('embedPlayer'); // Nuevo elemento
const searchInput = document.getElementById('channelSearch');
const clearBtn    = document.getElementById('clearSearch');
const emptyState  = document.getElementById('emptyState');
const catContainer = document.getElementById('categoriesContainer');
const streamError = document.getElementById('streamError');
const playerTitle = document.getElementById('playerTitle');
const footerText  = document.getElementById('footerText');

let hls;
let shakaPlayer; // Nuevo soporte DASH
let allChannels   = [];
let activeCategory = 'Todos';
let currentView   = localStorage.getItem('playcast_view') || 'list';
let favorites     = JSON.parse(localStorage.getItem('playcast_favs') || '[]');
let lastStream = { url: '', name: '', type: '' };

/* ── Inicialización mantenida ── */
shaka.polyfill.installAll(); // Instala polyfills para DASH
applyView(currentView);

fetch('config.json')
    .then(r => r.json())
    .then(data => {
        allChannels = data.channels || [];
        footerText.textContent = data.footer_text || '';
        renderCategories(data.categories || ['Todos']);
        renderChannels(allChannels);
    })
    .catch(() => {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;">Error al cargar canales.</div>';
    });

/* ── Reproductor Multi-formato (Mantenimiento de tu sistema) ── */
async function playStream(url, name, type = 'hls') {
    if (!url) return;
    lastStream = { url, name, type };
    playerTitle.textContent = name || 'En vivo';
    container.style.display = 'flex';
    streamError.classList.remove('visible');

    // Forzar pantalla completa y rotación en móviles
    try {
        if (container.requestFullscreen) await container.requestFullscreen();
        if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock('landscape').catch(() => {});
        }
    } catch (e) { console.warn("Fullscreen no disponible"); }

    // Limpiar estados previos
    video.style.display = 'none';
    embedPlayer.style.display = 'none';
    embedPlayer.src = '';
    if (hls) hls.destroy();
    if (shakaPlayer) await shakaPlayer.destroy();

    // 1. Detección automática de tipo Embed (YouTube/Frames)
    if (type === 'embed' || url.includes('youtube.com/embed')) {
        embedPlayer.style.display = 'block';
        embedPlayer.src = url;
    } 
    // 2. Soporte DASH (.mpd)
    else if (type === 'dash' || url.includes('.mpd')) {
        video.style.display = 'block';
        shakaPlayer = new shaka.Player(video);
        shakaPlayer.addEventListener('error', () => showStreamError());
        try {
            await shakaPlayer.load(url);
            video.play();
        } catch (e) { showStreamError(); }
    }
    // 3. Soporte HLS (Tu lógica original mejorada)
    else {
        video.style.display = 'block';
        if (Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
            hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) showStreamError(); });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            video.play().catch(() => showStreamError());
        } else {
            showStreamError();
        }
    }
}

function stopStream() {
    container.style.display = 'none';
    video.pause();
    video.src = '';
    embedPlayer.src = '';
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    if (hls) { hls.destroy(); hls = null; }
}

/* ── El resto de tus funciones originales (renderChannels, toggleFav, etc.) se mantienen sin cambios ── */
function renderCategories(cats) {
    catContainer.innerHTML = '';
    const allCats = favorites.length > 0 ? ['Todos', '⭐ Favoritos', ...cats.filter(c => c !== 'Todos')] : cats;
    allCats.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'cat-btn' + (cat === activeCategory ? ' active' : '');
        btn.textContent = cat;
        btn.onclick = () => {
            activeCategory = cat;
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterAndRender();
        };
        catContainer.appendChild(btn);
    });
}

function renderChannels(channels) {
    list.innerHTML = '';
    emptyState.style.display = channels.length === 0 ? 'block' : 'none';
    channels.forEach(ch => {
        const isFav = favorites.includes(ch.url);
        const card  = document.createElement('div');
        card.className = 'channel-card' + (ch.is_vip ? ' is-vip' : '');
        const emoji = getCategoryEmoji(ch.category);
        card.innerHTML = `
            <div class="channel-logo">${ch.logo ? `<img src="${ch.logo}" onerror="this.parentElement.textContent='${emoji}'">` : emoji}</div>
            <div class="channel-info">
                <span class="channel-name">${ch.name}</span>
                <div class="channel-meta">
                    <span class="channel-category">${ch.category || ''}</span>
                    <span class="channel-country">${ch.country ? '· ' + ch.country : ''}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn-fav ${isFav ? 'active' : ''}" onclick="toggleFav(this, '${escapeAttr(ch.url)}')">★</button>
                <button class="btn-play ${ch.is_vip ? 'vip' : ''}" 
                    onclick="playStream('${escapeAttr(ch.url)}', '${escapeAttr(ch.name)}', '${ch.type || 'hls'}')">
                    ${ch.is_vip ? 'PREMIUM' : 'VER'}
                </button>
            </div>
        `;
        list.appendChild(card);
    });
}

function filterAndRender() {
    const term = searchInput.value.toLowerCase().trim();
    let filtered = allChannels.filter(ch => {
        const matchSearch = !term || ch.name.toLowerCase().includes(term);
        const matchCat = activeCategory === 'Todos' ? true : (activeCategory === '⭐ Favoritos' ? favorites.includes(ch.url) : ch.category === activeCategory);
        return matchSearch && matchCat;
    });
    renderChannels(filtered);
}

searchInput.addEventListener('input', () => filterAndRender());
function clearSearch() { searchInput.value = ''; filterAndRender(); }
function toggleFav(btn, url) {
    const idx = favorites.indexOf(url);
    if (idx === -1) favorites.push(url); else favorites.splice(idx, 1);
    localStorage.setItem('playcast_favs', JSON.stringify(favorites));
    filterAndRender();
}
function toggleView() {
    currentView = currentView === 'list' ? 'grid' : 'list';
    localStorage.setItem('playcast_view', currentView);
    applyView(currentView);
}
function applyView(view) {
    list.className = view === 'grid' ? 'grid-view' : 'list-view';
    document.getElementById('viewToggleBtn').textContent = view === 'grid' ? '☰' : '⊞';
}
function getCategoryEmoji(cat) {
    const map = {'Noticias': '📰','Entretenimiento': '🎬','Deportes': '⚽','Música': '🎵','Internacional': '🌐'};
    return map[cat] || '📺';
}
function escapeAttr(str) { return str ? str.replace(/'/g, "\\'").replace(/"/g, '&quot;') : ''; }
function showStreamError() { video.style.display = 'none'; streamError.classList.add('visible'); }
function retryStream() { playStream(lastStream.url, lastStream.name, lastStream.type); }