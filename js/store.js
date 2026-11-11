// 利用者データ（設定・読書記録・単語メモ）を localStorage に保存する
const KEY = 'tadoku:v1';

export const DEFAULT_SETTINGS = {
  fontSize: 20,
  lineHeight: 1.8,
  maxWidth: 34,
  fontFamily: 'serif',
  theme: 'auto',
  dictionary: { enabled: false },
  tts: { voiceURI: null, rate: 1 },
  goal: { type: 'words', weekly: 5000 },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

function deepMerge(base, over) {
  const out = clone(base);
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(out)) {
    if (!(k in over)) continue;
    const v = over[k];
    if (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge(out[k], v);
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

export function freshState() {
  return { schemaVersion: 1, settings: clone(DEFAULT_SETTINGS), readings: [], sessions: [], words: {} };
}

export function normalizeState(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('データの形式が正しくありません');
  const s = freshState();
  s.settings = deepMerge(DEFAULT_SETTINGS, d.settings);
  if (Array.isArray(d.readings)) s.readings = d.readings.filter((r) => r && r.id);
  if (Array.isArray(d.sessions)) s.sessions = d.sessions.filter((x) => x && x.date && x.readingId);
  if (d.words && typeof d.words === 'object' && !Array.isArray(d.words)) s.words = d.words;
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (e) {
    console.warn('[tadoku] 読み込みに失敗しました', e);
  }
  return freshState();
}

let state = load();

export const store = {
  get state() { return state; },
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('[tadoku] 保存に失敗しました', e);
      window.dispatchEvent(new CustomEvent('tadoku:storage-error'));
      return false;
    }
  },
  replace(next) { state = normalizeState(next); this.save(); },
  reset() { state = freshState(); this.save(); },
};

export function uid(prefix = 'r') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const nowISO = () => new Date().toISOString();

/** 読書セッション（日付×読書記録ごとに集計）に語数・秒数を加算 */
export function addSession(readingId, words, seconds, date = localDate()) {
  words = Math.max(0, Math.round(words || 0));
  seconds = Math.max(0, Math.round(seconds || 0));
  if (!words && !seconds) return;
  const s = state.sessions.find((x) => x.readingId === readingId && x.date === date);
  if (s) { s.words += words; s.seconds += seconds; }
  else state.sessions.push({ readingId, date, words, seconds });
}

/** 読んだ語数を指定値に合わせる（減らす場合は新しい日付から差し引く） */
export function setReadingWords(r, newWords) {
  newWords = Math.max(0, Math.round(newWords || 0));
  let diff = newWords - (r.wordsRead || 0);
  r.wordsRead = newWords;
  if (diff > 0) { addSession(r.id, diff, 0); return; }
  const ss = state.sessions.filter((s) => s.readingId === r.id).sort((a, b) => b.date.localeCompare(a.date));
  for (const s of ss) {
    if (diff >= 0) break;
    const take = Math.min(s.words, -diff);
    s.words -= take;
    diff += take;
  }
  state.sessions = state.sessions.filter((s) => s.words > 0 || s.seconds > 0);
}

export function activeReadingFor(bookId) {
  return state.readings.find((r) => !r.external && r.bookId === bookId && r.status === 'reading') || null;
}

export function readingsFor(bookId) {
  return state.readings.filter((r) => !r.external && r.bookId === bookId);
}

export function deleteReading(id) {
  state.readings = state.readings.filter((r) => r.id !== id);
  state.sessions = state.sessions.filter((s) => s.readingId !== id);
}

export function abandonReading(r) {
  r.status = 'abandoned';
  r.endedAt = nowISO();
  r.updatedAt = r.endedAt;
}

export function normWord(w) {
  return String(w).toLowerCase().replace(/[’‘]/g, "'").replace(/'s$/, '');
}

export function markWord(display, occ) {
  const key = normWord(display);
  let e = state.words[key];
  if (!e) e = state.words[key] = { word: key, count: 0, firstSeen: occ.at, lastSeen: occ.at, occurrences: [] };
  e.count += 1;
  e.lastSeen = occ.at;
  e.occurrences.push(occ);
  return key;
}

export function unmarkWord(display, readingId, i) {
  const key = normWord(display);
  const e = state.words[key];
  if (!e) return;
  const idx = e.occurrences.findIndex((o) => o.readingId === readingId && o.i === i);
  if (idx >= 0) e.occurrences.splice(idx, 1);
  e.count = Math.max(0, e.count - 1);
  if (e.count === 0) delete state.words[key];
}
