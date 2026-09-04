import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Rect, SceneProps } from "../types";
import { fitMedia, fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { payloadOf } from "../content";
import { hasStatic } from "../assets";
import { Plate } from "../components/Backdrop";
import { MediaFrame, focusTransform, kenBurnsProgress, slowPush } from "../components/Media";
import { SceneFrame, useScene } from "../components/SceneFrame";

/** The highlight rect padded by 35 % on each side (clamped to the image) so the zoom keeps some context. */
const padRect = (r: Rect, w: number, h: number): Rect => {
  const px = r.w * 0.35;
  const py = r.h * 0.35;
  const x = Math.max(0, r.x - px);
  const y = Math.max(0, r.y - py);
  return { x, y, w: Math.min(w - x, r.w + 2 * px), h: Math.min(h - y, r.h + 2 * py) };
};

/** Screenshot fitted, hold 0.5 s, then zoom into the highlight rect with a glowing box + label. */
export const Screenshot: React.FC<SceneProps> = ({ beat, globalStart, totalFrames }) => {
  const info = useScene(beat, globalStart, totalFrames);
  const sc = payloadOf(beat, "screenshot");
  const L = useLayout();
  const T = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fit = fitMedia(L, sc.w, sc.h);
  const k = fit.w / sc.w;
  const holdFrames = Math.round(0.5 * fps);
  const p = kenBurnsProgress(frame, fps, 1.2, holdFrames);
  const tf = focusTransform(fit, sc.w, sc.h, padRect(sc.highlight, sc.w, sc.h), p, slowPush(frame, info.durationInFrames, 0.02));
  const boxS = spring({ frame: frame - holdFrames + 4, fps, config: { damping: 12, stiffness: 160 } });
  const pulse = 0.75 + 0.25 * Math.sin((frame / fps) * Math.PI * 2 * 1.2);
  // highlight rect in fitted-image space, and on screen after the transform
  const r = { x: sc.highlight.x * k, y: sc.highlight.y * k, w: sc.highlight.w * k, h: sc.highlight.h * k };
  const screen = { x: fit.x + r.x * tf.scale + tf.tx, y: fit.y + r.y * tf.scale + tf.ty, w: r.w * tf.scale, h: r.h * tf.scale };
  const labelH = Math.round(48 * L.fontScale);
  const labelAbove = screen.y - labelH - 14 >= fit.y + 8;
  const labelTop = labelAbove ? screen.y - labelH - 14 : Math.min(fit.y + fit.h - labelH - 8, screen.y + screen.h + 14);
  const labelLeft = Math.max(fit.x + 8, Math.min(fit.x + fit.w - 8 - 420 * L.fontScale, screen.x));
  const entrance = interpolate(frame, [0, 10], [0.96, 1], { extrapolateRight: "clamp" });
  return (
    <SceneFrame beat={beat} info={info} media={fit}>
      <Plate angle={200} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${T.colors.bg}bb 0%, transparent 25%, transparent 70%, ${T.colors.bg}dd 100%)` }} />
      <MediaFrame fit={fit} scale={entrance}>
        <div style={{ position: "absolute", left: 0, top: 0, width: fit.w, height: fit.h, transformOrigin: "0 0", translate: `${tf.tx}px ${tf.ty}px`, scale: String(tf.scale) }}>
          {hasStatic(sc.src) ? (
            <Img src={staticFile(sc.src)} style={{ position: "absolute", left: 0, top: 0, width: fit.w, height: fit.h, objectFit: "cover" }} />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.fonts.cn, fontSize: fs(L, 32), color: T.colors.dim, background: T.colors.cardBg }}>缺少 public/{sc.src}</div>
          )}
          {/* dim everything but the highlight once the zoom starts */}
          <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${0.35 * Math.min(1, boxS)})`, clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${r.y}px, ${r.x}px ${r.y}px, ${r.x}px ${r.y + r.h}px, ${r.x + r.w}px ${r.y + r.h}px, ${r.x + r.w}px ${r.y}px, 0 ${r.y}px)` }} />
          <div
            style={{
              position: "absolute",
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              boxSizing: "border-box",
              border: `${Math.max(2, 4 / tf.scale)}px solid ${T.colors.accent}`,
              borderRadius: 10 / tf.scale,
              boxShadow: `0 0 ${(T.glow > 0 ? 40 : 14) / tf.scale}px ${T.colors.accent}${T.glow > 0 ? "cc" : "66"}, inset 0 0 ${18 / tf.scale}px ${T.colors.accent}44`,
              opacity: frame < holdFrames - 4 ? 0 : Math.min(1, boxS) * pulse,
              scale: String(interpolate(boxS, [0, 1], [1.4, 1])),
              transformOrigin: "50% 50%",
            }}
          />
        </div>
      </MediaFrame>
      <div
        style={{
          position: "absolute",
          left: labelLeft,
          top: labelTop,
          height: labelH,
          padding: `0 ${Math.round(18 * L.fontScale)}px`,
          display: "flex",
          alignItems: "center",
          borderRadius: 10,
          background: T.colors.accent,
          color: T.name === "paper" ? "#fff" : T.colors.bg,
          fontFamily: T.fonts.cn,
          fontSize: fs(L, 26),
          fontWeight: 800,
          whiteSpace: "nowrap",
          boxShadow: T.glow > 0 ? `0 0 24px ${T.colors.accent}99` : "0 6px 16px rgba(0,0,0,0.2)",
          opacity: frame < holdFrames ? 0 : Math.min(1, boxS),
          translate: `0 ${interpolate(boxS, [0, 1], [labelAbove ? 12 : -12, 0])}px`,
          maxWidth: fit.w - 16,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {sc.label}
      </div>
    </SceneFrame>
  );
};
