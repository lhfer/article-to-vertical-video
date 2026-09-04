import React from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import type { SceneProps } from "../types";
import { fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { payloadOf } from "../content";
import { hasStatic } from "../assets";
import { Plate } from "../components/Backdrop";
import { SceneFrame, useScene } from "../components/SceneFrame";
import { Rise } from "../components/Text";

/** Full-bleed generated / stock motion plate: <Video objectFit="cover" muted loop> darkened, captions on top. */
export const Broll: React.FC<SceneProps> = ({ beat, globalStart, totalFrames }) => {
  const info = useScene(beat, globalStart, totalFrames);
  const br = payloadOf(beat, "broll");
  const L = useLayout();
  const T = useTheme();
  const frame = useCurrentFrame();
  const has = hasStatic(br.src);
  const zoom = interpolate(frame, [0, info.durationInFrames], [1.02, 1.08], { extrapolateRight: "clamp" });
  return (
    <SceneFrame beat={beat} info={info} backdrop={false} particles={false}>
      {has ? (
        <div style={{ position: "absolute", inset: 0, transform: `scale(${zoom})`, transformOrigin: "50% 50%" }}>
          <Video src={staticFile(br.src)} muted loop objectFit="cover" style={{ position: "absolute", left: 0, top: 0, width: L.W, height: L.H }} name={`broll ${beat.id}`} />
        </div>
      ) : (
        <Plate angle={120} />
      )}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${T.colors.bg}e6 0%, ${T.colors.bg}66 30%, ${T.colors.bg}55 60%, ${T.colors.bg}f2 100%)` }} />
      {br.caption ? (
        <Rise delay={8} style={{ position: "absolute", left: L.safe.left + 40, right: L.safe.right + 40, top: L.hero.y - Math.round(60 * L.fontScale), textAlign: "center", fontFamily: T.fonts.display, fontSize: fs(L, 44), fontWeight: 800, color: T.colors.fg, lineHeight: 1.35, textShadow: "0 4px 24px rgba(0,0,0,0.6)" }} distance={24}>
          {br.caption}
        </Rise>
      ) : null}
      {!has ? <div style={{ position: "absolute", left: 0, right: 0, top: L.hero.y + Math.round(60 * L.fontScale), textAlign: "center", fontFamily: T.fonts.cn, fontSize: fs(L, 26), color: T.colors.dim }}>缺少 public/{br.src}</div> : null}
    </SceneFrame>
  );
};
