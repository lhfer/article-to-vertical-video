import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { SceneProps } from "../types";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { payloadOf } from "../content";
import { fmtNumber } from "../text";
import { SceneFrame, useScene } from "../components/SceneFrame";
import { bigNumberStyle, displayAccentStyle } from "../components/ui";

/** Title + rows as horizontal bars with value/unit; hero row accented; count-ups staggered. */
export const Scorecard: React.FC<SceneProps> = ({ beat, globalStart, totalFrames }) => {
  const info = useScene(beat, globalStart, totalFrames);
  const sc = payloadOf(beat, "scorecard");
  const L = useLayout();
  const T = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rows = sc.rows;
  const n = Math.max(1, rows.length);
  const hasBottom = info.lines.length > 0 || info.cards.length > 0;
  const bottom = hasBottom ? Math.min(L.chart.y + L.chart.h, L.captionTopFree - 30) : L.chart.y + L.chart.h;
  const titleH = Math.round(100 * L.fontScale);
  const rowH = Math.max(Math.round(72 * L.fontScale), Math.min(Math.round(118 * L.fontScale), Math.floor((bottom - L.chart.y - titleH) / n)));
  const globalMax = Math.max(...rows.map((r) => r.max ?? Math.abs(r.value))) || 1;
  const titleS = spring({ frame: frame - 2, fps, config: { damping: 14, stiffness: 160 } });
  const push = interpolate(frame, [0, info.durationInFrames], [1, 1.02], { extrapolateRight: "clamp" });
  const labelW = Math.round(L.chart.w * 0.34);
  const valueW = Math.round(L.chart.w * 0.24);
  const barW = L.chart.w - labelW - valueW - Math.round(28 * L.fontScale);
  return (
    <SceneFrame beat={beat} info={info}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${push})`, transformOrigin: "50% 40%" }}>
        <div style={{ position: "absolute", left: L.chart.x, top: L.chart.y, width: L.chart.w, fontFamily: T.fonts.display, fontSize: fs(L, 48), fontWeight: 900, color: T.colors.fg, opacity: Math.min(1, titleS * 2), transform: `translateX(${interpolate(titleS, [0, 1], [-40, 0])}px)`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <span style={displayAccentStyle(T)}>{sc.title}</span>
        </div>
        {rows.map((r, i) => {
          const delay = 8 + i * 6;
          const sp = spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 90 } });
          const p = Math.min(1, sp);
          const max = r.max ?? globalMax;
          const frac = Math.min(1, Math.abs(r.value) / (max || 1));
          const hero = Boolean(r.hero);
          const barH = Math.round(rowH * (hero ? 0.34 : 0.26));
          const top = L.chart.y + titleH + i * rowH;
          return (
            <div key={i} style={{ position: "absolute", left: L.chart.x, top, width: L.chart.w, height: rowH, display: "flex", alignItems: "center", opacity: frame < delay ? 0 : Math.min(1, sp * 2), transform: `translateY(${interpolate(sp, [0, 1], [16, 0])}px)` }}>
              <div style={{ width: labelW, fontFamily: T.fonts.cn, fontSize: fs(L, hero ? 34 : 30), fontWeight: hero ? 800 : 600, color: hero ? T.colors.fg : T.colors.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 12 }}>{r.label}</div>
              <div style={{ width: barW, height: barH, borderRadius: 999, background: T.colors.barBg, position: "relative", marginRight: Math.round(28 * L.fontScale) }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: barW * frac * p, borderRadius: 999, background: hero ? T.gradients.hot : T.colors.accent2, opacity: hero ? 1 : 0.6, boxShadow: hero && T.glow > 0 ? `0 0 20px ${T.colors.accent}99` : "none" }} />
                {r.max !== undefined ? <div style={{ position: "absolute", right: -2, top: -4, bottom: -4, width: 2, background: T.colors.cardBorder }} /> : null}
              </div>
              <div style={{ width: valueW, textAlign: "right", fontFamily: T.fonts.en, fontSize: fs(L, hero ? 46 : 36), fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1, ...(hero ? bigNumberStyle(T) : { color: T.colors.fg }) }}>
                {fmtNumber(r.value, r.value * p, r.unit ?? "")}
              </div>
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
};
