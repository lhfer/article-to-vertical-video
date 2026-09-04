import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { useLayout } from "../layout";
import { hotStyle, useTheme } from "../theme";
import { isCJK, splitWords } from "../text";
import { displayAccentStyle, textGlow } from "./ui";

/**
 * Word-by-word spring slam of a phrase. `hotLast` styles the last word with the theme hot style; `hotWord` styles a
 * specific word. Chinese without spaces is chunked by splitWords(). Wraps inside maxWidth, centered.
 */
export const WordSlam: React.FC<{
  text: string;
  size: number;
  top: number;
  delay?: number;
  stagger?: number;
  hotLast?: boolean;
  /** words rendered in the hot style (and kept whole when chunking) */
  hot?: string[];
  weight?: number;
  align?: "center" | "left";
  left?: number;
  maxWidth?: number;
  lineHeight?: number;
  color?: string;
  font?: string;
}> = ({ text, size, top, delay = 0, stagger = 4, hotLast = false, hot: hotWords = [], weight = 900, align = "center", left, maxWidth, lineHeight = 1.15, color, font }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLayout();
  const T = useTheme();
  const words = splitWords(text, hotWords);
  const hot = hotStyle(T);
  const gap = Math.round(size * 0.22);
  const x = left ?? L.safe.left;
  const w = maxWidth ?? L.W - L.safe.left - L.safe.right;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        width: w,
        top,
        textAlign: align,
        fontFamily: font ?? T.fonts.display,
        fontWeight: weight,
        fontSize: size,
        lineHeight,
        color: color ?? T.colors.fg,
        textShadow: textGlow(T),
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        justifyContent: align === "center" ? "center" : "flex-start",
        rowGap: Math.round(size * 0.05),
      }}
    >
      {words.map((wd, i) => {
        const f = frame - delay - i * stagger;
        const s = spring({ frame: f, fps, config: { damping: 13, stiffness: 220, mass: 0.9 } });
        const isHot = (hotLast && i === words.length - 1) || hotWords.includes(wd);
        // no gap between two Chinese chunks (they read as one phrase); a gap around Latin words / numbers
        const prev = i > 0 ? words[i - 1] : undefined;
        const marginLeft = i === 0 ? 0 : isCJK(prev?.slice(-1)) && isCJK(wd[0]) ? 0 : gap;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginLeft,
              opacity: f < 0 ? 0 : Math.min(1, s * 2),
              scale: String(interpolate(s, [0, 1], [2.4, 1])),
              translate: `0 ${interpolate(s, [0, 1], [30, 0])}px`,
              filter: `blur(${interpolate(s, [0, 1], [12, 0])}px)`,
              ...(isHot ? { ...hot, fontSize: Math.round(size * 1.08) } : {}),
            }}
          >
            {wd}
          </span>
        );
      })}
    </div>
  );
};

/** One block of text slamming in (scale 3 → 1 with blur). For brand words and numbers. */
export const SlamText: React.FC<{ text: string; size: number; top: number; delay?: number; accent?: boolean; font?: string; letterSpacing?: number; color?: string; left?: number; width?: number; align?: "center" | "left" }> = ({
  text,
  size,
  top,
  delay = 0,
  accent = false,
  font,
  letterSpacing,
  color,
  left,
  width,
  align = "center",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLayout();
  const T = useTheme();
  const f = frame - delay;
  const s = spring({ frame: f, fps, config: { damping: 13, stiffness: 220, mass: 0.9 } });
  return (
    <div
      style={{
        position: "absolute",
        left: left ?? L.safe.left,
        width: width ?? L.W - L.safe.left - L.safe.right,
        top,
        textAlign: align,
        fontFamily: font ?? T.fonts.display,
        fontWeight: 900,
        fontSize: size,
        letterSpacing: letterSpacing ?? 2,
        lineHeight: 1.1,
        opacity: f < 0 ? 0 : Math.min(1, s * 2),
        scale: String(interpolate(s, [0, 1], [3, 1])),
        filter: `blur(${interpolate(s, [0, 1], [16, 0])}px)`,
        whiteSpace: "pre-wrap",
        ...(accent ? displayAccentStyle(T) : { color: color ?? T.colors.fg, textShadow: textGlow(T) }),
      }}
    >
      {text}
    </div>
  );
};

/** Fade + rise entrance for secondary lines. */
export const Rise: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties; distance?: number }> = ({ delay = 0, children, style, distance = 30 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - delay;
  const s = spring({ frame: f, fps, config: { damping: 16, stiffness: 150 } });
  return (
    <div style={{ ...style, opacity: f < 0 ? 0 : Math.min(1, s * 1.6), translate: `0 ${interpolate(s, [0, 1], [distance, 0])}px` }}>
      {children}
    </div>
  );
};

/** Small pill label (tags, captions on media). */
export const Pill: React.FC<{ text: string; left: number; top: number; delay?: number; size?: number; solid?: boolean }> = ({ text, left, top, delay = 6, size, solid = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = useTheme();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 200 } });
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        padding: "8px 20px",
        borderRadius: 999,
        background: solid ? T.colors.accent : T.name === "paper" ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.72)",
        border: `1px solid ${T.colors.accent}${solid ? "" : "99"}`,
        fontFamily: T.fonts.cn,
        fontSize: size ?? 26,
        fontWeight: 700,
        color: solid ? (T.name === "paper" ? "#fff" : T.colors.bg) : T.colors.accent,
        letterSpacing: 1,
        boxShadow: T.glow > 0 ? `0 0 20px ${T.colors.accent}66` : "0 4px 14px rgba(0,0,0,0.12)",
        opacity: frame < delay ? 0 : Math.min(1, s * 2),
        translate: `${interpolate(s, [0, 1], [-40, 0])}px 0`,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
};
