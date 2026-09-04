import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { SceneProps } from "../types";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { payloadOf } from "../content";
import { SceneFrame, useScene } from "../components/SceneFrame";
import { Rise, WordSlam } from "../components/Text";
import { fitFontSize, hotIn, lineCount } from "../text";

/** Question centered + sub + a comment-bubble motif; energy calm. */
export const Cta: React.FC<SceneProps> = ({ beat, globalStart, totalFrames }) => {
  const info = useScene(beat, globalStart, totalFrames);
  const c = payloadOf(beat, "cta");
  const L = useLayout();
  const T = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chars = Array.from(c.question).length;
  const size = fitFontSize(c.question, Math.round(L.hero.size * 0.84), L.hero.maxWidth);
  const nLines = lineCount(c.question, size, L.hero.maxWidth);
  const bubbleW = Math.round(120 * L.fontScale);
  const bubbleTop = L.hero.y - Math.round(190 * L.fontScale);
  const bubbleIn = spring({ frame: frame - 2, fps, config: { damping: 10, stiffness: 140 } });
  const bob = Math.sin((frame / fps) * Math.PI * 2 * 0.6) * 6;
  const push = interpolate(frame, [0, info.durationInFrames], [1, 1.02], { extrapolateRight: "clamp" });
  return (
    <SceneFrame beat={beat} info={info} calm>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${push})`, transformOrigin: "50% 50%" }}>
        {/* comment bubble */}
        <div style={{ position: "absolute", left: (L.W - bubbleW) / 2, top: bubbleTop, width: bubbleW, height: Math.round(bubbleW * 0.8), opacity: Math.min(1, bubbleIn), transform: `translateY(${bob}px) scale(${interpolate(bubbleIn, [0, 1], [0.4, 1])})`, transformOrigin: "50% 100%" }}>
          <svg width={bubbleW} height={bubbleW * 0.8} viewBox="0 0 120 96" fill="none">
            <path d="M14 8h92a10 10 0 0 1 10 10v44a10 10 0 0 1-10 10H50L28 92V72H14A10 10 0 0 1 4 62V18A10 10 0 0 1 14 8z" fill={T.colors.accent} opacity={0.95} />
            {[0, 1, 2].map((i) => {
              const d = spring({ frame: frame - 10 - i * 5, fps, config: { damping: 9, stiffness: 200 } });
              return <circle key={i} cx={38 + i * 22} cy={40} r={7 * Math.min(1, d)} fill={T.name === "paper" ? "#fff" : T.colors.bg} />;
            })}
          </svg>
        </div>
        <WordSlam text={c.question} size={size} top={L.hero.y - Math.round(40 * L.fontScale)} delay={6} stagger={4} hot={hotIn(c.question, beat.lines)} maxWidth={L.hero.maxWidth} lineHeight={1.25} />
        {c.sub ? (
          <Rise delay={Math.round(10 + chars * 1.4)} style={{ position: "absolute", left: (L.W - L.hero.maxWidth) / 2, width: L.hero.maxWidth, top: L.hero.y - Math.round(40 * L.fontScale) + Math.round(size * 1.25 * nLines) + Math.round(24 * L.fontScale), textAlign: "center", fontFamily: T.fonts.cn, fontSize: fs(L, 32), color: T.colors.dim, fontWeight: 500 }}>
            {c.sub}
          </Rise>
        ) : null}
      </div>
    </SceneFrame>
  );
};
