import React from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import type { SceneProps } from "../types";
import { fitMedia, fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { payloadOf } from "../content";
import { bgTwinOf, hasStatic } from "../assets";
import { clipSchedule } from "../clipSchedule";
import { Plate } from "../components/Backdrop";
import { MediaFrame, ScheduledVideo, focusTransform, kenBurnsProgress, slowPush } from "../components/Media";
import { SceneFrame, useScene } from "../components/SceneFrame";
import { Pill } from "../components/Text";

/**
 * Demo clip: one foreground <Video> (objectFit cover, trims in SOURCE frames, piecewise rate — see clipSchedule.ts),
 * background = the pre-blurred `<src>.bg.mp4` twin when present (never a CSS-blurred second decoder), else a theme plate.
 * `focus` Ken Burns from the full frame into the rect over 1.2 s, then a slow push. Captions below the media box.
 */
export const Clip: React.FC<SceneProps> = ({ beat, globalStart, totalFrames }) => {
  const info = useScene(beat, globalStart, totalFrames);
  const c = payloadOf(beat, "clip");
  const L = useLayout();
  const T = useTheme();
  const frame = useCurrentFrame();
  const fit = fitMedia(L, c.w, c.h);
  const has = hasStatic(c.src);
  const bgMode = c.bg ?? "blur";
  const twin = bgTwinOf(c.src);
  const hasTwin = bgMode === "blur" && has && hasStatic(twin);
  const schedule = clipSchedule(c, info.seconds, info.fps);
  const p = kenBurnsProgress(frame, info.fps, 1.2, 4);
  const push = slowPush(frame, info.durationInFrames, 0.04);
  const tf = focusTransform(fit, c.w, c.h, c.focus, p, push);
  const entrance = interpolate(frame, [0, 10], [0.96, 1], { extrapolateRight: "clamp" });
  return (
    <SceneFrame beat={beat} info={info} media={fit}>
      {hasTwin ? (
        <Video src={staticFile(twin)} muted loop objectFit="cover" style={{ position: "absolute", left: 0, top: 0, width: L.W, height: L.H, opacity: 0.85 }} />
      ) : bgMode !== "none" ? (
        <Plate angle={160} />
      ) : null}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${T.colors.bg}cc 0%, transparent 22%, transparent 70%, ${T.colors.bg}dd 100%)` }} />
      <MediaFrame fit={fit} scale={entrance}>
        {has ? (
          <div style={{ position: "absolute", left: 0, top: 0, width: fit.w, height: fit.h, transform: `translate(${tf.tx}px, ${tf.ty}px) scale(${tf.scale})`, transformOrigin: "0 0" }}>
            <ScheduledVideo src={c.src} schedule={schedule} toSeconds={c.to} objectFit="cover" style={{ position: "absolute", left: 0, top: 0, width: fit.w, height: fit.h }} name={beat.id} />
          </div>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.fonts.cn, fontSize: fs(L, 32), color: T.colors.dim, background: T.colors.cardBg }}>
            缺少 public/{c.src}
          </div>
        )}
      </MediaFrame>
      {c.tag ? <Pill text={c.tag} left={fit.x + Math.round(24 * L.fontScale)} top={fit.y + Math.round(22 * L.fontScale)} delay={6} solid /> : null}
      {schedule.rate > 1.05 ? (
        <div style={{ position: "absolute", right: L.W - fit.x - fit.w + Math.round(24 * L.fontScale), top: fit.y + Math.round(24 * L.fontScale), fontFamily: T.fonts.en, fontSize: fs(L, 24), fontWeight: 800, color: T.colors.fg, background: "rgba(0,0,0,0.45)", padding: "6px 14px", borderRadius: 999, opacity: interpolate(frame, [8, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          {schedule.rate.toFixed(schedule.rate % 1 === 0 ? 0 : 1)}×
        </div>
      ) : null}
    </SceneFrame>
  );
};
