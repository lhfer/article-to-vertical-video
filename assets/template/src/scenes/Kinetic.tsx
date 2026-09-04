import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import type { SceneProps } from "../types";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { payloadOf } from "../content";
import { SceneFrame, useScene } from "../components/SceneFrame";
import { Rise, WordSlam } from "../components/Text";
import { fitFontSize, hotIn, lineCount } from "../text";

/** One big spoken phrase, word-by-word spring, the hot style on the last word; small sub line. */
export const Kinetic: React.FC<SceneProps> = ({ beat, globalStart, totalFrames }) => {
  const info = useScene(beat, globalStart, totalFrames);
  const k = payloadOf(beat, "kinetic");
  const hots = hotIn(k.text, beat.lines);
  const L = useLayout();
  const T = useTheme();
  const frame = useCurrentFrame();
  const hasLines = info.lines.length > 0;
  const size = fitFontSize(k.text, L.hero.size, L.hero.maxWidth);
  const nLines = lineCount(k.text, size, L.hero.maxWidth);
  const top = hasLines ? L.hero.y - Math.round(120 * L.fontScale) : L.hero.y - Math.round(40 * L.fontScale);
  const push = interpolate(frame, [0, info.durationInFrames], [1, 1.03], { extrapolateRight: "clamp" });
  return (
    <SceneFrame beat={beat} info={info}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${push})`, transformOrigin: "50% 45%" }}>
        <WordSlam text={k.text} size={size} top={top} delay={4} stagger={5} hot={hots} hotLast={hots.length === 0} maxWidth={L.hero.maxWidth} />
        {k.sub ? (
          <Rise delay={Math.round(4 + k.text.length * 1.3)} style={{ position: "absolute", left: (L.W - L.hero.maxWidth) / 2, width: L.hero.maxWidth, top: top + Math.round(size * 1.15 * nLines) + Math.round(30 * L.fontScale), textAlign: "center", fontFamily: T.fonts.cn, fontSize: fs(L, 34), color: T.colors.dim, fontWeight: 500 }}>
            {k.sub}
          </Rise>
        ) : null}
      </div>
    </SceneFrame>
  );
};
