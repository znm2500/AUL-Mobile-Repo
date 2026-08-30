// ===== i18n =====
const I18N = {
  zh: {
    search_placeholder: '搜索 AU 游戏...',
    sort_new: '最新',
    sort_hot: '最热',
    sort_name: '名字',
    sort_all: '全部',
    loading: '加载中...',
    load_failed: '加载失败，请刷新重试',
    no_games: '未找到相关游戏',
    download: '下载',
    by: 'by',
    engine: '引擎',
    hot: '热度',
    lang_switch: 'EN',
  },
  en: {
    search_placeholder: 'Search AU games...',
    sort_new: 'NEW',
    sort_hot: 'HOT',
    sort_name: 'NAME',
    sort_all: 'ALL',
    loading: 'Loading...',
    load_failed: 'Failed to load, please refresh',
    no_games: 'No games found',
    download: 'GET',
    by: 'by',
    engine: 'Engine',
    hot: 'Hot',
    lang_switch: '中文',
  },
};

let lang = detectLang();

function detectLang() {
  const saved = localStorage.getItem('aulang');
  if (saved === 'zh' || saved === 'en') return saved;
  const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  return nav.startsWith('zh') ? 'zh' : 'en';
}

function t(key) {
  return (I18N[lang] && I18N[lang][key] != null) ? I18N[lang][key] : key;
}

function setLang(l) {
  lang = (l === 'zh' || l === 'en') ? l : 'en';
  localStorage.setItem('aulang', lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  applyI18n();
  render();
}

function toggleLang() {
  setLang(lang === 'zh' ? 'en' : 'zh');
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
}

// ===== Data sources (mirrors app/src/main/java/com/au/launcher/utils/Constants.kt) =====
const CONFIG_URL_GLOBAL = 'https://cdn.jsdelivr.net/gh/znm2500/AUL-Mobile-Repo@data/config.json';
const CONFIG_URL_CN = 'https://gitcode.com/znm1145/AUL-Mobile-Repo/raw/data/config.json';
const IMAGE_BASE_GLOBAL = 'https://cdn.jsdelivr.net/gh/znm2500/AUL-Mobile-Repo@data/';
const IMAGE_BASE_CN = 'https://gitcode.com/znm1145/AUL-Mobile-Repo/raw/data/';
const DOWNLOAD_URL_GLOBAL = 'https://github.com/znm2500/AUL-Mobile-Repo/releases/download/';
const DOWNLOAD_URL_CN = 'https://gitcode.com/znm1145/AUL-Mobile-Repo/releases/download/';

// Region detection: zh-CN / zh-TW / zh-HK etc. => CN, otherwise Global
const isCnRegion = (() => {
  const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
  return nav.startsWith('zh');
})();

// Preferred order for the current region
const CONFIG_URLS = isCnRegion ? [CONFIG_URL_CN, CONFIG_URL_GLOBAL] : [CONFIG_URL_GLOBAL, CONFIG_URL_CN];
const IMAGE_BASES = [IMAGE_BASE_GLOBAL]; // 图片源只用 jsdelivr CDN
const DOWNLOAD_URL = isCnRegion ? DOWNLOAD_URL_CN : DOWNLOAD_URL_GLOBAL;

// Inline SVG placeholder (no external dependency, no emoji)
const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#000"/>' +
  '<text x="8" y="5.2" font-size="1.6" fill="#9A9A9A" text-anchor="middle" font-family="monospace">AU</text></svg>'
);

let allGames = [];
let currentSort = 'new'; // new | hot | name | all
let searchQuery = '';

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const statusEl = $('status');
const searchInput = $('search');

// ===== Helpers =====
function localized(field) {
  if (!field) return '';
  const useZh = lang === 'zh';
  if (useZh && field.zh && field.zh !== '') return field.zh;
  if (!useZh && field.en && field.en !== '') return field.en;
  return field.zh || field.en || '';
}
const nameOf = (g) => localized(g.name);
const authorOf = (g) => localized(g.author);

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function imageUrls(id) {
  return IMAGE_BASES.map((base) => base + id + '.webp');
}

function downloadUrl(g) {
  return `${DOWNLOAD_URL}v${g.version}/${g.id}.apk`;
}

// ===== Fetch config (region-aware priority, fallback cross-region) =====
async function fetchConfig() {
  const ts = '?t=' + Date.now();
  for (const url of CONFIG_URLS.map((u) => u + ts)) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) { /* try next */ }
  }
  throw new Error('config fetch failed');
}

// ===== Sort + filter =====
function sortGames(list) {
  const r = list.slice();
  if (currentSort === 'new') {
    r.sort((a, b) => (b.publish_time || '').localeCompare(a.publish_time || ''));
  } else if (currentSort === 'hot') {
    r.sort((a, b) => (b.hot_score || 0) - (a.hot_score || 0));
  } else if (currentSort === 'name') {
    const loc = lang === 'zh' ? 'zh-Hans-CN' : 'en';
    r.sort((a, b) => nameOf(a).localeCompare(nameOf(b), loc));
  }
  return r;
}

function filterGames() {
  let r = sortGames(allGames);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    r = r.filter((g) =>
      nameOf(g).toLowerCase().includes(q) ||
      authorOf(g).toLowerCase().includes(q) ||
      (g.engine || '').toLowerCase().includes(q) ||
      (g.id || '').toLowerCase().includes(q)
    );
  }
  return r;
}

// ===== Render =====
function render() {
  const list = filterGames();
  grid.innerHTML = '';
  if (!list.length) {
    statusEl.textContent = t('no_games');
    statusEl.className = 'status dim';
    return;
  }
  statusEl.className = 'status hidden';
  const frag = document.createDocumentFragment();
  for (const g of list) frag.appendChild(buildCard(g));
  grid.appendChild(frag);
}

function buildCard(g) {
  const card = document.createElement('div');
  card.className = 'card';
  const urls = imageUrls(g.id);
  const dl = downloadUrl(g);
  const engineTag = g.engine ? '<span class="tag">' + t('engine') + ': ' + escapeHtml(g.engine) + '</span>' : '';
  card.innerHTML =
    '<div class="cover"><img alt="' + escapeHtml(nameOf(g)) + '"></div>' +
    '<div class="info-row">' +
      '<div class="info">' +
        '<div class="name">' + escapeHtml(nameOf(g)) + '</div>' +
        '<div class="meta">' + t('by') + ' ' + escapeHtml(authorOf(g)) + '</div>' +
        '<div class="tags">' +
          engineTag +
          '<span class="tag">' + t('hot') + ': ' + (g.hot_score || 0) + '</span>' +
        '</div>' +
      '</div>' +
      '<a class="dl-btn" href="' + escapeHtml(dl) + '" download target="_blank" rel="noopener">' + t('download') + '</a>' +
    '</div>';

  const img = card.querySelector('img');
  img.dataset.idx = '0';
  img.src = urls[0];
  img.addEventListener('error', () => {
    let idx = parseInt(img.dataset.idx || '0', 10) + 1;
    img.dataset.idx = String(idx);
    if (idx < urls.length) {
      img.src = urls[idx];
    } else {
      img.src = PLACEHOLDER;
      img.onerror = null;
    }
  });
  return card;
}

// ===== UI events =====
function setSort(sort) {
  currentSort = sort;
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.sort === sort));
  render();
}

document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => setSort(t.dataset.sort)));

searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  render();
});

$('lang').addEventListener('click', toggleLang);

// ===== Init =====
async function init() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  applyI18n();
  statusEl.textContent = t('loading');
  statusEl.className = 'status';
  try {
    const config = await fetchConfig();
    allGames = (config && Array.isArray(config.games)) ? config.games : [];
    setSort('new');
  } catch (e) {
    statusEl.textContent = t('load_failed');
    statusEl.className = 'status';
  }
}
init();
