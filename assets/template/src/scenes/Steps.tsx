import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { SceneProps } from "../types";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { payloadOf } from "../content";
import { SceneFrame, useScene } from "../components/SceneFrame";
import { displayAccentStyle, glowShadow } from "../components/ui";

/** Title + numbered items staggered in; the active item follows the narration proportion. */
export const Steps: React.FC<SceneProps> = ({ beat, globalStart, totalFrames }) => {
  const info = useScene(beat, globalStart, totalFrames);
  const s = payloadOf(beat, "steps");
  const L = useLayout();
  const T = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.max(1, s.items.length);
  const hasBottom = info.lines.length > 0 || info.cards.length > 0;
  const areaH = (hasBottom ? Math.min(L.chart.y + L.chart.h, L.captionTopFree - 30) : L.chart.y + L.chart.h) - L.chart.y;
  const titleH = Math.round(96 * L.fontScale);
  const rowH = Math.max(Math.round(64 * L.fontScale), Math.min(Math.round(120 * L.fontScale), Math.floor((areaH - titleH) / n)));
  const size = fs(L, n > 5 ? 32 : n > 3 ? 36 : 40);
  const active = Math.min(n - 1, Math.floor(info.spoken * n * 0.999));
  const titleS = spring({ frame: frame - 2, fps, config: { damping: 14, stiffness: 160 } });
  const push = interpolate(frame, [0, info.durationInFrames], [1, 1.02], { extrapolateRight: "clamp" });
  return (
    <SceneFrame beat={beat} info={info}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${push})`, transformOrigin: "50% 40%" }}>
        <div style={{ position: "absolute", left: L.chart.x, top: L.chart.y, width: L.chart.w, fontFamily: T.fonts.display, fontSize: fs(L, 48), fontWeight: 900, color: T.colors.fg, opacity: Math.min(1, titleS * 2), transform: `translateX(${interpolate(titleS, [0, 1], [-40, 0])}px)`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <span style={displayAccentStyle(T)}>{s.title}</span>
        </div>
        {s.items.map((item, i) => {
          const delay = 8 + i * 5;
          const sp = spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 150 } });
          const isActive = i === active;
          const done = i < active;
          const numSize = Math.round(rowH * 0.5);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: L.chart.x,
                top: L.chart.y + titleH + i * rowH,
                width: L.chart.w,
                height: rowH,
                display: "flex",
                alignItems: "center",
                gap: Math.round(24 * L.fontScale),
                opacity: frame < delay ? 0 : Math.min(1, sp * 2) * (isActive ? 1 : done ? 0.75 : 0.5),
                transform: `translateX(${interpolate(sp, [0, 1], [50, 0])}px) scale(${isActive ? 1.02 : 1})`,
                transformOrigin: "left center",
              }}
            >
              <div
                style={{
                  width: numSize,
                  height: numSize,
                  borderRadius: "50%",
                  flex: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: T.fonts.en,
                  fontSize: Math.round(numSize * 0.55),
                  fontWeight: 900,
                  color: isActive || done ? (T.name === "paper" ? "#fff" : T.colors.bg) : T.colors.dim,
                  background: isActive ? T.colors.accent : done ? T.colors.accent2 : T.colors.barBg,
                  boxShadow: isActive ? glowShadow(T, `${T.colors.accent}99`, 30) : "none",
                }}
              >
                {i + 1}
              </div>
              <div style={{ fontFamily: T.fonts.cn, fontSize: size, fontWeight: isActive ? 800 : 600, color: T.colors.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, borderBottom: `1px solid ${T.colors.cardBorder}`, paddingBottom: 6 }}>{item}</div>
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
};
