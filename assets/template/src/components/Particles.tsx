import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { useLayout } from "../layout";
import { useTheme } from "../theme";
import { seeded } from "../text";

/** Deterministic rising light points. Only rendered when theme.particles; ≤ 40; cheap radial-gradient dots. */
export const Particles: React.FC<{ count?: number; speed?: number; opacity?: number }> = ({ count = 32, speed = 1, opacity = 0.8 }) => {
  const frame = useCurrentFrame();
  const L = useLayout();
  const T = useTheme();
  if (!T.particles) return null;
  const n = Math.min(40, count);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity }}>
      {Array.from({ length: n }).map((_, i) => {
        const x = seeded(i, 1) * L.W;
        const size = 3 + seeded(i, 2) * 6;
        const v = (0.6 + seeded(i, 3) * 1.6) * speed;
        const y = L.H + 40 - ((frame * v + seeded(i, 4) * L.H) % (L.H + 80));
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(frame * 0.08 + i));
        const color = seeded(i, 5) > 0.7 ? T.colors.accent2 : T.colors.accent;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size * 3,
              height: size * 3,
              borderRadius: size * 3,
              background: `radial-gradient(circle, ${color} 0%, ${color} 30%, transparent 70%)`,
              opacity: tw * 0.9,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
