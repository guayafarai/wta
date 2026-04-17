/* ═══════════════════════════════════════════════════
   PlayCast PRO — Channels Module
   
   Handles: data loading, filtering, rendering.
   Strictly separated from Player logic.
   ═══════════════════════════════════════════════════ */

const ChannelsModule = (() => {
  // ── State ────────────────────────────────────────
  let allChannels    = [];
  let categories     = ['Todos'];
  let activeCategory = 'Todos';
  let favorites      = JSON.parse(localStorage.getItem('playcast_favs') || '[]');
  let currentView    = localStorage.getItem('playcast_view') || 'list';
  let searchTerm     = '';
  let configData     = null;

  // ── DOM refs (set when dashboard mounts) ─────────
  let listEl, catContainerEl, emptyStateEl, channelCountEl;

  // ── Load config.json ─────────────────────────────
  async function load() {
    try {
      const res  = await fetch('config.json');
      configData = await res.json();

      allChannels = configData.channels || [];
      categories  = configData.categories || ['Todos'];

      return configData;
    } catch (err) {
      console.error('[Channels] Failed to load config:', err);
      return null;
    }
  }

  // ── Mount dashboard elements ─────────────────────
  function mount() {
    listEl         = document.getElementById('channel-list');
    catContainerEl = document.getElementById('categoriesContainer');
    emptyStateEl   = document.getElementById('emptyState');
    channelCountEl = document.getElementById('channelCount');

    if (!listEl) return;

    applyView(currentView);
    renderCategories();
    renderChannels(allChannels);
  }

  // ── Render category pills ─────────────────────────
  function renderCategories() {
    if (!catContainerEl) return;
    catContainerEl.innerHTML = '';

    const hasFavs = favorites.length > 0;
    const cats    = hasFavs
      ? ['Todos', '⭐ Favoritos', ...categories.filter(c => c !== 'Todos')]
      : categories;

    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'cat-btn' + (cat === activeCategory ? ' active' : '');
      btn.textContent = cat;
      btn.setAttribute('aria-label', `Categoría: ${cat}`);
      btn.addEventListener('click', () => selectCategory(cat));
      catContainerEl.appendChild(btn);
    });
  }

  function selectCategory(cat) {
    activeCategory = cat;
    document.querySelectorAll('.cat-btn').forEach(b => {
      b.classList.toggle('active', b.textContent === cat);
    });
    filterAndRender();
  }

  // ── Render channel cards ──────────────────────────
  function renderChannels(channels) {
    if (!listEl) return;
    listEl.innerHTML = '';

    const isEmpty = channels.length === 0;
    if (emptyStateEl) emptyStateEl.classList.toggle('visible', isEmpty);
    if (channelCountEl) channelCountEl.textContent = `${channels.length} canal${channels.length !== 1 ? 'es' : ''}`;

    if (isEmpty) return;

    channels.forEach((ch, idx) => {
      const card = buildCard(ch, idx);
      listEl.appendChild(card);
    });
  }

  function buildCard(ch, idx) {
    const isFav   = favorites.includes(ch.id || ch.url);
    const hasUrl  = !!ch.url;
    const card    = document.createElement('div');
    card.className = 'channel-card' + (ch.is_vip ? ' is-vip' : '');
    card.style.animationDelay = `${Math.min(idx * 0.04, 0.32)}s`;

    const emoji   = getCategoryEmoji(ch.category);
    const logoHTML = ch.logo
      ? `<img src="${ch.logo}" alt="${escAttr(ch.name)}" loading="lazy" onerror="this.parentElement.textContent='${emoji}'">`
      : emoji;

    const playLabel = ch.is_vip ? 'PREMIUM' : (hasUrl ? 'VER' : 'PRONTO');
    const playClass = ch.is_vip ? 'btn-play vip' : (hasUrl ? 'btn-play' : 'btn-play no-url');

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
          aria-label="${isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}"
          data-id="${escAttr(ch.id || ch.url)}">★</button>
        <button class="${playClass}"
          aria-label="Ver ${ch.name}"
          data-channel-id="${escAttr(ch.id || '')}">
          ${playLabel}
        </button>
      </div>
    `;

    // Fav button
    card.querySelector('.btn-fav').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFav(ch.id || ch.url, card.querySelector('.btn-fav'));
    });

    // Play button
    const playBtn = card.querySelector('.btn-play');
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handlePlay(ch);
    });

    return card;
  }

  // ── Handle play action ────────────────────────────
  function handlePlay(ch) {
    if (!ch.url) {
      showToast(`${ch.name} — Próximamente disponible`);
      return;
    }
    if (ch.is_vip) {
      window.open(ch.url, '_blank');
      return;
    }
    // Navigate to player via Router
    Router.navigate('/player', { id: ch.id || '', name: ch.name, url: ch.url });
  }

  // ── Favorites ────────────────────────────────────
  function toggleFav(id, btn) {
    const idx = favorites.indexOf(id);
    if (idx === -1) {
      favorites.push(id);
      showToast('⭐ Agregado a favoritos');
    } else {
      favorites.splice(idx, 1);
      showToast('Eliminado de favoritos');
    }
    localStorage.setItem('playcast_favs', JSON.stringify(favorites));
    btn.classList.toggle('active', favorites.includes(id));
    renderCategories();
    filterAndRender();
  }

  // ── Search & Filter ───────────────────────────────
  function setSearch(term) {
    searchTerm = term.toLowerCase().trim();
    filterAndRender();
  }

  function filterAndRender() {
    const filtered = allChannels.filter(ch => {
      const matchSearch = !searchTerm || ch.name.toLowerCase().includes(searchTerm);
      const matchCat = activeCategory === 'Todos' ? true
        : activeCategory === '⭐ Favoritos' ? favorites.includes(ch.id || ch.url)
        : ch.category === activeCategory;
      return matchSearch && matchCat;
    });
    renderChannels(filtered);
  }

  // ── View toggle ───────────────────────────────────
  function toggleView() {
    currentView = currentView === 'list' ? 'grid' : 'list';
    localStorage.setItem('playcast_view', currentView);
    applyView(currentView);
    return currentView;
  }

  function applyView(view) {
    if (!listEl) listEl = document.getElementById('channel-list');
    if (!listEl) return;
    listEl.className = view === 'grid' ? 'grid-view' : 'list-view';
  }

  // ── Get channel by id ─────────────────────────────
  function getById(id) {
    return allChannels.find(ch => (ch.id || ch.url) === id) || null;
  }

  // ── Get channels by category ─────────────────────
  function getByCategory(category) {
    return allChannels.filter(ch => ch.category === category);
  }

  // ── Helpers ───────────────────────────────────────
  function getCategoryEmoji(cat) {
    const map = {
      'Noticias':       '📰',
      'Entretenimiento':'🎬',
      'Deportes':       '⚽',
      'Música':         '🎵',
      'Internacional':  '🌐'
    };
    return map[cat] || '📺';
  }

  function escAttr(str) {
    return str ? String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
  }

  // ── Public API ────────────────────────────────────
  return {
    load,
    mount,
    toggleView,
    setSearch,
    getById,
    getByCategory,
    getCategoryEmoji,
    get currentView() { return currentView; },
    get all() { return allChannels; },
    get configData() { return configData; }
  };
})();
