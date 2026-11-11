// HTMLだけで描く単系列の棒グラフ（ホバーで値表示・表でも確認可）
import { esc } from './ui.js';
import { fmt } from './stats.js';

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/**
 * @param {{title: string, unit: string, items: {label: string, full?: string, value: number}[],
 *   goal?: number|null, labelEvery?: number, valueName?: string}} o
 */
export function barChart({ title, unit, items, goal = null, labelEvery = 1, valueName = '値' }) {
  const max = niceMax(Math.max(1, goal || 0, ...items.map((i) => i.value)));
  const total = items.reduce((a, b) => a + b.value, 0);
  const n = items.length;
  const bars = items.map((it) => `<div class="bar-slot" data-tip="${esc(`${it.full || it.label}：${fmt(it.value)}${unit}`)}">
      <div class="bar${it.value ? '' : ' zero'}" style="height:${(it.value / max) * 100}%"></div></div>`).join('');
  const labels = items.map((it, i) => `<span>${(n - 1 - i) % labelEvery === 0 ? esc(it.label) : ''}</span>`).join('');
  const goalLine = goal ? `<div class="chart-goal" style="bottom:${(goal / max) * 100}%"><span>目標 ${fmt(goal)}${unit}</span></div>` : '';
  return `<figure class="chart">
    <figcaption>${esc(title)}<span class="muted small">　合計 ${fmt(total)}${unit}</span></figcaption>
    <div class="chart-body">
      <div class="chart-y" aria-hidden="true"><span>${fmt(max)}</span><span>${fmt(max / 2)}</span><span>0</span></div>
      <div class="chart-plot" role="img" aria-label="${esc(`${title}の棒グラフ。合計${fmt(total)}${unit}。数値は下の「表で見る」で確認できます。`)}">
        <div class="gridline" style="bottom:100%"></div><div class="gridline" style="bottom:50%"></div>
        ${goalLine}
        <div class="bars" style="--n:${n}">${bars}</div>
      </div>
    </div>
    <div class="chart-x" style="--n:${n}" aria-hidden="true">${labels}</div>
    <details class="chart-table"><summary>表で見る</summary>
      <table><thead><tr><th scope="col">期間</th><th scope="col">${esc(valueName)}（${esc(unit)}）</th></tr></thead>
      <tbody>${items.map((it) => `<tr><td>${esc(it.full || it.label)}</td><td class="num">${fmt(it.value)}</td></tr>`).join('')}</tbody></table>
    </details>
  </figure>`;
}

export function attachTooltips(root) {
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  root.appendChild(tip);
  root.style.position = 'relative';
  root.addEventListener('pointerover', (e) => {
    const s = e.target.closest('.bar-slot');
    if (!s) return;
    tip.textContent = s.dataset.tip;
    tip.hidden = false;
    const rr = root.getBoundingClientRect();
    const sr = s.getBoundingClientRect();
    const br = s.firstElementChild.getBoundingClientRect();
    const half = tip.offsetWidth / 2;
    const x = Math.min(Math.max(sr.left + sr.width / 2 - rr.left, half), rr.width - half);
    tip.style.left = `${x}px`;
    tip.style.top = `${Math.min(br.top, sr.bottom - 2) - rr.top - 8}px`;
  });
  root.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.bar-slot')) tip.hidden = true;
  });
}
