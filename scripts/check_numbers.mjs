#!/usr/bin/env node
/**
 * check_numbers.mjs — article-to-vertical-video v2
 *
 * Every number the video shows or speaks must come from the article (facts) or from a cited
 * source quote (takes). Context-aware: bench rows need their model name nearby, cards need their
 * label nearby, units must sit next to the value.
 *
 *   node check_numbers.mjs <project_dir> <article.md> [--json]
 *
 * exit 0 = no MISS · 1 = at least one MISS · 2 = usage / unreadable input
 * Also exported: checkNumbers(projectDir, articlePath) → { checked, missing, weak, unchecked, stats }
 * (lint_content.mjs --article folds missing → N-MISS, weak → N-WEAK). Node >= 20, built-ins only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ------------------------------------------------------------------ constants
const NEAR_MODEL_BEFORE = 160; // chars before a bench value in which the model name must appear
const NEAR_LABEL_BEFORE = 200; // chars before a card / scorecard value in which a label token must appear
const NEAR_AFTER = 80; // prose often says "78.5% for GPT-5.6 Sol" — allow the name shortly after
const CONTEXT = 40; // ±chars printed for every matched value
const APPROX_WORDS = ["近", "约", "大概", "差不多", "超过", "不到", "两", "几"]; // spoken rounding → skip
const APPROX_WORDS_RE = new RegExp(`(?:${APPROX_WORDS.join("|")})\\s*$`);

/** Unit families: any member found adjacent to the value satisfies the unit. `prefix` members sit before the number ($10). */
const UNIT_FAMILIES = [
  { id: "percent", suffix: ["%", "％", "percent", "pct", "个点", "个百分点"], prefix: [] },
  { id: "times", suffix: ["x", "×", "倍", "times", "X"], prefix: [] },
  { id: "minutes", suffix: ["分钟", "min", "mins", "minute", "minutes", "分"], prefix: [] },
  { id: "seconds", suffix: ["秒", "s", "sec", "secs", "second", "seconds"], prefix: [] },
  { id: "hours", suffix: ["小时", "h", "hr", "hrs", "hour", "hours"], prefix: [] },
  { id: "days", suffix: ["天", "day", "days"], prefix: [] },
  { id: "usd", suffix: ["美元", "美金", "USD", "dollar", "dollars"], prefix: ["$", "US$"] },
  { id: "cny", suffix: ["元", "块", "人民币", "RMB", "CNY"], prefix: ["¥", "￥"] },
  { id: "wan", suffix: ["万"], prefix: [] },
  { id: "yi", suffix: ["亿"], prefix: [] },
  { id: "M", suffix: ["M", "million", "百万"], prefix: [] },
  { id: "K", suffix: ["K", "k", "thousand"], prefix: [] },
  { id: "B", suffix: ["B", "billion"], prefix: [] },
  { id: "tokens", suffix: ["token", "tokens"], prefix: [] },
  { id: "fps", suffix: ["fps"], prefix: [] },
  { id: "px", suffix: ["px"], prefix: [] },
  { id: "ms", suffix: ["ms"], prefix: [] },
];
const UNIT_TOKEN_TO_FAMILY = new Map();
for (const f of UNIT_FAMILIES) for (const u of [...f.suffix, ...f.prefix]) UNIT_TOKEN_TO_FAMILY.set(u, f);
// Units that may follow a number with no space in running text (used when extracting numbers from our own copy).
const TEXT_UNIT_RE = "%|％|×|x|X|倍|个点|个百分点|分钟|秒|小时|天|美元|美金|元|万|亿|M|K|B|tokens?|fps|px|ms";
const TEXT_PREFIX_RE = "\\$|US\\$|¥|￥";

// ------------------------------------------------------------------ helpers
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lowerAscii = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase()); // length-preserving
const isCjk = (ch) => /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u.test(ch);
const hasLetter = (s) => /[A-Za-z\u3400-\u9fff]/u.test(s);

/**
 * Normalize text for matching: full-width digits → ASCII, ％ → %, ‑ ‐ ‒ − → -, whitespace runs → one space.
 * Returns { norm, map } where map[i] = offset in the original string of norm[i] (for context printing).
 */
export function normalizeText(text) {
  const src = String(text ?? "");
  let norm = "";
  const map = [];
  let inSpace = false;
  for (let i = 0; i < src.length; i++) {
    let ch = src[i];
    const cp = ch.codePointAt(0);
    if (/\s/u.test(ch) || cp === 0x3000 || cp === 0x200b || cp === 0x2060) {
      if (inSpace) continue;
      inSpace = true; norm += " "; map.push(i); continue;
    }
    inSpace = false;
    if (cp >= 0xff10 && cp <= 0xff19) ch = String.fromCharCode(cp - 0xff10 + 0x30);
    else if (ch === "％") ch = "%";
    else if (cp === 0x2010 || cp === 0x2011 || cp === 0x2012 || cp === 0x2212) ch = "-";
    else if (ch === "．") ch = ".";
    norm += ch; map.push(i);
  }
  map.push(src.length);
  return { norm, map, src };
}

/** Markdown table blocks in the ORIGINAL text: [{start, end}] offsets. Blank lines inside a block are allowed. */
function tableBlocks(src) {
  const blocks = [];
  let pos = 0, cur = null, lastTableEnd = 0;
  for (const line of src.split("\n")) {
    const end = pos + line.length;
    const trimmed = line.trim();
    if (/^\|/.test(trimmed)) {
      if (!cur) cur = { start: pos };
      lastTableEnd = end;
    } else if (trimmed === "") {
      /* blank: keep the block open */
    } else {
      if (cur) { blocks.push({ start: cur.start, end: lastTableEnd }); cur = null; }
    }
    pos = end + 1;
  }
  if (cur) blocks.push({ start: cur.start, end: lastTableEnd });
  return blocks;
}

/** Article index: normalized text + lowercase copy + table blocks in normalized offsets. */
export function indexArticle(text) {
  const { norm, map, src } = normalizeText(text);
  const lower = lowerAscii(norm);
  const toNorm = (origOff) => { // first norm index whose original offset >= origOff
    let lo = 0, hi = map.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (map[mid] < origOff) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const blocks = tableBlocks(src).map((b) => ({ start: toNorm(b.start), end: toNorm(b.end) }));
  let cjk = 0, total = 0;
  for (const ch of norm) { if (ch === " ") continue; total++; if (isCjk(ch)) cjk++; }
  return { norm, lower, map, src, blocks, cjkRatio: total ? cjk / total : 0 };
}

/** Number forms that should be treated as the same printed value: 96 ↔ 96.0, 1000 ↔ 1,000, 72.6 ↔ 72.60. */
export function numberForms(raw) {
  const s = String(raw).trim().replace(/,/g, "");
  const forms = new Set([s]);
  const n = Number(s);
  if (Number.isFinite(n)) {
    if (Number.isInteger(n)) {
      // "96" ↔ "96.0" ↔ "96.00"; but an explicit "4.0" in our copy (Terminal-Bench 4.0) never matches a bare "4"
      if (!s.includes(".")) { forms.add(String(n)); if (Math.abs(n) >= 1000) forms.add(n.toLocaleString("en-US")); }
      forms.add(`${n}.0`); forms.add(`${n}.00`);
    } else {
      forms.add(String(n));
      const dec = (s.split(".")[1] ?? "").length;
      if (dec === 1) forms.add(n.toFixed(2));
      if (dec === 2 && s.endsWith("0")) forms.add(n.toFixed(1));
    }
  }
  return [...forms].filter(Boolean);
}

const unitFamilyOf = (unit) => {
  const u = String(unit ?? "").trim();
  if (!u) return null;
  return UNIT_TOKEN_TO_FAMILY.get(u) ?? UNIT_TOKEN_TO_FAMILY.get(u.toLowerCase()) ?? { id: u, suffix: [u], prefix: [] };
};

/**
 * Find every occurrence of `raw` (any printed form) in the indexed text, with number boundaries.
 * Each hit: { start, end, unitOk } — unitOk = the unit family sits adjacent (spaces / one hyphen allowed), or no unit required.
 */
export function findValue(idx, raw, unit) {
  const fam = unitFamilyOf(unit);
  const hits = [];
  const text = idx.norm;
  for (const form of numberForms(raw)) {
    const re = new RegExp(`(?<![\\d.,])${esc(form)}(?![\\d]|[.,]\\d)`, "g");
    for (const m of text.matchAll(re)) {
      const start = m.index, end = start + form.length;
      let unitOk = true;
      if (fam) {
        unitOk = false;
        const after = text.slice(end, end + 24);
        for (const u of fam.suffix) {
          const alpha = /^[A-Za-z]+$/.test(u);
          const re2 = new RegExp(`^[ \\-]?${esc(u)}${alpha ? "(?![A-Za-z])" : ""}`, alpha ? "i" : "");
          if (re2.test(after)) { unitOk = true; break; }
        }
        if (!unitOk) {
          const before = text.slice(Math.max(0, start - 8), start);
          for (const u of fam.prefix) if (new RegExp(`${esc(u)} ?$`).test(before)) { unitOk = true; break; }
        }
      }
      hits.push({ start, end, unitOk });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  return hits;
}

/** Does any of `needles` (already lowercase) occur within [from, to) of the lowercase text? ASCII needles need letter boundaries ("sol" ≠ "solve"; "sol2" is a glued footnote and passes). */
function nearAny(idx, needles, from, to) {
  const lo = Math.max(0, from), hi = Math.min(idx.lower.length, to);
  if (hi <= lo) return null;
  const win = idx.lower.slice(lo, hi);
  for (const n of needles) {
    if (!n) continue;
    const head = /^[a-z]/.test(n) ? "(?<![a-z])" : "", tail = /[a-z]$/.test(n) ? "(?![a-rt-z])" : ""; // plural "tokens" still matches "token"
    if (head || tail) { if (new RegExp(`${head}${esc(n)}${tail}`).test(win)) return n; }
    else if (win.includes(n)) return n;
  }
  return null;
}
function inSameBlock(idx, pos, needles) {
  for (const b of idx.blocks) {
    if (pos >= b.start && pos < b.end) return nearAny(idx, needles, b.start, b.end);
  }
  return null;
}
function context(idx, start, end) {
  const s = idx.map[Math.max(0, start)], e = idx.map[Math.min(end, idx.map.length - 1)];
  const src = idx.src;
  const a = Math.max(0, s - CONTEXT), b = Math.min(src.length, e + CONTEXT);
  return `${a > 0 ? "…" : ""}${src.slice(a, s)}【${src.slice(s, e)}】${src.slice(e, b)}${b < src.length ? "…" : ""}`.replace(/\s+/g, " ");
}

/** "Claude Opus 5" → ["claude opus 5", "opus 5"]; "GPT-5.6 Sol" → ["gpt-5.6 sol", "sol"]. Drops pure-number tails. */
export function modelVariants(name) {
  const toks = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const v = toks.slice(i).join(" ");
    if (v.length >= 3 && hasLetter(v)) out.push(lowerAscii(normalizeText(v).norm));
  }
  return [...new Set(out)];
}
/** Label → tokens: split on · / spaces; ≥ 2 chars; pure-Chinese glosses after · dropped when an ASCII token exists. */
export function labelTokens(label) {
  const parts = String(label ?? "").split("·");
  const all = [];
  parts.forEach((part, i) => {
    for (const t of part.split(/[\s（）()【】：:,，]+/).filter(Boolean)) {
      const clean = t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%]+$/gu, "");
      if ([...clean].length < 2) continue;
      const cjk = [...clean].every((ch) => isCjk(ch) || /[\p{P}]/u.test(ch));
      all.push({ tok: lowerAscii(normalizeText(clean).norm), cjk, afterDot: i > 0 });
    }
  });
  const hasAscii = all.some((t) => !t.cjk);
  return [...new Set(all.filter((t) => !(hasAscii && t.cjk && t.afterDot)).map((t) => t.tok))];
}

/**
 * Extract numbers from our own copy (captions / narration / …).
 * Returns [{ raw, unit, index, kind: "checked"|"unchecked", why }]
 *   checked   = has a unit, or a decimal point, or ≥ 3 digits
 *   unchecked = bare integer of ≤ 2 digits (e.g. "GPT-6", "3 件事"), or spoken approximations (近 7 个点)
 */
export function extractNumbers(text, { selfTime = false } = {}) {
  const { norm } = normalizeText(text);
  const out = [];
  const re = new RegExp(`(${TEXT_PREFIX_RE})?\\s*(\\d+(?:,\\d{3})*(?:\\.\\d+)?)\\s?(${TEXT_UNIT_RE})?(?![A-Za-z\\d])`, "gu");
  for (const m of norm.matchAll(re)) {
    const prefix = m[1] ?? "", raw = m[2], suffix = m[3] ?? "";
    const numStart = m.index + m[0].indexOf(raw);
    // "GPT-5.6", "ARC-AGI-3", "v4.1.1": a number glued to letters/version dots is an identifier, not a claim
    const prevCh = norm[numStart - 1] ?? "";
    const nextCh = norm[numStart + raw.length] ?? "";
    const glued = /[A-Za-z\-.]/.test(prevCh) && !prefix;
    if (glued && !suffix) { out.push({ raw, unit: "", index: numStart, kind: "unchecked", why: "型号/编号里的数字" }); continue; }
    if (/[A-Za-z]/.test(nextCh) && !suffix) { out.push({ raw, unit: "", index: numStart, kind: "unchecked", why: "型号/编号里的数字" }); continue; }
    const unit = suffix || (prefix ? prefix.replace(/^US/, "") : "");
    const before = norm.slice(Math.max(0, numStart - 6), numStart);
    if (APPROX_WORDS_RE.test(before)) { out.push({ raw, unit, index: numStart, kind: "unchecked", why: "口语约数（近/约/超过…），不核对" }); continue; }
    const digits = raw.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
    const decimal = raw.includes(".");
    if (!unit && !decimal && digits.length <= 2) { out.push({ raw, unit: "", index: numStart, kind: "unchecked", why: "两位以内的裸整数" }); continue; }
    // "3 分钟讲清 3 件事" in the promise / hook / cta describes the video itself, not the article
    if (selfTime && !decimal && digits.length <= 2 && ["分钟", "秒", "小时", "分"].includes(unit)) { out.push({ raw, unit, index: numStart, kind: "unchecked", why: "视频自述的时长（promise / hook / cta），不核对" }); continue; }
    out.push({ raw, unit, index: numStart, kind: "checked", why: unit ? "带单位" : decimal ? "含小数" : "≥ 3 位数字" });
  }
  return out;
}

// ------------------------------------------------------------------ core
function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Check every number in <projectDir>/content against the article (facts) or sources.json quotes (takes).
 * Returns { checked:[…], missing:[…], weak:[…], unchecked:[…], stats }.
 * Each item: { where, beat, value, unit, hint, context? }.
 */
export function checkNumbers(projectDir, articlePath) {
  const contentDir = path.join(projectDir, "content");
  const script = readJson(path.join(contentDir, "script.json"));
  if (!isObj(script)) throw new Error(`读不到 ${path.join(contentDir, "script.json")}`);
  const bench = readJson(path.join(contentDir, "bench.json"));
  const sources = readJson(path.join(contentDir, "sources.json"));
  if (!fs.existsSync(articlePath)) throw new Error(`原文不存在：${articlePath}`);
  const article = indexArticle(fs.readFileSync(articlePath, "utf8"));
  const sourceById = new Map();
  if (isObj(sources) && Array.isArray(sources.sources)) for (const s of sources.sources) if (isObj(s) && typeof s.id === "string") sourceById.set(s.id, s);
  const sourceIndex = new Map(); // id → indexed quote
  const quoteIndex = (ids) => {
    const key = ids.join("+");
    if (!sourceIndex.has(key)) sourceIndex.set(key, indexArticle(ids.map((id) => String(sourceById.get(id)?.quote ?? "")).join("\n")));
    return sourceIndex.get(key);
  };

  const checked = [], missing = [], weak = [], unchecked = [];
  const item = (where, beat, value, unit, hint, extra = {}) => ({ where, beat: beat ?? null, value: String(value), unit: unit ?? "", hint, ...extra });

  /**
   * Generic check of one value: unit adjacency in `idx`, then "near" needles (model / label tokens).
   * needles = [] → no proximity requirement (captions, takes).
   */
  const checkValue = ({ where, beat, value, unit, needles, idx, nearBefore, kindLabel, againstSource }) => {
    const hits = findValue(idx, value, unit);
    const unitHits = hits.filter((h) => h.unitOk);
    const printed = unit ? `${value}${unit}` : String(value);
    if (!hits.length) {
      missing.push(item(where, beat, value, unit, `${againstSource ? "来源引文" : "原文"}里没有 ${printed}（也试过 ${numberForms(value).join(" / ")}）`));
      return;
    }
    if (!unitHits.length) {
      missing.push(item(where, beat, value, unit, `${againstSource ? "来源引文" : "原文"}里有 ${value} 但旁边没有单位 ${unit}`, { context: context(idx, hits[0].start, hits[0].end) }));
      return;
    }
    if (!needles.length) {
      checked.push(item(where, beat, value, unit, `找到 ${printed}`, { context: context(idx, unitHits[0].start, unitHits[0].end) }));
      return;
    }
    // A Chinese-only label against a (nearly) non-Chinese article cannot be located by words; the value itself was verified.
    if (idx.cjkRatio < 0.05 && needles.every((n) => !/[a-z]/.test(n))) {
      checked.push(item(where, beat, value, unit, `找到 ${printed}（${kindLabel}为中文，原文非中文，未做邻近核对）`, { context: context(idx, unitHits[0].start, unitHits[0].end) }));
      return;
    }
    for (const h of unitHits) {
      const hit = nearAny(idx, needles, h.start - nearBefore, h.start) || nearAny(idx, needles, h.end, h.end + NEAR_AFTER) || inSameBlock(idx, h.start, needles);
      if (hit) { checked.push(item(where, beat, value, unit, `找到 ${printed}，附近有 ${kindLabel}“${hit}”`, { context: context(idx, h.start, h.end) })); return; }
    }
    weak.push(item(where, beat, value, unit, `找到 ${printed}，但 ${nearBefore} 字内没有${kindLabel}（${needles.slice(0, 4).join(" / ")}）——请人工确认是同一个数`, { context: context(idx, unitHits[0].start, unitHits[0].end) }));
  };

  // -- bench rows
  if (isObj(bench) && isObj(bench.tables)) {
    for (const [key, table] of Object.entries(bench.tables)) {
      if (!isObj(table) || !Array.isArray(table.rows)) continue;
      const unit = typeof table.unit === "string" ? table.unit.trim() : "";
      table.rows.forEach((row, i) => {
        if (!isObj(row) || !isNum(row.value)) return;
        checkValue({ where: `bench.${key}.rows[${i}] ${row.model ?? ""}`, beat: null, value: row.value, unit, needles: modelVariants(row.model), idx: article, nearBefore: NEAR_MODEL_BEFORE, kindLabel: "模型名" });
      });
    }
  }

  // -- text fields of every beat
  const beats = Array.isArray(script.beats) ? script.beats.filter(isObj) : [];
  const q = (s) => { const t = String(s).replace(/\s+/g, " "); return `“${[...t].length > 48 ? [...t].slice(0, 48).join("") + "…" : t}”`; };
  const checkText = (where, beat, text, { takeRanges = [], sourceIds = null, selfTime = false } = {}) => {
    if (typeof text !== "string" || !text) return;
    const nums = extractNumbers(text, { selfTime });
    for (const n of nums) {
      if (n.kind === "unchecked") { unchecked.push(item(where, beat, n.raw, n.unit, `${n.why}：${q(text)}`)); continue; }
      if (takeRanges.some(([a, b]) => n.index >= a && n.index < b)) continue; // covered by the take check
      if (sourceIds) {
        if (!sourceIds.length) { missing.push(item(where, beat, n.raw, n.unit, `take 含数字但没有可核对的 source：${q(text)}`)); continue; }
        checkValue({ where, beat, value: n.raw, unit: n.unit, needles: [], idx: quoteIndex(sourceIds), nearBefore: 0, kindLabel: "", againstSource: true });
      } else {
        checkValue({ where, beat, value: n.raw, unit: n.unit, needles: [], idx: article, nearBefore: 0, kindLabel: "" });
      }
    }
  };

  if (Array.isArray(script.chapters)) script.chapters.forEach((c, i) => { if (isObj(c)) { checkText(`chapters[${i}].title`, null, c.title); checkText(`chapters[${i}].sub`, null, c.sub); } });

  for (const b of beats) {
    const id = typeof b.id === "string" ? b.id : "?";
    const kind = b.kind;
    const narration = typeof b.narration === "string" ? b.narration : "";
    const takes = Array.isArray(b.takes) ? b.takes.filter((t) => isObj(t) && typeof t.text === "string" && t.text) : [];
    const takeTexts = takes.map((t) => t.text);
    if (kind === "take" && isObj(b.take) && typeof b.take.text === "string" && b.take.text) takeTexts.push(b.take.text); // the take payload is an opinion too
    const rangesIn = (text) => { // [start,end) of every take text inside `text` (normalized offsets ≈ original: takes are short)
      const norm = normalizeText(text).norm;
      const out = [];
      for (const tt of takeTexts) { const tn = normalizeText(tt).norm; let at = norm.indexOf(tn); while (at >= 0) { out.push([at, at + tn.length]); at = norm.indexOf(tn, at + 1); } }
      return out;
    };
    // takes → sources
    takes.forEach((t, j) => checkText(`beat ${id} takes[${j}]`, id, t.text, { sourceIds: typeof t.source === "string" && sourceById.has(t.source) ? [t.source] : [] }));
    if (kind === "take" && isObj(b.take) && typeof b.take.text === "string") {
      const alreadyCovered = takes.some((t) => b.take.text.includes(t.text) || t.text.includes(b.take.text));
      if (!alreadyCovered) checkText(`beat ${id} take.text`, id, b.take.text, { sourceIds: typeof b.take.source === "string" && sourceById.has(b.take.source) ? [b.take.source] : [] });
    }
    // narration + captions (numbers inside a take sentence are skipped here; hook/promise/cta may state the video's own length)
    const selfTime = ["hook", "promise", "cta"].includes(kind);
    checkText(`beat ${id} narration`, id, narration, { takeRanges: rangesIn(narration), selfTime });
    if (Array.isArray(b.lines)) b.lines.forEach((ln, j) => { if (isObj(ln)) checkText(`beat ${id} lines[${j}]`, id, ln.text, { takeRanges: rangesIn(String(ln.text ?? "")), selfTime }); });
    // cards
    if (Array.isArray(b.cards)) b.cards.forEach((c, j) => {
      if (!isObj(c)) return;
      const viaSource = typeof c.source === "string";
      const idx = viaSource ? (sourceById.has(c.source) ? quoteIndex([c.source]) : null) : article;
      const unit = typeof c.unit === "string" ? c.unit.trim() : "";
      const tokens = labelTokens(c.label);
      if (isNum(c.value)) {
        if (viaSource && !idx) missing.push(item(`beat ${id} cards[${j}].value`, id, c.value, unit, `card.source ${q(c.source)} 不在 sources.json 中`));
        else checkValue({ where: `beat ${id} cards[${j}].value`, beat: id, value: c.value, unit, needles: viaSource ? [] : tokens, idx, nearBefore: NEAR_LABEL_BEFORE, kindLabel: "标签词", againstSource: viaSource });
      }
      if (isNum(c.prev)) {
        const needles = viaSource ? [] : [...modelVariants(c.prevLabel), ...tokens];
        if (viaSource && !idx) missing.push(item(`beat ${id} cards[${j}].prev`, id, c.prev, unit, `card.source ${q(c.source)} 不在 sources.json 中`));
        else checkValue({ where: `beat ${id} cards[${j}].prev`, beat: id, value: c.prev, unit, needles, idx, nearBefore: NEAR_LABEL_BEFORE, kindLabel: "标签/模型名", againstSource: viaSource });
      }
      for (const f of ["label", "sub", "text", "prevLabel"]) if (typeof c[f] === "string") checkText(`beat ${id} cards[${j}].${f}`, id, c[f], viaSource && idx ? { sourceIds: [c.source] } : {});
    });
    // scorecard rows
    if (kind === "scorecard" && isObj(b.scorecard)) {
      checkText(`beat ${id} scorecard.title`, id, b.scorecard.title);
      if (Array.isArray(b.scorecard.rows)) b.scorecard.rows.forEach((r, j) => {
        if (!isObj(r) || !isNum(r.value)) return;
        checkValue({ where: `beat ${id} scorecard.rows[${j}] ${r.label ?? ""}`, beat: id, value: r.value, unit: typeof r.unit === "string" ? r.unit.trim() : "", needles: labelTokens(r.label), idx: article, nearBefore: NEAR_LABEL_BEFORE, kindLabel: "标签词" });
      });
    }
    // payload texts
    const p = isObj(b[kind]) ? b[kind] : null;
    if (p) {
      const fields = { hook: ["text", "sub"], promise: ["text", "items"], bench: ["heading", "footnote"], clip: ["tag"], kinetic: ["text", "sub"], quote: ["text", "by"], steps: ["title", "items"], image: ["caption"], screenshot: ["label"], broll: ["caption"], summary: ["title", "items"], cta: ["question", "sub"], outro: ["lines"] }[kind] ?? [];
      const selfTime = ["hook", "promise", "cta"].includes(kind);
      for (const f of fields) {
        const v = p[f];
        if (Array.isArray(v)) v.forEach((s, j) => checkText(`beat ${id} ${kind}.${f}[${j}]`, id, s, { selfTime }));
        else checkText(`beat ${id} ${kind}.${f}`, id, v, { selfTime });
      }
    }
  }

  const stats = { checked: checked.length, missing: missing.length, weak: weak.length, unchecked: unchecked.length };
  return { ok: missing.length === 0, checked, missing, weak, unchecked, stats };
}

// ------------------------------------------------------------------ CLI
function usage() {
  return `用法: node check_numbers.mjs <project_dir> <article.md> [--json]

核对 <project_dir>/content/{script,bench,sources}.json 里出现的每个数字：
  · bench 行：数值 + 表单位必须紧邻出现在原文里，且 ${NEAR_MODEL_BEFORE} 字内（或同一表格块内）出现该行的模型名（或其末尾词，如 “Opus 5”）
  · 卡片 / 计分卡：数值 + 单位紧邻，${NEAR_LABEL_BEFORE} 字内出现标签词；prev 同理（用 prevLabel）
  · 字幕 / 旁白 / 大字 / 总结 / 结尾等文案：带单位、含小数或 ≥ 3 位的数字必须出现在原文（有单位的要单位紧邻）
  · 两位以内的裸整数（GPT-6、3 件事）和口语约数（近 7 个点、约 40 分钟）只列为 unchecked，不算失败
  · take（观点）句里的数字改为对照 sources.json 里引用来源的 quote；没有 source 即 MISS
  · 带 card.source 的卡片同样对照来源引文
输出：人读模式逐条打印匹配上下文（±${CONTEXT} 字）；--json 输出 {ok, checked, missing:[{where,value,unit,hint}], weak:[…], unchecked:[…], stats}
  MISS = 没找到 → exit 1；weak = 找到了但附近没有模型名/标签（只报告，不失败）
`;
}

function main(argv) {
  const args = argv.slice(2);
  if (!args.length || args.includes("--help") || args.includes("-h")) { process.stdout.write(usage()); return args.length ? 0 : 2; }
  const json = args.includes("--json");
  const positional = args.filter((a) => !a.startsWith("--"));
  if (positional.length !== 2) { process.stderr.write(usage()); return 2; }
  // exit codes: 0 all numbers sourced · 1 MISS or unreadable input · 2 usage error
  let r;
  try { r = checkNumbers(path.resolve(positional[0]), path.resolve(positional[1])); }
  catch (e) { process.stderr.write(`check_numbers: ${e.message}\n`); return 1; }
  if (json) { process.stdout.write(JSON.stringify(r, null, 2) + "\n"); return r.missing.length ? 1 : 0; }
  const out = [];
  out.push(`check_numbers · ${positional[0]} ← ${positional[1]}`);
  const fmt = (x) => `${x.where}：${/^(\$|US\$|¥|￥)$/.test(x.unit) ? `${x.unit}${x.value}` : `${x.value}${x.unit}`}`;
  out.push(`\n✓ 已核对 ×${r.checked.length}`);
  for (const x of r.checked) out.push(`  ✓ ${fmt(x)}  ← ${x.context ?? ""}`);
  out.push(`\n? 弱匹配 ×${r.weak.length}（找到数值，但附近没有模型名/标签 —— 请人工确认）`);
  for (const x of r.weak) out.push(`  ? ${fmt(x)}  ${x.hint}\n      ← ${x.context ?? ""}`);
  out.push(`\n· 未核对 ×${r.unchecked.length}（裸小整数 / 型号数字 / 口语约数）`);
  for (const x of r.unchecked) out.push(`  · ${fmt(x)}  ${x.hint}`);
  out.push(`\n✗ MISS ×${r.missing.length}`);
  for (const x of r.missing) out.push(`  ✗ ${fmt(x)}  ${x.hint}${x.context ? `\n      ← ${x.context}` : ""}`);
  out.push(`\n结果  ${r.missing.length ? `✗ ${r.missing.length} 个数字没有出处 → exit 1` : "✓ 所有数字都有出处"}（核对 ${r.checked.length} · 弱匹配 ${r.weak.length} · 未核对 ${r.unchecked.length}）`);
  process.stdout.write(out.join("\n") + "\n");
  return r.missing.length ? 1 : 0;
}

const isEntry = (() => { try { return process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (isEntry) process.exit(main(process.argv));
