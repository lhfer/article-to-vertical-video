import React from "react";
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { SceneProps } from "../types";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { chapterOf } from "../content";
import { Backdrop } from "../components/Backdrop";
import { Flash } from "../components/Flash";
import { textGlow } from "../components/ui";

/** Chapter card: number slam + title + sub. Tier decides its length (0.8 s m / 1.4 s l); skipped in Short and xs/s by the timeline. */
export const ChapterTitle: React.FC<SceneProps> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLayout();
  const T = useTheme();
  const ch = chapterOf(beat) ?? { id: beat.chapter ?? "", num: "", title: beat.chapter ?? "", sub: undefined };
  const a = spring({ frame, fps, config: { damping: 15, stiffness: 190 } });
  const b = spring({ frame: frame - 3, fps, config: { damping: 15, stiffness: 190 } });
  const numSize = fs(L, 280);
  const blockH = Math.round(numSize * 1.02 + fs(L, 78) * 1.35 + 10 + fs(L, 28) * 1.6 + 22);
  const numTop = Math.max(L.safe.top + 40, Math.round((L.H - blockH) / 2) - Math.round(30 * L.fontScale));
  const titleTop = numTop + Math.round(numSize * 1.02);
  const subTop = titleTop + fs(L, 78) * 1.35 + 10;
  const x = L.chart.x;
  return (
    <AbsoluteFill style={{ backgroundColor: T.colors.bg, overflow: "hidden" }}>
      <Backdrop />
      <div
        style={{
          position: "absolute",
          left: interpolate(a, [0, 1], [-700, x]),
          top: numTop,
          fontFamily: T.fonts.en,
          fontWeight: 900,
          fontSize: numSize,
          lineHeight: 1,
          letterSpacing: -10,
          transform: `skewX(${interpolate(a, [0, 1], [-25, -8])}deg)`,
          ...(T.gradients.useGradientText
            ? { backgroundImage: T.gradients.fire, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: `drop-shadow(0 0 40px ${T.colors.accent2}88)` }
            : { color: T.colors.accent }),
        }}
      >
        {ch.num}
      </div>
      <div
        style={{
          position: "absolute",
          left: x,
          width: L.chart.w,
          top: titleTop,
          fontFamily: T.fonts.display,
          fontWeight: 900,
          fontSize: fs(L, 78),
          color: T.colors.fg,
          lineHeight: 1.2,
          opacity: Math.min(1, b * 2),
          translate: `${interpolate(b, [0, 1], [400, 0])}px 0`,
          textShadow: textGlow(T),
        }}
      >
        {ch.title}
      </div>
      {ch.sub ? (
        <div style={{ position: "absolute", left: x, width: L.chart.w, top: subTop, fontFamily: T.fonts.en, fontSize: fs(L, 28), letterSpacing: 5, color: T.colors.dim, textTransform: "uppercase", opacity: interpolate(frame, [6, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          {ch.sub}
        </div>
      ) : null}
      <div style={{ position: "absolute", left: x, top: subTop + fs(L, 28) * 1.6 + 16, height: 6, width: interpolate(b, [0, 1], [0, L.chart.w]), background: T.gradients.fire, borderRadius: 3 }} />
      {T.glow > 0 ? (
        <Sequence from={0} durationInFrames={4} layout="none">
          <Flash peak={0.5} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
