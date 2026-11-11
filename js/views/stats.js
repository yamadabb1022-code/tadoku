import { store, uid, nowISO, localDate, addSession, deleteReading, abandonReading } from '../store.js';
import {
  totals, streak, lastNDays, lastNWeeks, milestoneDates, MILESTONES, fmt, fmtDuration, parseDate,
} from '../stats.js';
import { LEVELS, DIFFICULTY_LABELS } from '../levels.js';
import { barChart, attachTooltips } from '../charts.js';
import { esc, toast, confirmDialog, ssGet, ssSet } from '../ui.js';

const STATUS_LABELS = { reading: '読書中', finished: '読了', abandoned: '中断' };
const md = (dateStr) => { const d = parseDate(dateStr); return `${d.getMonth() + 1}/${d.getDate()}`; };
const dateOf = (iso) => (iso ? localDate(new Date(iso)) : '');

export async function renderStats(root, params) {
  const tab = params.tab === 'external' ? 'external' : 'log';
  document.title = `${tab === 'log' ? '読書記録' : '外部本トラッカー'} – 多読ノート`;
  root.innerHTML = `<div class="page">
    <h1>記録</h1>
    <nav class="tabs" aria-label="記録の種類">
      <a href="#/stats"${tab === 'log' ? ' aria-current="page"' : ''}>読書記録</a>
      <a href="#/stats/external"${tab === 'external' ? ' aria-current="page"' : ''}>外部本トラッカー</a>
    </nav>
    <div id="panel"></div></div>`;
  const panel = root.querySelector('#panel');
  if (tab === 'log') renderLog(panel); else renderExternal(panel);
}

// 再描画のたびにリスナーが重複しないよう、要素ごと差し替える
function freshEl(el) {
  const n = el.cloneNode(false);
  el.replaceWith(n);
  return n;
}

// ---------------- 読書記録 ----------------
function renderLog(el) {
  el = freshEl(el);
  const st = store.state;
  const t = totals(st);
  const sk = streak(st.sessions);
  const ms = milestoneDates(st.sessions);
  const next = MILESTONES.find((m) => m > t.words);
  const prevM = [...MILESTONES].reverse().find((m) => m <= t.words) || 0;
  let metric = ssGet('tadoku:metric', st.settings.goal.type === 'minutes' ? 'minutes' : 'words');
  const history = [...st.readings].sort((a, b) => (b.endedAt || b.updatedAt || b.startedAt || '').localeCompare(a.endedAt || a.updatedAt || a.startedAt || ''));

  el.innerHTML = `
    <section class="stat-grid" aria-label="累計">
      <div class="stat card"><span class="stat-label">累計語数</span><span class="stat-value">${fmt(t.words)}<small>語</small></span></div>
      <div class="stat card"><span class="stat-label">読了</span><span class="stat-value">${t.finished}<small>冊</small></span></div>
      <div class="stat card"><span class="stat-label">中断</span><span class="stat-value">${t.abandoned}<small>冊</small></span></div>
      <div class="stat card"><span class="stat-label">読書時間</span><span class="stat-value sm">${fmtDuration(t.seconds)}</span></div>
      <div class="stat card"><span class="stat-label">連続読書</span><span class="stat-value">${sk.days}<small>日</small></span></div>
    </section>

    <section><h2>マイルストーン</h2>
      <ol class="milestones">${MILESTONES.map((m) => {
        const d = ms[m];
        if (d) return `<li class="done"><span class="ms-n">${fmt(m)}語</span><span class="ms-d">✓ ${esc(d)} 達成</span></li>`;
        if (m === next) {
          const p = Math.min(100, ((t.words - prevM) / (m - prevM)) * 100);
          return `<li class="next"><span class="ms-n">${fmt(m)}語</span>
            <span class="meter sm" role="progressbar" aria-label="${fmt(m)}語までの進み具合" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}"><span style="width:${p}%"></span></span>
            <span class="muted small">あと ${fmt(m - t.words)}語</span></li>`;
        }
        return `<li><span class="ms-n">${fmt(m)}語</span></li>`;
      }).join('')}</ol>
    </section>

    <section>
      <div class="section-head"><h2>推移</h2>
        <div class="seg-toggle" role="radiogroup" aria-label="グラフに表示する値">
          <label><input type="radio" name="metric" value="words"${metric === 'words' ? ' checked' : ''}><span>語数</span></label>
          <label><input type="radio" name="metric" value="minutes"${metric === 'minutes' ? ' checked' : ''}><span>時間</span></label>
        </div></div>
      <div id="charts" class="charts"></div>
    </section>

    <section><h2>履歴</h2>
      ${history.length ? `<div class="table-wrap"><table class="history">
        <thead><tr><th scope="col">日付</th><th scope="col">タイトル</th><th scope="col">Lv</th><th scope="col">語数</th><th scope="col">時間</th><th scope="col">状態</th><th scope="col">面白さ</th><th scope="col">易しさ</th><th scope="col"><span class="visually-hidden">操作</span></th></tr></thead>
        <tbody>${history.map((r) => `<tr>
          <td>${esc(dateOf(r.endedAt || r.updatedAt || r.startedAt))}</td>
          <td lang="en">${esc(r.title)}${r.external ? ' <span class="badge muted" lang="ja">外部</span>' : ''}</td>
          <td>${Number.isInteger(r.level) ? r.level : '–'}</td>
          <td class="num">${fmt(r.wordsRead)}${r.status !== 'finished' && r.totalWords ? `<span class="muted small"> / ${fmt(r.totalWords)}</span>` : ''}</td>
          <td>${fmtDuration(r.seconds)}</td>
          <td>${STATUS_LABELS[r.status] || ''}</td>
          <td>${r.enjoyment ? `${'★'.repeat(r.enjoyment)}<span class="visually-hidden">${r.enjoyment}/5</span>` : '–'}</td>
          <td>${r.difficulty ? DIFFICULTY_LABELS[r.difficulty] : '–'}</td>
          <td><button type="button" class="btn sm ghost" data-del="${esc(r.id)}" aria-label="「${esc(r.title)}」の記録を削除">削除</button></td>
        </tr>`).join('')}</tbody></table></div>` : '<p class="empty">まだ記録がありません。ライブラリから1冊読んでみましょう。</p>'}
    </section>`;

  const charts = el.querySelector('#charts');
  function drawCharts() {
    const days = lastNDays(st.sessions, 30);
    const weeks = lastNWeeks(st.sessions, 12);
    const val = metric === 'words' ? (d) => d.words : (d) => Math.round(d.seconds / 60);
    const unit = metric === 'words' ? '語' : '分';
    const g = st.settings.goal;
    const goalMatches = (g.type === 'words' && metric === 'words') || (g.type === 'minutes' && metric === 'minutes');
    charts.innerHTML = barChart({
      title: '日別（直近30日）', unit, valueName: metric === 'words' ? '語数' : '読書時間',
      items: days.map((d) => ({ label: md(d.date), full: d.date, value: val(d) })), labelEvery: 7,
    }) + barChart({
      title: '週別（直近12週・月曜はじまり）', unit, valueName: metric === 'words' ? '語数' : '読書時間',
      items: weeks.map((w) => ({ label: md(w.start), full: `${w.start} の週`, value: val(w) })),
      goal: goalMatches ? g.weekly : null, labelEvery: 3,
    });
  }
  attachTooltips(charts);
  drawCharts();

  el.querySelector('.seg-toggle').addEventListener('change', (e) => {
    metric = e.target.value;
    ssSet('tadoku:metric', metric);
    const tip = charts.querySelector('.chart-tip');
    drawCharts();
    if (tip) charts.appendChild(tip);
  });

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const r = st.readings.find((x) => x.id === b.dataset.del);
    if (!r) return;
    if (!(await confirmDialog(`「${r.title}」の記録を削除しますか？ 語数・時間も累計から除かれます。`, { ok: '削除する', danger: true }))) return;
    deleteReading(r.id);
    store.save();
    toast('記録を削除しました');
    renderLog(el);
  });
}

// ---------------- 外部本トラッカー ----------------
function renderExternal(el) {
  el = freshEl(el);
  const st = store.state;
  const list = st.readings.filter((r) => r.external)
    .sort((a, b) => (b.updatedAt || b.startedAt || '').localeCompare(a.updatedAt || a.startedAt || ''));
  const today = localDate();
  const lvOpts = `<option value="">不明</option>${LEVELS.map((L) => `<option value="${L.lv}">Lv${L.lv}（${L.erf} / ${L.cefr}）</option>`).join('')}`;

  el.innerHTML = `
    <p class="lead">市販のgraded readersなど、このサイトに本文がない本を記録します。保存するのはタイトル・レベル・語数などだけで、本文は扱いません。語数は累計にも加算されます。</p>
    <form class="card form" id="extForm">
      <h2>本を記録する</h2>
      <div class="field-grid">
        <label class="field wide"><span>タイトル（必須）</span><input name="title" required autocomplete="off"></label>
        <label class="field"><span>レベル</span><select name="level">${lvOpts}</select></label>
        <label class="field"><span>総語数（必須）</span><input name="total" type="number" min="1" required inputmode="numeric"></label>
        <fieldset class="seg wide"><legend>状態</legend><div class="opts">
          <label class="opt"><input type="radio" name="status" value="finished" checked><span>読了</span></label>
          <label class="opt"><input type="radio" name="status" value="reading"><span>読書中</span></label>
          <label class="opt"><input type="radio" name="status" value="abandoned"><span>中断</span></label></div></fieldset>
        <label class="field" id="wordsReadField" hidden><span>ここまで読んだ語数</span><input name="wordsRead" type="number" min="0" inputmode="numeric" value="0"></label>
        <label class="field"><span>日付</span><input name="date" type="date" value="${today}" max="${today}"></label>
        <label class="field"><span>読書時間（分・任意）</span><input name="minutes" type="number" min="0" inputmode="numeric"></label>
        <label class="field"><span>面白かった度（任意）</span><select name="enjoyment"><option value="">–</option>${[1, 2, 3, 4, 5].map((n) => `<option>${n}</option>`).join('')}</select></label>
        <label class="field"><span>易しさ（任意）</span><select name="difficulty"><option value="">–</option>${Object.entries(DIFFICULTY_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      </div>
      <button class="btn btn-primary">記録する</button>
    </form>

    <h2>記録した本</h2>
    ${list.length ? `<ul class="ext-list">${list.map((r) => `<li class="ext-item card">
      <div class="ext-main"><strong lang="en">${esc(r.title)}</strong>
        <span class="muted small">${Number.isInteger(r.level) ? `Lv${r.level} · ` : ''}${fmt(r.totalWords)}語 · ${STATUS_LABELS[r.status]}${r.status !== 'finished' ? `（${fmt(r.wordsRead)}語まで）` : ''}</span></div>
      <div class="ext-actions">
        ${r.status === 'reading' ? `<details class="ext-progress"><summary class="btn sm">進み具合を記録</summary>
          <form class="inline-form" data-progress="${esc(r.id)}">
            <label class="field"><span>今回読んだ語数</span><input name="words" type="number" min="1" required inputmode="numeric"></label>
            <label class="field"><span>分（任意）</span><input name="minutes" type="number" min="0" inputmode="numeric"></label>
            <label class="field"><span>日付</span><input name="date" type="date" value="${today}" max="${today}"></label>
            <button class="btn sm btn-primary">追加</button></form></details>
          <button type="button" class="btn sm" data-ext-finish="${esc(r.id)}">読了にする</button>
          <button type="button" class="btn sm btn-quit" data-ext-quit="${esc(r.id)}">中断する</button>` : ''}
        <button type="button" class="btn sm ghost" data-ext-del="${esc(r.id)}" aria-label="「${esc(r.title)}」の記録を削除">削除</button>
      </div></li>`).join('')}</ul>` : '<p class="empty">まだありません。</p>'}`;

  const form = el.querySelector('#extForm');
  const wrField = el.querySelector('#wordsReadField');
  form.addEventListener('change', (e) => {
    if (e.target.name === 'status') wrField.hidden = e.target.value === 'finished';
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const total = Math.max(1, Number(fd.get('total')) || 0);
    const status = fd.get('status');
    const wordsRead = status === 'finished' ? total : Math.min(total, Math.max(0, Number(fd.get('wordsRead')) || 0));
    const date = fd.get('date') || today;
    const seconds = Math.max(0, Number(fd.get('minutes')) || 0) * 60;
    const iso = new Date(`${date}T12:00:00`).toISOString();
    const r = {
      id: uid('x'), bookId: null, external: true, title: String(fd.get('title')).trim(),
      level: fd.get('level') === '' ? null : Number(fd.get('level')),
      totalWords: total, status, wordsRead, position: 0, seconds,
      startedAt: iso, endedAt: status === 'reading' ? null : iso, updatedAt: nowISO(),
      enjoyment: fd.get('enjoyment') ? Number(fd.get('enjoyment')) : null,
      difficulty: fd.get('difficulty') || null,
    };
    st.readings.push(r);
    addSession(r.id, wordsRead, seconds, date);
    store.save();
    toast(`「${r.title}」を記録しました（${fmt(wordsRead)}語）`);
    renderExternal(el);
  });

  el.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-progress]');
    if (!f) return;
    e.preventDefault();
    const r = st.readings.find((x) => x.id === f.dataset.progress);
    if (!r) return;
    const fd = new FormData(f);
    const words = Math.max(0, Number(fd.get('words')) || 0);
    const seconds = Math.max(0, Number(fd.get('minutes')) || 0) * 60;
    addSession(r.id, words, seconds, fd.get('date') || today);
    r.wordsRead += words;
    r.seconds = (r.seconds || 0) + seconds;
    r.updatedAt = nowISO();
    store.save();
    toast(`${fmt(words)}語を追加しました`);
    renderExternal(el);
  });

  el.addEventListener('click', async (e) => {
    const fin = e.target.closest('[data-ext-finish]');
    const quit = e.target.closest('[data-ext-quit]');
    const del = e.target.closest('[data-ext-del]');
    const id = (fin || quit || del)?.dataset.extFinish || (fin || quit || del)?.dataset.extQuit || (fin || quit || del)?.dataset.extDel;
    const r = id && st.readings.find((x) => x.id === id);
    if (!r) return;
    if (fin) {
      const rest = Math.max(0, r.totalWords - r.wordsRead);
      addSession(r.id, rest, 0);
      r.wordsRead = r.totalWords;
      r.status = 'finished';
      r.endedAt = nowISO();
      r.updatedAt = r.endedAt;
      store.save();
      toast(`読了を記録しました（+${fmt(rest)}語）`);
    } else if (quit) {
      abandonReading(r);
      store.save();
      toast('中断を記録しました');
    } else if (del) {
      if (!(await confirmDialog(`「${r.title}」の記録を削除しますか？`, { ok: '削除する', danger: true }))) return;
      deleteReading(r.id);
      store.save();
      toast('削除しました');
    }
    renderExternal(el);
  });
}
