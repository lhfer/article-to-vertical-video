// Scene length + caption/card timing derived from the voice-over. Pure functions, no React.
// fitSeconds grows AND shrinks a scene to VO + lead + tail. VO = narration-durations.json[beat.id] when TTS has run,
// else an estimate from the narration text (chars / 8.4) so previews match the storyboard; beats without narration
// get a per-kind base length capped by the tier's "max scene without VO".
// The constants below are the single source of truth shared with scripts/lint_content.mjs and scripts/storyboard.py
// (DESIGN.md §3 "Timing constants") — change all three together.
import type { Beat, BeatKind, Card, ClipPayload, Line, Tier } from "./types";
import { weightedLen } from "./text";

export const VO_LEAD = 0.25; // seconds of silence before the voice starts
export const VO_TAIL = 0.5; // breathing room after the voice ends
export const CHARS_PER_SECOND = 8.4; // Seed-TTS 2.0 at rate 28, code points excluding whitespace (punctuation counts: TTS pauses on it)
export const RATE_FLOOR = 0.75; // clips never play slower than this
const MIN_LINE_SECONDS = 0.9;
const LINE_GAP = 0.1;

export const CHAPTER_CARD_SECONDS: Record<Tier, number> = { xs: 0, s: 0, m: 0.8, l: 1.4 };
export const MAX_SECONDS_NO_VO: Record<Tier, number> = { xs: 4, s: 6, m: 10, l: 14 };
export const BASE_SECONDS_BY_KIND: Record<BeatKind, number> = {
  hook: 3,
  promise: 4,
  chapter: 0.8,
  bench: 6,
  clip: 6,
  kinetic: 3,
  quote: 4,
  steps: 5,
  image: 4,
  screenshot: 4,
  scorecard: 5,
  take: 4,
  broll: 4,
  summary: 5,
  cta: 4,
  outro: 5,
};

export const clipSpanSeconds = (c: Pick<ClipPayload, "from" | "to" | "rate">) => Math.max(0, c.to - c.from) / (c.rate > 0 ? c.rate : 1);

/** Base scene length when there is no voice-over (chapter cards excluded). */
export const baseSeconds = (beat: Beat, tier: Tier): number => {
  if (beat.kind === "chapter") return CHAPTER_CARD_SECONDS[tier];
  let base = BASE_SECONDS_BY_KIND[beat.kind] ?? 4;
  if (beat.kind === "bench" && beat.bench?.mode === "table") base = 1.5;
  if (beat.kind === "clip" && beat.clip) {
    const span = clipSpanSeconds(beat.clip);
    if (span > 0) base = span;
  }
  return Math.min(base, MAX_SECONDS_NO_VO[tier]);
};

/** Narration length the way lint/storyboard count it: code points minus whitespace. */
export const narrLen = (s: string | undefined): number => {
  let n = 0;
  for (const ch of s ?? "") {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x3000 || cp === 0xa0) continue;
    n++;
  }
  return n;
};

/** Measured voice-over seconds (narration-durations.json) or null when TTS has not produced this beat yet. */
export const measuredVoSeconds = (beat: Beat, durations: Record<string, number>): number | null => {
  const d = durations[beat.id];
  return typeof d === "number" && Number.isFinite(d) && d > 0 ? d : null;
};

/** Voice-over seconds used for timing: measured when available, else estimated from the narration text, null without narration. */
export const voSeconds = (beat: Beat, durations: Record<string, number>): number | null => {
  const measured = measuredVoSeconds(beat, durations);
  if (measured !== null) return measured;
  const n = narrLen(beat.narration);
  return n > 0 ? n / CHARS_PER_SECOND : null;
};

/**
 * Fitted scene seconds: VO + lead + tail when the beat has narration (measured or estimated), else baseSeconds;
 * a clip scene is never shorter than its footage (to − from) / rate; clamped by beat.minSeconds/maxSeconds.
 */
export const fitSeconds = (beat: Beat, tier: Tier, durations: Record<string, number>): number => {
  if (beat.kind === "chapter") return CHAPTER_CARD_SECONDS[tier]; // 0 in xs/s → the timeline skips it
  const vo = voSeconds(beat, durations);
  let s = vo !== null ? vo + VO_LEAD + VO_TAIL : baseSeconds(beat, tier);
  if (beat.kind === "clip" && beat.clip) s = Math.max(s, clipSpanSeconds(beat.clip));
  if (typeof beat.minSeconds === "number") s = Math.max(s, beat.minSeconds);
  if (typeof beat.maxSeconds === "number") s = Math.min(s, beat.maxSeconds);
  return Math.max(0.5, s);
};

/** Voice-over span inside the scene, in seconds, for BGM ducking — only when real audio exists. */
export const voSpan = (beat: Beat, sceneSeconds: number, durations: Record<string, number>): { from: number; to: number } | null => {
  const vo = measuredVoSeconds(beat, durations);
  if (vo === null) return null;
  return { from: Math.min(VO_LEAD, sceneSeconds), to: Math.min(VO_LEAD + vo, sceneSeconds) };
};

export type TimedLine = Line & { t: number; d: number };

const clampLines = (lines: TimedLine[], sceneSeconds: number): TimedLine[] => {
  const sorted = [...lines].sort((a, b) => a.t - b.t);
  // a line never starts before the previous one ends
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].t + sorted[i - 1].d;
    if (sorted[i].t < prevEnd) sorted[i] = { ...sorted[i], t: prevEnd };
  }
  for (let i = 0; i < sorted.length; i++) sorted[i] = { ...sorted[i], d: Math.max(MIN_LINE_SECONDS, sorted[i].d) };
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].t + sorted[i - 1].d;
    if (sorted[i].t < prevEnd) sorted[i] = { ...sorted[i], t: prevEnd };
  }
  // if the lines run past the scene, compress everything proportionally
  const last = sorted[sorted.length - 1];
  const end = last ? last.t + last.d : 0;
  if (end > sceneSeconds && end > 0) {
    const k = sceneSeconds / end;
    return sorted.map((l) => ({ ...l, t: l.t * k, d: Math.max(0.5, l.d * k) }));
  }
  return sorted;
};

/**
 * Caption timing. With a voice-over, lines are spread over the VO span by weighted character count
 * (authored t/d are ignored). Without one, authored t/d are used when present, else lines are spread evenly.
 */
export const fitLines = (lines: Line[] | undefined, vo: number | null, sceneSeconds: number): TimedLine[] => {
  if (!lines || lines.length === 0) return [];
  if (vo !== null && vo > 0) {
    const weights = lines.map((l) => Math.max(1, weightedLen(l.text)));
    const total = weights.reduce((a, b) => a + b, 0);
    let cum = 0;
    const timed = lines.map((l, i) => {
      const start = VO_LEAD + (vo * cum) / total;
      const span = (vo * weights[i]) / total;
      cum += weights[i];
      return { ...l, t: start, d: Math.max(MIN_LINE_SECONDS, span - LINE_GAP) };
    });
    return clampLines(timed, sceneSeconds);
  }
  const authored = lines.every((l) => typeof l.t === "number" && typeof l.d === "number");
  if (authored) return clampLines(lines.map((l) => ({ ...l, t: l.t as number, d: l.d as number })), sceneSeconds);
  const start = Math.min(0.25, sceneSeconds * 0.1);
  const avail = Math.max(0.5, sceneSeconds - start - 0.25);
  const slot = avail / lines.length;
  return clampLines(
    lines.map((l, i) => ({ ...l, t: start + i * slot, d: Math.max(MIN_LINE_SECONDS, slot - LINE_GAP) })),
    sceneSeconds,
  );
};

/** Scale card timings from the authored base length to the fitted length; clamp into the scene; no overlap. */
export const fitCards = (cards: Card[] | undefined, baseSecondsValue: number, newSeconds: number): Card[] => {
  if (!cards || cards.length === 0) return [];
  const k = baseSecondsValue > 0 ? newSeconds / baseSecondsValue : 1;
  const scaled = cards.map((c) => ({ ...c, t: c.t * k, d: c.d * k })).sort((a, b) => a.t - b.t);
  for (let i = 0; i < scaled.length; i++) {
    const c = scaled[i];
    if (i > 0) {
      const prevEnd = scaled[i - 1].t + scaled[i - 1].d;
      if (c.t < prevEnd) c.t = prevEnd;
    }
    if (c.t > newSeconds - 1) c.t = Math.max(0, newSeconds - 1);
    c.d = Math.max(0.5, Math.min(c.d, newSeconds - c.t - 0.05));
  }
  return scaled.filter((c) => c.d >= 0.5 && c.t < newSeconds);
};

/** Playback rate that lets (to − from) cover the scene, within [RATE_FLOOR, clip.rate]. */
export const clipRateFor = (clip: Pick<ClipPayload, "from" | "to" | "rate">, sceneSeconds: number): number => {
  const span = Math.max(0, clip.to - clip.from);
  if (span <= 0 || sceneSeconds <= 0) return Math.max(RATE_FLOOR, clip.rate);
  const needed = span / sceneSeconds;
  return Math.max(RATE_FLOOR, Math.min(clip.rate, needed));
};

/** Narration proportion at which `needle` (alias/name) is first mentioned; null when absent. */
export const mentionProportion = (narration: string | undefined, needles: string[]): number | null => {
  if (!narration) return null;
  const n = narration.toLowerCase();
  let best: number | null = null;
  for (const needle of needles) {
    const q = needle.trim().toLowerCase();
    if (q.length < 2) continue;
    const i = n.indexOf(q);
    if (i >= 0 && (best === null || i < best)) best = i;
  }
  return best === null ? null : best / Math.max(1, n.length);
};
