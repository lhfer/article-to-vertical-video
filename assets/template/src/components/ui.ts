import type React from "react";
import type { Theme } from "../theme";

/** Style for big numerals: gradient text on neon, solid hot color elsewhere (no marker / underline on numbers). */
export const bigNumberStyle = (T: Theme, ok = true): React.CSSProperties => {
  if (!ok) return { color: T.colors.danger };
  if (T.gradients.useGradientText) {
    return { backgroundImage: T.gradients.hot, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" };
  }
  return { color: T.colors.hot };
};

/** Gradient (neon) or solid accent (others) display text, for brand words and slams. */
export const displayAccentStyle = (T: Theme): React.CSSProperties =>
  T.gradients.useGradientText
    ? { backgroundImage: T.gradients.hot, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }
    : { color: T.colors.accent };

export const glowShadow = (T: Theme, color: string, px = 40) => (T.glow > 0 ? `0 0 ${px}px ${color}` : "none");

export const textGlow = (T: Theme) => (T.glow > 0 ? `0 10px 40px rgba(0,0,0,${0.8 * T.glow})` : "none");
