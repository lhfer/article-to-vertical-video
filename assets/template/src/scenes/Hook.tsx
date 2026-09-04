import React from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import type { SceneProps } from "../types";
import { useLayout } from "../layout";
import { useTheme } from "../theme";
import { payloadOf } from "../content";
import { hasStatic } from "../assets";
import { clipSchedule } from "../clipSchedule";
import { Backdrop, Plate } from "../components/Backdrop";
import { KenBurnsImage, ScheduledVideo } from "../components/Media";
import { SceneFrame, useScene } from "../components/SceneFrame";
import { Rise, WordSlam } from "../components/Text";
import { fitFontSize, hotIn, lineCount } from "../text";

/** ≤ 3 s opener: the viewer's stake in huge text over a plate / image / clip / broll. No TopBar — the hook comes before the brand. */
export const Hook: React.FC<SceneProps> = ({ beat, globalStart, totalFrames }) => {
  const info = useScene(beat, globalStart, totalFrames);
  const hook = payloadOf(beat, "hook");
  const hots = hotIn(hook.text, beat.lines);
  const L = useLayout();
  const T = useTheme();
  const frame = useCurrentFrame();
  const v = hook.visual;
  const full = { x: 0, y: 0, w: L.W, h: L.H };
  const hasSrc = v.src ? hasStatic(v.src) : false;
  const kind = hasSrc ? v.kind : "text";
  const zoom = interpolate(frame, [0, info.durationInFrames], [1, 1.06], { extrapolateRight: "clamp" });

  let visual: React.ReactNode;
  if (kind === "image" && v.src) {
    visual = <KenBurnsImage src={v.src} w={v.w ?? 1600} h={v.h ?? 900} fit={full} push={0.1} />;
  } else if (kind === "clip" && v.src) {
    const from = v.from ?? 0;
    const to = v.to !== undefined && v.to > from ? v.to : from + info.seconds;
    const schedule = clipSchedule({ src: v.src, w: v.w ?? 1600, h: v.h ?? 900, from, to, rate: 1, tag: "" }, info.seconds, info.fps);
    visual = <ScheduledVideo src={v.src} schedule={schedule} toSeconds={to} objectFit="cover" style={{ position: "absolute", left: 0, top: 0, width: L.W, height: L.H }} name="hook" />;
  } else if (kind === "broll" && v.src) {
    visual = <Video src={staticFile(v.src)} muted loop objectFit="cover" style={{ position: "absolute", left: 0, top: 0, width: L.W, height: L.H }} />;
  } else {
    visual = (
      <>
        <Plate angle={120} />
        <div
          style={{
            position: "absolute",
            left: -L.W * 0.2,
            top: L.H * 0.1,
            width: L.W * 1.4,
            height: L.H * 0.5,
            background: T.gradients.hot,
            opacity: T.name === "paper" ? 0.16 : 0.22,
            rotate: `${-14 + frame * 0.03}deg`,
            filter: "blur(60px)",
          }}
        />
        <Backdrop bg={false} glow={false} />
      </>
    );
  }

  const heroW = L.hero.maxWidth;
  const size = fitFontSize(hook.text, Math.round(L.hero.size * 1.1), heroW);
  const nLines = lineCount(hook.text, size, heroW);
  const textTop = L.hero.y - Math.round(size * 1.15 * nLines * 0.5) - Math.round(20 * L.fontScale);
  return (
    <SceneFrame beat={beat} info={info} topBar={false} footer={false} backdrop={false} particles={kind === "text"}>
      <AbsoluteFill style={{ scale: String(zoom) }}>{visual}</AbsoluteFill>
      {kind !== "text" ? (
        <AbsoluteFill
          style={{
            background:
              T.name === "paper"
                ? "linear-gradient(180deg, rgba(246,241,231,0.55) 0%, rgba(246,241,231,0.25) 40%, rgba(246,241,231,0.75) 100%)"
                : "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.8) 100%)",
          }}
        />
      ) : null}
      <WordSlam text={hook.text} size={size} top={textTop} delay={2} stagger={5} hot={hots} hotLast={hots.length === 0} maxWidth={heroW} />
      {hook.sub ? (
        <Rise delay={14} style={{ position: "absolute", left: L.safe.left, width: L.W - L.safe.left - L.safe.right, top: textTop + Math.round(size * 1.15 * nLines) + Math.round(36 * L.fontScale), textAlign: "center", fontFamily: T.fonts.cn, fontSize: L.hero.subSize, fontWeight: 600, color: T.colors.dim, letterSpacing: 2 }}>
          {hook.sub}
        </Rise>
      ) : null}
    </SceneFrame>
  );
};
