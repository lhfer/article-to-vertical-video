import React from "react";
import { staticFile } from "remotion";
import { loadFont } from "@remotion/fonts";
import { useTheme } from "../theme";
import type { Theme } from "../theme";
import { hasStatic } from "../assets";

const requested = new Set<string>();

/**
 * Registers every theme.fontFiles entry that exists under public/fonts via @remotion/fonts (delayRender inside).
 * Missing files are skipped silently — the theme's CSS font stack is the fallback. Guarded so each file loads once.
 */
export const ensureFonts = (theme: Theme) => {
  for (const f of theme.fontFiles) {
    if (requested.has(f.file) || !hasStatic(f.file)) continue;
    requested.add(f.file);
    try {
      loadFont({ family: f.family, url: staticFile(f.file), weight: f.weight, style: f.style }).catch(() => undefined);
    } catch {
      // never crash on fonts
    }
  }
};

export const FontLoader: React.FC = () => {
  const T = useTheme();
  const done = React.useRef(false);
  if (!done.current) {
    done.current = true;
    ensureFonts(T);
  }
  return null;
};
