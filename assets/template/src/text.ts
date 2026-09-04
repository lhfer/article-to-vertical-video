// Pure text helpers shared by captions, hooks and the narration fitter. Mirrors scripts/lint_content.mjs.

const isSpace = (cp: number) => cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x3000 || cp === 0xa0;

/** CJK 1, ASCII 0.6, whitespace 0 — the same weighting lint uses for the 14-char caption rule. */
export const weightedLen = (s: string): number => {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isSpace(cp)) continue;
    n += cp >= 0x21 && cp <= 0x7e ? 0.6 : 1;
  }
  return n;
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Split text into hot / plain runs. Only the first occurrence of each hot word is marked. */
export const splitHot = (text: string, hot: string[] = []): { t: string; hot: boolean }[] => {
  const words = hot.filter((h) => h && text.includes(h));
  if (words.length === 0) return [{ t: text, hot: false }];
  const re = new RegExp(`(${words.map(escapeRe).join("|")})`);
  const out: { t: string; hot: boolean }[] = [];
  let rest = text;
  const used = new Set<string>();
  while (rest.length > 0) {
    const m = re.exec(rest);
    if (!m || m.index === undefined) {
      out.push({ t: rest, hot: false });
      break;
    }
    if (m.index > 0) out.push({ t: rest.slice(0, m.index), hot: false });
    const w = m[0];
    out.push({ t: w, hot: !used.has(w) });
    used.add(w);
    rest = rest.slice(m.index + w.length);
  }
  return out.filter((p) => p.t.length > 0);
};

const CJK_RANGE = "\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff";
const CJK_RE = new RegExp(`^[${CJK_RANGE}]$`);
const TOKEN_RE = new RegExp(`[A-Za-z0-9][A-Za-z0-9.%+\\-]*|[${CJK_RANGE}]+|[^\\sA-Za-z0-9${CJK_RANGE}]+`, "g");

export const isCJK = (ch: string | undefined): boolean => ch !== undefined && CJK_RE.test(ch);

// Chrome (the renderer) and Node ship ICU with a Chinese dictionary: Intl.Segmenter gives real word boundaries,
// deterministically. Falls back to 2–3-char chunks where it is unavailable.
const SEGMENTER: Intl.Segmenter | null = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter("zh-CN", { granularity: "word" }) : null;

const PARTICLE = /^[的得地了着过们儿子吗呢吧啊呀哦嘛么]$/;

/** Cut a Chinese run into words (dictionary based), merging one-char words into a neighbour so tokens stay ≥ 2 chars. */
const cjkWords = (run: string): string[] => {
  const chars = [...run];
  if (chars.length <= 4) return [run];
  let words: string[];
  if (SEGMENTER) {
    const raw = Array.from(SEGMENTER.segment(run), (s) => s.segment).filter((w) => w.length > 0);
    const merged: string[] = [];
    const len = (w: string) => [...w].length;
    const isANotA = (a: string | undefined, b: string | undefined, c: string | undefined) =>
      a !== undefined && len(a) === 1 && ((b !== undefined && len(b) >= 2 && /^[不没得]/.test(b) && [...b][1] === a) || (b !== undefined && /^[不没得]$/.test(b) && c !== undefined && c.startsWith(a)));
    for (let i = 0; i < raw.length; i++) {
      const w = raw[i];
      const next = raw[i + 1];
      const prev = merged[merged.length - 1];
      if (len(w) !== 1) {
        merged.push(w);
      } else if (isANotA(w, next, raw[i + 2])) {
        // 吃不吃 / 值不值 stays together
        const two = len(next as string) >= 2;
        merged.push(two ? w + (next as string) : w + (next as string) + (raw[i + 2] as string));
        i += two ? 1 : 2;
      } else if (PARTICLE.test(w) && prev !== undefined) {
        merged[merged.length - 1] = prev + w; // 的了着… attach backwards
      } else if (isANotA(next, raw[i + 2], raw[i + 3])) {
        if (prev !== undefined && len(prev) <= 3) merged[merged.length - 1] = prev + w;
        else merged.push(w);
      } else if (next !== undefined && len(next) <= 2) {
        merged.push(w + next); // verbs / pronouns attach forwards
        i++;
      } else if (prev !== undefined && len(prev) <= 3) {
        merged[merged.length - 1] = prev + w;
      } else {
        merged.push(w);
      }
    }
    words = merged;
  } else {
    const n = Math.ceil(chars.length / 3);
    const size = Math.ceil(chars.length / n);
    words = [];
    for (let i = 0; i < chars.length; i += size) words.push(chars.slice(i, i + size).join(""));
  }
  return words;
};

/**
 * Split a phrase into "words" for word-by-word animation. Hot words become their own token; Latin/number runs are one
 * token each; Chinese runs are cut into dictionary words (Intl.Segmenter); punctuation sticks to the previous token.
 */
export const splitWords = (text: string, hot: string[] = []): string[] => {
  const out: string[] = [];
  for (const seg of splitHot(text, hot)) {
    if (seg.hot) {
      out.push(seg.t);
      continue;
    }
    for (const tk of seg.t.match(TOKEN_RE) ?? []) {
      if (/^[A-Za-z0-9]/.test(tk)) {
        out.push(tk);
      } else if (isCJK(tk[0])) {
        out.push(...cjkWords(tk));
      } else if (out.length > 0) {
        out[out.length - 1] += tk; // punctuation
      } else {
        out.push(tk);
      }
    }
  }
  return out.length > 0 ? out : [text];
};

/** Deterministic 0..1 hash of an index/salt pair (particles, jitter). No Math.random anywhere. */
export const seeded = (i: number, k: number): number => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Format a number: integers stay integers (decided from the TARGET value, never the animated one). */
export const fmtNumber = (target: number, shown: number, unit = ""): string => {
  const decimals = Number.isInteger(target) ? 0 : Math.min(2, (String(target).split(".")[1] ?? "").length || 1);
  let v = target >= 0 ? Math.min(shown, target) : Math.max(shown, target);
  if (unit === "%") v = Math.min(v, 100);
  return `${v.toFixed(decimals)}${unit}`;
};

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Hot words declared on a beat's lines that actually occur in `text` (for big phrases: hook, kinetic, take, cta). */
export const hotIn = (text: string, lines: { hot?: string[] }[] | undefined): string[] => {
  const out: string[] = [];
  for (const l of lines ?? []) for (const h of l.hot ?? []) if (h && text.includes(h) && !out.includes(h)) out.push(h);
  return out;
};

/** Approximate rendered width of a phrase in em (CJK ≈ 1 em, ASCII ≈ 0.6 em, spaces ≈ 0.3 em). */
export const emWidth = (s: string): number => {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    n += isSpace(cp) ? 0.3 : cp >= 0x21 && cp <= 0x7e ? 0.6 : 1.02;
  }
  return n;
};

/** Font size for a big phrase: keep `base` when it fits one line, shrink to ≥ minRatio × base to stay on one line, else fit ≤ maxLines. */
export const fitFontSize = (text: string, base: number, maxWidth: number, maxLines = 2, minRatio = 0.72): number => {
  const em = Math.max(0.5, emWidth(text));
  const oneLine = Math.floor(maxWidth / em);
  if (oneLine >= base) return base;
  if (oneLine >= base * minRatio) return oneLine;
  const multi = Math.floor((maxWidth * maxLines) / (em * 1.08)); // wrap loses some width per line
  return Math.max(Math.round(base * 0.5), Math.min(base, multi));
};

/** Estimated number of wrapped lines for a phrase at a font size. */
export const lineCount = (text: string, size: number, maxWidth: number): number => Math.max(1, Math.ceil((emWidth(text) * size) / Math.max(1, maxWidth)));
