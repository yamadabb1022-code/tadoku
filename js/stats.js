// 読書記録の集計
import { localDate } from './store.js';

export const MILESTONES = [10000, 50000, 100000, 300000, 500000, 1000000];

export const fmt = (n) => Number(n || 0).toLocaleString('ja-JP');

export function fmtDuration(sec) {
  const m = Math.round((sec || 0) / 60);
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  return `${h}時間${m % 60 ? `${m % 60}分` : ''}`;
}

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function weekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 月曜はじまり
  return d;
}

export function totals(state) {
  let words = 0;
  let seconds = 0;
  for (const s of state.sessions) { words += s.words || 0; seconds += s.seconds || 0; }
  const finished = state.readings.filter((r) => r.status === 'finished').length;
  const abandoned = state.readings.filter((r) => r.status === 'abandoned').length;
  return { words, seconds, finished, abandoned };
}

export function streak(sessions) {
  const days = new Set(sessions.filter((s) => s.words > 0 || s.seconds >= 60).map((s) => s.date));
  const d = new Date();
  const readToday = days.has(localDate(d));
  if (!readToday) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(localDate(d))) { n += 1; d.setDate(d.getDate() - 1); }
  return { days: n, readToday };
}

function byDate(sessions) {
  const m = new Map();
  for (const s of sessions) {
    const v = m.get(s.date) || { words: 0, seconds: 0 };
    v.words += s.words || 0;
    v.seconds += s.seconds || 0;
    m.set(s.date, v);
  }
  return m;
}

export function lastNDays(sessions, n) {
  const m = byDate(sessions);
  const out = [];
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    const key = localDate(d);
    out.push({ date: key, ...(m.get(key) || { words: 0, seconds: 0 }) });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function lastNWeeks(sessions, n) {
  const m = new Map();
  for (const s of sessions) {
    const k = localDate(weekStart(parseDate(s.date)));
    const v = m.get(k) || { words: 0, seconds: 0 };
    v.words += s.words || 0;
    v.seconds += s.seconds || 0;
    m.set(k, v);
  }
  const out = [];
  const d = weekStart(new Date());
  d.setDate(d.getDate() - 7 * (n - 1));
  for (let i = 0; i < n; i++) {
    const key = localDate(d);
    out.push({ start: key, ...(m.get(key) || { words: 0, seconds: 0 }) });
    d.setDate(d.getDate() + 7);
  }
  return out;
}

export function thisWeek(sessions) {
  const w = lastNWeeks(sessions, 1)[0];
  return { words: w.words, seconds: w.seconds };
}

/** 自分の読書速度（words per minute）。データが少ないうちは 100 */
export function estimateWpm(state) {
  const internal = new Set(state.readings.filter((r) => !r.external).map((r) => r.id));
  let words = 0;
  let sec = 0;
  for (const s of state.sessions) {
    if (!internal.has(s.readingId) || !s.seconds) continue;
    words += s.words;
    sec += s.seconds;
  }
  if (sec < 300 || words < 300) return 100;
  return Math.min(300, Math.max(40, Math.round(words / (sec / 60))));
}

/** 各マイルストーンを達成した日付 { 10000: '2026-11-03', ... } */
export function milestoneDates(sessions) {
  const m = byDate(sessions);
  const dates = [...m.keys()].sort();
  const out = {};
  let cum = 0;
  let mi = 0;
  for (const d of dates) {
    cum += m.get(d).words;
    while (mi < MILESTONES.length && cum >= MILESTONES[mi]) { out[MILESTONES[mi]] = d; mi += 1; }
  }
  return out;
}
