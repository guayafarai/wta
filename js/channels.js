/* ═══════════════════════════════════════════════════
   PlayCast PRO — Channels Module
   Categorías: Todos | NBA | MLB
   Fuentes:    config.json + nba.json + mlb.json
   ═══════════════════════════════════════════════════ */

const ChannelsModule = (() => {
  // Todos los canales mezclados por categoría
  const sources = {
    general: [],  // config.json
    futbol:  [],  // futbol.json
    nba:     [],  // nba.json
    mlb:     [],  // mlb.json
  };

  let activeCategory = 'todos';  // 'todos' | 'nba' | 'mlb'
  let searchTerm     = '';
  let configData     = null;
  let listEl, emptyStateEl, channelCountEl;

  // Conteo de reproducciones → "más vistos"
  let viewCounts = JSON.parse(localStorage.getItem('playcast_views') || '{}');

  function _incView(id) {
    viewCounts[id] = (viewCounts[id] || 0) + 1;
    localStorage.setItem('playcast_views', JSON.stringify(viewCounts));
  }
  function _getViewCount(id) { return viewCounts[id] || 0; }

  // ── Cargar todos los JSON ─────────────────────────
  async function load() {
    const [cfg, futbol, nba, mlb] = await Promise.all([
      _fetchJSON('config.json'),
      _fetchJSON('futbol.json'),
      _fetchJSON('nba.json'),
      _fetchJSON('mlb.json'),
    ]);

    configData       = cfg || {};
    sources.general  = _normalize(cfg?.channels,    'general');
    sources.futbol   = _normalize(futbol?.channels, 'futbol');
    sources.nba      = _normalize(nba?.channels,    'nba');
    sources.mlb      = _normalize(mlb?.channels,    'mlb');

    return configData;
  }

  async function _fetchJSON(file) {
    try {
      const res = await fetch(file + '?v=' + Date.now());
      if (!res.ok) return null;
      const data = await res.json();
      // Soportar dos formatos:
      // 1. { "channels": [...] }  ← formato estándar
      // 2. [...]                  ← array directo (ej: futbol.json)
      if (Array.isArray(data)) return { channels: data };
      return data;
    } catch (e) {
      console.warn('[Channels] No se pudo cargar', file);
      return null;
    }
  }

  // Normaliza el array y añade campo _cat para filtrado
  function _normalize(arr, cat) {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(ch => !!ch.name)
      .map(ch => ({ ...ch, _cat: cat }));
  }

  // ── Montar dashboard ──────────────────────────────
  function mount() {
    // Siempre re-renderizar tabs (son estáticos, no dependen de datos)
    _renderTabs();

    listEl         = document.getElementById('channel-list');
    emptyStateEl   = document.getElementById('emptyState');
    channelCountEl = document.getElementById('channelCount');

    // Renderizar canales si el contenedor existe
    if (listEl) _filterAndRender();
  }

  // ── Tabs de categoría ─────────────────────────────
  function _renderTabs() {
    const container = document.getElementById('cat-tabs');
    if (!container) return;
    container.innerHTML = '';

    const tabs = [
      { id: 'todos',   label: '📺 Canales' },
      { id: 'futbol',  label: '⚽ Fútbol'  },
      { id: 'nba',     label: '🏀 NBA'     },
      { id: 'mlb',     label: '⚾ MLB'     },
    ];

    tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.className  = 'cat-btn' + (tab.id === activeCategory ? ' active' : '');
      btn.textContent = tab.label;
      btn.dataset.cat = tab.id;
      btn.addEventListener('click', () => {
        activeCategory = tab.id;
        container.querySelectorAll('.cat-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.cat === tab.id)
        );
        _filterAndRender();
      });
      container.appendChild(btn);
    });
  }

  // ── Filtrar y renderizar ──────────────────────────
  function _filterAndRender() {
    let pool;
    if      (activeCategory === 'futbol') pool = sources.futbol;
    else if (activeCategory === 'nba')    pool = sources.nba;
    else if (activeCategory === 'mlb')    pool = sources.mlb;
    else pool = [...sources.general, ...sources.futbol, ...sources.nba, ...sources.mlb];

    const filtered = searchTerm
      ? pool.filter(ch => ch.name.toLowerCase().includes(searchTerm))
      : pool;

    _renderChannels(filtered);
  }

  // ── Render cards ──────────────────────────────────
  function _renderChannels(channels) {
    if (!listEl) return;
    listEl.innerHTML = '';

    const isEmpty = channels.length === 0;
    if (emptyStateEl) emptyStateEl.classList.toggle('visible', isEmpty);
    if (channelCountEl) channelCountEl.textContent =
      channels.length ? `${channels.length} canal${channels.length !== 1 ? 'es' : ''}` : '';

    if (isEmpty) return;

    channels.forEach((ch, idx) => listEl.appendChild(_buildCard(ch, idx)));
  }

  function _buildCard(ch, idx) {
    const hasUrl  = !!ch.url;
    // Limpiar saltos de línea del nombre (algunos JSON vienen con \n)
    const name    = (ch.name || '').replace(/\n/g, ' ').trim();
    const card    = document.createElement('div');
    card.className = 'channel-card';
    card.style.animationDelay = `${Math.min(idx * 0.04, 0.3)}s`;

    const catIcon  = ch._cat === 'nba' ? '🏀' : ch._cat === 'mlb' ? '⚾' : ch._cat === 'futbol' ? '⚽' : '📺';
    const logoHTML = ch.logo
      ? `<img src="${_esc(ch.logo)}" alt="${_esc(name)}" loading="lazy" onerror="this.parentElement.textContent='${catIcon}'">`
      : catIcon;

    const views = _getViewCount(ch.id || ch.name);
    const viewsBadge = views > 0
      ? `<span class="views-badge">▶ ${views > 999 ? Math.floor(views / 1000) + 'k' : views}</span>`
      : '';

    card.innerHTML = `
      <div class="channel-logo">${logoHTML}</div>
      <div class="channel-info">
        <span class="channel-name">${name}</span>
        <div class="channel-meta">${viewsBadge}</div>
      </div>
      <div class="card-actions">
        <button class="${hasUrl ? 'btn-play' : 'btn-play no-url'}"
                aria-label="Ver ${_esc(name)}">
          ${hasUrl ? '▶ VER' : 'PRONTO'}
        </button>
      </div>
    `;

    card.querySelector('.btn-play').addEventListener('click', e => {
      e.stopPropagation();
      _handlePlay(ch, name);
    });

    return card;
  }

  function _handlePlay(ch, name) {
    if (!ch.url) { showToast(`${name || ch.name} — Próximamente`); return; }
    _incView(ch.id || ch.name);
    Router.navigate('/player', { id: ch.id || '', name: name || ch.name, url: ch.url });
  }

  // ── Búsqueda ──────────────────────────────────────
  function setSearch(term) {
    searchTerm = term.toLowerCase().trim();
    _filterAndRender();
  }

  // ── Sugeridos para el sidebar del player ─────────
  // Mezcla canales de la misma categoría + aleatorios
  function getSuggested(excludeId, count = 6) {
    const all  = [...sources.general, ...sources.futbol, ...sources.nba, ...sources.mlb];
    const pool = all.filter(ch => (ch.id || ch.name) !== excludeId && ch.url);
    if (!pool.length) return [];

    return [...pool]
      .sort((a, b) => {
        const vA = _getViewCount(a.id || a.name);
        const vB = _getViewCount(b.id || b.name);
        return (vB * 0.7 + Math.random() * 0.3) - (vA * 0.7 + Math.random() * 0.3);
      })
      .slice(0, count);
  }

  function getById(id) {
    const all = [...sources.general, ...sources.futbol, ...sources.nba, ...sources.mlb];
    return all.find(ch => (ch.id || ch.name) === id) || null;
  }

  function _esc(s) {
    return s ? String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
  }

  return { load, mount, setSearch, getById, getSuggested,
    get configData() { return configData; } };
})();
