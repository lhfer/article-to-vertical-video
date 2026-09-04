import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { useTheme } from "../theme";

/** 2–3 frame flash used on hard cuts. Color defaults to the theme accent (white on a paper theme is invisible). */
export const Flash: React.FC<{ peak?: number; color?: string }> = ({ peak = 0.7, color }) => {
  const frame = useCurrentFrame();
  const T = useTheme();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: color ?? (T.name === "paper" ? T.colors.accent : "#ffffff"),
        pointerEvents: "none",
        mixBlendMode: T.name === "paper" ? "multiply" : "screen",
        opacity: interpolate(frame, [0, 1, 3], [0, peak * (T.name === "paper" ? 0.35 : 1), 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}
    />
  );
};
