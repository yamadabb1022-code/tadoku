import { store } from '../store.js';
import { loadCatalog } from '../books.js';
import { totals, streak, thisWeek, MILESTONES, fmt } from '../stats.js';
import { suggestLevel, suggestionText } from '../levels.js';
import { esc } from '../ui.js';

export async function renderHome(root) {
  await loadCatalog();
  const st = store.state;
  const g = st.settings.goal;
  const t = totals(st);
  const sk = streak(st.sessions);
  const wk = thisWeek(st.sessions);
  const cur = g.type === 'words' ? wk.words : Math.floor(wk.seconds / 60);
  const unit = g.type === 'words' ? '語' : '分';
  const pct = g.weekly > 0 ? Math.min(100, (cur / g.weekly) * 100) : 0;
  const next = MILESTONES.find((m) => m > t.words);
  const reading = st.readings
    .filter((r) => !r.external && r.status === 'reading')
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const sug = suggestLevel(st.readings);

  root.innerHTML = `<div class="page">
    <h1 class="visually-hidden">ホーム</h1>
    <section class="card hero" aria-label="読書の状況">
      <div class="stat-row">
        <div class="stat"><span class="stat-label">累計</span><span class="stat-value">${fmt(t.words)}<small>語</small></span></div>
        <div class="stat"><span class="stat-label">連続</span><span class="stat-value">${sk.days}<small>日</small></span></div>
        <div class="stat"><span class="stat-label">読了</span><span class="stat-value">${t.finished}<small>冊</small></span></div>
      </div>
      <div class="goal">
        <div class="goal-head"><span>今週の目標</span><span>${fmt(cur)} / ${fmt(g.weekly)} ${unit}</span></div>
        <div class="meter" role="progressbar" aria-label="今週の目標の進み具合" aria-valuemin="0" aria-valuemax="${g.weekly}" aria-valuenow="${Math.min(cur, g.weekly)}"><div style="width:${pct}%"></div></div>
      </div>
      <p class="muted small">${next ? `次の節目 ${fmt(next)}語まで、あと ${fmt(next - t.words)}語` : '100万語に到達しました。'}${!sk.readToday && sk.days > 0 ? `　・　今日も少し読むと ${sk.days + 1}日連続です` : ''}</p>
    </section>

    ${reading.length ? `<section><h2>読みかけ</h2><ul class="mini-list">${reading.map((r) => `
      <li><a href="#/read/${encodeURIComponent(r.bookId)}">${esc(r.title)}</a>
        <span class="muted small">${r.totalWords ? Math.round(((r.position || 0) / r.totalWords) * 100) : 0}%</span></li>`).join('')}</ul></section>` : ''}

    ${sug ? `<section class="note" aria-label="レベルの提案"><p>${esc(suggestionText(sug))}</p>
      <p class="muted small">参考です。読む本はいつでも自由に選んでください。</p>
      <a class="btn sm" href="#/library?lv=${sug.level}">Lv${sug.level}の本を見る</a></section>` : ''}

    <section class="principles">
      <h2>多読の約束</h2>
      <ol>
        <li><strong>辞書は引かない。</strong>気になる単語はタップでマークだけして、先へ進みます。</li>
        <li><strong>分からないところは飛ばす。</strong>全体の流れがつかめれば十分です。</li>
        <li><strong>つまらなければやめる。</strong>やめた本も、読んだところまで記録されます。</li>
        <li><strong>易しい本をたくさん。</strong>「易しすぎるかな」くらいがちょうどよいレベルです。</li>
      </ol>
    </section>
    <p><a class="btn btn-primary lg" href="#/library">本を選ぶ</a></p>
  </div>`;
}
