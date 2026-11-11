// 教材の読み込み（books/*.json ＋ IndexedDB の取り込み教材）
import * as db from './db.js';

// 単語の切り出し規則（語数カウント・リーダー表示で共通）
export const WORD_RE = /[A-Za-z0-9]+(?:['’][A-Za-z]+)*(?:-[A-Za-z0-9]+)*/g;

export function countWords(text) {
  const m = String(text).match(WORD_RE);
  return m ? m.length : 0;
}

export const GENRES = {
  fable: '寓話', 'fairy-tale': '昔話・童話', classic: '古典', daily: '日常', mystery: 'ミステリー',
  travel: '旅・異文化', sf: 'SF', drama: 'ドラマ', nonfiction: 'ノンフィクション', science: '科学',
  romance: '恋愛', humor: 'ユーモア', adventure: '冒険', history: '歴史', biography: '伝記',
};
export const genreLabel = (g) => GENRES[g] || g;

export const SOURCE_LABELS = {
  original: '自作',
  'public-domain': 'パブリックドメイン',
  'adapted-pd': 'PD作品を易しく書き直し',
};

export function validateBook(b) {
  const errs = [];
  if (!b || typeof b !== 'object' || Array.isArray(b)) return ['本のデータ（オブジェクト）ではありません'];
  if (!b.id || typeof b.id !== 'string') errs.push('id（文字列）がありません');
  if (!b.title || typeof b.title !== 'string') errs.push('title がありません');
  if (!Number.isInteger(b.level) || b.level < 0 || b.level > 6) errs.push('level は 0〜6 の整数にしてください');
  if (!Array.isArray(b.chapters) || b.chapters.length === 0) errs.push('chapters がありません');
  else if (b.chapters.some((c) => !c || !Array.isArray(c.paragraphs) || c.paragraphs.some((p) => typeof p !== 'string')))
    errs.push('chapters[].paragraphs は文字列の配列にしてください');
  return errs;
}

function normalizeBook(b, origin) {
  const wordCount = b.chapters.reduce((n, c) => n + c.paragraphs.reduce((m, p) => m + countWords(p), 0), 0);
  return {
    ...b,
    author: b.author || '',
    genres: Array.isArray(b.genres) ? b.genres : b.genre ? [b.genre] : [],
    summary: b.summary || '',
    source: b.source || { type: 'original' },
    wordCount,
    origin,
  };
}

let catalog = null;

export async function loadCatalog(force = false) {
  if (catalog && !force) return catalog;
  const books = [];
  const errors = [];
  try {
    const res = await fetch('books/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const idx = await res.json();
    const files = Array.isArray(idx.books) ? idx.books : [];
    const results = await Promise.allSettled(files.map((f) =>
      fetch(`books/${f}`, { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })));
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        const errs = validateBook(r.value);
        if (errs.length) errors.push(`${files[i]}: ${errs.join(' / ')}`);
        else books.push(normalizeBook(r.value, 'bundled'));
      } else {
        errors.push(`${files[i]}: 読み込めませんでした（${r.reason && r.reason.message}）`);
      }
    });
  } catch (e) {
    errors.push(location.protocol === 'file:'
      ? 'ファイルを直接開いているため教材を読み込めません。ローカルサーバー経由で開いてください（README参照）。'
      : `books/index.json を読み込めませんでした（${e.message}）`);
  }
  const imported = await db.getAllBooks();
  for (const b of imported) {
    if (validateBook(b).length) continue;
    const nb = normalizeBook(b, 'imported');
    const i = books.findIndex((x) => x.id === b.id);
    if (i >= 0) books[i] = nb; else books.push(nb);
  }
  catalog = { books, errors };
  return catalog;
}

export function getBook(id) {
  return catalog ? catalog.books.find((b) => b.id === id) || null : null;
}

/** プレーンテキスト（空行で段落区切り、「# 見出し」で章）から本データを作る */
export function bookFromText({ title, author, level, genres, summary, text }) {
  const chapters = [];
  let cur = { title: '', paragraphs: [] };
  for (const block of String(text).replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    const t = block.trim();
    if (!t) continue;
    const lines = t.split('\n');
    if (/^#\s+/.test(lines[0])) {
      if (cur.paragraphs.length || cur.title) chapters.push(cur);
      cur = { title: lines[0].replace(/^#\s+/, '').trim(), paragraphs: [] };
      const rest = lines.slice(1).join(' ').replace(/\s+/g, ' ').trim();
      if (rest) cur.paragraphs.push(rest);
    } else {
      cur.paragraphs.push(t.replace(/\s+/g, ' '));
    }
  }
  if (cur.paragraphs.length || cur.title) chapters.push(cur);
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'book';
  return {
    id: `user-${slug}-${Date.now().toString(36)}`,
    title: String(title).trim(),
    author: String(author || '').trim(),
    level: Number(level),
    genres,
    summary: String(summary || '').trim(),
    source: { type: 'public-domain', note: '利用者が追加' },
    chapters: chapters.filter((c) => c.paragraphs.length),
  };
}
