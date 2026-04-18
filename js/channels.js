/* ═══════════════════════════════════════════════════
   PlayCast PRO — Channels Module
   Solo canales deportivos. Sin categorías, sin VIP,
   sin país, sin cuadrícula. Lista pura.
   ═══════════════════════════════════════════════════ */

const ChannelsModule = (() => {
  let allChannels  = [];
  let searchTerm   = '';
  let configData   = null;
  let listEl, emptyStateEl, channelCountEl;

  // ── Conteo de reproducciones (para "más vistos") ──
  // Guardado en localStorage como { channelId: count }
  let viewCounts = JSON.parse(localStorage.getItem('playcast_views') || '{}');

  function _incView(id) {
    viewCounts[id] = (viewCounts[id] || 0) + 1;
    localStorage.setItem('playcast_views', JSON.stringify(viewCounts));
  }

  function _getViewCount(id) {
    return viewCounts[id] || 0;
  }

  // ── Cargar config.json ────────────────────────────
  async function load() {
    try {
      // Cache-busting leve para GitHub Pages (evita que sirva versión vieja)
      const res = await fetch('config.json?v=' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      configData  = await res.json();
      allChannels = (configData.channels || []).filter(ch => !!ch.name);
      return configData;
    } catch (err) {
      console.error('[Channels] Error cargando config:', err);
      return null;
    }
  }

  // ── Montar en el dashboard ────────────────────────
  function mount() {
    listEl         = document.getElementById('channel-list');
    emptyStateEl   = document.getElementById('emptyState');
    channelCountEl = document.getElementById('channelCount');
    if (!listEl) return;
    renderChannels(allChannels);
  }

  // ── Render lista ──────────────────────────────────
  function renderChannels(channels) {
    if (!listEl) return;
    listEl.innerHTML = '';

    const isEmpty = channels.length === 0;
    if (emptyStateEl) emptyStateEl.classList.toggle('visible', isEmpty);
    if (channelCountEl) channelCountEl.textContent =
      channels.length ? `${channels.length} canal${channels.length !== 1 ? 'es' : ''}` : '';

    if (isEmpty) return;

    channels.forEach((ch, idx) => {
      listEl.appendChild(_buildCard(ch, idx));
    });
  }

  function _buildCard(ch, idx) {
    const hasUrl = !!ch.url;
    const card   = document.createElement('div');
    card.className = 'channel-card';
    card.style.animationDelay = `${Math.min(idx * 0.04, 0.3)}s`;

    const logoHTML = ch.logo
      ? `<img src="${_esc(ch.logo)}" alt="${_esc(ch.name)}" loading="lazy" onerror="this.parentElement.textContent='⚽'">`
      : '⚽';

    const views = _getViewCount(ch.id || ch.name);
    const viewsBadge = views > 0
      ? `<span class="views-badge">▶ ${views > 999 ? Math.floor(views/1000)+'k' : views}</span>`
      : '';

    card.innerHTML = `
      <div class="channel-logo">${logoHTML}</div>
      <div class="channel-info">
        <span class="channel-name">${ch.name}</span>
        <div class="channel-meta">${viewsBadge}</div>
      </div>
      <div class="card-actions">
        <button class="${hasUrl ? 'btn-play' : 'btn-play no-url'}"
                aria-label="Ver ${_esc(ch.name)}">
          ${hasUrl ? '▶ VER' : 'PRONTO'}
        </button>
      </div>
    `;

    card.querySelector('.btn-play').addEventListener('click', e => {
      e.stopPropagation();
      _handlePlay(ch);
    });

    return card;
  }

  function _handlePlay(ch) {
    if (!ch.url) {
      showToast(`${ch.name} — Próximamente`);
      return;
    }
    _incView(ch.id || ch.name);
    Router.navigate('/player', { id: ch.id || '', name: ch.name, url: ch.url });
  }

  // ── Búsqueda ──────────────────────────────────────
  function setSearch(term) {
    searchTerm = term.toLowerCase().trim();
    _filterAndRender();
  }

  function _filterAndRender() {
    const filtered = allChannels.filter(ch =>
      !searchTerm || ch.name.toLowerCase().includes(searchTerm)
    );
    renderChannels(filtered);
  }

  // ── Canales sugeridos (aleatorio con sesgo en más vistos) ──
  function getSuggested(excludeId, count = 6) {
    const pool = allChannels.filter(ch => (ch.id || ch.name) !== excludeId && ch.url);
    if (pool.length === 0) return [];

    // Ordenar mezclando aleatoriedad con popularidad
    const sorted = [...pool].sort((a, b) => {
      const vA = _getViewCount(a.id || a.name);
      const vB = _getViewCount(b.id || b.name);
      // 70% peso popularidad, 30% aleatorio
      const scoreA = vA * 0.7 + Math.random() * 0.3;
      const scoreB = vB * 0.7 + Math.random() * 0.3;
      return scoreB - scoreA;
    });

    return sorted.slice(0, count);
  }

  function getById(id) {
    return allChannels.find(ch => (ch.id || ch.name) === id) || null;
  }

  function _esc(str) {
    return str ? String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
  }

  return {
    load,
    mount,
    setSearch,
    getById,
    getSuggested,
    get all() { return allChannels; },
    get configData() { return configData; }
  };
})();
