import React from "react";
import { Easing, Freeze, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import type { Rect } from "../types";
import { useLayout } from "../layout";
import { useTheme } from "../theme";
import type { ClipSchedule } from "../clipSchedule";
import { hasStatic } from "../assets";
import { Plate } from "./Backdrop";

export type Fit = { x: number; y: number; w: number; h: number };

/**
 * Transform for content of size fit.w × fit.h so that `focus` (source px of a w×h source) fills the box.
 * p = 0 → whole frame; p = 1 → focus rect. push adds a slow extra zoom (hold with motion). transform-origin must be 0 0.
 */
export const focusTransform = (fit: Fit, w: number, h: number, focus: Rect | undefined, p: number, push = 1): { scale: number; tx: number; ty: number } => {
  const k = fit.w / w;
  let S = push;
  let cx = fit.w / 2;
  let cy = fit.h / 2;
  if (focus) {
    const rw = Math.max(1, focus.w * k);
    const rh = Math.max(1, focus.h * k);
    const target = Math.min(3, Math.max(1, Math.min(fit.w / rw, fit.h / rh)));
    const fx = (focus.x + focus.w / 2) * k;
    const fy = (focus.y + focus.h / 2) * k;
    S = interpolate(p, [0, 1], [1, target]) * push;
    cx = interpolate(p, [0, 1], [fit.w / 2, fx]);
    cy = interpolate(p, [0, 1], [fit.h / 2, fy]);
  }
  void h;
  let tx = fit.w / 2 - S * cx;
  let ty = fit.h / 2 - S * cy;
  tx = Math.min(0, Math.max(fit.w - S * fit.w, tx));
  ty = Math.min(0, Math.max(fit.h - S * fit.h, ty));
  return { scale: S, tx, ty };
};

/** Ken Burns progress: ease to the focus over `zoomSeconds`, then hold. */
export const kenBurnsProgress = (frame: number, fps: number, zoomSeconds = 1.2, delayFrames = 0) =>
  interpolate(frame - delayFrames, [0, zoomSeconds * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });

/** Slow 1.00 → 1.04 push over the scene so a held frame is never static. */
export const slowPush = (frame: number, durationInFrames: number, amount = 0.04) => 1 + amount * Math.min(1, Math.max(0, frame / Math.max(1, durationInFrames)));

/** Rounded media frame (border, shadow) positioned at a fitted box. Children are clipped. */
export const MediaFrame: React.FC<{ fit: Fit; children: React.ReactNode; scale?: number; radius?: number }> = ({ fit, children, scale = 1, radius }) => {
  const T = useTheme();
  const L = useLayout();
  return (
    <div
      style={{
        position: "absolute",
        left: fit.x,
        top: fit.y,
        width: fit.w,
        height: fit.h,
        borderRadius: radius ?? L.media.radius,
        overflow: "hidden",
        border: `1px solid ${T.colors.cardBorder}`,
        boxShadow: T.glow > 0 ? `0 0 70px ${T.colors.accent}33, 0 40px 90px rgba(0,0,0,0.7)` : "0 24px 60px rgba(0,0,0,0.18)",
        scale: String(scale),
        backgroundColor: T.name === "paper" ? "#fff" : "#000",
      }}
    >
      {children}
    </div>
  );
};

/** Image with Ken Burns inside a fitted box (focus rect optional). Missing file → theme plate. */
export const KenBurnsImage: React.FC<{ src: string; w: number; h: number; fit: Fit; focus?: Rect; zoomSeconds?: number; delayFrames?: number; push?: number }> = ({ src, w, h, fit, focus, zoomSeconds = 1.2, delayFrames = 0, push }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const p = kenBurnsProgress(frame, fps, zoomSeconds, delayFrames);
  const pushAmount = push ?? (focus ? 0.03 : 0.08);
  const t = focusTransform(fit, w, h, focus, p, slowPush(frame, durationInFrames, pushAmount));
  if (!hasStatic(src)) return <Plate />;
  return (
    <Img
      src={staticFile(src)}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: fit.w,
        height: fit.h,
        objectFit: "cover",
        transformOrigin: "0 0",
        translate: `${t.tx}px ${t.ty}px`,
        scale: String(t.scale),
      }}
    />
  );
};

/**
 * A clip rendered as constant-rate <Video> segments (see clipSchedule.ts). Only one segment is mounted at a time, so
 * this is one decoder. When the footage cannot cover the scene, the last covered frame is held with <Freeze>.
 */
export const ScheduledVideo: React.FC<{ src: string; schedule: ClipSchedule; toSeconds: number; objectFit: "cover" | "contain"; style: React.CSSProperties; name?: string }> = ({ src, schedule, toSeconds, objectFit, style, name }) => {
  const { fps } = useVideoConfig();
  const url = staticFile(src);
  const trimAfter = Math.round(toSeconds * fps) + 1; // +1 frame absorbs trimBefore rounding; sequences bound playback
  const holds = schedule.coverFrames < schedule.sceneFrames;
  const freezeAt = Math.max(0, schedule.coverFrames - 1);
  return (
    <Freeze frame={freezeAt} active={(f) => holds && f >= schedule.coverFrames}>
      {schedule.segments.map((seg, i) => (
        <Sequence key={i} from={seg.startFrame} durationInFrames={seg.frames} layout="none" name={`${name ?? "clip"} ×${seg.rate.toFixed(2)}`}>
          <Video src={url} muted trimBefore={Math.round(seg.srcFrom * fps)} trimAfter={trimAfter} playbackRate={seg.rate} objectFit={objectFit} style={style} />
        </Sequence>
      ))}
    </Freeze>
  );
};
