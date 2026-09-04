// Visual identity presets. brief.theme picks one; scenes read it through useTheme().
// neon = the v1 look (dark, cyan/violet/orange). paper = 打工人便签风 (warm paper, ink, highlighter).
// editorial = 杂志编辑风 (charcoal, gold, serif numerals). Every scene must render correctly in all three.
import React, { createContext, useContext } from "react";
import type { BeatKind, SfxKind, ThemeName, TransitionKind } from "./types";

export type FontFile = { family: string; file: string; weight?: string; style?: string };

export type Theme = {
  name: ThemeName;
  colors: {
    bg: string;
    fg: string;
    dim: string;
    faint: string;
    accent: string;
    accent2: string;
    hot: string; // fallback solid color for hot words when gradients are off
    danger: string;
    cardBg: string;
    cardBorder: string;
    barBg: string;
    highlighter: string; // paper-style marker behind hot words
  };
  gradients: { hot: string; fire: string; useGradientText: boolean };
  fonts: { cn: string; en: string; display: string };
  /** loaded by FontLoader from public/fonts when the files exist; otherwise the css stacks above apply */
  fontFiles: FontFile[];
  texture: "grid" | "grain" | "none";
  particles: boolean;
  /** 0..1 — strength of glows / text shadows */
  glow: number;
  cornerRadius: number;
  captionStyle: "glow" | "highlighter" | "underline";
  /** key: `${prevKind}>${nextKind}` | `*>${nextKind}` | `${prevKind}>*` | "default" */
  transitions: Record<string, TransitionKind>;
  sfx: Partial<Record<BeatKind, SfxKind>>;
  bgm: { bpm: number; base: number; kit: "synth" | "lofi" | "minimal" };
};

const CN_STACK = '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const EN_STACK = '"Inter", "SF Pro Display", "Helvetica Neue", Arial, sans-serif';

export const NEON: Theme = {
  name: "neon",
  colors: {
    bg: "#05070d",
    fg: "#ffffff",
    dim: "rgba(255,255,255,0.62)",
    faint: "rgba(255,255,255,0.14)",
    accent: "#37e6ff",
    accent2: "#7c5cff",
    hot: "#37e6ff",
    danger: "#ff3d5a",
    cardBg: "linear-gradient(135deg, rgba(20,26,44,0.86), rgba(8,10,18,0.86))",
    cardBorder: "rgba(255,255,255,0.14)",
    barBg: "rgba(255,255,255,0.14)",
    highlighter: "rgba(55,230,255,0.25)",
  },
  gradients: {
    hot: "linear-gradient(90deg, #37e6ff 0%, #7c5cff 45%, #ff7a1a 100%)",
    fire: "linear-gradient(90deg, #ff7a1a 0%, #ff3d5a 100%)",
    useGradientText: true,
  },
  fonts: { cn: CN_STACK, en: EN_STACK, display: `"Smiley Sans", ${CN_STACK}` },
  fontFiles: [
    { family: "Noto Sans SC", file: "fonts/NotoSansSC-Bold.ttf", weight: "700" },
    { family: "Noto Sans SC", file: "fonts/NotoSansSC-Black.ttf", weight: "900" },
    { family: "Smiley Sans", file: "fonts/SmileySans-Oblique.ttf", weight: "700" },
  ],
  texture: "grid",
  particles: true,
  glow: 1,
  cornerRadius: 24,
  captionStyle: "glow",
  transitions: {
    default: "fade",
    "*>chapter": "slide",
    "*>hook": "cut",
    "hook>*": "whip",
    "chapter>*": "zoom",
    "*>take": "cut",
    "*>summary": "wipe",
    "*>cta": "fade",
    "*>outro": "fade",
  },
  sfx: { hook: "riser", chapter: "whoosh", bench: "tick", clip: "whoosh", kinetic: "hit", take: "hit", summary: "whoosh", cta: "none", outro: "none", quote: "none", steps: "tick", scorecard: "tick" },
  bgm: { bpm: 128, base: 0.22, kit: "synth" },
};

export const PAPER: Theme = {
  name: "paper",
  colors: {
    bg: "#f6f1e7",
    fg: "#1b1b1f",
    dim: "rgba(27,27,31,0.62)",
    faint: "rgba(27,27,31,0.10)",
    accent: "#ff5c39",
    accent2: "#2b59ff",
    hot: "#e6432a",
    danger: "#d62839",
    cardBg: "#ffffff",
    cardBorder: "rgba(27,27,31,0.12)",
    barBg: "rgba(27,27,31,0.10)",
    highlighter: "#ffe45c",
  },
  gradients: {
    hot: "linear-gradient(90deg, #ff5c39 0%, #ff8a3d 100%)",
    fire: "linear-gradient(90deg, #ff5c39 0%, #d62839 100%)",
    useGradientText: false,
  },
  fonts: { cn: CN_STACK, en: EN_STACK, display: `"Smiley Sans", ${CN_STACK}` },
  fontFiles: [
    { family: "Noto Sans SC", file: "fonts/NotoSansSC-Bold.ttf", weight: "700" },
    { family: "Noto Sans SC", file: "fonts/NotoSansSC-Black.ttf", weight: "900" },
    { family: "Smiley Sans", file: "fonts/SmileySans-Oblique.ttf", weight: "700" },
  ],
  texture: "grain",
  particles: false,
  glow: 0,
  cornerRadius: 18,
  captionStyle: "highlighter",
  transitions: {
    default: "cut",
    "*>chapter": "slide",
    "*>hook": "cut",
    "hook>*": "cut",
    "*>take": "cut",
    "*>summary": "slide",
    "*>cta": "fade",
    "*>outro": "fade",
  },
  sfx: { hook: "hit", chapter: "whoosh", bench: "tick", clip: "whoosh", kinetic: "hit", take: "hit", summary: "whoosh", cta: "none", outro: "none", quote: "none", steps: "tick", scorecard: "tick" },
  bgm: { bpm: 96, base: 0.2, kit: "lofi" },
};

export const EDITORIAL: Theme = {
  name: "editorial",
  colors: {
    bg: "#101114",
    fg: "#f4f2ee",
    dim: "rgba(244,242,238,0.6)",
    faint: "rgba(244,242,238,0.12)",
    accent: "#e8c547",
    accent2: "#9aa0a6",
    hot: "#e8c547",
    danger: "#ff5a5f",
    cardBg: "rgba(24,25,30,0.92)",
    cardBorder: "rgba(244,242,238,0.16)",
    barBg: "rgba(244,242,238,0.12)",
    highlighter: "rgba(232,197,71,0.3)",
  },
  gradients: {
    hot: "linear-gradient(90deg, #e8c547 0%, #f4e2a0 100%)",
    fire: "linear-gradient(90deg, #e8c547 0%, #ff5a5f 100%)",
    useGradientText: false,
  },
  fonts: {
    cn: '"Noto Serif SC", "Songti SC", "STSong", serif',
    en: '"Playfair Display", "Georgia", "Times New Roman", serif',
    display: '"Noto Serif SC", "Songti SC", serif',
  },
  fontFiles: [
    { family: "Noto Serif SC", file: "fonts/NotoSerifSC-Bold.ttf", weight: "700" },
    { family: "Noto Sans SC", file: "fonts/NotoSansSC-Bold.ttf", weight: "700" },
  ],
  texture: "none",
  particles: false,
  glow: 0.2,
  cornerRadius: 6,
  captionStyle: "underline",
  transitions: {
    default: "fade",
    "*>chapter": "wipe",
    "*>hook": "cut",
    "hook>*": "wipe",
    "*>take": "fade",
    "*>summary": "wipe",
    "*>cta": "fade",
    "*>outro": "fade",
  },
  sfx: { hook: "riser", chapter: "whoosh", bench: "tick", clip: "none", kinetic: "hit", take: "hit", summary: "whoosh", cta: "none", outro: "none", quote: "none", steps: "tick", scorecard: "tick" },
  bgm: { bpm: 110, base: 0.18, kit: "minimal" },
};

export const THEMES: Record<ThemeName, Theme> = { neon: NEON, paper: PAPER, editorial: EDITORIAL };
export const getTheme = (name: ThemeName): Theme => THEMES[name] ?? NEON;

export const ThemeContext = createContext<Theme>(NEON);
export const ThemeProvider: React.FC<{ name: ThemeName; children: React.ReactNode }> = ({ name, children }) =>
  React.createElement(ThemeContext.Provider, { value: getTheme(name) }, children);
export const useTheme = (): Theme => useContext(ThemeContext);

/** Resolve the transition into `next` given the previous beat kind, honoring director overrides. */
export const pickTransition = (theme: Theme, prev: BeatKind | null, next: BeatKind, override?: TransitionKind): TransitionKind => {
  if (override) return override;
  const t = theme.transitions;
  if (prev && t[`${prev}>${next}`]) return t[`${prev}>${next}`];
  if (t[`*>${next}`]) return t[`*>${next}`];
  if (prev && t[`${prev}>*`]) return t[`${prev}>*`];
  return t.default ?? "fade";
};

/** Deterministic beat pulse 0..1 from the frame (no audio analysis). */
export const beatPulse = (frame: number, fps: number, bpm: number) => {
  const beatFrames = (60 / bpm) * fps;
  const phase = (frame % beatFrames) / beatFrames;
  return Math.pow(1 - phase, 3);
};

/** Hot-word style for the current theme (gradient text on neon, marker on paper, underline on editorial). */
export const hotStyle = (theme: Theme): React.CSSProperties => {
  if (theme.gradients.useGradientText) {
    return { backgroundImage: theme.gradients.hot, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", textShadow: "none" };
  }
  if (theme.captionStyle === "highlighter") {
    return { color: theme.colors.fg, background: theme.colors.highlighter, padding: "0 6px", borderRadius: 6, textShadow: "none" };
  }
  return { color: theme.colors.hot, textDecoration: "underline", textDecorationThickness: "6px", textUnderlineOffset: "10px", textShadow: "none" };
};
