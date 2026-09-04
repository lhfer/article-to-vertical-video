import React from "react";
import { useVideoConfig } from "remotion";
import { useLayout } from "../layout";
import { beatPulse, useTheme } from "../theme";

/** Progress bar at layout.energyBarY that pumps on the BGM beat (deterministic, from the global frame). */
export const EnergyBar: React.FC<{ progress: number; globalFrame: number; calm?: boolean }> = ({ progress, globalFrame, calm = false }) => {
  const { fps } = useVideoConfig();
  const L = useLayout();
  const T = useTheme();
  const pulse = calm ? 0 : beatPulse(globalFrame, fps, T.bgm.bpm);
  const x0 = L.safe.left;
  const w = L.W - L.safe.left - L.safe.right;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div style={{ position: "absolute", left: 0, top: L.energyBarY, width: L.W, height: 14, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: x0, top: 4, height: 6, width: w, background: T.colors.faint, borderRadius: 3 }} />
      <div
        style={{
          position: "absolute",
          left: x0,
          top: 4,
          height: 6,
          width: w * p,
          background: T.gradients.hot,
          borderRadius: 3,
          boxShadow: T.glow > 0 ? `0 0 ${10 + pulse * 30}px ${T.colors.accent}` : "none",
          opacity: T.glow > 0 ? 1 : 0.9,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: x0 + w * p - 8,
          top: 2,
          width: 16,
          height: 10,
          borderRadius: 8,
          background: T.name === "paper" ? T.colors.accent : T.colors.fg,
          scale: String(1 + pulse * 0.7),
          boxShadow: T.glow > 0 ? `0 0 18px ${T.colors.accent}` : "none",
        }}
      />
    </div>
  );
};
