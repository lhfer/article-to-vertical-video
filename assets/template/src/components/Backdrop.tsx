import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { useLayout } from "../layout";
import { useTheme } from "../theme";

const cleanId = (raw: string) => `bd-${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`;

/**
 * Theme background: grid (neon) / grain (paper, SVG feTurbulence with a fixed seed) / none (editorial).
 * SVG pattern + filter ids are unique per instance (React.useId), so two scenes overlapping in a transition never clash.
 */
export const Backdrop: React.FC<{ glow?: boolean; dim?: number; still?: boolean; bg?: boolean }> = ({ glow = true, dim = 0, still = false, bg = true }) => {
  const frame = useCurrentFrame();
  const L = useLayout();
  const T = useTheme();
  const id = cleanId(React.useId());
  const f = still ? 0 : frame;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", backgroundColor: bg ? T.colors.bg : "transparent" }}>
      {T.texture === "grid" ? (
        <svg width={L.W} height={L.H} style={{ position: "absolute", left: 0, top: 0, opacity: 0.16 }}>
          <defs>
            <pattern id={`${id}-grid`} width={72} height={72} patternUnits="userSpaceOnUse" patternTransform={`translate(${(f * 0.6) % 72} ${(f * 0.35) % 72})`}>
              <path d="M 72 0 L 0 0 0 72" fill="none" stroke={T.colors.accent} strokeWidth={1} />
            </pattern>
          </defs>
          <rect width={L.W} height={L.H} fill={`url(#${id}-grid)`} />
        </svg>
      ) : null}
      {T.texture === "grain" ? (
        <svg width={L.W} height={L.H} style={{ position: "absolute", left: 0, top: 0, opacity: 0.55, mixBlendMode: "multiply" }}>
          <defs>
            <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={7} stitchTiles="stitch" result="n" />
              <feColorMatrix type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.32  0 0 0 0 0.28  0 0 0 0.16 0" />
            </filter>
          </defs>
          <rect width={L.W} height={L.H} filter={`url(#${id}-grain)`} />
        </svg>
      ) : null}
      {T.texture === "grid" && !still ? (
        <div
          style={{
            position: "absolute",
            top: -L.H * 0.3,
            left: ((f * 9) % (L.W * 2.4)) - L.W * 1.2,
            width: 220,
            height: L.H * 1.6,
            rotate: "22deg",
            background: `linear-gradient(90deg, transparent 0%, ${T.colors.highlighter} 50%, transparent 100%)`,
            filter: "blur(8px)",
            opacity: 0.5,
          }}
        />
      ) : null}
      {glow ? (
        <AbsoluteFill
          style={{
            background:
              T.name === "paper"
                ? `radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 60%)`
                : T.name === "editorial"
                  ? `radial-gradient(90% 50% at 50% 0%, rgba(232,197,71,0.10) 0%, rgba(0,0,0,0) 60%)`
                  : `radial-gradient(120% 70% at 50% 100%, rgba(124,92,255,0.22) 0%, rgba(0,0,0,0) 60%)`,
          }}
        />
      ) : null}
      {dim > 0 ? <AbsoluteFill style={{ backgroundColor: T.colors.bg, opacity: dim }} /> : null}
    </AbsoluteFill>
  );
};

/** Solid theme plate used behind full-bleed text hooks / clip scenes without a bg twin. */
export const Plate: React.FC<{ angle?: number }> = ({ angle = 135 }) => {
  const T = useTheme();
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background:
          T.name === "paper"
            ? `linear-gradient(${angle}deg, #fff7e6 0%, ${T.colors.bg} 55%, #efe4d0 100%)`
            : T.name === "editorial"
              ? `linear-gradient(${angle}deg, #1a1b20 0%, ${T.colors.bg} 60%, #0b0c0f 100%)`
              : `linear-gradient(${angle + frame * 0.05}deg, #0b1230 0%, ${T.colors.bg} 45%, #1a0f2e 100%)`,
      }}
    />
  );
};
