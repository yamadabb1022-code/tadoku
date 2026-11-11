// ルーター（ハッシュ方式）と起動処理
import { store } from './store.js';
import { loadCatalog } from './books.js';
import { applyDisplay, toast, esc, icons } from './ui.js';
import { renderHome } from './views/home.js';
import { renderLibrary } from './views/library.js';
import { renderStats } from './views/stats.js';
import { renderWords } from './views/words.js';
import { renderSettings } from './views/settings.js';
import { renderReader } from './reader.js';

const NAV = [
  { key: 'home', href: '#/', label: 'ホーム', title: '多読ノート' },
  { key: 'library', href: '#/library', label: 'ライブラリ', title: 'ライブラリ' },
  { key: 'stats', href: '#/stats', label: '記録', title: '記録' },
  { key: 'words', href: '#/words', label: '単語メモ', title: '単語メモ' },
  { key: 'settings', href: '#/settings', label: '設定', title: '設定' },
];

const routes = [
  { re: /^\/?$/, nav: 'home', fn: renderHome },
  { re: /^\/library$/, nav: 'library', fn: renderLibrary },
  { re: /^\/read\/([^/]+)$/, nav: null, fn: renderReader, keys: ['id'] },
  { re: /^\/stats(?:\/(external))?$/, nav: 'stats', fn: renderStats, keys: ['tab'] },
  { re: /^\/words$/, nav: 'words', fn: renderWords },
  { re: /^\/settings$/, nav: 'settings', fn: renderSettings },
];

const view = document.getElementById('view');
let cleanup = null;
let first = true;
let routeToken = 0;

function buildNav() {
  document.getElementById('mainNav').innerHTML = NAV.map((n) =>
    `<a href="${n.href}" data-nav="${n.key}">${icons[n.key]}<span>${n.label}</span></a>`).join('');
}

async function route() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  let r = null;
  let m = null;
  for (const x of routes) { m = path.match(x.re); if (m) { r = x; break; } }
  if (!r) { location.replace('#/'); return; }

  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  document.body.classList.remove('reading');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  (r.keys || []).forEach((k, i) => { if (m[i + 1] !== undefined) params[k] = decodeURIComponent(m[i + 1]); });

  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === r.nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const nav = NAV.find((n) => n.key === r.nav);
  document.title = nav && nav.key !== 'home' ? `${nav.title} – 多読ノート` : '多読ノート';

  // 画面ごとに新しいコンテナを用意（前の画面のイベントリスナーを残さない）
  view.innerHTML = '';
  const container = document.createElement('div');
  view.appendChild(container);
  window.scrollTo(0, 0);
  try {
    const token = ++routeToken;
    const c = await r.fn(container, params);
    if (token !== routeToken) { if (typeof c === 'function') c(); return; } // 描画中に別の画面へ移動した
    if (typeof c === 'function') cleanup = c;
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="page"><h1>エラーが発生しました</h1><p>${esc(e.message)}</p><p><a href="#/">ホームへ</a></p></div>`;
  }
  if (!first) {
    const h = view.querySelector('h1');
    const target = h || view;
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
  first = false;
}

function init() {
  applyDisplay(store.state.settings);
  buildNav();
  if (location.protocol === 'file:') {
    document.getElementById('fileWarning').hidden = false;
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('tadoku:storage-error', () => toast('記録を保存できませんでした。ブラウザの保存容量や設定を確認してください。'));
  loadCatalog().finally(route);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[tadoku] SW登録失敗', e));
  }
}

init();
