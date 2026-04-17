/* ── Estado global ── */
const list        = document.getElementById('channel-list');
const video       = document.getElementById('video');
const iframe      = document.getElementById('iframePlayer'); // Nueva referencia
const container   = document.getElementById('videoContainer');
const searchInput = document.getElementById('channelSearch');
const clearBtn    = document.getElementById('clearSearch');
const emptyState  = document.getElementById('emptyState');
const catContainer = document.getElementById('categoriesContainer');
const streamError = document.getElementById('streamError');
const playerTitle = document.getElementById('playerTitle');
const footerText  = document.getElementById('footerText');

// Variables de estado
let hls;
let dashPlayer;
let allChannels    = [];
let activeCategory = 'Todos';
let currentView    = localStorage.getItem('playcast_view') || 'list';
let favorites      = JSON.parse(localStorage.getItem('playcast_favs') || '[]');
let lastStreamUrl  = '';

/* ── Lógica de Reproducción (M3U8, DASH, IFRAME) ── */
async function playStream(url, name) {
    if (!url) return;
    lastStreamUrl = url;
    playerTitle.textContent = name || 'En vivo';
    container.style.display = 'flex';
    streamError.classList.remove('visible');
    
    const isIframe = url.includes('youtube.com') || url.includes('facebook.com') || url.includes('embed') || url.endsWith('.html');
    const isDash = url.endsWith('.mpd');

    // Resetear estados
    video.style.display = 'none';
    iframe.style.display = 'none';
    iframe.src = '';
    if (hls) hls.destroy();
    if (dashPlayer) dashPlayer.reset();

    if (isIframe) {
        iframe.src = url;
        iframe.style.display = 'block';
    } else {
        video.style.display = 'block';
        if (isDash) {
            dashPlayer = dash.Factory.create().initialize(video, url, true);
        } else if (url.includes('.m3u8')) {
            setupHLS(url);
        } else {
            video.src = url;
            video.play().catch(() => showStreamError());
        }
    }

    // Fullscreen y Orientación en Móviles
    manejarPantallaCompleta();
}

function setupHLS(url) {
    if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
        hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) showStreamError(); });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.play().catch(() => showStreamError());
    }
}

async function manejarPantallaCompleta() {
    try {
        if (container.requestFullscreen) await container.requestFullscreen();
        else if (container.webkitRequestFullscreen) await container.webkitRequestFullscreen();

        if (window.screen.orientation && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            await screen.orientation.lock('landscape').catch(() => {});
        }
    } catch (e) { console.warn("Fullscreen no disponible"); }
}

function stopStream() {
    container.style.display = 'none';
    video.pause();
    video.src = '';
    iframe.src = '';
    
    if (hls) { hls.destroy(); hls = null; }
    if (dashPlayer) { dashPlayer.reset(); dashPlayer = null; }

    if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    if (window.screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
    }
}

/* ── Inicializar vista ── */
applyView(currentView);

/* ── Cargar configuración ── */
fetch('config.json')
    .then(r => r.json())
    .then(data => {
        allChannels = data.channels || [];
        footerText.textContent = data.footer_text || '';
        renderCategories(data.categories || ['Todos']);
        renderChannels(allChannels);
    })
    .catch(() => {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;">Error al cargar canales. Verifica config.json</div>';
    });

/* ── Renderizar categorías ── */
function renderCategories(cats) {
    catContainer.innerHTML = '';
    // Añadir "Favoritos" si el usuario tiene alguno
    const allCats = favorites.length > 0 ? ['Todos', '⭐ Favoritos', ...cats.filter(c => c !== 'Todos')] : cats;

    allCats.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'cat-btn' + (cat === activeCategory ? ' active' : '');
        btn.textContent = cat;
        btn.addEventListener('click', () => {
            activeCategory = cat;
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterAndRender();
        });
        catContainer.appendChild(btn);
    });
}

/* ── Renderizar canales ── */
function renderChannels(channels) {
    list.innerHTML = '';
    emptyState.style.display = channels.length === 0 ? 'block' : 'none';

    channels.forEach((ch, i) => {
        const isFav = favorites.includes(ch.url);
        const card  = document.createElement('div');
        card.className = 'channel-card' + (ch.is_vip ? ' is-vip' : '');

        const emoji = getCategoryEmoji(ch.category);
        const logoHTML = ch.logo
            ? `<img src="${ch.logo}" alt="${ch.name}" onerror="this.parentElement.textContent='${emoji}'">`
            : emoji;

        card.innerHTML = `
            <div class="channel-logo">${logoHTML}</div>
            <div class="channel-info">
                <span class="channel-name">${ch.name}</span>
                <div class="channel-meta">
                    <span class="channel-category">${ch.category || ''}</span>
                    <span class="channel-country">${ch.country ? '· ' + ch.country : ''}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn-fav ${isFav ? 'active' : ''}" 
                    data-url="${ch.url}" 
                    title="${isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}"
                    onclick="toggleFav(this, '${escapeAttr(ch.url)}')">★</button>
                <button class="btn-play ${ch.is_vip ? 'vip' : ''}" 
                    onclick="${ch.is_vip ? `window.open('${escapeAttr(ch.url)}', '_blank')` : `playStream('${escapeAttr(ch.url)}', '${escapeAttr(ch.name)}')`}">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                    ${ch.is_vip ? 'PREMIUM' : 'VER'}
                </button>
            </div>
        `;
        list.appendChild(card);
    });
}

/* ── Filtrar y renderizar ── */
function filterAndRender() {
    const term = searchInput.value.toLowerCase().trim();

    let filtered = allChannels.filter(ch => {
        const matchSearch = !term || ch.name.toLowerCase().includes(term) || (ch.category || '').toLowerCase().includes(term);
        const matchCat = activeCategory === 'Todos'
            ? true
            : activeCategory === '⭐ Favoritos'
                ? favorites.includes(ch.url)
                : ch.category === activeCategory;
        return matchSearch && matchCat;
    });

    renderChannels(filtered);
}

/* ── Búsqueda ── */
searchInput.addEventListener('input', e => {
    clearBtn.classList.toggle('visible', e.target.value.length > 0);
    filterAndRender();
});

function clearSearch() {
    searchInput.value = '';
    clearBtn.classList.remove('visible');
    filterAndRender();
}

/* ── Favoritos ── */
function toggleFav(btn, url) {
    const idx = favorites.indexOf(url);
    if (idx === -1) {
        favorites.push(url);
        btn.classList.add('active');
        btn.title = 'Quitar de favoritos';
    } else {
        favorites.splice(idx, 1);
        btn.classList.remove('active');
        btn.title = 'Añadir a favoritos';
    }
    localStorage.setItem('playcast_favs', JSON.stringify(favorites));
    // Re-renderizar categorías por si apareció/desapareció "Favoritos"
    fetch('config.json').then(r => r.json()).then(data => {
        renderCategories(data.categories || ['Todos']);
    });
}

/* ── Reproductor ── */
function playStream(url, name) {
    if (!url) return;
    lastStreamUrl = url;
    playerTitle.textContent = name || 'En vivo';
    container.style.display = 'flex';
    streamError.classList.remove('visible');

    if (Hls.isSupported()) {
        if (hls) hls.destroy();
        hls = new Hls({ enableWorker: true });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) showStreamError();
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.play().catch(() => showStreamError());
    } else {
        showStreamError();
    }
}

function showStreamError() {
    video.style.display = 'none';
    streamError.classList.add('visible');
}

function retryStream() {
    video.style.display = '';
    streamError.classList.remove('visible');
    playStream(lastStreamUrl, playerTitle.textContent);
}

function stopStream() {
    container.style.display = 'none';
    video.style.display = '';
    streamError.classList.remove('visible');
    video.pause();
    video.src = '';
    if (hls) { hls.destroy(); hls = null; }
}

/* ── Toggle vista grid/list ── */
function toggleView() {
    currentView = currentView === 'list' ? 'grid' : 'list';
    localStorage.setItem('playcast_view', currentView);
    applyView(currentView);
}

function applyView(view) {
    const btn = document.getElementById('viewToggleBtn');
    if (!list) return;
    list.className = view === 'grid' ? 'grid-view' : 'list-view';
    if (btn) btn.textContent = view === 'grid' ? '☰' : '⊞';
}

/* ── Utilidades ── */
function getCategoryEmoji(cat) {
    const map = {
        'Noticias': '📰',
        'Entretenimiento': '🎬',
        'Deportes': '⚽',
        'Música': '🎵',
        'Internacional': '🌐',
        'Infantil': '🎠',
        'Documentales': '🔬',
    };
    return map[cat] || '📺';
}

function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
