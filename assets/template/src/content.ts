// Loads the content set (content/*.json) — the ONLY files the model edits. Everything the scenes show comes
// from here. The imports are static, so all five files must exist (narration-durations.json may be `{}`).
import briefJson from "../content/brief.json";
import scriptJson from "../content/script.json";
import benchJson from "../content/bench.json";
import sourcesJson from "../content/sources.json";
import durationsJson from "../content/narration-durations.json";
import type { Beat, Bench, BenchTable, Brief, Chapter, Durations, Script, Sources, Tier } from "./types";
import { tierOf } from "./types";

const fail = (msg: string): never => {
  throw new Error(`[content] ${msg} — fix content/*.json (run scripts/lint_content.mjs)`);
};

const asBrief = (v: unknown): Brief => {
  const b = v as Partial<Brief> | null;
  if (!b || typeof b !== "object") return fail("brief.json is not an object");
  if (typeof b.targetSeconds !== "number") return fail("brief.targetSeconds missing");
  if (!b.theme) return fail("brief.theme missing");
  return b as Brief;
};

const asScript = (v: unknown): Script => {
  const s = v as Partial<Script> | null;
  if (!s || typeof s !== "object") return fail("script.json is not an object");
  if (!s.meta || typeof s.meta.brand !== "string") return fail("script.meta.brand missing");
  if (!Array.isArray(s.beats) || s.beats.length < 2) return fail("script.beats needs at least 2 beats");
  const seen = new Set<string>();
  for (const beat of s.beats as Beat[]) {
    if (typeof beat.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(beat.id)) return fail(`beat id ${JSON.stringify(beat.id)} must match ^[a-z0-9][a-z0-9-]*$`);
    if (seen.has(beat.id)) return fail(`duplicate beat id ${beat.id}`);
    seen.add(beat.id);
  }
  return { ...(s as Script), chapters: Array.isArray(s.chapters) ? (s.chapters as Chapter[]) : [] };
};

const asBench = (v: unknown): Bench => {
  const b = v as Partial<Bench> | null;
  if (!b || typeof b !== "object") return { hero: "", tables: {} };
  return { hero: typeof b.hero === "string" ? b.hero : "", tables: (b.tables ?? {}) as Record<string, BenchTable> };
};

const asSources = (v: unknown): Sources => {
  const s = v as Partial<Sources> | null;
  return { sources: s && Array.isArray(s.sources) ? s.sources : [] };
};

const asDurations = (v: unknown): Durations => {
  const out: Durations = {};
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === "number" && Number.isFinite(val) && val > 0) out[k] = val;
  }
  return out;
};

export const BRIEF: Brief = asBrief(briefJson);
export const SCRIPT: Script = asScript(scriptJson);
export const BENCH: Bench = asBench(benchJson);
export const SOURCES: Sources = asSources(sourcesJson);
export const DURATIONS: Durations = asDurations(durationsJson);

export const TIER: Tier = BRIEF.tier ?? tierOf(BRIEF.targetSeconds);
export const META = SCRIPT.meta;
export const ACCOUNT_NAME = BRIEF.account?.name ?? "";
export const BADGE_FILE = BRIEF.account?.badge;

export const chapterOf = (beat: Beat): Chapter | undefined => (beat.chapter ? SCRIPT.chapters.find((c) => c.id === beat.chapter) : undefined);
export const tableOf = (key: string): BenchTable | undefined => BENCH.tables[key];
export const sourceOf = (id: string | undefined) => (id ? SOURCES.sources.find((s) => s.id === id) : undefined);
export const beatById = (id: string): Beat | undefined => SCRIPT.beats.find((b) => b.id === id);

/** Payload object named after the kind (schema rule). */
export const payloadOf = <K extends Beat["kind"]>(beat: Beat, kind: K): NonNullable<Beat[K]> => {
  const p = beat[kind];
  if (!p) fail(`beat ${beat.id} (kind=${kind}) is missing its "${kind}" payload`);
  return p as NonNullable<Beat[K]>;
};
