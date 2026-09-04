import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { SceneProps } from "../types";
import { fitMedia, fs, useLayout } from "../layout";
import { useTheme } from "../theme";
import { payloadOf } from "../content";
import { hasStatic } from "../assets";
import { Plate } from "../components/Backdrop";
import { KenBurnsImage, MediaFrame } from "../components/Media";
import { SceneFrame, useScene } from "../components/SceneFrame";
import { Rise } from "../components/Text";

/** Image with Ken Burns (optional focus rect) inside the media box + a small caption under it. */
export const Image: React.FC<SceneProps> = ({ beat, globalStart, totalFrames }) => {
  const info = useScene(beat, globalStart, totalFrames);
  const im = payloadOf(beat, "image");
  const L = useLayout();
  const T = useTheme();
  const frame = useCurrentFrame();
  const fit = fitMedia(L, im.w, im.h);
  const entrance = interpolate(frame, [0, 10], [0.96, 1], { extrapolateRight: "clamp" });
  const zoomSeconds = Math.max(1.2, Math.min(4, info.seconds * 0.6));
  const captionH = im.caption ? Math.round(44 * L.fontScale) : 0;
  return (
    <SceneFrame beat={beat} info={info} media={{ y: fit.y, h: fit.h + captionH }}>
      <Plate angle={200} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${T.colors.bg}bb 0%, transparent 25%, transparent 70%, ${T.colors.bg}dd 100%)` }} />
      <MediaFrame fit={fit} scale={entrance}>
        {hasStatic(im.src) ? (
          <KenBurnsImage src={im.src} w={im.w} h={im.h} fit={fit} focus={im.focus} zoomSeconds={zoomSeconds} delayFrames={4} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.fonts.cn, fontSize: fs(L, 32), color: T.colors.dim, background: T.colors.cardBg }}>缺少 public/{im.src}</div>
        )}
      </MediaFrame>
      {im.caption ? (
        <Rise delay={10} style={{ position: "absolute", left: fit.x, width: fit.w, top: fit.y + fit.h + Math.round(10 * L.fontScale), textAlign: "center", fontFamily: T.fonts.cn, fontSize: fs(L, 24), color: T.colors.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} distance={12}>
          {im.caption}
        </Rise>
      ) : null}
    </SceneFrame>
  );
};
