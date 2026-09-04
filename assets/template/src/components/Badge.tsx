import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { ACCOUNT_NAME, BADGE_FILE } from "../content";
import { hasStatic } from "../assets";

const initials = (name: string) => [...name].slice(0, 2).join("") || "·";

/**
 * Persistent account identity, top-right inside the safe area: name + badge image (public/badge.png) or an initials disc.
 * `stamp` plays a rotate-scale stamp with a "观点" ribbon (takes); `stampAt` = frame where the stamp lands.
 */
export const Badge: React.FC<{ stamp?: boolean; stampAt?: number; hideName?: boolean }> = ({ stamp = false, stampAt = 8, hideName = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLayout();
  const T = useTheme();
  const size = L.badge.size;
  const src = BADGE_FILE && hasStatic(BADGE_FILE) ? staticFile(BADGE_FILE) : null;
  const enter = spring({ frame: frame - 2, fps, config: { damping: 16, stiffness: 160 } });
  const st = stamp ? spring({ frame: frame - stampAt, fps, config: { damping: 9, stiffness: 260, mass: 0.9 } }) : 1;
  const stampScale = stamp ? interpolate(st, [0, 1], [2.2, 1]) : 1;
  const stampRot = stamp ? interpolate(st, [0, 1], [-28, -8]) : 0;
  const nameSize = fs(L, 22);
  return (
    <div style={{ position: "absolute", left: 0, top: L.badge.y, width: L.badge.x + size, height: size, pointerEvents: "none" }}>
      {!hideName && ACCOUNT_NAME ? (
        <div
          style={{
            position: "absolute",
            right: size + 14,
            top: 0,
            height: size,
            display: "flex",
            alignItems: "center",
            fontFamily: T.fonts.cn,
            fontSize: nameSize,
            fontWeight: 700,
            color: T.colors.dim,
            letterSpacing: 1,
            whiteSpace: "nowrap",
            opacity: Math.min(1, enter * 1.5),
            translate: `${interpolate(enter, [0, 1], [16, 0])}px 0`,
          }}
        >
          {ACCOUNT_NAME}
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: L.badge.x,
          top: 0,
          width: size,
          height: size,
          borderRadius: size,
          overflow: "hidden",
          background: src ? T.colors.cardBg : T.colors.accent,
          border: `2px solid ${T.colors.cardBorder}`,
          boxShadow: T.glow > 0 ? `0 0 24px ${T.colors.accent}66` : "0 4px 12px rgba(0,0,0,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: T.fonts.cn,
          fontWeight: 900,
          fontSize: Math.round(size * 0.4),
          color: T.name === "paper" ? "#fff" : T.colors.bg,
          opacity: Math.min(1, enter * 1.5),
          scale: String(interpolate(enter, [0, 1], [0.6, 1]) * (stamp ? interpolate(st, [0, 0.6, 1], [1, 1.25, 1]) : 1)),
        }}
      >
        {src ? <Img src={src} style={{ width: size, height: size, objectFit: "cover" }} /> : initials(ACCOUNT_NAME)}
      </div>
      {stamp ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: size + Math.round(6 * L.fontScale),
            padding: `${Math.round(size * 0.06)}px ${Math.round(size * 0.22)}px`,
            border: `4px solid ${T.colors.accent}`,
            borderRadius: 10,
            color: T.colors.accent,
            fontFamily: T.fonts.cn,
            fontWeight: 900,
            fontSize: fs(L, 30),
            letterSpacing: 6,
            background: T.name === "paper" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.35)",
            opacity: frame < stampAt ? 0 : Math.min(1, st * 1.6),
            scale: String(stampScale),
            rotate: `${stampRot}deg`,
            transformOrigin: "center",
            boxShadow: T.glow > 0 ? `0 0 30px ${T.colors.accent}88` : "none",
            whiteSpace: "nowrap",
          }}
        >
          观点
        </div>
      ) : null}
    </div>
  );
};
