import React from "react";
import { Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fs, useLayout } from "../layout";
import { hotStyle, useTheme } from "../theme";
import type { TimedLine } from "../narration";
import { splitHot } from "../text";

const CaptionLine: React.FC<{ line: TimedLine; durationInFrames: number; top: number; size: number }> = ({ line, durationInFrames, top, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLayout();
  const T = useTheme();
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 180, mass: 0.7 } });
  const exit = interpolate(frame, [durationInFrames - 7, durationInFrames - 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) });
  const parts = splitHot(line.text, line.hot);
  const reveal = durationInFrames > 2.5 * fps; // per-character reveal only when the line stays long enough to read it twice
  const totalChars = [...line.text].length;
  const revealFrames = Math.round(0.45 * fps);
  let charIndex = 0;
  const lineHeight = 1.3;
  const width = L.W - L.safe.left - L.safe.right;
  const hot = hotStyle(T);
  const isTake = line.kind === "take";
  return (
    <div
      style={{
        position: "absolute",
        left: L.safe.left,
        width,
        top,
        textAlign: "center",
        fontFamily: T.fonts.cn,
        fontWeight: 800,
        fontSize: size,
        lineHeight,
        maxHeight: size * lineHeight * 2 + 8, // never more than 2 lines
        overflow: "hidden",
        color: T.colors.fg,
        letterSpacing: 1,
        textShadow: T.glow > 0 ? `0 6px 30px rgba(0,0,0,${0.85 * T.glow}), 0 2px 6px rgba(0,0,0,${0.8 * T.glow})` : "none",
        opacity: Math.min(enter * 1.4, 1) * exit,
        scale: String(interpolate(enter, [0, 1], [1.22, 1])),
        translate: `0 ${interpolate(exit, [0, 1], [22, 0])}px`,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {T.glow > 0 ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: -18,
            width: interpolate(enter, [0, 1], [0, 110]),
            height: 5,
            translate: "-50% 0",
            background: T.gradients.hot,
            borderRadius: 3,
            boxShadow: `0 0 16px ${T.colors.accent}`,
          }}
        />
      ) : null}
      {isTake ? (
        <span
          style={{
            display: "inline-block",
            verticalAlign: "middle",
            marginRight: 14,
            padding: "2px 12px",
            borderRadius: 8,
            fontSize: Math.round(size * 0.5),
            fontWeight: 700,
            letterSpacing: 2,
            color: T.name === "paper" ? "#fff" : T.colors.bg,
            background: T.colors.accent,
            textShadow: "none",
          }}
        >
          观点
        </span>
      ) : null}
      {parts.map((p, i) => {
        const chars = [...p.t];
        const style: React.CSSProperties = p.hot ? { ...hot, fontSize: Math.round(size * 1.12), padding: "0 3px" } : {};
        if (!reveal) {
          return (
            <span key={i} style={style}>
              {p.t}
            </span>
          );
        }
        return (
          <span key={i} style={style}>
            {chars.map((ch, j) => {
              const idx = charIndex++;
              const at = (idx / Math.max(1, totalChars)) * revealFrames;
              const o = interpolate(frame, [at, at + 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return (
                <span key={j} style={{ opacity: o }}>
                  {ch}
                </span>
              );
            })}
          </span>
        );
      })}
    </div>
  );
};

/** Caption lines (already timed by fitLines). `top` comes from layout tokens (captionTopBelow / captionTopFree). */
export const Captions: React.FC<{ lines: TimedLine[]; top: number; size?: number }> = ({ lines, top, size }) => {
  const { fps } = useVideoConfig();
  const L = useLayout();
  const px = size ?? fs(L, 54);
  return (
    <>
      {lines.map((l, i) => {
        const d = Math.max(1, Math.round(l.d * fps));
        return (
          <Sequence key={i} from={Math.round(l.t * fps)} durationInFrames={d} layout="none" name={`Caption ${i + 1}`}>
            <CaptionLine line={l} durationInFrames={d} top={top} size={px} />
          </Sequence>
        );
      })}
    </>
  );
};
