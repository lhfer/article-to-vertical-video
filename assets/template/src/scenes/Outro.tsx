import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { SceneProps } from "../types";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { META, payloadOf } from "../content";
import { SceneFrame, useScene } from "../components/SceneFrame";
import { Rise, SlamText } from "../components/Text";

/** Lines staggered → brand slam → finalLine → fade to black over the last 0.6 s. */
export const Outro: React.FC<SceneProps> = ({ beat, globalStart, totalFrames }) => {
  const info = useScene(beat, globalStart, totalFrames);
  const o = payloadOf(beat, "outro");
  const L = useLayout();
  const T = useTheme();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const lines = o.lines.slice(0, 4);
  const lineH = Math.round(66 * L.fontScale);
  const linesTop = L.hero.y - Math.round(250 * L.fontScale);
  const brandTop = linesTop + lines.length * lineH + Math.round(50 * L.fontScale);
  const brandDelay = 6 + lines.length * 6 + 4;
  const finalTop = brandTop + Math.round(L.hero.size * 1.1) + Math.round(24 * L.fontScale);
  const fade = interpolate(frame, [durationInFrames - Math.round(0.6 * fps), durationInFrames - 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <SceneFrame beat={beat} info={info} calm captions={false} footer={false} overlay={<AbsoluteFill style={{ backgroundColor: "#000", opacity: fade, pointerEvents: "none" }} />}>
      {lines.map((l, i) => (
        <Rise key={i} delay={6 + i * 6} style={{ position: "absolute", left: L.safe.left + 40, right: L.safe.right + 40, top: linesTop + i * lineH, textAlign: "center", fontFamily: T.fonts.cn, fontSize: fs(L, 36), fontWeight: 600, color: i === lines.length - 1 ? T.colors.fg : T.colors.dim, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {l}
        </Rise>
      ))}
      <SlamText text={`${META.brand}${META.brandAccent ? " " + META.brandAccent : ""}`} size={Math.round(L.hero.size * 0.9)} top={brandTop} delay={brandDelay} accent letterSpacing={2} />
      {META.finalLine ? (
        <Rise delay={brandDelay + 12} style={{ position: "absolute", left: L.safe.left + 40, right: L.safe.right + 40, top: finalTop, textAlign: "center", fontFamily: T.fonts.cn, fontSize: fs(L, 30), color: T.colors.dim, fontWeight: 500 }}>
          {META.finalLine}
        </Rise>
      ) : null}
      {META.bottomNote ? (
        <Rise delay={brandDelay + 18} style={{ position: "absolute", left: 0, right: 0, top: L.footerY - Math.round(50 * L.fontScale), textAlign: "center", fontFamily: T.fonts.cn, fontSize: fs(L, 22), color: T.colors.faint }}>
          {META.bottomNote}
        </Rise>
      ) : null}
    </SceneFrame>
  );
};
