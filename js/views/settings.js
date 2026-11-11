import { store, normalizeState, localDate } from '../store.js';
import * as db from '../db.js';
import { loadCatalog, validateBook, bookFromText, GENRES, countWords } from '../books.js';
import { LEVELS } from '../levels.js';
import { ttsSupported, englishVoices, onVoicesChanged, speakSample } from '../tts.js';
import { fmt } from '../stats.js';
import {
  esc, toast, confirmDialog, download, displayControlsHTML, bindDisplayControls, applyDisplay,
} from '../ui.js';

const TEMPLATE = {
  id: 'my-book-001',
  title: 'My Book Title',
  author: 'Author Name',
  level: 1,
  genres: ['daily'],
  summary: '日本語の短い紹介文',
  source: { type: 'public-domain', note: 'Where the text came from', url: 'https://www.gutenberg.org/' },
  chapters: [{ title: 'Chapter 1', paragraphs: ['First paragraph.', 'Second paragraph.'] }],
};

export async function renderSettings(root) {
  const s = store.state.settings;
  const imported = await db.getAllBooks();
  const lvOpts = LEVELS.map((L) => `<option value="${L.lv}">Lv${L.lv}（${L.erf} / ${L.cefr}）</option>`).join('');

  root.innerHTML = `<div class="page settings">
    <h1>設定</h1>

    <section class="card" aria-labelledby="h-display">
      <h2 id="h-display">表示</h2>
      <div id="displayCtl">${displayControlsHTML(s)}</div>
      <p class="preview" lang="en">The little mouse hears the lion. She runs to him. She sees the net. “Don’t worry,” she says. “I can help.”</p>
    </section>

    <section class="card" aria-labelledby="h-read">
      <h2 id="h-read">読み方</h2>
      <label class="switch"><input type="checkbox" id="dictOn"${s.dictionary.enabled ? ' checked' : ''}>
        <span>単語をタップしたら辞書を表示する</span></label>
      <p class="hint">多読の基本は辞書を引かずに読むことなので、初期設定はオフです。オフのときは、単語をタップすると「後で確認したい単語」としてマークされます（もう一度タップで解除）。<br>
      オンにすると英英辞書（Free Dictionary API・オンライン時のみ）を使います。調べた単語だけが外部サービスに送信されます。ポップアップから単語のマークもできます。</p>
      <details class="hint"><summary>キーボード操作</summary>
        <ul><li>Tab で各ボタンへ移動、Space / Page Down でスクロール</li>
        <li>本文の単語をダブルクリックなどで選択して <kbd>M</kbd> キー：その単語をマーク／解除</li>
        <li><kbd>Esc</kbd>：辞書や設定パネルを閉じる</li></ul></details>
    </section>

    <section class="card" aria-labelledby="h-tts">
      <h2 id="h-tts">音声（読み上げ）</h2>
      ${ttsSupported ? `<div class="field-grid">
        <label class="field"><span>声</span><select id="voice"></select></label>
        <label class="field"><span>速度 <output id="rateOut">${s.tts.rate.toFixed(1)}×</output></span>
          <input type="range" id="rate" min="0.5" max="1.5" step="0.1" value="${s.tts.rate}"></label>
      </div>
      <button type="button" class="btn sm" id="ttsTest">試しに聞く</button>
      <p class="hint">使える声はブラウザとOSによって異なります。</p>` : '<p>このブラウザは音声合成（Web Speech API）に対応していません。</p>'}
    </section>

    <section class="card" aria-labelledby="h-goal">
      <h2 id="h-goal">週の目標</h2>
      <form id="goalForm" class="field-grid" onsubmit="return false">
        <fieldset class="seg"><legend>目標の種類</legend><div class="opts">
          <label class="opt"><input type="radio" name="gtype" value="words"${s.goal.type === 'words' ? ' checked' : ''}><span>語数</span></label>
          <label class="opt"><input type="radio" name="gtype" value="minutes"${s.goal.type === 'minutes' ? ' checked' : ''}><span>時間（分）</span></label></div></fieldset>
        <label class="field"><span>1週間あたり</span><input type="number" name="weekly" min="1" value="${s.goal.weekly}" inputmode="numeric"></label>
      </form>
      <p class="hint">目安：1日10分なら週に約70分、語数ならレベル次第で5,000〜10,000語くらいです。無理のない量にしましょう。</p>
    </section>

    <section class="card" aria-labelledby="h-books">
      <h2 id="h-books">教材の追加</h2>
      <p class="hint">著作権のある市販本の本文は追加しないでください。Project Gutenberg などのパブリックドメイン作品や、自分で書いた英文を使えます。市販本は「記録 › 外部本トラッカー」で語数だけ記録できます。</p>
      <h3>テキストから追加</h3>
      <form id="textForm" class="field-grid">
        <label class="field wide"><span>タイトル（必須）</span><input name="title" required lang="en"></label>
        <label class="field"><span>著者</span><input name="author" lang="en"></label>
        <label class="field"><span>レベル</span><select name="level">${lvOpts}</select></label>
        <label class="field"><span>ジャンル</span><select name="genre">${Object.entries(GENRES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label class="field wide"><span>紹介文（日本語・任意）</span><input name="summary"></label>
        <label class="field wide"><span>本文（空行で段落を区切る。「# 見出し」で章を分けられます）</span>
          <textarea name="text" rows="8" required lang="en"></textarea></label>
        <p class="muted small wide" id="textCount" aria-live="polite"></p>
        <div class="wide"><button class="btn btn-primary">追加する</button></div>
      </form>
      <h3>JSONファイルから追加</h3>
      <p class="hint">1冊分のJSON、または <code>{"books":[…]}</code> 形式のファイルを読み込めます。</p>
      <div class="row">
        <label class="btn sm"><input type="file" id="bookFile" accept=".json,application/json" multiple class="visually-hidden">ファイルを選ぶ</label>
        <button type="button" class="btn sm ghost" id="tplBtn">テンプレートを保存</button>
      </div>
      <h3>追加した本（${imported.length}冊）</h3>
      ${imported.length ? `<ul class="mini-list">${imported.map((b) => `<li><span lang="en">${esc(b.title)}</span>
        <span class="muted small">Lv${b.level}</span>
        <button type="button" class="btn sm ghost" data-del-book="${esc(b.id)}" aria-label="「${esc(b.title)}」を削除">削除</button></li>`).join('')}</ul>` : '<p class="muted small">まだありません。</p>'}
    </section>

    <section class="card" aria-labelledby="h-data">
      <h2 id="h-data">データ管理</h2>
      <p class="hint">記録はこのブラウザにだけ保存されています。機種変更やブラウザのデータ削除に備えて、ときどきバックアップしてください。</p>
      <div class="row">
        <button type="button" class="btn" id="exportBtn">バックアップを保存（JSON）</button>
        <label class="btn"><input type="file" id="importFile" accept=".json,application/json" class="visually-hidden">バックアップから復元</label>
      </div>
      <p><button type="button" class="btn btn-danger sm" id="resetBtn">すべての記録を消去</button></p>
    </section>

    <section class="card" aria-labelledby="h-levels">
      <h2 id="h-levels">レベル対応表（目安）</h2>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">Lv</th><th scope="col">ERF帯</th><th scope="col">CEFR</th><th scope="col">見出し語数</th><th scope="col">特徴</th></tr></thead>
        <tbody>${LEVELS.map((L) => `<tr><td>${L.lv}</td><td>${L.erf}</td><td>${L.cefr}</td><td>${L.headwords}</td><td>${L.desc}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="hint">ERF Graded Reader Scale・CEFR との対応はおおよその目安です。</p>
    </section>
  </div>`;

  const $ = (sel) => root.querySelector(sel);
  // 再描画時はコンテナごと差し替えてリスナーの重複を防ぐ
  const rerender = () => { offVoices(); const n = root.cloneNode(false); root.replaceWith(n); renderSettings(n); };
  bindDisplayControls($('#displayCtl'));

  $('#dictOn').addEventListener('change', (e) => { s.dictionary.enabled = e.target.checked; store.save(); });

  let offVoices = () => {};
  if (ttsSupported) {
    const sel = $('#voice');
    const fill = () => {
      sel.innerHTML = `<option value="">自動（英語）</option>${englishVoices().map((v) => `<option value="${esc(v.voiceURI)}">${esc(v.name)}（${esc(v.lang)}）</option>`).join('')}`;
      sel.value = s.tts.voiceURI || '';
    };
    fill();
    offVoices = onVoicesChanged(fill);
    sel.addEventListener('change', () => { s.tts.voiceURI = sel.value || null; store.save(); });
    $('#rate').addEventListener('input', (e) => { s.tts.rate = Number(e.target.value); $('#rateOut').textContent = `${s.tts.rate.toFixed(1)}×`; });
    $('#rate').addEventListener('change', () => store.save());
    $('#ttsTest').addEventListener('click', () => speakSample('The little mouse hears the lion. She runs to him.', { rate: s.tts.rate, voiceURI: s.tts.voiceURI }));
  }

  $('#goalForm').addEventListener('change', () => {
    const f = $('#goalForm');
    s.goal.type = f.querySelector('input[name="gtype"]:checked').value;
    s.goal.weekly = Math.max(1, Number(f.elements.weekly.value) || 1);
    store.save();
    toast('目標を保存しました');
  });

  // ---- 教材 ----
  const textForm = $('#textForm');
  textForm.elements.text.addEventListener('input', (e) => { $('#textCount').textContent = `${fmt(countWords(e.target.value))}語`; });
  textForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(textForm);
    const book = bookFromText({
      title: fd.get('title'), author: fd.get('author'), level: fd.get('level'),
      genres: [fd.get('genre')], summary: fd.get('summary'), text: fd.get('text'),
    });
    const errs = validateBook(book);
    if (errs.length) { toast(errs.join(' / ')); return; }
    await db.putBook(book);
    await loadCatalog(true);
    toast(`「${book.title}」を追加しました`);
    rerender();
  });

  $('#bookFile').addEventListener('change', async (e) => {
    let added = 0;
    const problems = [];
    for (const file of e.target.files) {
      try {
        const data = JSON.parse(await file.text());
        const list = Array.isArray(data.books) ? data.books : [data];
        for (const b of list) {
          const errs = validateBook(b);
          if (errs.length) problems.push(`${file.name}: ${errs.join(' / ')}`);
          else { await db.putBook(b); added += 1; }
        }
      } catch (err) {
        problems.push(`${file.name}: JSONとして読めません`);
      }
    }
    await loadCatalog(true);
    if (problems.length) console.warn(problems);
    toast(`${added}冊を追加しました${problems.length ? `（${problems.length}件は形式エラー：${problems[0]}）` : ''}`, { duration: 8000 });
    rerender();
  });

  $('#tplBtn').addEventListener('click', () => download('book-template.json', JSON.stringify(TEMPLATE, null, 2)));

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del-book]');
    if (!b) return;
    if (!(await confirmDialog('この本をライブラリから削除しますか？（読書記録は残ります）', { ok: '削除する', danger: true }))) return;
    await db.deleteBook(b.dataset.delBook);
    await loadCatalog(true);
    toast('削除しました');
    rerender();
  });

  // ---- バックアップ ----
  $('#exportBtn').addEventListener('click', async () => {
    const data = {
      app: 'tadoku-note', exportedAt: new Date().toISOString(),
      userData: store.state, importedBooks: await db.getAllBooks(),
    };
    download(`tadoku-backup-${localDate()}.json`, JSON.stringify(data, null, 2));
  });

  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    let next;
    try {
      data = JSON.parse(await file.text());
      next = normalizeState(data.userData || data);
    } catch (err) {
      toast(`読み込めませんでした：${err.message}`);
      return;
    }
    const books = Array.isArray(data.importedBooks) ? data.importedBooks.filter((b) => !validateBook(b).length) : [];
    const ok = await confirmDialog(`現在の記録を、バックアップ（読書記録${next.readings.length}件・単語${Object.keys(next.words).length}語・追加した本${books.length}冊）で置き換えます。よろしいですか？`, { ok: '置き換える', danger: true });
    if (!ok) return;
    store.replace(next);
    for (const b of books) await db.putBook(b);
    await loadCatalog(true);
    applyDisplay(store.state.settings);
    toast('復元しました');
    rerender();
  });

  $('#resetBtn').addEventListener('click', async () => {
    if (!(await confirmDialog('読書記録・単語メモ・設定をすべて消去します。元に戻せません。先にバックアップを保存することをおすすめします。', { ok: 'すべて消去', danger: true }))) return;
    store.reset();
    await db.clearBooks();
    await loadCatalog(true);
    applyDisplay(store.state.settings);
    toast('消去しました');
    rerender();
  });

  return () => offVoices();
}
