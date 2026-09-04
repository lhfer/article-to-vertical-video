import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { SceneProps } from "../types";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { payloadOf, sourceOf } from "../content";
import { SceneFrame, useScene } from "../components/SceneFrame";
import { WordSlam } from "../components/Text";
import { fitFontSize, hotIn, lineCount } from "../text";
import { displayAccentStyle } from "../components/ui";

/** Opinion card: big text, the Badge stamps with a "观点" ribbon, the source shown small when present. */
export const Take: React.FC<SceneProps> = ({ beat, globalStart, totalFrames }) => {
  const info = useScene(beat, globalStart, totalFrames);
  const tk = payloadOf(beat, "take");
  const L = useLayout();
  const T = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const src = sourceOf(tk.source ?? beat.takes?.[0]?.source);
  const chars = Array.from(tk.text).length;
  const width = Math.min(L.hero.maxWidth, L.W - L.safe.left - L.safe.right);
  const left = (L.W - width) / 2;
  const textW = width - Math.round(100 * L.fontScale);
  const size = fitFontSize(tk.text, Math.round(L.hero.size * 0.92), textW, 3, 0.88);
  const lines = lineCount(tk.text, size, textW);
  const cardH = Math.round(size * 1.2 * lines + 200 * L.fontScale + (src ? 50 * L.fontScale : 0));
  const top = Math.max(L.chart.y, L.hero.y - Math.round(cardH * 0.55));
  const cardIn = spring({ frame, fps, config: { damping: 14, stiffness: 110 } });
  const stampAt = Math.round(0.45 * fps) + Math.min(24, chars * 2);
  const push = interpolate(frame, [0, info.durationInFrames], [1, 1.025], { extrapolateRight: "clamp" });
  return (
    <SceneFrame beat={beat} info={info} stamp stampAt={stampAt}>
      <div
        style={{
          position: "absolute",
          left,
          top,
          width,
          height: cardH,
          borderRadius: T.cornerRadius,
          background: T.colors.cardBg,
          border: `1px solid ${T.colors.cardBorder}`,
          boxShadow: T.glow > 0 ? `0 0 90px ${T.colors.accent}22, 0 30px 80px rgba(0,0,0,0.45)` : "0 16px 40px rgba(0,0,0,0.12)",
          opacity: Math.min(1, cardIn * 1.5),
          transform: `translateY(${interpolate(cardIn, [0, 1], [50, 0])}px) scale(${push})`,
          boxSizing: "border-box",
        }}
      >
        <div style={{ position: "absolute", left: Math.round(40 * L.fontScale), top: Math.round(34 * L.fontScale), display: "flex", alignItems: "center", gap: 12, fontFamily: T.fonts.cn, fontSize: fs(L, 26), fontWeight: 800, color: T.colors.accent, letterSpacing: 2 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: T.colors.accent, display: "inline-block" }} />
          <span style={displayAccentStyle(T)}>我的看法</span>
        </div>
        {src ? (
          <div style={{ position: "absolute", left: Math.round(40 * L.fontScale), right: Math.round(40 * L.fontScale), bottom: Math.round(28 * L.fontScale), fontFamily: T.fonts.cn, fontSize: fs(L, 22), color: T.colors.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: interpolate(frame, [stampAt + 6, stampAt + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            参考 · {src.title}
          </div>
        ) : null}
      </div>
      <WordSlam text={tk.text} size={size} top={top + Math.round(100 * L.fontScale)} delay={6} stagger={4} weight={900} hot={hotIn(tk.text, beat.lines)} maxWidth={width - Math.round(100 * L.fontScale)} lineHeight={1.2} />
    </SceneFrame>
  );
};
