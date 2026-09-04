import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { SceneProps } from "../types";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { payloadOf } from "../content";
import { SceneFrame, useScene } from "../components/SceneFrame";
import { Rise } from "../components/Text";
import { displayAccentStyle } from "../components/ui";

/** Typewriter quote card with big quotation marks and a "— by" line. */
export const Quote: React.FC<SceneProps> = ({ beat, globalStart, totalFrames }) => {
  const info = useScene(beat, globalStart, totalFrames);
  const q = payloadOf(beat, "quote");
  const L = useLayout();
  const T = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chars = Array.from(q.text);
  // type over the first ~55% of the spoken span (or of the scene), at least 1 char / frame, at most 2 frames / char
  const spokenFrames = info.vo !== null ? info.vo * fps : info.durationInFrames;
  const typeFrames = Math.max(chars.length, Math.min(chars.length * 2.2, spokenFrames * 0.55));
  const shown = Math.min(chars.length, Math.floor(interpolate(frame, [8, 8 + typeFrames], [0, chars.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const caret = frame < 8 + typeFrames && Math.floor(frame / 8) % 2 === 0;
  const cardIn = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  const size = fs(L, chars.length > 40 ? 40 : chars.length > 24 ? 46 : 52);
  const width = Math.min(L.hero.maxWidth, L.W - L.safe.left - L.safe.right);
  const left = (L.W - width) / 2;
  const top = L.hero.y - Math.round(230 * L.fontScale);
  const push = interpolate(frame, [0, info.durationInFrames], [1, 1.025], { extrapolateRight: "clamp" });
  return (
    <SceneFrame beat={beat} info={info}>
      <div
        style={{
          position: "absolute",
          left,
          top,
          width,
          padding: `${Math.round(70 * L.fontScale)}px ${Math.round(56 * L.fontScale)}px ${Math.round(56 * L.fontScale)}px`,
          borderRadius: T.cornerRadius,
          background: T.colors.cardBg,
          border: `1px solid ${T.colors.cardBorder}`,
          boxShadow: T.glow > 0 ? `0 30px 80px rgba(0,0,0,0.45)` : "0 16px 40px rgba(0,0,0,0.12)",
          opacity: Math.min(1, cardIn * 1.5),
          transform: `translateY(${interpolate(cardIn, [0, 1], [40, 0])}px) scale(${push})`,
          boxSizing: "border-box",
        }}
      >
        <div style={{ position: "absolute", left: Math.round(34 * L.fontScale), top: Math.round(-30 * L.fontScale), fontFamily: T.fonts.en, fontSize: fs(L, 150), lineHeight: 1, fontWeight: 900, ...displayAccentStyle(T), opacity: 0.9 }}>“</div>
        <div style={{ fontFamily: T.fonts.cn, fontSize: size, lineHeight: 1.5, fontWeight: 600, color: T.colors.fg, minHeight: size * 1.5 * 2, wordBreak: "break-all" }}>
          {chars.slice(0, shown).join("")}
          <span style={{ opacity: caret ? 1 : 0, color: T.colors.accent }}>|</span>
        </div>
        <Rise delay={Math.round(8 + typeFrames)} style={{ marginTop: Math.round(28 * L.fontScale), textAlign: "right", fontFamily: T.fonts.cn, fontSize: fs(L, 30), color: T.colors.dim, fontWeight: 500 }}>
          —— {q.by}
        </Rise>
        <div style={{ position: "absolute", right: Math.round(30 * L.fontScale), bottom: Math.round(-46 * L.fontScale), fontFamily: T.fonts.en, fontSize: fs(L, 150), lineHeight: 1, fontWeight: 900, ...displayAccentStyle(T), opacity: 0.9 }}>”</div>
      </div>
    </SceneFrame>
  );
};
