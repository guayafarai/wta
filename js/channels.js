/* ═══════════════════════════════════════════════════
   PlayCast PRO — Channels Module (Updated)
   Carga dinámica de canales, MLB y NBA.
   ═══════════════════════════════════════════════════ */

const ChannelsModule = (() => {
  let allChannels     = [];
  let searchTerm      = '';
  let currentCategory = 'all'; 
  let configData      = null;
  let listEl, emptyStateEl, channelCountEl;

  // ── Conteo de reproducciones ──
  let viewCounts = JSON.parse(localStorage.getItem('playcast_views') || '{}');

  function _incView(id) {
    viewCounts[id] = (viewCounts[id] || 0) + 1;
    localStorage.setItem('playcast_views', JSON.stringify(viewCounts));
  }

  function _getViewCount(id) {
    return viewCounts[id] || 0;
  }

  // ── Carga Multifuente (config, mlb, nba) ──
  async function load() {
    try {
      const v = Date.now();
      // Cargamos los 3 JSON que existen en el repositorio
      const [resConfig, resMlb, resNba] = await Promise.all([
        fetch(`config.json?v=${v}`),
        fetch(`mlb.json?v=${v}`),
        fetch(`nba.json?v=${v}`)
      ]);

      // Validamos y extraemos datos
      const dataConfig = resConfig.ok ? await resConfig.json() : { channels: [] };
      const dataMlb    = resMlb.ok    ? await resMlb.json()    : [];
      const dataNba    = resNba.ok    ? await resNba.json()    : [];

      // Mapeamos para asignar categorías internas
      const general = (dataConfig.channels || []).map(ch => ({ ...ch, category: 'all' }));
      const mlb     = (Array.isArray(dataMlb) ? dataMlb : []).map(ch => ({ ...ch, category: 'mlb' }));
      const nba     = (Array.isArray(dataNba) ? dataNba : []).map(ch => ({ ...ch, category: 'nba' }));

      // Unificamos la lista completa
      allChannels = [...general, ...mlb, ...nba].filter(ch => !!ch.name);
      
      configData = dataConfig;
      return configData;
    } catch (err) {
      console.error('[Channels] Error cargando múltiples fuentes:', err);
      return null;
    }
  }

  function mount() {
    listEl         = document.getElementById('channel-list');
    emptyStateEl   = document.getElementById('emptyState');
    channelCountEl = document.getElementById('channelCount');
    if (!listEl) return;
    _filterAndRender();
  }

  // ── Filtrado y Renderizado ──
  function setCategory(cat) {
    currentCategory = cat;
    _filterAndRender();
  }

  function setSearch(term) {
    searchTerm = term.toLowerCase().trim();
    _filterAndRender();
  }

  function _filterAndRender() {
    if (!listEl) return;

    const filtered = allChannels.filter(ch => {
      const matchSearch = !searchTerm || ch.name.toLowerCase().includes(searchTerm);
      const matchCat    = currentCategory === 'all' || ch.category === currentCategory;
      return matchSearch && matchCat;
    });

    renderChannels(filtered);
  }

  function renderChannels(channels) {
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
      if (typeof showToast === 'function') showToast(`${ch.name} — Próximamente`);
      return;
    }
    _incView(ch.id || ch.name);
    if (typeof Router !== 'undefined') {
      Router.navigate('/player', { id: ch.id || '', name: ch.name, url: ch.url });
    }
  }

  function getSuggested(excludeId, count = 6) {
    const pool = allChannels.filter(ch => (ch.id || ch.name) !== excludeId && ch.url);
    if (pool.length === 0) return [];

    const sorted = [...pool].sort((a, b) => {
      const vA = _getViewCount(a.id || a.name);
      const vB = _getViewCount(b.id || b.name);
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
    setCategory,
    getById,
    getSuggested,
    get all() { return allChannels; },
    get configData() { return configData; }
  };
})();
