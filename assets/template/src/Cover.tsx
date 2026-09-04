import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { LayoutProvider, fs, useLayout } from "./layout";
import { ThemeProvider, useTheme } from "./theme";
import { ACCOUNT_NAME, BRIEF, META, SCRIPT } from "./content";
import { COVER_FILE, hasStatic } from "./assets";
import { Backdrop } from "./components/Backdrop";
import { Badge } from "./components/Badge";
import { FontLoader } from "./components/FontLoader";
import { displayAccentStyle } from "./components/ui";
import { splitHot } from "./text";

const CoverInner: React.FC = () => {
  const L = useLayout();
  const T = useTheme();
  const hook = SCRIPT.beats.find((b) => b.kind === "hook")?.hook;
  const text = hook?.text ?? META.tagline ?? META.brand;
  const hot = SCRIPT.beats.find((b) => b.kind === "hook")?.lines?.[0]?.hot ?? [];
  const chars = Array.from(text).length;
  const size = Math.round(L.hero.size * (chars > 14 ? 1.05 : 1.25));
  const hasCover = hasStatic(COVER_FILE);
  return (
    <AbsoluteFill style={{ backgroundColor: T.colors.bg, overflow: "hidden" }}>
      {hasCover ? <Img src={staticFile(COVER_FILE)} style={{ position: "absolute", inset: 0, width: L.W, height: L.H, objectFit: "cover" }} /> : <Backdrop still />}
      <AbsoluteFill style={{ background: hasCover ? `linear-gradient(180deg, ${T.colors.bg}99 0%, ${T.colors.bg}33 35%, ${T.colors.bg}ee 100%)` : `linear-gradient(180deg, transparent 40%, ${T.colors.bg}cc 100%)` }} />
      <div style={{ position: "absolute", left: L.safe.left + 40, top: L.topBar.y, fontFamily: T.fonts.en, fontSize: fs(L, 34), fontWeight: 900, color: T.colors.fg, letterSpacing: 1 }}>
        {META.brand}
        {META.brandAccent ? <span style={{ ...displayAccentStyle(T), marginLeft: 12 }}>{META.brandAccent}</span> : null}
      </div>
      <Badge />
      <div style={{ position: "absolute", left: (L.W - L.hero.maxWidth) / 2, width: L.hero.maxWidth, top: L.hero.y - Math.round(size * 1.2), textAlign: "center", fontFamily: T.fonts.display, fontSize: size, fontWeight: 900, lineHeight: 1.15, color: T.colors.fg, textShadow: T.glow > 0 ? "0 12px 50px rgba(0,0,0,0.85)" : "none", wordBreak: "break-all" }}>
        {splitHot(text, hot).map((seg, i) => (
          <span key={i} style={seg.hot ? displayAccentStyle(T) : undefined}>
            {seg.t}
          </span>
        ))}
      </div>
      {hook?.sub ? <div style={{ position: "absolute", left: (L.W - L.hero.maxWidth) / 2, width: L.hero.maxWidth, top: L.hero.y + Math.round(size * 1.2), textAlign: "center", fontFamily: T.fonts.cn, fontSize: fs(L, 40), fontWeight: 600, color: T.colors.dim }}>{hook.sub}</div> : null}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: L.safe.bottom + 40, textAlign: "center", fontFamily: T.fonts.cn, fontSize: fs(L, 30), fontWeight: 700, color: T.colors.fg, opacity: 0.9 }}>
        @{ACCOUNT_NAME || META.brand}
        <span style={{ color: T.colors.dim, fontWeight: 500, marginLeft: 16 }}>{META.source}</span>
      </div>
    </AbsoluteFill>
  );
};

/** Cover still: brand + hook text + account name over public/gen/cover.png when present. */
export const Cover: React.FC = () => (
  <LayoutProvider variant="main">
    <ThemeProvider name={BRIEF.theme}>
      <FontLoader />
      <CoverInner />
    </ThemeProvider>
  </LayoutProvider>
);
