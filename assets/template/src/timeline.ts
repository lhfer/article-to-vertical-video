// Builds the ordered list of scenes for a variant with frame counts, transitions, sfx cues and VO spans.
// Pure — no React, no module-scope totals. Root computes durations through calculateMetadata / per composition.
import type { Beat, BeatKind, Bench, Brief, Script, SfxKind, Tier, TransitionKind } from "./types";
import { tierOf } from "./types";
import { getLayout, type Variant } from "./layout";
import { getTheme, pickTransition, type Theme } from "./theme";
import { baseSeconds, fitSeconds, voSpan } from "./narration";

export type TimelineInput = { brief: Brief; script: Script; bench: Bench; durations: Record<string, number> };

export type Item = {
  beat: Beat;
  /** position in the variant's list */
  index: number;
  frames: number;
  seconds: number;
  /** authored base length (cards are authored against it) */
  baseSeconds: number;
  startFrame: number;
  /** transition INTO this item */
  transition: TransitionKind;
  transitionFrames: number;
  sfx: SfxKind;
  vo: { fromFrame: number; toFrame: number } | null;
};

export type Timeline = { variant: Variant; fps: number; tier: Tier; theme: Theme; items: Item[]; totalFrames: number };

const TRANSITION_EXTRA: Record<TransitionKind, number> = { cut: 0, fade: 0, slide: 2, whip: 2, zoom: 4, wipe: 2, iris: 6 };

/** Beats that belong to a variant. Short = beats flagged short (chapter cards never); falls back to all non-chapter beats. */
export const beatsForVariant = (variant: Variant, script: Script, tier: Tier): Beat[] => {
  if (variant === "short") {
    const flagged = script.beats.filter((b) => b.short === true && b.kind !== "chapter");
    return flagged.length > 0 ? flagged : script.beats.filter((b) => b.kind !== "chapter");
  }
  return script.beats.filter((b) => !(b.kind === "chapter" && fitSeconds(b, tier, {}) <= 0));
};

export const sfxFor = (beat: Beat, theme: Theme): SfxKind => beat.sfx ?? theme.sfx[beat.kind] ?? "none";

export const buildTimeline = (variant: Variant, input: TimelineInput): Timeline => {
  const L = getLayout(variant);
  const fps = L.fps;
  const tier: Tier = input.brief.tier ?? tierOf(input.brief.targetSeconds);
  const theme = getTheme(input.brief.theme);
  const beats = beatsForVariant(variant, input.script, tier);

  const frames = beats.map((b) => Math.max(1, Math.round(fitSeconds(b, tier, input.durations) * fps)));
  const items: Item[] = [];
  let cursor = 0;
  let prevKind: BeatKind | null = null;
  beats.forEach((beat, i) => {
    const f = frames[i];
    let transition: TransitionKind = i === 0 ? "cut" : pickTransition(theme, prevKind, beat.kind, beat.transition);
    let tFrames = 0;
    if (i > 0 && transition !== "cut") {
      const wanted = L.transitionFrames + TRANSITION_EXTRA[transition];
      const cap = Math.floor(Math.min(frames[i - 1], f) * 0.4); // never longer than 40% of either neighbour
      tFrames = Math.min(wanted, cap);
      if (tFrames < 1) {
        tFrames = 0;
        transition = "cut";
      }
    }
    const startFrame = i === 0 ? 0 : cursor - tFrames;
    const seconds = f / fps;
    const span = voSpan(beat, seconds, input.durations);
    items.push({
      beat,
      index: i,
      frames: f,
      seconds,
      baseSeconds: baseSeconds(beat, tier),
      startFrame,
      transition,
      transitionFrames: tFrames,
      sfx: sfxFor(beat, theme),
      vo: span ? { fromFrame: startFrame + Math.round(span.from * fps), toFrame: startFrame + Math.round(span.to * fps) } : null,
    });
    cursor = startFrame + f;
    prevKind = beat.kind;
  });
  const totalFrames = Math.max(1, items.reduce((a, it) => a + it.frames, 0) - items.reduce((a, it) => a + it.transitionFrames, 0));
  return { variant, fps, tier, theme, items, totalFrames };
};

export const totalFrames = (variant: Variant, input: TimelineInput): number => buildTimeline(variant, input).totalFrames;

export const itemById = (timeline: Timeline, id: string): Item | undefined => timeline.items.find((it) => it.beat.id === id);
