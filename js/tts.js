// Web Speech API による朗読（文ごとに読み上げ、読み上げ位置をハイライト）
export const ttsSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

export function englishVoices() {
  if (!ttsSupported) return [];
  return speechSynthesis.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang));
}

export function onVoicesChanged(fn) {
  if (!ttsSupported) return () => {};
  speechSynthesis.addEventListener('voiceschanged', fn);
  return () => speechSynthesis.removeEventListener('voiceschanged', fn);
}

export function pickVoice(uri) {
  const vs = englishVoices();
  return (uri && vs.find((v) => v.voiceURI === uri)) || vs.find((v) => /en[-_]US/i.test(v.lang)) || vs[0] || null;
}

/** 文要素内の各単語要素の文字オフセット（boundary イベントの charIndex 対応用） */
function wordOffsets(el) {
  if (el._offs) return el._offs;
  const offs = [];
  let pos = 0;
  const walk = (node) => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) pos += c.nodeValue.length;
      else if (c.classList && c.classList.contains('w')) { offs.push({ start: pos, el: c }); pos += c.textContent.length; }
      else walk(c);
    }
  };
  walk(el);
  el._offs = offs;
  return offs;
}

export class Narrator {
  /**
   * @param {{sentences: Element[], getRate: () => number, getVoiceURI: () => string|null,
   *   onSentence?: Function, onWord?: Function, onEnd?: Function}} opts
   */
  constructor(opts) {
    Object.assign(this, opts);
    this.index = -1;
    this.playing = false;
    this.token = 0;
  }

  play(from) {
    if (!ttsSupported) return;
    this.stop();
    this.playing = true;
    const t = this.token;
    // cancel 直後の speak は無視されることがあるため少し待つ
    setTimeout(() => { if (t === this.token && this.playing) this.speak(from); }, 80);
  }

  speak(i) {
    if (i >= this.sentences.length) { this.playing = false; this.onEnd?.(); return; }
    this.index = i;
    const el = this.sentences[i];
    const text = el.textContent;
    if (!/\S/.test(text)) { this.speak(i + 1); return; }
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(this.getVoiceURI());
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    u.rate = this.getRate();
    const token = this.token;
    const offs = wordOffsets(el);
    u.onboundary = (e) => {
      if (token !== this.token || (e.name && e.name !== 'word')) return;
      let hit = null;
      for (const o of offs) { if (o.start <= e.charIndex) hit = o; else break; }
      this.onWord?.(hit && hit.el);
    };
    u.onend = () => { if (token === this.token && this.playing) this.speak(i + 1); };
    u.onerror = (e) => {
      if (token !== this.token || e.error === 'interrupted' || e.error === 'canceled') return;
      this.playing = false;
      this.onEnd?.(e);
    };
    this.onSentence?.(el, i);
    speechSynthesis.speak(u);
  }

  stop() {
    this.token += 1;
    this.playing = false;
    if (ttsSupported) speechSynthesis.cancel();
  }

  /** 速度・声の変更を今の文からすぐ反映 */
  restart() {
    if (this.playing) this.play(Math.max(0, this.index));
  }
}

export function speakSample(text, { rate, voiceURI }) {
  if (!ttsSupported) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(voiceURI);
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
  u.rate = rate;
  setTimeout(() => speechSynthesis.speak(u), 60);
}
