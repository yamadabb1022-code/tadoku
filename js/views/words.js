import { store } from '../store.js';
import { esc, confirmDialog, ssGet, ssSet } from '../ui.js';

function highlight(sentence, word) {
  const s = esc(sentence);
  const w = esc(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&#39;/g, '(?:&#39;|’)');
  return s.replace(new RegExp(`(^|[^A-Za-z])(${w}(?:(?:&#39;|’)s)?)(?![A-Za-z])`, 'gi'), '$1<mark>$2</mark>');
}

export function renderWords(root) {
  const st = store.state;
  let q = '';
  let sort = ssGet('tadoku:wordsort', 'count');

  root.innerHTML = `<div class="page">
    <h1>単語メモ</h1>
    <p class="lead">読書中にマークした単語です。覚えようとしなくて大丈夫。気になったときだけ眺めてください。何度も出会う単語は、読んでいるうちに自然と分かってきます。</p>
    <div class="toolbar">
      <label class="field inline"><span class="visually-hidden">単語を検索</span><input type="search" id="wq" placeholder="単語を検索" lang="en"></label>
      <label class="field inline"><span>並び順</span><select id="wsort">
        <option value="count">出会った回数</option><option value="recent">最近マークした順</option><option value="alpha">ABC順</option></select></label>
    </div>
    <p class="muted small" id="wcount" aria-live="polite"></p>
    <ul class="word-list" id="wlist"></ul>
  </div>`;

  const listEl = root.querySelector('#wlist');
  const sortEl = root.querySelector('#wsort');
  sortEl.value = sort;

  function draw() {
    let entries = Object.values(st.words);
    if (q) entries = entries.filter((e) => e.word.includes(q));
    const sorters = {
      count: (a, b) => b.count - a.count || (b.lastSeen || '').localeCompare(a.lastSeen || ''),
      recent: (a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''),
      alpha: (a, b) => a.word.localeCompare(b.word, 'en'),
    };
    entries.sort(sorters[sort]);
    root.querySelector('#wcount').textContent = `${entries.length}語`;
    if (!Object.keys(st.words).length) {
      listEl.innerHTML = '<li class="empty">まだマークした単語はありません。リーダーで単語をタップすると、読書を止めずにマークできます（辞書オフ時）。</li>';
      return;
    }
    listEl.innerHTML = entries.map((e) => `<li class="word-item card">
      <details>
        <summary><span class="word" lang="en">${esc(e.word)}</span><span class="count">${e.count}回</span></summary>
        <ol class="occ">${[...e.occurrences].reverse().map((o) => `<li>
          <p class="occ-sentence" lang="en">${highlight(o.sentence, e.word)}</p>
          <p class="muted small"><span lang="en">${esc(o.title)}</span> · ${esc((o.at || '').slice(0, 10))}</p></li>`).join('')}</ol>
        <div class="word-actions">
          <a class="btn sm ghost" href="https://ejje.weblio.jp/content/${encodeURIComponent(e.word)}" target="_blank" rel="noopener">Weblioで見る</a>
          <button type="button" class="btn sm ghost" data-del="${esc(e.word)}">メモから消す</button>
        </div>
      </details></li>`).join('');
  }

  root.querySelector('#wq').addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); draw(); });
  sortEl.addEventListener('change', () => { sort = sortEl.value; ssSet('tadoku:wordsort', sort); draw(); });
  listEl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    if (!(await confirmDialog(`「${b.dataset.del}」を単語メモから消しますか？`, { ok: '消す', danger: true }))) return;
    delete st.words[b.dataset.del];
    store.save();
    draw();
  });
  draw();
}
