/* ── Estado global ── */
const list        = document.getElementById('channel-list');
const video       = document.getElementById('video');
const iframe      = document.getElementById('iframePlayer'); 
const container   = document.getElementById('videoContainer');
const searchInput = document.getElementById('channelSearch');
const clearBtn    = document.getElementById('clearSearch');
const emptyState  = document.getElementById('emptyState');
const catContainer = document.getElementById('categoriesContainer');
const streamError = document.getElementById('streamError');
const playerTitle = document.getElementById('playerTitle');
const footerText  = document.getElementById('footerText');

let hls;
let dashPlayer;
let allChannels    = [];
let activeCategory = 'Todos';
let currentView    = localStorage.getItem('playcast_view') || 'list';
let favorites      = JSON.parse(localStorage.getItem('playcast_favs') || '[]');
let lastStreamUrl  = '';

/* ── Inicialización ── */
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

/* ── Lógica de Reproducción Profesional ── */
async function playStream(url, name) {
    if (!url) return;
    lastStreamUrl = url;
    playerTitle.textContent = name || 'En vivo';
    container.style.display = 'flex';
    streamError.classList.remove('visible');
    
    const isIframe = url.includes('youtube.com') || url.includes('facebook.com') || url.includes('embed') || url.endsWith('.html');
    const isDash = url.endsWith('.mpd');

    // Limpieza de estados anteriores para evitar fugas de memoria
    video.style.display = 'none';
    iframe.style.display = 'none';
    iframe.src = '';
    video.pause();
    video.src = '';

    if (hls) { hls.destroy(); hls = null; }
    if (dashPlayer) { dashPlayer.reset(); dashPlayer = null; }

    if (isIframe) {
        iframe.src = url;
        iframe.style.display = 'block';
    } else {
        video.style.display = 'block';
        if (isDash) {
            dashPlayer = dash.Factory.create().initialize(video, url, true);
            dashPlayer.on(dashjs.MediaPlayer.events.ERROR, () => showStreamError());
        } else if (url.includes('.m3u8')) {
            setupHLS(url);
        } else {
            video.src = url;
            video.play().catch(() => showStreamError());
        }
    }
    activarModoCine();
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

async function activarModoCine() {
    try {
        if (container.requestFullscreen) await container.requestFullscreen();
        else if (container.webkitRequestFullscreen) await container.webkitRequestFullscreen();

        if (window.screen.orientation && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            await screen.orientation.lock('landscape').catch(() => {});
        }
    } catch (e) { console.warn("Modo cine no disponible"); }
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
    if (window.screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
}

/* ── UI y Favoritos ── */
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

    channels.forEach((ch) => {
        const isFav = favorites.includes(ch.url);
        const card  = document.createElement('div');
        card.className = 'channel-card' + (ch.is_vip ? ' is-vip' : '');

        const emoji = getCategoryEmoji(ch.category);
        const logoHTML = ch.logo ? `<img src="${ch.logo}" alt="${ch.name}" onerror="this.parentElement.textContent='${emoji}'">` : emoji;

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
                <button class="btn-fav ${isFav ? 'active' : ''}" onclick="toggleFav(this, '${escapeAttr(ch.url)}')">★</button>
                <button class="btn-play ${ch.is_vip ? 'vip' : ''}" 
                    onclick="${ch.is_vip ? `window.open('${escapeAttr(ch.url)}', '_blank')` : `playStream('${escapeAttr(ch.url)}', '${escapeAttr(ch.name)}')`}">
                    ${ch.is_vip ? 'PREMIUM' : 'VER'}
                </button>
            </div>
        `;
        list.appendChild(card);
    });
}

function toggleFav(btn, url) {
    const idx = favorites.indexOf(url);
    if (idx === -1) favorites.push(url);
    else favorites.splice(idx, 1);
    localStorage.setItem('playcast_favs', JSON.stringify(favorites));
    
    // Actualización instantánea sin recarga de página
    const currentCats = Array.from(document.querySelectorAll('.cat-btn')).map(b => b.textContent.replace('⭐ ', ''));
    renderCategories(currentCats);
    filterAndRender();
}

function filterAndRender() {
    const term = searchInput.value.toLowerCase().trim();
    let filtered = allChannels.filter(ch => {
        const matchSearch = !term || ch.name.toLowerCase().includes(term);
        const matchCat = activeCategory === 'Todos' ? true : 
                         activeCategory === '⭐ Favoritos' ? favorites.includes(ch.url) : 
                         ch.category === activeCategory;
        return matchSearch && matchCat;
    });
    renderChannels(filtered);
}

function showStreamError() {
    video.style.display = 'none';
    iframe.style.display = 'none';
    streamError.classList.add('visible');
}

function retryStream() {
    streamError.classList.remove('visible');
    playStream(lastStreamUrl, playerTitle.textContent);
}

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

function clearSearch() {
    searchInput.value = '';
    filterAndRender();
}

function getCategoryEmoji(cat) {
    const map = { 'Noticias': '📰', 'Entretenimiento': '🎬', 'Deportes': '⚽', 'Música': '🎵', 'Internacional': '🌐' };
    return map[cat] || '📺';
}

function escapeAttr(str) {
    return str ? str.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
}

searchInput.addEventListener('input', () => {
    clearBtn.classList.toggle('visible', searchInput.value.length > 0);
    filterAndRender();
});