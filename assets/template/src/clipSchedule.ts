// Piecewise playback schedule for clip scenes. @remotion/media's <Video> maps time as
// frame / fps × playbackRate + trimBefore / fps, so a per-frame rate change would jump the source position.
// Instead the scene is split into up to four <Sequence>s, each with a constant rate:
//
//   pre (rFast)  →  ramp (√rFast, ≤ 0.8 s)  →  result window (1×, resultAt − 0.6 s … + 2.4 s)  →  post (rFast)
//
// rFast is solved so the whole scene is covered, then clamped to [0.75, clip.rate]. If the clamp bites at 0.75 the
// footage runs out early and the last covered frame is held (<Freeze>) — lint already flags this as "旁白太长".
// Without resultAt there is a single segment at clipRateFor().
import type { ClipPayload } from "./types";
import { RATE_FLOOR, clipRateFor } from "./narration";

export type ClipSegment = {
  /** first scene frame of this segment */
  startFrame: number;
  frames: number;
  /** source position (seconds) at the first frame */
  srcFrom: number;
  rate: number;
};

export type ClipSchedule = {
  segments: ClipSegment[];
  /** scene frames actually covered by footage (≤ sceneFrames); frames beyond hold the last covered frame */
  coverFrames: number;
  sceneFrames: number;
  /** nominal fast rate (for labels / debugging) */
  rate: number;
};

const RESULT_BEFORE = 0.6;
const RESULT_AFTER = 2.4;
const RAMP_SECONDS = 0.8;
const MIN_RATE = RATE_FLOOR;

export const clipSchedule = (clip: ClipPayload, sceneSeconds: number, fps: number): ClipSchedule => {
  const sceneFrames = Math.max(1, Math.round(sceneSeconds * fps));
  const span = Math.max(0, clip.to - clip.from);
  const maxRate = Math.max(MIN_RATE, clip.rate);
  const segments: ClipSegment[] = [];
  let cursor = 0; // scene frames used
  let src = clip.from; // source seconds consumed

  const push = (rate: number, srcSpanWanted: number) => {
    const remainingScene = sceneFrames - cursor;
    const remainingSrc = clip.to - src;
    const srcSpan = Math.min(srcSpanWanted, remainingSrc);
    if (remainingScene <= 0 || srcSpan <= 0) return;
    const frames = Math.min(remainingScene, Math.floor((srcSpan / rate) * fps));
    if (frames <= 0) return;
    segments.push({ startFrame: cursor, frames, srcFrom: src, rate });
    cursor += frames;
    src += (frames / fps) * rate;
  };

  const resultAt = clip.resultAt;
  const hasResult = typeof resultAt === "number" && resultAt > clip.from && resultAt < clip.to;
  if (!hasResult || span <= 0) {
    const rate = clipRateFor(clip, sceneSeconds);
    push(rate, span);
    return { segments, coverFrames: cursor, sceneFrames, rate };
  }

  const winA = Math.max(clip.from, resultAt - RESULT_BEFORE);
  const winB = Math.min(clip.to, resultAt + RESULT_AFTER);
  const winSrc = winB - winA;
  if (winSrc >= sceneSeconds - 0.5) {
    // the 1× window alone fills the scene: play it straight
    src = winA;
    push(1, winSrc);
    return { segments, coverFrames: cursor, sceneFrames, rate: 1 };
  }
  const restSrc = span - winSrc;
  const restScene = Math.max(0.1, sceneSeconds - winSrc);
  const rFast = restSrc <= 0 ? 1 : Math.max(MIN_RATE, Math.min(maxRate, restSrc / restScene));
  const rMid = Math.sqrt(rFast);
  const preSrcTotal = winA - clip.from;
  const rampScene = preSrcTotal > 0 && rFast > 1.05 ? Math.min(RAMP_SECONDS, preSrcTotal / rMid) : 0;
  const rampSrc = rampScene * rMid;

  push(rFast, preSrcTotal - rampSrc); // pre
  if (rampScene > 0) push(rMid, rampSrc); // ease toward 1×
  push(1, Math.max(0, winB - src)); // result window at 1×
  push(rFast, Math.max(0, clip.to - src)); // post
  return { segments, coverFrames: cursor, sceneFrames, rate: rFast };
};
