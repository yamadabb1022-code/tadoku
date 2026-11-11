import { store, readingsFor, abandonReading } from '../store.js';
import { loadCatalog, genreLabel } from '../books.js';
import { LEVELS, levelInfo, suggestLevel, suggestionText } from '../levels.js';
import { estimateWpm, fmt } from '../stats.js';
import { esc, toast, ssGet, ssSet } from '../ui.js';

const LENGTHS = [
  { v: 'all', l: 'すべての長さ', test: () => true },
  { v: 's', l: '〜500語', test: (n) => n <= 500 },
  { v: 'm', l: '501〜2,000語', test: (n) => n > 500 && n <= 2000 },
  { v: 'l', l: '2,001〜5,000語', test: (n) => n > 2000 && n <= 5000 },
  { v: 'xl', l: '5,001語〜', test: (n) => n > 5000 },
];
const STATUSES = [
  { v: 'all', l: 'すべて' }, { v: 'unread', l: '未読' }, { v: 'reading', l: '読みかけ' },
  { v: 'finished', l: '読了' }, { v: 'abandoned', l: '中断した本' },
];
const SORTS = [
  { v: 'level', l: 'レベル順' }, { v: 'short', l: '短い順' }, { v: 'long', l: '長い順' }, { v: 'title', l: 'タイトル順' },
];

function bookStatus(book) {
  const rs = readingsFor(book.id);
  const active = rs.find((r) => r.status === 'reading') || null;
  const finished = rs.filter((r) => r.status === 'finished').length;
  const abandoned = rs.filter((r) => r.status === 'abandoned').length;
  const key = active ? 'reading' : finished ? 'finished' : abandoned ? 'abandoned' : 'unread';
  return { active, finished, abandoned, key };
}

export async function renderLibrary(root, params) {
  const { books, errors } = await loadCatalog();
  const f = { level: 'all', genre: 'all', length: 'all', status: 'all', sort: 'level', ...ssGet('tadoku:filters', {}) };
  if (params.lv !== undefined && /^\d$/.test(params.lv)) f.level = params.lv;
  const genres = [...new Set(books.flatMap((b) => b.genres))].sort((a, b) => genreLabel(a).localeCompare(genreLabel(b), 'ja'));
  const sug = suggestLevel(store.state.readings);
  const opt = (list, cur) => list.map((o) => `<option value="${o.v}"${String(cur) === o.v ? ' selected' : ''}>${esc(o.l)}</option>`).join('');

  root.innerHTML = `<div class="page">
    <h1>ライブラリ</h1>
    <p class="lead">「易しすぎるかな」くらいの本から。合わなければ、いつでもやめて大丈夫です。</p>
    ${errors.length ? `<div class="note warn" role="alert"><p>一部の教材を読み込めませんでした。</p><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
    ${sug ? `<div class="note"><p>${esc(suggestionText(sug))}<span class="muted small">（参考）</span></p>
      <button type="button" class="btn sm" data-filter-lv="${sug.level}">Lv${sug.level}で絞り込む</button></div>` : ''}
    <form class="filters" aria-label="絞り込み" onsubmit="return false">
      <label class="field"><span>レベル</span><select name="level">
        ${opt([{ v: 'all', l: 'すべてのレベル' }, ...LEVELS.map((L) => ({ v: String(L.lv), l: `Lv${L.lv}（${L.erf} / ${L.cefr}）` }))], f.level)}</select></label>
      <label class="field"><span>ジャンル</span><select name="genre">
        ${opt([{ v: 'all', l: 'すべてのジャンル' }, ...genres.map((g) => ({ v: g, l: genreLabel(g) }))], f.genre)}</select></label>
      <label class="field"><span>語数</span><select name="length">${opt(LENGTHS, f.length)}</select></label>
      <label class="field"><span>状態</span><select name="status">${opt(STATUSES, f.status)}</select></label>
      <label class="field"><span>並び順</span><select name="sort">${opt(SORTS, f.sort)}</select></label>
    </form>
    <p class="muted small" id="libCount" aria-live="polite"></p>
    <div class="book-list" id="bookList"></div>
  </div>`;

  const form = root.querySelector('.filters');
  const list = root.querySelector('#bookList');
  const countEl = root.querySelector('#libCount');

  function draw() {
    const wpm = estimateWpm(store.state);
    const len = LENGTHS.find((l) => l.v === f.length) || LENGTHS[0];
    let items = books
      .map((b) => ({ b, s: bookStatus(b) }))
      .filter(({ b, s }) => (f.level === 'all' || b.level === Number(f.level))
        && (f.genre === 'all' || b.genres.includes(f.genre))
        && len.test(b.wordCount)
        && (f.status === 'all' || s.key === f.status));
    const sorters = {
      level: (x, y) => x.b.level - y.b.level || x.b.wordCount - y.b.wordCount,
      short: (x, y) => x.b.wordCount - y.b.wordCount,
      long: (x, y) => y.b.wordCount - x.b.wordCount,
      title: (x, y) => x.b.title.localeCompare(y.b.title, 'en'),
    };
    items = items.sort(sorters[f.sort] || sorters.level);
    countEl.textContent = `${items.length}冊`;
    list.innerHTML = items.length ? items.map(({ b, s }) => card(b, s, wpm)).join('')
      : '<p class="empty">条件に合う本がありません。絞り込みをゆるめてみてください。</p>';
  }

  function card(b, s, wpm) {
    const L = levelInfo(b.level);
    const min = Math.max(1, Math.round(b.wordCount / wpm));
    const pct = s.active && b.wordCount ? Math.round(((s.active.position || 0) / b.wordCount) * 100) : 0;
    const badge = s.active ? `<span class="badge">読みかけ ${pct}%</span>`
      : s.finished ? `<span class="badge done">読了${s.finished > 1 ? ` ×${s.finished}` : ''}</span>`
        : s.abandoned ? '<span class="badge muted">中断</span>' : '';
    const href = `#/read/${encodeURIComponent(b.id)}`;
    return `<article class="book-card">
      <div class="book-top"><span class="lv lv-${b.level}">Lv${b.level}</span>
        <span class="muted small">${L ? `ERF ${esc(L.erf)} · CEFR ${esc(L.cefr)}` : ''}</span>${badge}</div>
      <h2 class="book-title" lang="en"><a href="${href}">${esc(b.title)}</a></h2>
      ${b.author ? `<p class="book-author muted small" lang="en">${esc(b.author)}</p>` : ''}
      <p class="book-summary">${esc(b.summary)}</p>
      <ul class="facts"><li>${fmt(b.wordCount)}語</li><li>約${min}分</li>${b.genres.map((g) => `<li>${esc(genreLabel(g))}</li>`).join('')}${b.origin === 'imported' ? '<li>追加した本</li>' : ''}</ul>
      <div class="card-actions">
        <a class="btn ${s.active ? 'btn-primary' : ''}" href="${href}">${s.active ? '続きを読む' : s.finished ? 'もう一度読む' : '読む'}</a>
        ${s.active ? `<button type="button" class="btn btn-quit" data-quit="${esc(s.active.id)}">つまらないので中断</button>` : ''}
      </div>
    </article>`;
  }

  form.addEventListener('change', (e) => {
    const k = e.target.name;
    if (!k) return;
    f[k] = e.target.value;
    ssSet('tadoku:filters', f);
    draw();
  });

  root.addEventListener('click', (e) => {
    const lvBtn = e.target.closest('[data-filter-lv]');
    if (lvBtn) {
      f.level = lvBtn.dataset.filterLv;
      form.elements.level.value = f.level;
      ssSet('tadoku:filters', f);
      draw();
      return;
    }
    const q = e.target.closest('[data-quit]');
    if (!q) return;
    const r = store.state.readings.find((x) => x.id === q.dataset.quit);
    if (!r) return;
    const prev = { status: r.status, endedAt: r.endedAt, updatedAt: r.updatedAt };
    abandonReading(r);
    store.save();
    draw();
    toast(`「${r.title}」を中断として記録しました（${fmt(r.wordsRead)}語）`, {
      action: '元に戻す',
      onAction: () => { Object.assign(r, prev); store.save(); draw(); },
    });
  });

  draw();
}
