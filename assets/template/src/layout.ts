// Layout tokens per output variant. Every absolute coordinate used by a scene comes from here.
// Safe areas: main (3:4) keeps the 视频号 central 6:7 rule (≈90 px top/bottom are at risk);
// short (9:16) keeps 抖音-style overlays clear (top ~220, bottom ~380, right ~120; heuristic values).
import React, { createContext, useContext } from "react";

export type Variant = "main" | "short";

export type Layout = {
  variant: Variant;
  W: number;
  H: number;
  fps: number;
  /** pixels to keep clear of platform UI on each edge */
  safe: { top: number; bottom: number; left: number; right: number };
  /** multiply every font size by this */
  fontScale: number;
  /** brand row / chapter title / progress line */
  topBar: { y: number; titleY: number; progressY: number; brandSize: number; titleSize: number };
  /** account badge, top-right inside the safe area */
  badge: { x: number; y: number; size: number };
  /** maximum box for clips / images / screenshots; media is fitted and centered inside */
  media: { x: number; y: number; w: number; h: number; radius: number };
  /** caption line top when media is on screen: media bottom + captionGap */
  captionGap: number;
  /** caption top when no media box is shown (bench, kinetic, quote…) */
  captionTopFree: number;
  /** stat / chip / quote cards */
  cardTop: number;
  cardWidth: number;
  /** area for charts, steps, scorecards, summaries */
  chart: { x: number; y: number; w: number; h: number };
  /** big centered phrases (hook, kinetic, promise, cta) */
  hero: { y: number; size: number; subSize: number; maxWidth: number };
  /** small data-source line */
  footerY: number;
  /** progress bar that pumps on the beat */
  energyBarY: number;
  /** transition length in frames */
  transitionFrames: number;
};

const MAIN: Layout = {
  variant: "main",
  W: 1080,
  H: 1440,
  fps: 30,
  safe: { top: 100, bottom: 100, left: 40, right: 40 },
  fontScale: 1,
  topBar: { y: 104, titleY: 156, progressY: 220, brandSize: 30, titleSize: 38 },
  badge: { x: 1080 - 40 - 72, y: 100, size: 72 },
  media: { x: 40, y: 280, w: 1000, h: 600, radius: 24 },
  captionGap: 70,
  captionTopFree: 1090,
  cardTop: 1096,
  cardWidth: 960,
  chart: { x: 60, y: 300, w: 960, h: 740 },
  hero: { y: 560, size: 84, subSize: 40, maxWidth: 960 },
  footerY: 1296,
  energyBarY: 1326,
  transitionFrames: 8,
};

const SHORT: Layout = {
  variant: "short",
  W: 1080,
  H: 1920,
  fps: 30,
  safe: { top: 220, bottom: 380, left: 40, right: 120 },
  fontScale: 1.3,
  topBar: { y: 236, titleY: 292, progressY: 360, brandSize: 30, titleSize: 40 },
  badge: { x: 1080 - 120 - 80, y: 232, size: 80 },
  media: { x: 40, y: 420, w: 920, h: 700, radius: 28 },
  captionGap: 80,
  captionTopFree: 1180,
  cardTop: 1240,
  cardWidth: 900,
  chart: { x: 60, y: 440, w: 900, h: 760 },
  hero: { y: 760, size: 100, subSize: 46, maxWidth: 900 },
  footerY: 1480,
  energyBarY: 1520,
  transitionFrames: 6,
};

export const LAYOUTS: Record<Variant, Layout> = { main: MAIN, short: SHORT };
export const getLayout = (variant: Variant): Layout => LAYOUTS[variant];

/** Fit a w×h source into the media box; returns the box to draw. */
export const fitMedia = (L: Layout, w: number, h: number) => {
  const box = L.media;
  const k = Math.min(box.w / w, box.h / h);
  const fw = Math.round(w * k);
  const fh = Math.round(h * k);
  return { x: box.x + Math.round((box.w - fw) / 2), y: box.y + Math.round((box.h - fh) / 2), w: fw, h: fh };
};

/** Caption top for a scene that shows media of the given fitted height. */
export const captionTopBelow = (L: Layout, fitted: { y: number; h: number }) => fitted.y + fitted.h + L.captionGap;

export const LayoutContext = createContext<Layout>(MAIN);
export const LayoutProvider: React.FC<{ variant: Variant; children: React.ReactNode }> = ({ variant, children }) =>
  React.createElement(LayoutContext.Provider, { value: LAYOUTS[variant] }, children);
export const useLayout = (): Layout => useContext(LayoutContext);

/** Scale a font size by the variant. */
export const fs = (L: Layout, size: number) => Math.round(size * L.fontScale);
