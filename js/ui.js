// 共通UI部品
import { store } from './store.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const mq = window.matchMedia('(prefers-color-scheme: dark)');
let currentTheme = 'auto';

export function applyTheme(theme) {
  currentTheme = theme;
  const eff = theme === 'auto' ? (mq.matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = eff;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f7f6f2';
}
mq.addEventListener('change', () => { if (currentTheme === 'auto') applyTheme('auto'); });

export function applyDisplay(s) {
  const r = document.documentElement;
  r.style.setProperty('--read-size', `${s.fontSize}px`);
  r.style.setProperty('--read-lh', String(s.lineHeight));
  r.style.setProperty('--read-width', `${s.maxWidth}em`);
  r.dataset.font = s.fontFamily;
  applyTheme(s.theme);
}

let toastTimer;
export function toast(message, { action, onAction, duration = 4000 } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(toastTimer);
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" class="toast-action">${esc(action)}</button>` : ''}`;
  el.classList.add('show');
  if (action) {
    el.querySelector('.toast-action').addEventListener('click', () => { el.classList.remove('show'); onAction?.(); }, { once: true });
  }
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? Math.max(duration, 6000) : duration);
}

export function announce(msg) {
  const el = document.getElementById('sr-live');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = msg; }, 30);
}

export function confirmDialog(message, { ok = 'OK', cancel = 'キャンセル', danger = false } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg';
    dlg.innerHTML = `<form method="dialog" class="dlg-body">
      <p class="dlg-message">${esc(message)}</p>
      <div class="dlg-actions">
        <button value="cancel" class="btn ghost">${esc(cancel)}</button>
        <button value="ok" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(ok)}</button>
      </div></form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'ok'); dlg.remove(); });
    dlg.showModal();
  });
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function ssGet(key, fallback) {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
export function ssSet(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できなくても動作に影響なし */ }
}

/** 表示設定（文字サイズ・行間・幅・書体・テーマ）のフォーム */
export function displayControlsHTML(s) {
  return `<div class="field-grid">
    <label class="field"><span>文字サイズ <output data-out="fontSize">${s.fontSize}px</output></span>
      <input type="range" min="14" max="30" step="1" data-set="fontSize" value="${s.fontSize}"></label>
    <label class="field"><span>行間 <output data-out="lineHeight">${s.lineHeight}</output></span>
      <input type="range" min="1.3" max="2.4" step="0.1" data-set="lineHeight" value="${s.lineHeight}"></label>
    <label class="field"><span>本文の幅 <output data-out="maxWidth">${s.maxWidth}em</output></span>
      <input type="range" min="20" max="48" step="1" data-set="maxWidth" value="${s.maxWidth}"></label>
    <label class="field"><span>書体</span>
      <select data-set="fontFamily"><option value="serif">セリフ体（明朝系）</option><option value="sans">サンセリフ体（ゴシック系）</option></select></label>
    <label class="field"><span>テーマ</span>
      <select data-set="theme"><option value="auto">自動（端末の設定）</option><option value="light">ライト</option><option value="sepia">セピア</option><option value="dark">ダーク</option></select></label>
  </div>`;
}

export function bindDisplayControls(el) {
  const s = store.state.settings;
  el.querySelectorAll('select[data-set]').forEach((x) => { x.value = s[x.dataset.set]; });
  let t;
  el.addEventListener('input', (e) => {
    const k = e.target.dataset.set;
    if (!k) return;
    const v = e.target.type === 'range' ? Number(e.target.value) : e.target.value;
    store.state.settings[k] = v;
    const o = el.querySelector(`[data-out="${k}"]`);
    if (o) o.textContent = `${v}${k === 'fontSize' ? 'px' : k === 'maxWidth' ? 'em' : ''}`;
    applyDisplay(store.state.settings);
    clearTimeout(t);
    t = setTimeout(() => store.save(), 300);
  });
}

export const icons = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  library: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h4v16H4zM10 4h4v16h-4zM16.5 4.5l3.8 1-3.9 15-3.8-1z"/></svg>',
  stats: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></svg>',
  words: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  audio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
};
