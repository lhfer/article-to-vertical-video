#!/usr/bin/env node
/**
 * lint_content.mjs — article-to-vertical-video v2
 *
 * Schema + editorial lint for <project_dir>/content/{brief,script,bench,sources}.json
 * (+ optional narration-durations.json). Node >= 20, built-ins only.
 *
 *   node lint_content.mjs <project_dir> [--json] [--strict] [--article <article.md>]
 *
 * exit 0 = clean · 1 = errors · 2 = --strict and warnings only
 * Every rule is listed in RULES below and in references/lint-rules.md.
 * Timing model (fitBeat) is mirrored by scripts/storyboard.py — change both together.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const SCHEMA_DIR = path.join(SKILL_DIR, "schemas");
const REF_DIR = path.join(SKILL_DIR, "references");

// ------------------------------------------------------------------ rules
// [code, level, what it checks]. references/lint-rules.md mirrors this table; run_tests.sh cross-checks both.
export const RULES = [
  ["S-FILE", "ERROR", "必需文件缺失或无法读取（brief.json、script.json 必需；bench.json、sources.json 可选）"],
  ["S-JSON", "ERROR", "JSON 解析失败"],
  ["S-SCHEMA", "ERROR", "不符合 schemas/*.json（类型、必填、枚举、长度、额外字段、模式、范围）"],
  ["L-ID-DUP", "ERROR", "beat id 重复"],
  ["L-ID-PATTERN", "ERROR", "beat id 须匹配 ^[a-z0-9][a-z0-9-]*$ 且 ≤ 32 字符"],
  ["L-PAYLOAD", "ERROR", "缺少与 kind 同名的载荷对象（chapter 除外）"],
  ["L-CHAPTER-REF", "ERROR", "chapter 引用的章节不存在，或 chapter beat 缺 chapter 字段"],
  ["L-CAP-LEN", "ERROR", "字幕加权长度 > 14（中文/全角 1、ASCII 0.6、空白 0）"],
  ["L-CAP-HOT", "ERROR", "每条字幕恰好一个 hot 词，且必须出现在 text 中"],
  ["L-CARD-COUNT", "ERROR", "每个 beat 最多 2 张卡片"],
  ["L-CARD-OVERLAP", "ERROR", "同一 beat 的卡片时间段不能重叠"],
  ["L-FIRST-HOOK", "ERROR", "第一个 beat 必须是 hook"],
  ["L-LAST-CTA", "ERROR", "最后一个 beat 必须是 cta 或 outro；outro 之前必须有 cta"],
  ["L-TURN", "ERROR", "m/l 档必须恰好有一个 role=turn 的 beat"],
  ["L-BENCH-REF", "ERROR", "bench.tables 引用的表必须存在于 bench.json；有 bench beat 就必须有 bench.json"],
  ["L-CLIP-RANGE", "ERROR", "clip（含 hook.visual 的 clip/broll）的 from 必须小于 to"],
  ["L-CLIP-RATE", "ERROR", "clip.rate 必须在 [0.75, 4] 内"],
  ["L-RECT", "ERROR", "focus / highlight 矩形必须落在 w×h 内"],
  ["L-SRC", "ERROR", "src 文件必须存在于 public/ 下（public/ 或对应素材目录还空着时降为 WARN）"],
  ["L-TAKE-TEXT", "ERROR", "take.text 必须是本 beat 旁白或某条字幕的子串"],
  ["L-TAKE-SOURCE", "ERROR", "含数字的 take 必须带 source"],
  ["L-SOURCE-REF", "ERROR", "takes / take 载荷 / cards 引用的 source id 必须存在于 sources.json"],
  ["L-NARR-LEN", "ERROR/WARN", "旁白字数 ≤ (maxSeconds ?? 档默认秒) × 9；超过 1.3 倍为 ERROR，否则 WARN"],
  ["L-BANNED", "ERROR", "旁白含播音腔禁用词（references/banned-words.txt 或内置列表）"],
  ["L-VO-LONG", "ERROR", "旁白太长：clip 的配音秒数 > (to − from) / 0.75（需 narration-durations.json）"],
  ["N-MISS", "ERROR", "（--article）数字未在原文或 sources.json 引文中找到（check_numbers.mjs）"],
  ["L-PERSON", "WARN", "clip / bench / kinetic 的旁白应含第一或第二人称（我 / 你 / 你们 / 咱）"],
  ["L-HOOK-LEN", "WARN", "hook 旁白 ≤ 32 字，hook.text 加权长度 ≤ 16"],
  ["L-SHORT-STRUCT", "WARN", "短版（short=true 的 beat）须含 hook 与 cta，且 ≥ 3 个"],
  ["L-SHORT-LEN", "WARN", "短版预计时长应在 shortVersion.targetSeconds ±25% 内"],
  ["L-TOTAL-LEN", "WARN", "预计总时长应在 brief.targetSeconds ±20% 内"],
  ["L-GLOSSARY", "WARN", "bench 表首次被旁白提到时须带人话别名（表的 alias 或 references/glossary.json）"],
  ["L-SUMMARY", "WARN", "l 档应有一个 summary beat（收藏点）"],
  ["L-DEAD-AIR", "WARN", "有配音时长时：非 chapter 场景的预计秒数 − 配音秒数 > 1.2 s（素材比旁白长，或没有旁白）"],
  ["L-BADGE", "WARN", "account.badge 文件不存在于 public/"],
  ["N-WEAK", "WARN", "（--article）数值在原文找到，但附近没有模型名 / 标签上下文"],
];

const BUILTIN_BANNED = ["登场", "震撼", "重磅", "颠覆", "史诗级", "王炸", "炸裂", "新一代智能已经到来", "见证历史"];
export const TIER_DEFAULT_SECONDS = { xs: 4, s: 6, m: 12, l: 15 }; // narration budget seconds per beat (× 9 chars)
export const CHAPTER_CARD_SECONDS = { xs: 0, s: 0, m: 0.8, l: 1.4 };
export const MAX_SECONDS_NO_VO = { xs: 4, s: 6, m: 10, l: 14 }; // DESIGN §2.1 "max scene w/o VO"
export const BASE_SECONDS_BY_KIND = { hook: 3, promise: 4, bench: 6, kinetic: 3, quote: 4, steps: 5, image: 4, screenshot: 4, scorecard: 5, take: 4, broll: 4, summary: 5, cta: 4, outro: 5 };
export const CHARS_PER_SECOND = 8.4;
export const VO_LEAD = 0.25, VO_TAIL = 0.5, LEAD_TAIL_SECONDS = VO_LEAD + VO_TAIL; // template fitSeconds = VO + lead + tail
export const RATE_FLOOR = 0.75;
export const DEAD_AIR_SECONDS = 1.2;
const KINDS = ["hook", "promise", "chapter", "bench", "clip", "kinetic", "quote", "steps", "image", "screenshot", "scorecard", "take", "broll", "summary", "cta", "outro"];

// ------------------------------------------------------------------ text helpers (mirrored in storyboard.py)
const isSpace = (cp) => cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x3000 || cp === 0xa0;
/** CJK 1, ASCII (letters, digits, punctuation) 0.6, whitespace 0, everything else (full-width, CJK punctuation, symbols) 1. */
export function weightedLen(s) {
  let n = 0;
  for (const ch of String(s ?? "")) {
    const cp = ch.codePointAt(0);
    if (isSpace(cp)) continue;
    n += cp >= 0x21 && cp <= 0x7e ? 0.6 : 1;
  }
  return Math.round(n * 10) / 10;
}
/** Narration length = code points excluding whitespace (punctuation counts: TTS pauses on it). */
export function narrLen(s) {
  let n = 0;
  for (const ch of String(s ?? "")) if (!isSpace(ch.codePointAt(0))) n++;
  return n;
}
export const tierOf = (targetSeconds) => (targetSeconds <= 30 ? "xs" : targetSeconds <= 90 ? "s" : targetSeconds <= 240 ? "m" : "l");
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const hasDigit = (s) => /[0-9０-９]/.test(String(s ?? ""));
const q = (s, max = 60) => {
  const t = String(s ?? "").replace(/\s+/g, " ");
  return `“${[...t].length > max ? [...t].slice(0, max).join("") + "…" : t}”`;
};
const fmt = (n) => (Math.round(n * 10) / 10).toString();

/**
 * Scene timing for one beat — the same model as the template's fitSeconds and storyboard.py:
 *   chapter          → chapter card seconds by tier (0 for xs/s)
 *   VO (duration ?? chars / 8.4) → VO + 0.25 lead + 0.5 tail
 *   no VO            → base seconds by kind, clamped to the tier's max scene without VO
 *   clip             → footage (to − from) / rate always plays fully: seconds = max(VO fit, footage);
 *                      when VO fit > footage the template slows playback down to rate 0.75;
 *                      tooLong = the VO alone exceeds (to − from) / 0.75 (lint L-VO-LONG)
 *   then clamped by minSeconds / maxSeconds.
 */
export function fitBeat(beat, tier, durations) {
  const kind = beat.kind;
  if (kind === "chapter") return { seconds: CHAPTER_CARD_SECONDS[tier] ?? 0, vo: 0, voSource: null, footage: null, tooLong: false };
  const dur = durations && isNum(durations[beat.id]) ? durations[beat.id] : null;
  const chars = narrLen(beat.narration);
  let vo = 0, voSource = null;
  if (dur !== null) { vo = dur; voSource = "duration"; }
  else if (chars > 0) { vo = chars / CHARS_PER_SECOND; voSource = "estimate"; }
  let seconds;
  if (vo > 0) seconds = vo + LEAD_TAIL_SECONDS;
  else {
    let base = BASE_SECONDS_BY_KIND[kind] ?? 4;
    if (kind === "bench" && beat.bench?.mode === "table") base = 1.5;
    seconds = Math.min(base, MAX_SECONDS_NO_VO[tier] ?? 10);
  }
  let footage = null, tooLong = false;
  const c = beat.clip;
  if (kind === "clip" && isObj(c) && isNum(c.from) && isNum(c.to) && c.to > c.from) {
    const rate = isNum(c.rate) && c.rate > 0 ? c.rate : 1;
    footage = (c.to - c.from) / rate;
    tooLong = vo > (c.to - c.from) / RATE_FLOOR;
    seconds = Math.max(seconds, footage);
  }
  if (isNum(beat.minSeconds)) seconds = Math.max(seconds, beat.minSeconds);
  if (isNum(beat.maxSeconds)) seconds = Math.min(seconds, beat.maxSeconds);
  return { seconds, vo, voSource, footage, tooLong };
}

// ------------------------------------------------------------------ minimal JSON-schema (draft-07 subset) validator
const typeName = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const typeMatches = (t, v) => {
  switch (t) {
    case "integer": return typeof v === "number" && Number.isInteger(v);
    case "number": return typeof v === "number" && Number.isFinite(v);
    case "string": return typeof v === "string";
    case "boolean": return typeof v === "boolean";
    case "object": return isObj(v);
    case "array": return Array.isArray(v);
    case "null": return v === null;
    default: return true;
  }
};
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const resolveRef = (root, ref) => {
  if (!ref.startsWith("#/")) throw new Error(`不支持的 $ref: ${ref}`);
  let cur = root;
  for (const seg of ref.slice(2).split("/")) {
    cur = cur?.[seg.replace(/~1/g, "/").replace(/~0/g, "~")];
    if (cur === undefined) throw new Error(`$ref 未找到: ${ref}`);
  }
  return cur;
};
const joinPath = (p, key) => (typeof key === "number" ? `${p}[${key}]` : p ? `${p}.${key}` : key);

/** Returns [{path, message}] — empty when valid. Supports: type, enum, const, required, properties, additionalProperties (bool | schema),
 *  propertyNames, pattern, min/maxLength, minimum/maximum, exclusiveMin/Max, multipleOf, min/maxItems, items (schema | tuple), uniqueItems,
 *  min/maxProperties, $ref (same document), allOf/anyOf/oneOf/not. `default`, `description`, `format` are ignored. */
export function validateSchema(schema, data, root = schema, p = "", out = []) {
  if (schema === true) return out;
  if (schema === false) { out.push({ path: p, message: "不允许出现" }); return out; }
  if (!isObj(schema)) return out;
  if (schema.$ref) return validateSchema(resolveRef(root, schema.$ref), data, root, p, out);
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(t, data))) { out.push({ path: p, message: `类型应为 ${types.join("/")}，实际是 ${typeName(data)}` }); return out; }
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((v) => deepEqual(v, data))) out.push({ path: p, message: `值 ${JSON.stringify(data)} 不在允许范围 [${schema.enum.map((v) => JSON.stringify(v)).join(", ")}]` });
  if (schema.const !== undefined && !deepEqual(schema.const, data)) out.push({ path: p, message: `值必须为 ${JSON.stringify(schema.const)}` });
  if (typeof data === "string") {
    const len = [...data].length;
    if (isNum(schema.minLength) && len < schema.minLength) out.push({ path: p, message: `长度 ${len} 小于最小 ${schema.minLength}` });
    if (isNum(schema.maxLength) && len > schema.maxLength) out.push({ path: p, message: `长度 ${len} 超过最大 ${schema.maxLength}：${q(data)}` });
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(data)) out.push({ path: p, message: `${q(data)} 不匹配模式 ${schema.pattern}` });
  }
  if (typeof data === "number") {
    if (isNum(schema.minimum) && data < schema.minimum) out.push({ path: p, message: `数值 ${data} 小于最小 ${schema.minimum}` });
    if (isNum(schema.maximum) && data > schema.maximum) out.push({ path: p, message: `数值 ${data} 超过最大 ${schema.maximum}` });
    if (isNum(schema.exclusiveMinimum) && data <= schema.exclusiveMinimum) out.push({ path: p, message: `数值 ${data} 必须大于 ${schema.exclusiveMinimum}` });
    if (isNum(schema.exclusiveMaximum) && data >= schema.exclusiveMaximum) out.push({ path: p, message: `数值 ${data} 必须小于 ${schema.exclusiveMaximum}` });
    if (isNum(schema.multipleOf) && Math.abs(data / schema.multipleOf - Math.round(data / schema.multipleOf)) > 1e-9) out.push({ path: p, message: `数值 ${data} 必须是 ${schema.multipleOf} 的倍数` });
  }
  if (Array.isArray(data)) {
    if (isNum(schema.minItems) && data.length < schema.minItems) out.push({ path: p, message: `数组长度 ${data.length} 小于最小 ${schema.minItems}` });
    if (isNum(schema.maxItems) && data.length > schema.maxItems) out.push({ path: p, message: `数组长度 ${data.length} 超过最大 ${schema.maxItems}` });
    if (schema.uniqueItems === true) {
      const seen = new Set();
      data.forEach((v, i) => { const k = JSON.stringify(v); if (seen.has(k)) out.push({ path: joinPath(p, i), message: `数组元素重复：${k}` }); seen.add(k); });
    }
    if (Array.isArray(schema.items)) data.forEach((v, i) => { if (schema.items[i] !== undefined) validateSchema(schema.items[i], v, root, joinPath(p, i), out); });
    else if (schema.items !== undefined) data.forEach((v, i) => validateSchema(schema.items, v, root, joinPath(p, i), out));
  }
  if (isObj(data)) {
    const keys = Object.keys(data);
    if (Array.isArray(schema.required)) for (const r of schema.required) if (!(r in data)) out.push({ path: p, message: `缺少必填字段 ${r}` });
    if (isNum(schema.minProperties) && keys.length < schema.minProperties) out.push({ path: p, message: `字段数 ${keys.length} 小于最小 ${schema.minProperties}` });
    if (isNum(schema.maxProperties) && keys.length > schema.maxProperties) out.push({ path: p, message: `字段数 ${keys.length} 超过最大 ${schema.maxProperties}` });
    const props = isObj(schema.properties) ? schema.properties : {};
    for (const k of keys) {
      if (k in props) validateSchema(props[k], data[k], root, joinPath(p, k), out);
      else if (schema.additionalProperties === false) out.push({ path: p, message: `不允许的额外字段 ${k}` });
      else if (isObj(schema.additionalProperties)) validateSchema(schema.additionalProperties, data[k], root, joinPath(p, k), out);
      if (schema.propertyNames !== undefined) {
        const sub = validateSchema(schema.propertyNames, k, root, joinPath(p, k), []);
        for (const e of sub) out.push({ path: p, message: `字段名 ${JSON.stringify(k)} 不合法：${e.message}` });
      }
    }
  }
  if (Array.isArray(schema.allOf)) for (const s of schema.allOf) validateSchema(s, data, root, p, out);
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((s) => validateSchema(s, data, root, p, []).length === 0)) out.push({ path: p, message: "不满足 anyOf 的任一分支" });
  if (Array.isArray(schema.oneOf) && schema.oneOf.filter((s) => validateSchema(s, data, root, p, []).length === 0).length !== 1) out.push({ path: p, message: "必须恰好满足 oneOf 的一个分支" });
  if (schema.not !== undefined && validateSchema(schema.not, data, root, p, []).length === 0) out.push({ path: p, message: "不允许满足 not 分支" });
  return out;
}

function selfTest() {
  const cases = [
    ["type", { type: "integer" }, 1.5, 1],
    ["required", { type: "object", required: ["a"] }, {}, 1],
    ["enum", { enum: ["a", "b"] }, "c", 1],
    ["additionalProperties", { type: "object", properties: { a: {} }, additionalProperties: false }, { a: 1, b: 2 }, 1],
    ["pattern", { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" }, "Bad_Id", 1],
    ["minimum", { type: "number", minimum: 0.75, maximum: 4 }, 5, 1],
    ["exclusiveMinimum", { type: "number", exclusiveMinimum: 0 }, 0, 1],
    ["minLength", { type: "string", minLength: 2, maxLength: 3 }, "a", 1],
    ["maxLength", { type: "string", maxLength: 3 }, "abcd", 1],
    ["minItems", { type: "array", minItems: 2, maxItems: 3 }, [1], 1],
    ["maxItems", { type: "array", maxItems: 2 }, [1, 2, 3], 1],
    ["items", { type: "array", items: { type: "string" } }, ["a", 1], 1],
    ["properties", { type: "object", properties: { a: { type: "string", maxLength: 2 } } }, { a: "abc" }, 1],
    ["$ref", { definitions: { x: { type: "boolean" } }, properties: { a: { $ref: "#/definitions/x" } } }, { a: "no" }, 1],
    ["propertyNames", { type: "object", propertyNames: { pattern: "^[a-z]+$" } }, { OK: 1 }, 1],
    ["uniqueItems", { type: "array", uniqueItems: true }, ["a", "a"], 1],
    ["additionalProperties-schema", { type: "object", additionalProperties: { type: "number" } }, { a: "x" }, 1],
    ["default-ignored", { type: "object", properties: { a: { type: "boolean", default: false } } }, {}, 0],
    ["integer-accepts-1.0", { type: "integer" }, 1.0, 0],
    ["valid", { type: "object", required: ["a"], properties: { a: { type: "array", items: { enum: [1, 2] }, uniqueItems: true } }, additionalProperties: false }, { a: [1, 2] }, 0],
  ];
  let bad = 0;
  for (const [name, schema, data, expected] of cases) {
    const n = validateSchema(schema, data).length;
    const ok = expected === 0 ? n === 0 : n >= expected;
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"} validator ${name} (${n} 条)`);
  }
  const wl = [["OSWorld 2.0 拿了 72.6%", 11], ["先说结论：GPT-6 到底有多强", 13], ["a b", 1.2]]; // 15 ASCII × 0.6 + 2 CJK; 10 CJK/全角 + 5 ASCII × 0.6
  for (const [s, exp] of wl) { const got = weightedLen(s); const ok = Math.abs(got - exp) < 0.05; if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} weightedLen ${q(s)} = ${got}（期望 ${exp}）`); }
  const fits = [
    ["clip footage longer than VO", { id: "a", kind: "clip", narration: "十个字十个字十个字十", clip: { from: 0, to: 20, rate: 1 } }, "m", { a: 3 }, 20],
    ["VO fit", { id: "b", kind: "bench", narration: "x" }, "m", { b: 4 }, 4.75],
    ["chapter l", { id: "c", kind: "chapter" }, "l", null, 1.4],
    ["estimate 84 chars", { id: "d", kind: "kinetic", narration: "字".repeat(84) }, "m", null, 10.75],
  ];
  for (const [name, beat, tier, dur, exp] of fits) { const got = fitBeat(beat, tier, dur).seconds; const ok = Math.abs(got - exp) < 0.01; if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} fitBeat ${name} = ${fmt(got)}（期望 ${exp}）`); }
  const files = fs.existsSync(SCHEMA_DIR) ? fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".schema.json")) : [];
  for (const f of files) {
    try { JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, f), "utf8")); console.log(`ok   schema 可解析 ${f}`); } catch (e) { bad++; console.log(`FAIL schema 解析失败 ${f}: ${e.message}`); }
  }
  console.log(bad ? `selftest: ${bad} 个失败` : "selftest: 全部通过");
  return bad ? 1 : 0;
}

// ------------------------------------------------------------------ loading
function loadJson(file) {
  if (!fs.existsSync(file)) return { missing: true };
  try { return { data: JSON.parse(fs.readFileSync(file, "utf8")) }; } catch (e) { return { error: e.message }; }
}
function loadSchema(name) {
  const file = path.join(SCHEMA_DIR, `${name}.schema.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function loadBanned() {
  const file = path.join(REF_DIR, "banned-words.txt");
  if (!fs.existsSync(file)) return { words: BUILTIN_BANNED, source: "内置列表" };
  const words = fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
  return { words: words.length ? words : BUILTIN_BANNED, source: "references/banned-words.txt" };
}
/** glossary.json shapes accepted: {term: alias} | {term: {alias, …}} | {terms:[{term, alias}]} | [{term, alias}]. */
function loadGlossary() {
  const file = path.join(REF_DIR, "glossary.json");
  if (!fs.existsSync(file)) return new Map();
  const map = new Map();
  try {
    const g = JSON.parse(fs.readFileSync(file, "utf8"));
    const add = (term, entry) => {
      if (typeof term !== "string") return;
      const alias = typeof entry === "string" ? entry : isObj(entry) ? entry.alias ?? entry.plain ?? entry.zh ?? entry["人话"] : null;
      if (typeof alias === "string" && alias.trim()) map.set(term.trim().toLowerCase(), alias.trim());
    };
    const list = Array.isArray(g) ? g : Array.isArray(g?.terms) ? g.terms : Array.isArray(g?.glossary) ? g.glossary : null;
    if (list) { for (const e of list) if (isObj(e)) add(e.term ?? e.name ?? e.key ?? e.id, e); }
    else if (isObj(g)) for (const [k, v] of Object.entries(g)) if (isObj(v) || typeof v === "string") add(k, v);
  } catch { /* unreadable glossary = no aliases */ }
  return map;
}

// ------------------------------------------------------------------ lint
export async function lintProject(projectDir, opts = {}) {
  const errors = [], warnings = [];
  const E = (code, beat, message, extra = {}) => errors.push({ code, level: "ERROR", beat: beat ?? null, message, ...extra });
  const W = (code, beat, message, extra = {}) => warnings.push({ code, level: "WARN", beat: beat ?? null, message, ...extra });
  const contentDir = path.join(projectDir, "content");
  const publicDir = path.join(projectDir, "public");
  const publicExists = fs.existsSync(publicDir) && fs.statSync(publicDir).isDirectory();
  // a media dir that holds only dot-files (.gitkeep) means "nothing staged yet" → L-SRC stays a warning there
  const dirHasMedia = (dir) => {
    try { return fs.readdirSync(dir).some((n) => !n.startsWith(".")); } catch { return false; }
  };
  const stats = { projectDir, files: {}, tier: null, targetSeconds: null, beats: 0, chapters: 0, tables: 0, sources: 0, durations: 0, estimatedSeconds: 0, shortBeats: 0, shortSeconds: 0, publicExists };
  const finish = () => { stats.errors = errors.length; stats.warnings = warnings.length; return { ok: !errors.length, errors, warnings, stats }; };

  if (!fs.existsSync(contentDir)) {
    E("S-FILE", null, `找不到目录 ${contentDir}`);
    return finish();
  }

  // -- read + schema
  const files = {};
  for (const [name, required] of [["brief", true], ["script", true], ["bench", false], ["sources", false], ["narration-durations", false]]) {
    const file = path.join(contentDir, `${name}.json`);
    const r = loadJson(file);
    if (r.missing) {
      stats.files[name] = "缺";
      if (required) E("S-FILE", null, `缺少必需文件 content/${name}.json`);
      continue;
    }
    if (r.error) { stats.files[name] = "解析失败"; E("S-JSON", null, `content/${name}.json 解析失败：${r.error}`); continue; }
    files[name] = r.data;
    stats.files[name] = "✓";
    const schema = name === "narration-durations" ? { type: "object", additionalProperties: { type: "number", minimum: 0 } } : loadSchema(name);
    if (!schema) { E("S-FILE", null, `找不到 schema：schemas/${name}.schema.json`); continue; }
    let problems;
    try { problems = validateSchema(schema, r.data); } catch (e) { E("S-SCHEMA", null, `content/${name}.json 校验器异常：${e.message}`); continue; }
    for (const pr of problems) {
      const m = /^beats\[(\d+)\]/.exec(pr.path);
      const beatId = m && Array.isArray(r.data?.beats) && isObj(r.data.beats[+m[1]]) && typeof r.data.beats[+m[1]].id === "string" ? r.data.beats[+m[1]].id : null;
      E("S-SCHEMA", beatId, `content/${name}.json ${pr.path || "(根)"}：${pr.message}`, { path: pr.path });
    }
  }

  const brief = isObj(files.brief) ? files.brief : null;
  const script = isObj(files.script) ? files.script : null;
  const bench = isObj(files.bench) ? files.bench : null;
  const sources = isObj(files.sources) ? files.sources : null;
  const durations = isObj(files["narration-durations"]) ? files["narration-durations"] : null;
  stats.durations = durations ? Object.keys(durations).length : 0;

  const targetSeconds = brief && isNum(brief.targetSeconds) ? brief.targetSeconds : null;
  // tier: brief.tier, else derived from targetSeconds; with no usable brief we assume "m" for char budgets
  // but skip the tier-structure rules (L-TURN / L-SUMMARY) instead of guessing.
  const tierKnown = !!brief && (["xs", "s", "m", "l"].includes(brief.tier) || targetSeconds !== null);
  const tier = brief && ["xs", "s", "m", "l"].includes(brief.tier) ? brief.tier : targetSeconds !== null ? tierOf(targetSeconds) : "m";
  stats.tier = tierKnown ? tier : `${tier}?`; stats.targetSeconds = targetSeconds;
  const tables = bench && isObj(bench.tables) ? bench.tables : {};
  stats.tables = Object.keys(tables).length;
  const sourceIds = new Set(sources && Array.isArray(sources.sources) ? sources.sources.filter(isObj).map((s) => s.id).filter((x) => typeof x === "string") : []);
  stats.sources = sourceIds.size;

  if (!script || !Array.isArray(script.beats)) {
    if (script) E("S-SCHEMA", null, "script.json 缺少 beats 数组，无法继续编辑规则检查");
    return finish();
  }
  const beats = script.beats.filter(isObj);
  const chapterIds = new Set(Array.isArray(script.chapters) ? script.chapters.filter(isObj).map((c) => c.id) : []);
  stats.beats = beats.length; stats.chapters = chapterIds.size;
  const idOf = (b, i) => (typeof b.id === "string" && b.id ? b.id : `#${i + 1}`);

  // -- ids
  const seen = new Map();
  beats.forEach((b, i) => {
    const id = idOf(b, i);
    if (typeof b.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(b.id) || [...b.id].length > 32) E("L-ID-PATTERN", id, `beat #${i + 1} 的 id ${q(b.id)} 不符合 ^[a-z0-9][a-z0-9-]*$（≤ 32 字符，不用下划线）`);
    if (typeof b.id !== "string") return;
    if (seen.has(b.id)) E("L-ID-DUP", id, `id ${q(b.id)} 重复（第 ${seen.get(b.id) + 1} 和第 ${i + 1} 个 beat）`);
    else seen.set(b.id, i);
  });

  // -- per beat
  const banned = loadBanned();
  const srcFields = (b) => {
    const list = [];
    for (const k of ["clip", "image", "screenshot", "broll"]) if (isObj(b[k]) && typeof b[k].src === "string") list.push([`${k}.src`, b[k].src]);
    if (isObj(b.hook) && isObj(b.hook.visual) && typeof b.hook.visual.src === "string") list.push(["hook.visual.src", b.hook.visual.src]);
    return list;
  };
  const rectInside = (r, w, h) => isObj(r) && isNum(r.x) && isNum(r.y) && isNum(r.w) && isNum(r.h) && r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= w && r.y + r.h <= h;
  const benchBeats = beats.filter((b) => b.kind === "bench");
  if (benchBeats.length && !bench) E("L-BENCH-REF", null, `有 ${benchBeats.length} 个 bench beat（${benchBeats.map((b, i) => idOf(b, i)).join(", ")}），但缺少 content/bench.json`);

  beats.forEach((b, i) => {
    const id = idOf(b, i);
    const kind = b.kind;
    const narration = typeof b.narration === "string" ? b.narration : "";
    const lines = Array.isArray(b.lines) ? b.lines.filter(isObj) : [];
    const cards = Array.isArray(b.cards) ? b.cards.filter(isObj) : [];

    if (KINDS.includes(kind) && kind !== "chapter" && !isObj(b[kind])) E("L-PAYLOAD", id, `kind=${kind} 的 beat 缺少同名载荷对象 "${kind}"`);
    if (kind === "chapter" && typeof b.chapter !== "string") E("L-CHAPTER-REF", id, "chapter beat 必须带 chapter 字段指向 chapters[].id");
    if (typeof b.chapter === "string" && !chapterIds.has(b.chapter)) E("L-CHAPTER-REF", id, `chapter ${q(b.chapter)} 不在 script.chapters 中`);

    lines.forEach((ln, j) => {
      const text = typeof ln.text === "string" ? ln.text : "";
      const wl = weightedLen(text);
      if (wl > 14) E("L-CAP-LEN", id, `lines[${j}] 加权长度 ${fmt(wl)} > 14：${q(text)}`);
      const hot = Array.isArray(ln.hot) ? ln.hot : [];
      if (hot.length !== 1) E("L-CAP-HOT", id, `lines[${j}] hot 必须恰好 1 个，现有 ${hot.length} 个：${q(text)}`);
      else if (typeof hot[0] !== "string" || !hot[0] || !text.includes(hot[0])) E("L-CAP-HOT", id, `lines[${j}] hot ${q(hot[0])} 没有出现在 text 中：${q(text)}`);
    });

    if (cards.length > 2) E("L-CARD-COUNT", id, `卡片 ${cards.length} 张 > 2`);
    for (let a = 0; a < cards.length; a++) for (let c = a + 1; c < cards.length; c++) {
      const A = cards[a], B = cards[c];
      if (isNum(A.t) && isNum(A.d) && isNum(B.t) && isNum(B.d) && A.t < B.t + B.d && B.t < A.t + A.d) E("L-CARD-OVERLAP", id, `cards[${a}]（${A.t}–${fmt(A.t + A.d)} s）与 cards[${c}]（${B.t}–${fmt(B.t + B.d)} s）时间重叠`);
    }
    cards.forEach((c, j) => { if (typeof c.source === "string" && !sourceIds.has(c.source)) E("L-SOURCE-REF", id, `cards[${j}].source ${q(c.source)} 不在 sources.json 中`); });

    if (kind === "bench" && bench && isObj(b.bench) && Array.isArray(b.bench.tables)) {
      for (const t of b.bench.tables) if (!(typeof t === "string" && t in tables)) E("L-BENCH-REF", id, `bench.tables 引用的表 ${q(t)} 不在 bench.json 中（现有：${Object.keys(tables).join(", ") || "无"}）`);
    }

    if (kind === "clip" && isObj(b.clip)) {
      const c = b.clip;
      if (!(isNum(c.from) && isNum(c.to) && c.from < c.to)) E("L-CLIP-RANGE", id, `clip.from (${c.from}) 必须小于 clip.to (${c.to})`);
      if (!(isNum(c.rate) && c.rate >= RATE_FLOOR && c.rate <= 4)) E("L-CLIP-RATE", id, `clip.rate (${c.rate}) 必须在 [0.75, 4] 内`);
      if (c.focus !== undefined && !rectInside(c.focus, c.w, c.h)) E("L-RECT", id, `clip.focus ${JSON.stringify(c.focus)} 超出 ${c.w}×${c.h}`);
      if (durations && isNum(durations[b.id]) && isNum(c.from) && isNum(c.to) && c.to > c.from) {
        const maxVo = (c.to - c.from) / RATE_FLOOR;
        if (durations[b.id] > maxVo) E("L-VO-LONG", id, `旁白太长：配音 ${fmt(durations[b.id])} s > 素材放慢到 0.75× 也只能覆盖 ${fmt(maxVo)} s（(to − from) / 0.75）——缩短旁白或放宽 from/to`);
      }
    }
    if (kind === "hook" && isObj(b.hook) && isObj(b.hook.visual)) {
      const v = b.hook.visual;
      if ((v.kind === "clip" || v.kind === "broll") && (v.from !== undefined || v.to !== undefined) && !(isNum(v.from) && isNum(v.to) && v.from < v.to)) E("L-CLIP-RANGE", id, `hook.visual.from (${v.from}) 必须小于 hook.visual.to (${v.to})`);
    }
    if (kind === "image" && isObj(b.image) && b.image.focus !== undefined && !rectInside(b.image.focus, b.image.w, b.image.h)) E("L-RECT", id, `image.focus ${JSON.stringify(b.image.focus)} 超出 ${b.image.w}×${b.image.h}`);
    if (kind === "screenshot" && isObj(b.screenshot) && !rectInside(b.screenshot.highlight, b.screenshot.w, b.screenshot.h)) E("L-RECT", id, `screenshot.highlight ${JSON.stringify(b.screenshot.highlight)} 超出 ${b.screenshot.w}×${b.screenshot.h}`);

    for (const [field, src] of srcFields(b)) {
      if (path.isAbsolute(src) || src.split(/[\\/]/).includes("..")) { E("L-SRC", id, `${field} ${q(src)} 必须是 public/ 下的相对路径`); continue; }
      if (fs.existsSync(path.join(publicDir, src))) continue;
      if (publicExists && dirHasMedia(path.join(publicDir, path.dirname(src)))) E("L-SRC", id, `${field} ${q(src)} 在 public/ 下不存在`);
      else W("L-SRC", id, `${field} ${q(src)}：${publicExists ? `public/${path.dirname(src)}/ 还没有任何素材（先跑 download_media.sh / media_provider.py）` : "public/ 尚不存在"}，渲染前请确认文件已就位`);
    }

    const takes = Array.isArray(b.takes) ? b.takes.filter(isObj) : [];
    takes.forEach((t, j) => {
      const text = typeof t.text === "string" ? t.text : "";
      const inNarr = text && narration.includes(text);
      const inLine = text && lines.some((ln) => typeof ln.text === "string" && ln.text.includes(text));
      if (!inNarr && !inLine) E("L-TAKE-TEXT", id, `takes[${j}] ${q(text)} 不是旁白或任一字幕的子串`);
      if (hasDigit(text) && typeof t.source !== "string") E("L-TAKE-SOURCE", id, `takes[${j}] 含数字却没有 source：${q(text)}`);
      if (typeof t.source === "string" && !sourceIds.has(t.source)) E("L-SOURCE-REF", id, `takes[${j}].source ${q(t.source)} 不在 sources.json 中（现有：${[...sourceIds].join(", ") || "无"}）`);
    });
    if (kind === "take" && isObj(b.take)) {
      if (hasDigit(b.take.text) && typeof b.take.source !== "string") E("L-TAKE-SOURCE", id, `take 载荷含数字却没有 source：${q(b.take.text)}`);
      if (typeof b.take.source === "string" && !sourceIds.has(b.take.source)) E("L-SOURCE-REF", id, `take.source ${q(b.take.source)} 不在 sources.json 中`);
    }

    if (narration) {
      const len = narrLen(narration);
      const budgetSeconds = isNum(b.maxSeconds) ? b.maxSeconds : TIER_DEFAULT_SECONDS[tier];
      const budget = budgetSeconds * 9;
      const basis = isNum(b.maxSeconds) ? `maxSeconds ${b.maxSeconds}` : `${tier} 档默认 ${TIER_DEFAULT_SECONDS[tier]} s`;
      if (len > budget * 1.3) E("L-NARR-LEN", id, `旁白 ${len} 字 > 上限 ${fmt(budget)} 字的 1.3 倍（${basis} × 9）：${q(narration, 40)}`);
      else if (len > budget) W("L-NARR-LEN", id, `旁白 ${len} 字 > 上限 ${fmt(budget)} 字（${basis} × 9），建议精简`);
      const found = banned.words.filter((w) => narration.includes(w));
      if (found.length) E("L-BANNED", id, `旁白含播音腔禁用词 ${found.map((w) => q(w)).join("、")}（${banned.source}）`);
      if (["clip", "bench", "kinetic"].includes(kind) && !/[我你咱]/.test(narration)) W("L-PERSON", id, `${kind} 的旁白没有“我 / 你 / 咱”这类人称，听起来像播音稿：${q(narration, 40)}`);
    }
    if (kind === "hook") {
      const len = narrLen(narration);
      if (len > 32) W("L-HOOK-LEN", id, `hook 旁白 ${len} 字 > 32，开场要在 3 秒内说完`);
      if (isObj(b.hook) && typeof b.hook.text === "string" && weightedLen(b.hook.text) > 16) W("L-HOOK-LEN", id, `hook.text 加权长度 ${fmt(weightedLen(b.hook.text))} > 16：${q(b.hook.text)}`);
    }
  });

  // -- structure
  if (beats.length) {
    if (beats[0].kind !== "hook") E("L-FIRST-HOOK", idOf(beats[0], 0), `第一个 beat 必须是 hook，现在是 ${q(beats[0].kind)}`);
    const last = beats[beats.length - 1];
    const lastId = idOf(last, beats.length - 1);
    if (last.kind === "outro") { if (!beats.slice(0, -1).some((b) => b.kind === "cta")) E("L-LAST-CTA", lastId, "最后是 outro，但前面没有 cta beat（评论区提问）"); }
    else if (last.kind !== "cta") E("L-LAST-CTA", lastId, `最后一个 beat 必须是 cta 或 outro，现在是 ${q(last.kind)}`);
  }
  if (tierKnown && (tier === "m" || tier === "l")) {
    const turns = beats.filter((b) => b.role === "turn");
    if (turns.length !== 1) E("L-TURN", turns[0] ? idOf(turns[0], beats.indexOf(turns[0])) : null, `${tier} 档需要恰好一个 role=turn 的 beat（转折/“但也别吹过头”），现在有 ${turns.length} 个${turns.length ? "：" + turns.map((b) => b.id).join(", ") : ""}`);
  }
  if (tierKnown && tier === "l" && !beats.some((b) => b.kind === "summary")) W("L-SUMMARY", null, "l 档建议有一个 summary beat（截图收藏点）");

  // -- timing: totals, short cut, dead air
  const est = beats.map((b, i) => ({ id: idOf(b, i), kind: b.kind, short: b.short === true && b.kind !== "chapter", ...fitBeat(b, tier, durations) }));
  const total = est.reduce((a, e) => a + e.seconds, 0);
  stats.estimatedSeconds = Math.round(total * 10) / 10;
  if (targetSeconds !== null && targetSeconds > 0) {
    const dev = (total - targetSeconds) / targetSeconds;
    if (Math.abs(dev) > 0.2) W("L-TOTAL-LEN", null, `预计总时长 ${fmt(total)} s 偏离目标 ${targetSeconds} s 达 ${dev > 0 ? "+" : ""}${Math.round(dev * 100)}%（允许 ±20%）`);
  }
  const shortCfg = brief && isObj(brief.shortVersion) ? brief.shortVersion : null;
  const shortBeats = est.filter((e) => e.short);
  stats.shortBeats = shortBeats.length;
  stats.shortSeconds = Math.round(shortBeats.reduce((a, e) => a + e.seconds, 0) * 10) / 10;
  if (shortCfg && shortCfg.enabled === true && shortCfg.script !== "separate") { // "separate" = the short cut has its own script; short flags are irrelevant
    const missing = [];
    if (!shortBeats.some((e) => e.kind === "hook")) missing.push("hook");
    if (!shortBeats.some((e) => e.kind === "cta")) missing.push("cta");
    if (shortBeats.length < 3) missing.push(`至少 3 个 beat（现有 ${shortBeats.length}）`);
    if (missing.length) W("L-SHORT-STRUCT", null, `短版缺少：${missing.join("、")}（给 beat 加 "short": true）`);
    if (isNum(shortCfg.targetSeconds) && shortCfg.targetSeconds > 0 && shortBeats.length) {
      const dev = (stats.shortSeconds - shortCfg.targetSeconds) / shortCfg.targetSeconds;
      if (Math.abs(dev) > 0.25) W("L-SHORT-LEN", null, `短版预计 ${fmt(stats.shortSeconds)} s 偏离 shortVersion.targetSeconds ${shortCfg.targetSeconds} s 达 ${dev > 0 ? "+" : ""}${Math.round(dev * 100)}%（允许 ±25%）`);
    }
  }
  if (durations && Object.keys(durations).length) { // an empty {} placeholder (before TTS ran) counts as "no durations yet"
    stats.missingDurations = beats.map((b, i) => [b, idOf(b, i)]).filter(([b]) => typeof b.narration === "string" && b.narration.trim() && !isNum(durations[b.id])).map(([, id]) => id);
    stats.deadAir = [];
    for (const e of est) {
      if (e.kind === "chapter") continue;
      const gap = e.seconds - e.vo;
      if (gap > DEAD_AIR_SECONDS) {
        stats.deadAir.push({ id: e.id, gap: Math.round(gap * 10) / 10 });
        const why = e.vo <= 0 ? "没有旁白" : e.footage !== null && e.footage > e.vo + LEAD_TAIL_SECONDS ? `素材 (to − from) / rate = ${fmt(e.footage)} s 比旁白长` : "场景比旁白长";
        W("L-DEAD-AIR", e.id, `画面 ${fmt(e.seconds)} s，配音 ${fmt(e.vo)} s，空白 ${fmt(gap)} s > ${DEAD_AIR_SECONDS} s（${why}）——缩短 from/to、提高 rate 或补旁白`);
      }
    }
  }

  // -- glossary
  const glossary = loadGlossary();
  const usedTables = [];
  for (const b of beats) if (b.kind === "bench" && isObj(b.bench) && Array.isArray(b.bench.tables)) for (const t of b.bench.tables) if (typeof t === "string" && t in tables && !usedTables.includes(t)) usedTables.push(t);
  for (const key of usedTables) {
    const table = tables[key];
    if (!isObj(table)) continue;
    const name = typeof table.name === "string" ? table.name : key;
    const ascii = name.split("·")[0].trim();
    const firstWord = ascii.split(/\s+/)[0] ?? "";
    const mentions = [...new Set([key, ascii, firstWord].filter((m) => m && [...m].length >= 3))].map((m) => m.toLowerCase());
    const aliases = [...new Set([table.alias, glossary.get(key.toLowerCase()), glossary.get(name.toLowerCase()), glossary.get(ascii.toLowerCase())].filter((a) => typeof a === "string" && a))];
    if (!aliases.length) continue;
    const first = beats.find((b) => typeof b.narration === "string" && mentions.some((m) => b.narration.toLowerCase().includes(m)));
    if (first && !aliases.some((a) => first.narration.includes(a))) W("L-GLOSSARY", first.id, `旁白第一次提到 ${q(ascii)} 时没有带人话别名 ${aliases.map((a) => q(a)).join(" / ")}：${q(first.narration, 40)}`);
  }

  // -- badge
  if (brief && isObj(brief.account) && typeof brief.account.badge === "string" && brief.account.badge) {
    if (!fs.existsSync(path.join(publicDir, brief.account.badge))) W("L-BADGE", null, `account.badge ${q(brief.account.badge)} 不在 public/ 下（${publicExists ? "文件缺失" : "public/ 尚不存在"}）`);
  }

  // -- numbers (optional): check_numbers.mjs as a module
  if (opts.article) {
    try {
      const { checkNumbers } = await import("./check_numbers.mjs");
      const r = checkNumbers(projectDir, opts.article);
      for (const m of r.missing) E("N-MISS", m.beat, `${m.where}：${m.value}${m.unit} —— ${m.hint}`);
      for (const m of r.weak) W("N-WEAK", m.beat, `${m.where}：${m.value}${m.unit} —— ${m.hint}`);
      stats.numbers = r.stats;
    } catch (e) {
      E("S-FILE", null, `--article 数字核对失败：${e.message}`);
    }
  }
  return finish();
}

// ------------------------------------------------------------------ CLI
function usage() {
  const rows = RULES.map(([c, l, d]) => `  ${c.padEnd(15)} ${l.padEnd(11)} ${d}`).join("\n");
  return `用法: node lint_content.mjs <project_dir> [--json] [--strict] [--article <article.md>]

读取 <project_dir>/content/{brief,script,bench,sources}.json（+ 可选 narration-durations.json），
先按 schemas/*.json 做结构校验，再跑编辑规则。有 ERROR 时 exit 1；--strict 下只有 WARN 也 exit 2。
  --json               只输出 JSON：{ok, errors:[{code,beat,message}], warnings:[…], stats:{…}}
  --strict             WARN 也算失败（exit 2）
  --article <file>     顺带调用 check_numbers.mjs 核对数字：MISS → N-MISS（ERROR），弱匹配 → N-WEAK（WARN）
  --selftest           自检 schema 校验器 / 加权长度 / 时长模型
规则（详见 references/lint-rules.md）：
${rows}
`;
}

async function main(argv) {
  const args = argv.slice(2);
  // exit codes: 0 ok · 1 errors (or unreadable input) · 2 usage error, or --strict with warnings only
  if (!args.length || args.includes("--help") || args.includes("-h")) { process.stdout.write(usage()); return args.length ? 0 : 2; }
  if (args.includes("--selftest")) return selfTest();
  const opts = { json: false, strict: false, article: null };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") opts.json = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "--article") opts.article = args[++i];
    else if (a.startsWith("--article=")) opts.article = a.slice("--article=".length);
    else if (a.startsWith("-")) { process.stderr.write(`未知参数 ${a}\n`); return 2; }
    else positional.push(a);
  }
  if (positional.length !== 1) { process.stderr.write(usage()); return 2; }
  const projectDir = path.resolve(positional[0]);
  if (opts.article) {
    opts.article = path.resolve(opts.article);
    if (!fs.existsSync(opts.article)) { process.stderr.write(`--article 文件不存在：${opts.article}\n`); return 1; }
  }
  const { errors, warnings, stats } = await lintProject(projectDir, opts);
  const code = errors.length ? 1 : opts.strict && warnings.length ? 2 : 0;
  if (opts.json) {
    process.stdout.write(JSON.stringify({ ok: code === 0, exitCode: code, errors, warnings, stats }, null, 2) + "\n");
    return code;
  }
  const out = [];
  out.push(`lint_content · ${projectDir}`);
  const fileLine = Object.entries(stats.files).map(([k, v]) => `${k}.json ${v}`).join("  ·  ");
  if (fileLine) out.push(`  ${fileLine}`);
  out.push(`  tier ${stats.tier}${stats.targetSeconds !== null ? ` · 目标 ${stats.targetSeconds} s` : ""} · ${stats.beats} beats · ${stats.chapters} 章 · ${stats.tables} 表 · ${stats.sources} 来源 · 配音时长 ${stats.durations} 条`);
  const line = (e) => `  [${e.code}] ${e.beat ? `beat ${e.beat}：` : ""}${e.message}`;
  out.push(`ERROR ×${errors.length}`);
  for (const e of errors) out.push(line(e));
  out.push(`WARN ×${warnings.length}`);
  for (const w of warnings) out.push(line(w));
  const totalNote = stats.targetSeconds !== null ? `预计总时长 ${stats.estimatedSeconds} s / 目标 ${stats.targetSeconds} s` : `预计总时长 ${stats.estimatedSeconds} s`;
  out.push(`统计  ${totalNote} · 短版 ${stats.shortBeats} beats ${stats.shortSeconds} s${stats.missingDurations?.length ? ` · 缺配音时长：${stats.missingDurations.join(", ")}` : ""}${stats.numbers ? ` · 数字核对 ${JSON.stringify(stats.numbers)}` : ""}`);
  out.push(code === 0 ? `结果  ✓ 通过（${warnings.length} 个警告）` : code === 1 ? `结果  ✗ ${errors.length} 个错误，${warnings.length} 个警告 → exit 1` : `结果  ✗ --strict：${warnings.length} 个警告 → exit 2`);
  process.stdout.write(out.join("\n") + "\n");
  return code;
}

const isEntry = (() => { try { return process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (isEntry) main(process.argv).then((code) => process.exit(code), (e) => { process.stderr.write(`lint_content: ${e.stack || e.message}\n`); process.exit(1); });
