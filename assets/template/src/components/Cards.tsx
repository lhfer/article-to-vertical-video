import React from "react";
import { Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Card } from "../types";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { fmtNumber } from "../text";
import { bigNumberStyle } from "./ui";

const Tag: React.FC<{ text: string }> = ({ text }) => {
  const T = useTheme();
  const L = useLayout();
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 6,
        fontSize: fs(L, 18),
        fontWeight: 700,
        letterSpacing: 2,
        color: T.name === "paper" ? "#fff" : T.colors.bg,
        background: T.colors.accent,
        marginLeft: 10,
        verticalAlign: "middle",
      }}
    >
      {text}
    </span>
  );
};

const Shell: React.FC<{ durationInFrames: number; top: number; children: React.ReactNode }> = ({ durationInFrames, top, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLayout();
  const T = useTheme();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 140, mass: 0.8 } });
  const exit = interpolate(frame, [durationInFrames - 8, durationInFrames - 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: Math.round((L.W - L.cardWidth) / 2),
        width: L.cardWidth,
        top,
        padding: `${fs(L, 18)}px ${fs(L, 30)}px`,
        borderRadius: T.cornerRadius,
        background: T.colors.cardBg,
        border: `1px solid ${T.colors.cardBorder}`,
        boxShadow: T.glow > 0 ? `0 30px 80px rgba(0,0,0,${0.55 * T.glow}), inset 0 1px 0 rgba(255,255,255,0.12)` : "0 10px 30px rgba(0,0,0,0.12)",
        opacity: Math.min(enter * 1.5, 1) * exit,
        translate: `${interpolate(enter, [0, 1], [-70, 0])}px ${interpolate(exit, [0, 1], [20, 0])}px`,
        transform: `skewX(${interpolate(enter, [0, 1], [-8, 0])}deg)`,
        boxSizing: "border-box",
        color: T.colors.fg,
        fontFamily: T.fonts.cn,
      }}
    >
      {children}
    </div>
  );
};

const StatBody: React.FC<{ label: string; value: number; unit?: string; prev?: number; prevLabel?: string; sub?: string; lowerIsBetter?: boolean; source?: string }> = ({ label, value, unit = "", prev, prevLabel, sub, lowerIsBetter, source }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLayout();
  const T = useTheme();
  const s = spring({ frame: Math.max(0, frame - 3), fps, config: { damping: 12, stiffness: 90, mass: 1 } });
  const shown = value * Math.min(1, s);
  const max = Math.max(Math.abs(value), Math.abs(prev ?? 0), 1e-9);
  const barW = interpolate(Math.min(1, s), [0, 1], [0, (Math.abs(value) / max) * 100]);
  const prevW = prev !== undefined ? (Math.abs(prev) / max) * 100 : 0;
  const glow = interpolate(frame, [8, 20, 40], [0, 1, 0.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  const better = prev === undefined ? true : lowerIsBetter ? value <= prev : value >= prev;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: fs(L, 28), fontWeight: 600, color: T.colors.dim, letterSpacing: 1 }}>
          {label}
          {lowerIsBetter ? <span style={{ fontSize: fs(L, 20), color: T.colors.accent2, marginLeft: 10 }}>越低越好</span> : null}
          {source ? <Tag text="观点" /> : null}
        </div>
        {prev !== undefined ? (
          <div style={{ fontSize: fs(L, 22), fontFamily: T.fonts.en, padding: "4px 14px", borderRadius: 999, border: `1px solid ${T.colors.cardBorder}`, color: T.colors.dim, whiteSpace: "nowrap" }}>
            {prevLabel ? `${prevLabel} ` : ""}
            {fmtNumber(prev, prev, unit)}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 2 }}>
        <div
          style={{
            fontSize: fs(L, 76),
            fontWeight: 900,
            fontFamily: T.fonts.en,
            letterSpacing: -2,
            lineHeight: 1.05,
            fontVariantNumeric: "tabular-nums",
            ...bigNumberStyle(T, better),
            filter: T.glow > 0 ? `drop-shadow(0 0 ${8 + glow * 22}px ${T.colors.accent})` : "none",
            scale: String(1 + glow * 0.05),
            transformOrigin: "left center",
          }}
        >
          {fmtNumber(value, shown, unit)}
        </div>
        {sub ? <div style={{ fontSize: fs(L, 26), color: T.colors.dim, fontWeight: 500 }}>{sub}</div> : null}
      </div>
      <div style={{ position: "relative", height: 10, borderRadius: 5, background: T.colors.barBg, marginTop: 10, overflow: "visible" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: 10, width: `${barW}%`, borderRadius: 5, background: better ? T.gradients.hot : T.gradients.fire, boxShadow: T.glow > 0 ? `0 0 ${10 + glow * 20}px ${T.colors.accent2}` : "none" }} />
        {prev !== undefined ? (
          <>
            <div style={{ position: "absolute", left: `${prevW}%`, top: -6, width: 3, height: 22, background: T.colors.dim, borderRadius: 2 }} />
            <div style={{ position: "absolute", left: `${prevW}%`, top: 18, translate: "-50% 0", fontSize: fs(L, 18), color: T.colors.dim, whiteSpace: "nowrap", fontFamily: T.fonts.cn }}>{prevLabel ?? "之前"}</div>
          </>
        ) : null}
      </div>
      <div style={{ height: prev !== undefined ? fs(L, 22) : 0 }} />
    </div>
  );
};

const ChipBody: React.FC<{ text: string; source?: string }> = ({ text, source }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLayout();
  const T = useTheme();
  const s = spring({ frame, fps, config: { damping: 12, stiffness: 160 } });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div
        style={{
          width: fs(L, 56),
          height: fs(L, 56),
          borderRadius: 16,
          background: T.gradients.fire,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: fs(L, 32),
          flexShrink: 0,
          color: "#fff",
          scale: String(interpolate(s, [0, 1], [0.4, 1])),
          rotate: `${interpolate(s, [0, 1], [-40, 0])}deg`,
          boxShadow: T.glow > 0 ? `0 0 26px ${T.colors.accent2}` : "none",
        }}
      >
        ⚡
      </div>
      <div style={{ fontSize: fs(L, 34), fontWeight: 700, lineHeight: 1.35 }}>
        {text}
        {source ? <Tag text="观点" /> : null}
      </div>
    </div>
  );
};

const QuoteBody: React.FC<{ text: string; sub?: string; source?: string }> = ({ text, sub, source }) => {
  const frame = useCurrentFrame();
  const L = useLayout();
  const T = useTheme();
  const chars = [...text];
  const n = Math.min(chars.length, Math.floor(frame * 1.6));
  return (
    <div>
      <div style={{ fontSize: fs(L, 34), fontWeight: 700, lineHeight: 1.4 }}>
        “{chars.slice(0, n).join("")}
        <span style={{ opacity: frame % 10 < 5 && n < chars.length ? 1 : 0 }}>|</span>”{source ? <Tag text="观点" /> : null}
      </div>
      {sub ? <div style={{ fontSize: fs(L, 24), color: T.colors.dim, marginTop: 6 }}>{sub}</div> : null}
    </div>
  );
};

export const HighlightCard: React.FC<{ card: Card; durationInFrames: number; top: number }> = ({ card, durationInFrames, top }) => (
  <Shell durationInFrames={durationInFrames} top={top}>
    {card.kind === "stat" ? (
      <StatBody label={card.label} value={card.value} unit={card.unit} prev={card.prev} prevLabel={card.prevLabel} sub={card.sub} lowerIsBetter={card.lowerIsBetter} source={card.source} />
    ) : card.kind === "chip" ? (
      <ChipBody text={card.text} source={card.source} />
    ) : (
      <QuoteBody text={card.text} sub={card.sub} source={card.source} />
    )}
  </Shell>
);

/** Cards already retimed by fitCards. `top` comes from layout.cardTop. */
export const Cards: React.FC<{ cards: Card[]; top: number }> = ({ cards, top }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {cards.map((c, i) => {
        const d = Math.max(1, Math.round(c.d * fps));
        return (
          <Sequence key={i} from={Math.round(c.t * fps)} durationInFrames={d} layout="none" name={`Card ${i + 1}`}>
            <HighlightCard card={c} durationInFrames={d} top={top} />
          </Sequence>
        );
      })}
    </>
  );
};
