// リーダー画面：本文表示・単語マーク・辞書（任意）・朗読・自動記録・読了/中断
import {
  store, uid, nowISO, addSession, setReadingWords, activeReadingFor, abandonReading,
  markWord, unmarkWord, normWord,
} from './store.js';
import { loadCatalog, getBook, WORD_RE, SOURCE_LABELS } from './books.js';
import { levelLong, DIFFICULTY_LABELS } from './levels.js';
import { esc, toast, announce, displayControlsHTML, bindDisplayControls, icons } from './ui.js';
import { Narrator, ttsSupported, englishVoices, onVoicesChanged } from './tts.js';
import { fmt } from './stats.js';

const IDLE_MS = 120000; // 2分操作がなければ読書時間に数えない
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function splitSentences(p) {
  const parts = p.match(/[^.!?]*[.!?]+["”’)\]]*\s*|[^.!?]+$/g);
  return parts && parts.join('') === p ? parts : [p];
}

function buildText(book) {
  let wi = 0;
  let html = '';
  for (const ch of book.chapters) {
    if (ch.title) html += `<h2 class="chapter-title">${esc(ch.title)}</h2>`;
    for (const p of ch.paragraphs) {
      const start = wi;
      let inner = '';
      for (const s of splitSentences(p)) {
        inner += '<span class="s">';
        let last = 0;
        s.replace(WORD_RE, (m, off) => {
          inner += `${esc(s.slice(last, off))}<span class="w" data-i="${wi++}">${esc(m)}</span>`;
          last = off + m.length;
          return m;
        });
        inner += `${esc(s.slice(last))}</span>`;
      }
      html += `<p data-w="${start}" data-n="${wi - start}">${inner}</p>`;
    }
  }
  return { html, total: wi };
}

const dictCache = new Map();
async function lookup(word) {
  if (dictCache.has(word)) return dictCache.get(word);
  const cands = [word];
  if (/ies$/.test(word)) cands.push(word.replace(/ies$/, 'y'));
  if (/es$/.test(word)) cands.push(word.slice(0, -2));
  if (/s$/.test(word)) cands.push(word.slice(0, -1));
  if (/ed$/.test(word)) cands.push(word.slice(0, -2), word.slice(0, -1));
  if (/ing$/.test(word)) cands.push(word.slice(0, -3), `${word.slice(0, -3)}e`);
  for (const c of [...new Set(cands)].slice(0, 4)) {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(c)}`);
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const defs = [];
    for (const entry of data) {
      for (const m of entry.meanings || []) {
        for (const d of (m.definitions || []).slice(0, 2)) {
          if (defs.length < 4) defs.push({ pos: m.partOfSpeech || '', def: d.definition, head: c });
        }
      }
    }
    dictCache.set(word, defs);
    return defs;
  }
  dictCache.set(word, []);
  return [];
}

const diffOptions = (name) => Object.entries(DIFFICULTY_LABELS).map(([v, l]) =>
  `<label class="opt"><input type="radio" name="${name}" value="${v}"><span>${l}</span></label>`).join('');

export async function renderReader(root, params) {
  await loadCatalog();
  const book = getBook(params.id);
  if (!book) {
    root.innerHTML = `<div class="page"><h1>本が見つかりません</h1><p><a href="#/library">ライブラリへ戻る</a></p></div>`;
    return undefined;
  }
  document.body.classList.add('reading');
  document.title = `${book.title} – 多読ノート`;
  const settings = store.state.settings;
  const { html, total } = buildText(book);
  let reading = activeReadingFor(book.id);
  const src = book.source || {};

  root.innerHTML = `
  <div class="reader">
    <div class="reader-bar" role="toolbar" aria-label="リーダーの操作">
      <a class="icon-btn" href="#/library" aria-label="ライブラリへ戻る（記録は自動保存）">${icons.back}</a>
      <div class="reader-bar-title"><span class="t">${esc(book.title)}</span><span class="p" id="rpct">0%</span></div>
      <button type="button" class="icon-btn" id="btnAudio" aria-expanded="false" aria-controls="audioPanel" aria-label="音声で聞く" ${ttsSupported ? '' : 'disabled title="このブラウザは音声合成に対応していません"'}>${icons.audio}</button>
      <button type="button" class="icon-btn text" id="btnDisplay" aria-expanded="false" aria-controls="displayPanel" aria-label="表示の設定">Aa</button>
      <button type="button" class="btn btn-quit sm" data-act="quit">やめる</button>
      <div class="reader-progress" aria-hidden="true"><div id="rbar"></div></div>
    </div>
    <div class="reader-panel" id="displayPanel" hidden>${displayControlsHTML(settings)}</div>
    <div class="reader-panel" id="audioPanel" hidden>
      <div class="audio-row">
        <button type="button" class="btn btn-primary" id="ttsPlay" aria-pressed="false">▶ 再生</button>
        <label class="field inline"><span>速度 <output id="rateOut">${settings.tts.rate.toFixed(1)}×</output></span>
          <input type="range" id="ttsRate" min="0.5" max="1.5" step="0.1" value="${settings.tts.rate}"></label>
        <label class="field inline"><span>声</span><select id="ttsVoice"></select></label>
      </div>
      <p class="hint">画面の上のほうに見えている文から読み上げます。</p>
    </div>
    <article class="reader-text" lang="en" id="rtext">
      <header class="reader-head">
        <h1>${esc(book.title)}</h1>
        <p class="byline" lang="ja">${esc(book.author)}${book.author ? ' · ' : ''}${esc(levelLong(book.level))} · ${fmt(total)}語</p>
      </header>
      ${html}
    </article>
    <section class="reader-end" aria-label="読み終わり">
      <p class="end-note">最後まで来ました。</p>
      <button type="button" class="btn btn-primary lg" data-act="finish">読み終えた</button>
      <p class="source-note">出典：${esc(SOURCE_LABELS[src.type] || src.type || '')}${src.note ? ` — <span lang="en">${esc(src.note)}</span>` : ''}${src.url ? ` <a href="${esc(src.url)}" target="_blank" rel="noopener">原典</a>` : ''}</p>
    </section>
  </div>
  <div class="dict-pop" id="dictPop" role="dialog" aria-label="辞書" hidden></div>
  <dialog class="dlg" id="finishDlg" aria-labelledby="finishTitle">
    <form method="dialog" class="dlg-body">
      <h2 id="finishTitle">読了おめでとうございます</h2>
      <p class="muted">${fmt(total)}語を記録しました。よければ2つだけ教えてください（答えなくても大丈夫です）。</p>
      <fieldset class="seg"><legend>面白かった度</legend>
        <div class="opts">${[1, 2, 3, 4, 5].map((n) => `<label class="opt"><input type="radio" name="enjoyment" value="${n}"><span>${n}</span></label>`).join('')}</div>
        <div class="scale-ends" aria-hidden="true"><span>いまひとつ</span><span>とても面白い</span></div>
      </fieldset>
      <fieldset class="seg"><legend>易しさ</legend><div class="opts">${diffOptions('difficulty')}</div></fieldset>
      <div class="dlg-actions"><button value="skip" class="btn ghost">スキップ</button><button value="save" class="btn btn-primary">記録する</button></div>
    </form>
  </dialog>
  <dialog class="dlg" id="quitDlg" aria-labelledby="quitTitle">
    <form method="dialog" class="dlg-body">
      <h2 id="quitTitle">ここでやめる</h2>
      <p>合わない本はやめてOK。楽しく読める本に替えるのも、多読の大事なコツです。</p>
      <label class="field"><span>記録する語数（読んだところまで）</span>
        <input type="number" name="words" min="0" max="${total}" inputmode="numeric"></label>
      <fieldset class="seg"><legend>易しさ（任意）</legend><div class="opts">${diffOptions('qdifficulty')}</div></fieldset>
      <div class="dlg-actions"><button value="cancel" class="btn ghost">読み続ける</button><button value="quit" class="btn btn-quit-solid">やめて記録する</button></div>
    </form>
  </dialog>`;

  const $ = (sel) => root.querySelector(sel);
  const article = $('#rtext');
  const bar = $('.reader-bar');
  const pctEl = $('#rpct');
  const barEl = $('#rbar');
  const paras = [...article.querySelectorAll('p[data-w]')];
  const sentences = [...article.querySelectorAll('.s')];
  const pop = $('#dictPop');
  const finishDlg = $('#finishDlg');
  const quitDlg = $('#quitDlg');

  let curPos = reading ? reading.position || 0 : 0;
  let maxPos = reading ? reading.wordsRead || 0 : 0;
  let pendingSec = 0;
  let lastActivity = Date.now();
  let ticks = 0;
  let closed = false;
  let raf = 0;
  let popWord = null;

  if (reading && reading.marks) {
    for (const i of reading.marks) article.querySelector(`.w[data-i="${i}"]`)?.classList.add('marked');
  }

  // ---- 位置と記録 ----
  const barBottom = () => bar.getBoundingClientRect().bottom;

  function computePos() {
    const top = barBottom() + 4;
    for (const p of paras) {
      const r = p.getBoundingClientRect();
      if (r.bottom > top) {
        const start = Number(p.dataset.w);
        if (r.top >= top) return start;
        return start + Math.floor((Number(p.dataset.n) * (top - r.top)) / r.height);
      }
    }
    return total;
  }

  function updateProgress() {
    const pct = total ? Math.round((curPos / total) * 100) : 0;
    pctEl.textContent = `${pct}%`;
    barEl.style.width = `${pct}%`;
  }

  function ensureReading() {
    if (reading) return reading;
    const now = nowISO();
    reading = {
      id: uid('r'), bookId: book.id, external: false, title: book.title, author: book.author, level: book.level,
      totalWords: total, status: 'reading', wordsRead: 0, position: 0, seconds: 0,
      startedAt: now, endedAt: null, updatedAt: now, enjoyment: null, difficulty: null, marks: [],
    };
    store.state.readings.push(reading);
    return reading;
  }

  function flush(force = false) {
    if (closed) return;
    const dWords = Math.max(0, maxPos - (reading ? reading.wordsRead : 0));
    if (!reading && !force && dWords === 0 && pendingSec < 30) return;
    if (reading && !force && dWords === 0 && pendingSec === 0 && reading.position === curPos) return;
    const r = ensureReading();
    r.wordsRead = Math.max(r.wordsRead, maxPos);
    r.position = curPos;
    r.seconds += pendingSec;
    r.updatedAt = nowISO();
    addSession(r.id, dWords, pendingSec);
    pendingSec = 0;
    store.save();
  }

  function onScroll() {
    lastActivity = Date.now();
    if (raf) return;
    raf = setTimeout(() => {
      raf = 0;
      curPos = computePos();
      if (curPos > maxPos) maxPos = curPos;
      updateProgress();
    }, 120);
  }
  const onActivity = () => { lastActivity = Date.now(); };
  const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
  const onPageHide = () => flush();

  const timer = setInterval(() => {
    if (document.visibilityState === 'visible' && (Date.now() - lastActivity < IDLE_MS || narrator.playing)) pendingSec += 1;
    ticks += 1;
    if (ticks % 15 === 0) flush();
  }, 1000);

  // ---- 単語マーク ----
  function toggleMark(w) {
    const r = ensureReading();
    const i = Number(w.dataset.i);
    const text = w.textContent;
    r.marks = r.marks || [];
    if (w.classList.contains('marked')) {
      w.classList.remove('marked');
      r.marks = r.marks.filter((x) => x !== i);
      unmarkWord(text, r.id, i);
      announce(`${text} のマークを外しました`);
    } else {
      w.classList.add('marked');
      r.marks.push(i);
      const sentence = (w.closest('.s')?.textContent || '').trim();
      markWord(text, { bookId: book.id, title: book.title, sentence, at: nowISO(), readingId: r.id, i });
      announce(`${text} をマークしました`);
    }
    r.updatedAt = nowISO();
    store.save();
    updateDictMarkBtn();
  }

  // ---- 辞書（設定でオンのときだけ） ----
  function updateDictMarkBtn() {
    const b = pop.querySelector('[data-act="dict-mark"]');
    if (b && popWord) b.textContent = popWord.classList.contains('marked') ? 'マークを外す' : '後で確認（マーク）';
  }

  function positionPop(w) {
    const r = w.getBoundingClientRect();
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const left = Math.min(Math.max(8, r.left + window.scrollX), window.scrollX + document.documentElement.clientWidth - pw - 8);
    const below = r.bottom + ph + 12 < window.innerHeight;
    pop.style.left = `${left}px`;
    pop.style.top = `${(below ? r.bottom + 6 : r.top - ph - 6) + window.scrollY}px`;
  }

  async function openDict(w) {
    popWord = w;
    const key = normWord(w.textContent);
    pop.innerHTML = `<div class="dict-head"><strong lang="en">${esc(key)}</strong>
        <button type="button" class="icon-btn sm" data-act="dict-close" aria-label="辞書を閉じる">×</button></div>
      <div class="dict-body">調べています…</div>
      <div class="dict-actions"><button type="button" class="btn sm" data-act="dict-mark"></button>
        <a class="btn sm ghost" href="https://ejje.weblio.jp/content/${encodeURIComponent(key)}" target="_blank" rel="noopener">Weblio英和</a></div>`;
    updateDictMarkBtn();
    pop.hidden = false;
    positionPop(w);
    const body = pop.querySelector('.dict-body');
    try {
      const defs = await lookup(key);
      if (popWord !== w) return;
      body.innerHTML = defs.length
        ? `${defs[0].head !== key ? `<p class="muted small">→ <span lang="en">${esc(defs[0].head)}</span></p>` : ''}<ol lang="en">${defs.map((d) => `<li><em>${esc(d.pos)}</em> ${esc(d.def)}</li>`).join('')}</ol>`
        : '英英辞書には見つかりませんでした。';
    } catch {
      if (popWord !== w) return;
      body.textContent = navigator.onLine ? '辞書を取得できませんでした。' : 'オフラインのため辞書は使えません。';
    }
    if (popWord === w) positionPop(w);
  }

  function closeDict() {
    if (pop.hidden) return;
    pop.hidden = true;
    const w = popWord;
    popWord = null;
    w?.focus?.();
  }

  article.addEventListener('click', (e) => {
    const w = e.target.closest('.w');
    if (!w) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return;
    if (store.state.settings.dictionary.enabled) openDict(w);
    else toggleMark(w);
  });

  const onDocPointer = (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.w')) closeDict();
  };

  function onKey(e) {
    if (e.key === 'Escape') { closeDict(); return; }
    if (e.target.closest && e.target.closest('input, select, textarea, dialog')) return;
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const sel = window.getSelection();
      const node = sel && sel.anchorNode;
      const el = node && (node.nodeType === 1 ? node : node.parentElement);
      const w = el && el.closest && el.closest('.w');
      if (w && article.contains(w)) { e.preventDefault(); toggleMark(w); sel.removeAllRanges(); }
    }
  }

  // ---- 朗読 ----
  function clearSpeaking() {
    article.querySelector('.s.speaking')?.classList.remove('speaking');
    article.querySelector('.w.speaking')?.classList.remove('speaking');
  }
  function ensureVisible(el) {
    const r = el.getBoundingClientRect();
    const top = barBottom();
    if (r.top < top + 8 || r.bottom > window.innerHeight - 60) {
      window.scrollTo({ top: window.scrollY + r.top - top - window.innerHeight * 0.2, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }
  }
  const playBtn = $('#ttsPlay');
  function setPlayUI(on) {
    playBtn.textContent = on ? '❚❚ 停止' : '▶ 再生';
    playBtn.setAttribute('aria-pressed', String(on));
  }
  const narrator = new Narrator({
    sentences,
    getRate: () => store.state.settings.tts.rate,
    getVoiceURI: () => store.state.settings.tts.voiceURI,
    onSentence(el) { clearSpeaking(); el.classList.add('speaking'); ensureVisible(el); lastActivity = Date.now(); },
    onWord(w) { article.querySelector('.w.speaking')?.classList.remove('speaking'); w?.classList.add('speaking'); },
    onEnd() { setPlayUI(false); clearSpeaking(); },
  });

  function firstVisibleSentence() {
    const top = barBottom();
    const cur = sentences[narrator.index];
    if (cur) {
      const r = cur.getBoundingClientRect();
      if (r.bottom > top && r.top < window.innerHeight) return narrator.index;
    }
    const i = sentences.findIndex((s) => s.getBoundingClientRect().bottom > top + 4);
    return i < 0 ? 0 : i;
  }

  playBtn.addEventListener('click', () => {
    if (narrator.playing) { narrator.stop(); setPlayUI(false); clearSpeaking(); }
    else { narrator.play(firstVisibleSentence()); setPlayUI(true); }
  });
  const rateIn = $('#ttsRate');
  rateIn.addEventListener('input', () => {
    store.state.settings.tts.rate = Number(rateIn.value);
    $('#rateOut').textContent = `${Number(rateIn.value).toFixed(1)}×`;
  });
  rateIn.addEventListener('change', () => { store.save(); narrator.restart(); });
  const voiceSel = $('#ttsVoice');
  function fillVoices() {
    const vs = englishVoices();
    voiceSel.innerHTML = `<option value="">自動（英語）</option>${vs.map((v) => `<option value="${esc(v.voiceURI)}">${esc(v.name)}（${esc(v.lang)}）</option>`).join('')}`;
    voiceSel.value = store.state.settings.tts.voiceURI || '';
  }
  fillVoices();
  const offVoices = onVoicesChanged(fillVoices);
  voiceSel.addEventListener('change', () => {
    store.state.settings.tts.voiceURI = voiceSel.value || null;
    store.save();
    narrator.restart();
  });

  // ---- パネル開閉 ----
  function togglePanel(btn, panel) {
    const open = panel.hidden;
    for (const [b, p] of [[$('#btnAudio'), $('#audioPanel')], [$('#btnDisplay'), $('#displayPanel')]]) {
      p.hidden = true;
      b.setAttribute('aria-expanded', 'false');
    }
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }
  $('#btnAudio').addEventListener('click', (e) => togglePanel(e.currentTarget, $('#audioPanel')));
  $('#btnDisplay').addEventListener('click', (e) => togglePanel(e.currentTarget, $('#displayPanel')));
  bindDisplayControls($('#displayPanel'));

  // ---- 読了・中断 ----
  function finish() {
    narrator.stop();
    setPlayUI(false);
    maxPos = total;
    curPos = 0;
    flush(true);
    const r = reading;
    r.status = 'finished';
    r.endedAt = nowISO();
    r.updatedAt = r.endedAt;
    store.save();
    closed = true;
    finishDlg.showModal();
  }
  finishDlg.addEventListener('close', () => {
    if (finishDlg.returnValue === 'save') {
      const f = finishDlg.querySelector('form');
      const enj = f.querySelector('input[name="enjoyment"]:checked');
      const dif = f.querySelector('input[name="difficulty"]:checked');
      reading.enjoyment = enj ? Number(enj.value) : null;
      reading.difficulty = dif ? dif.value : null;
      store.save();
    }
    location.hash = '#/';
  });

  function openQuit() {
    narrator.stop();
    setPlayUI(false);
    flush();
    quitDlg.querySelector('input[name="words"]').value = String(maxPos);
    quitDlg.showModal();
  }
  quitDlg.addEventListener('close', () => {
    if (quitDlg.returnValue !== 'quit') return;
    const f = quitDlg.querySelector('form');
    const w = Math.min(total, Math.max(0, Number(f.querySelector('input[name="words"]').value) || 0));
    flush(true);
    const r = reading;
    setReadingWords(r, w);
    abandonReading(r);
    const dif = f.querySelector('input[name="qdifficulty"]:checked');
    if (dif) r.difficulty = dif.value;
    store.save();
    closed = true;
    toast(`中断を記録しました（${fmt(w)}語）。次の本へどうぞ。`);
    location.hash = '#/library';
  });

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'quit') openQuit();
    else if (act === 'finish') finish();
    else if (act === 'dict-close') closeDict();
    else if (act === 'dict-mark' && popWord) toggleMark(popWord);
  });

  // ---- イベント登録と再開位置 ----
  window.addEventListener('scroll', onScroll, { passive: true });
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) => window.addEventListener(t, onActivity, { passive: true }));
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('pointerdown', onDocPointer);
  document.addEventListener('keydown', onKey);

  if (reading && reading.position > 0) {
    const w = article.querySelector(`.w[data-i="${reading.position}"]`);
    const p = w && w.closest('p');
    if (p) {
      requestAnimationFrame(() => {
        p.scrollIntoView({ block: 'start' });
        toast('前回の続きから表示しています');
      });
    }
  }
  updateProgress();

  return () => {
    flush();
    closed = true;
    clearInterval(timer);
    narrator.stop();
    offVoices();
    window.removeEventListener('scroll', onScroll);
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) => window.removeEventListener(t, onActivity));
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('pointerdown', onDocPointer);
    document.removeEventListener('keydown', onKey);
  };
}
