// レベル定義（ERF Graded Reader Scale の帯・CEFR との対応は目安）
export const LEVELS = [
  { lv: 0, erf: 'Beginner', cefr: 'pre-A1', headwords: '〜300語', desc: 'ごく基本的な語と短い文だけ' },
  { lv: 1, erf: 'Beginner', cefr: 'A1', headwords: '300〜600語', desc: '現在形・過去形中心のやさしい文' },
  { lv: 2, erf: 'Elementary', cefr: 'A2', headwords: '600〜1,200語', desc: '日常的な語彙。会話が増える' },
  { lv: 3, erf: 'Intermediate', cefr: 'B1', headwords: '1,200〜2,000語', desc: '少し長い文や説明文も' },
  { lv: 4, erf: 'Upper-Intermediate', cefr: 'B2', headwords: '2,000〜3,000語', desc: '原作に近い表現が出てくる' },
  { lv: 5, erf: 'Advanced', cefr: 'B2+〜C1', headwords: '3,000語〜', desc: '語彙制限のゆるいリライト' },
  { lv: 6, erf: 'Native', cefr: 'C1〜', headwords: '制限なし', desc: 'リライトなしの原文' },
];

export const levelInfo = (lv) => (Number.isInteger(lv) ? LEVELS[lv] || null : null);

export function levelLong(lv) {
  const L = levelInfo(lv);
  return L ? `Lv${lv}（ERF ${L.erf} / CEFR ${L.cefr}）` : 'レベル不明';
}

/**
 * 直近3件の「易しさ」評価から次のレベルを提案する（参考表示用）。
 * 2件以上「易しすぎ」→ 1段上げる / 2件以上「難しすぎ」→ 1段下げる / 2件以上「ちょうどよい」→ 現状維持
 */
export function suggestLevel(readings) {
  const rated = readings
    .filter((r) => r.difficulty && Number.isInteger(r.level))
    .sort((a, b) => (b.endedAt || b.updatedAt || '').localeCompare(a.endedAt || a.updatedAt || ''))
    .slice(0, 3);
  if (rated.length < 2) return null;
  const base = rated[0].level;
  const count = (d) => rated.filter((r) => r.difficulty === d).length;
  if (count('too_easy') >= 2 && base < 6) return { level: base + 1, from: base, direction: 'up' };
  if (count('too_hard') >= 2 && base > 0) return { level: base - 1, from: base, direction: 'down' };
  if (count('just_right') >= 2) return { level: base, from: base, direction: 'stay' };
  return null;
}

export function suggestionText(s) {
  if (s.direction === 'up') return `最近「易しすぎ」が続いています。Lv${s.level} も試してみませんか？`;
  if (s.direction === 'down') return `最近「難しすぎ」が続いています。Lv${s.level} に戻すと、もっと楽に読めるかもしれません。`;
  return `Lv${s.level} がちょうどよさそうです。このレベルでたくさん読みましょう。`;
}

export const DIFFICULTY_LABELS = { too_easy: '易しすぎ', just_right: 'ちょうどよい', too_hard: '難しすぎ' };
