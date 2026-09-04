import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { SceneProps } from "../types";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { META, payloadOf } from "../content";
import { SceneFrame, useScene } from "../components/SceneFrame";
import { displayAccentStyle } from "../components/ui";

const Tick: React.FC<{ size: number; p: number; color: string; bg: string }> = ({ size, p, color, bg }) => {
  const len = 40;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", scale: String(interpolate(p, [0, 1], [0.6, 1])) }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <path d="M5 12.5 L10 17.5 L19 7" stroke={color} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - Math.min(1, p))} />
      </svg>
    </div>
  );
};

/** Screenshot-worthy 总结卡: title + checklist with staggered ticks, brand small, very clean. */
export const Summary: React.FC<SceneProps> = ({ beat, globalStart, totalFrames }) => {
  const info = useScene(beat, globalStart, totalFrames);
  const s = payloadOf(beat, "summary");
  const L = useLayout();
  const T = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.max(1, s.items.length);
  const hasBottom = info.lines.length > 0 || info.cards.length > 0;
  const width = Math.min(L.hero.maxWidth, L.W - L.safe.left - L.safe.right);
  const left = (L.W - width) / 2;
  const pad = Math.round(48 * L.fontScale);
  const titleH = Math.round(110 * L.fontScale);
  const rowH = Math.max(Math.round(66 * L.fontScale), Math.min(Math.round(96 * L.fontScale), Math.floor((L.chart.h - titleH - pad * 2 - 70 * L.fontScale) / n)));
  const cardH = titleH + rowH * n + pad * 2 + Math.round(60 * L.fontScale);
  const areaBottom = hasBottom ? L.captionTopFree - 30 : L.chart.y + L.chart.h;
  const top = Math.max(L.chart.y, Math.round((L.chart.y + areaBottom) / 2 - cardH / 2));
  const cardIn = spring({ frame, fps, config: { damping: 15, stiffness: 110 } });
  const size = fs(L, n > 5 ? 30 : n > 3 ? 34 : 38);
  const push = interpolate(frame, [0, info.durationInFrames], [1, 1.015], { extrapolateRight: "clamp" });
  return (
    <SceneFrame beat={beat} info={info} particles={false}>
      <div
        style={{
          position: "absolute",
          left,
          top,
          width,
          height: cardH,
          padding: pad,
          boxSizing: "border-box",
          borderRadius: T.cornerRadius,
          background: T.colors.cardBg,
          border: `1px solid ${T.colors.cardBorder}`,
          boxShadow: T.glow > 0 ? `0 30px 90px rgba(0,0,0,0.5)` : "0 18px 44px rgba(0,0,0,0.12)",
          opacity: Math.min(1, cardIn * 1.5),
          transform: `translateY(${interpolate(cardIn, [0, 1], [40, 0])}px) scale(${push})`,
        }}
      >
        <div style={{ height: titleH, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ fontFamily: T.fonts.display, fontSize: fs(L, 48), fontWeight: 900, color: T.colors.fg, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <span style={displayAccentStyle(T)}>{s.title}</span>
          </div>
          <div style={{ fontFamily: T.fonts.cn, fontSize: fs(L, 22), fontWeight: 700, color: T.colors.dim, padding: "6px 12px", borderRadius: 999, border: `1px solid ${T.colors.cardBorder}`, whiteSpace: "nowrap", marginLeft: 16 }}>总结</div>
        </div>
        {s.items.map((item, i) => {
          const delay = 10 + i * 7;
          const sp = spring({ frame: frame - delay, fps, config: { damping: 13, stiffness: 150 } });
          const tickSize = Math.round(rowH * 0.5);
          return (
            <div key={i} style={{ height: rowH, display: "flex", alignItems: "center", gap: Math.round(22 * L.fontScale), opacity: frame < delay ? 0 : Math.min(1, sp * 2), transform: `translateX(${interpolate(sp, [0, 1], [30, 0])}px)`, borderTop: i === 0 ? "none" : `1px solid ${T.colors.cardBorder}` }}>
              <Tick size={tickSize} p={Math.min(1, spring({ frame: frame - delay - 4, fps, config: { damping: 14, stiffness: 120 } }))} color={T.name === "paper" ? "#fff" : T.colors.bg} bg={T.colors.accent} />
              <div style={{ fontFamily: T.fonts.cn, fontSize: size, fontWeight: 600, color: T.colors.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item}</div>
            </div>
          );
        })}
        <div style={{ position: "absolute", left: pad, right: pad, bottom: Math.round(26 * L.fontScale), display: "flex", justifyContent: "space-between", fontFamily: T.fonts.en, fontSize: fs(L, 22), color: T.colors.dim, fontWeight: 700, letterSpacing: 1 }}>
          <span>
            {META.brand}
            {META.brandAccent ? <span style={{ color: T.colors.accent }}> {META.brandAccent}</span> : null}
          </span>
          <span style={{ fontFamily: T.fonts.cn, fontWeight: 500 }}>{META.source}</span>
        </div>
      </div>
    </SceneFrame>
  );
};
