import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { META, chapterOf } from "../content";
import type { Beat } from "../types";
import { displayAccentStyle } from "./ui";

/** Brand row + optional chapter title + source + progress line. Everything positioned from layout.topBar. */
export const TopBar: React.FC<{ beat: Beat; progress: number }> = ({ beat, progress }) => {
  const frame = useCurrentFrame();
  const L = useLayout();
  const T = useTheme();
  const chapter = chapterOf(beat);
  const left = L.safe.left + 20;
  const width = L.W - L.safe.left - L.safe.right - 40;
  const sourceRight = L.safe.right + L.badge.size + 16 + Math.round(fs(L, 22) * 5.5);
  const brand = L.topBar.brandSize;
  return (
    <>
      <div style={{ position: "absolute", left, top: L.topBar.y, height: brand * 1.2, display: "flex", alignItems: "center", fontFamily: T.fonts.en, fontWeight: 800, fontSize: brand, letterSpacing: 4, color: T.colors.fg, whiteSpace: "nowrap" }}>
        <span style={{ fontFamily: T.fonts.cn }}>{META.brand}</span>
        {META.brandAccent ? <span style={{ marginLeft: 12, ...displayAccentStyle(T) }}>{META.brandAccent}</span> : null}
      </div>
      <div style={{ position: "absolute", right: sourceRight, top: L.topBar.y + Math.round(brand * 0.15), fontFamily: T.fonts.en, fontSize: fs(L, 20), letterSpacing: 3, color: T.colors.dim, whiteSpace: "nowrap" }}>{META.source}</div>
      {chapter ? (
        <div
          style={{
            position: "absolute",
            left,
            top: L.topBar.titleY,
            width,
            fontFamily: T.fonts.cn,
            fontWeight: 700,
            fontSize: L.topBar.titleSize,
            color: T.colors.fg,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            opacity: interpolate(frame, [4, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            translate: `${interpolate(frame, [4, 14], [-30, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px 0`,
          }}
        >
          <span style={{ fontFamily: T.fonts.en, color: T.colors.accent2, marginRight: 14 }}>{chapter.num}</span>
          {chapter.title}
        </div>
      ) : null}
      <div style={{ position: "absolute", left, top: L.topBar.progressY, width, height: 4, background: T.colors.faint, borderRadius: 2 }}>
        <div style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%`, height: 4, background: T.gradients.hot, borderRadius: 2 }} />
      </div>
    </>
  );
};
