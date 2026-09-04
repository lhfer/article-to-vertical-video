import React from "react";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import type { Beat, Card } from "../types";
import { captionTopBelow, useLayout } from "../layout";
import { useTheme } from "../theme";
import { DURATIONS, TIER } from "../content";
import { VO_LEAD, baseSeconds, fitCards, fitLines, voSeconds, type TimedLine } from "../narration";
import { hasStatic, narrationFile } from "../assets";
import { Backdrop } from "./Backdrop";
import { Badge } from "./Badge";
import { Captions } from "./Captions";
import { Cards } from "./Cards";
import { EnergyBar } from "./EnergyBar";
import { Flash } from "./Flash";
import { Footer } from "./Footer";
import { Particles } from "./Particles";
import { TopBar } from "./TopBar";

export type SceneInfo = {
  frame: number;
  fps: number;
  durationInFrames: number;
  seconds: number;
  /** voice-over seconds or null */
  vo: number | null;
  /** 0..1 progress through the voice-over (or the scene when there is none) */
  spoken: number;
  lines: TimedLine[];
  cards: Card[];
  progress: number;
  globalFrame: number;
};

/** Timing facts every scene needs; derived from useVideoConfig() so a scene is the same in Main, Short and Beat-<id>. */
export const useScene = (beat: Beat, globalStart: number, totalFrames: number): SceneInfo => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const seconds = durationInFrames / fps;
  const vo = voSeconds(beat, DURATIONS);
  const spokenFrom = vo !== null ? VO_LEAD * fps : 0;
  const spokenLen = vo !== null ? vo * fps : durationInFrames;
  const spoken = Math.max(0, Math.min(1, (frame - spokenFrom) / Math.max(1, spokenLen)));
  return {
    frame,
    fps,
    durationInFrames,
    seconds,
    vo,
    spoken,
    lines: fitLines(beat.lines, vo, seconds),
    cards: fitCards(beat.cards, baseSeconds(beat, TIER), seconds),
    progress: totalFrames > 0 ? (globalStart + frame) / totalFrames : 0,
    globalFrame: globalStart + frame,
  };
};

export type SceneFrameProps = {
  beat: Beat;
  info: SceneInfo;
  /** fitted media box → captions go below it; null → captionTopFree */
  media?: { y: number; h: number } | null;
  topBar?: boolean;
  badge?: boolean;
  stamp?: boolean;
  stampAt?: number;
  captions?: boolean;
  cards?: boolean;
  footer?: boolean;
  footerExtra?: string;
  backdrop?: boolean;
  particles?: boolean;
  calm?: boolean;
  flash?: boolean;
  /** rendered above everything (e.g. the outro fade to black) */
  overlay?: React.ReactNode;
  children?: React.ReactNode;
};

/**
 * Every scene renders inside this: Backdrop → (scene content) → TopBar → Badge → Captions → Cards → Footer → EnergyBar
 * → narration Audio (at VO lead) → entry Flash (theme glow > 0). All positions come from layout tokens.
 */
export const SceneFrame: React.FC<SceneFrameProps> = ({
  beat,
  info,
  media = null,
  topBar = true,
  badge = true,
  stamp = false,
  stampAt,
  captions = true,
  cards = true,
  footer = true,
  footerExtra,
  backdrop = true,
  particles = true,
  calm = false,
  flash = true,
  overlay,
  children,
}) => {
  const L = useLayout();
  const T = useTheme();
  const { fps } = info;
  const hasCards = cards && info.cards.length > 0;
  const captionTop = media ? captionTopBelow(L, media) : hasCards ? L.cardTop - Math.round(170 * L.fontScale) : L.captionTopFree;
  const narration = narrationFile(beat.id);
  const voice = info.vo !== null && hasStatic(narration);
  return (
    <AbsoluteFill style={{ backgroundColor: T.colors.bg, overflow: "hidden" }}>
      {backdrop ? <Backdrop /> : null}
      {particles && T.particles ? <Particles count={calm ? 16 : 28} speed={calm ? 0.5 : 0.9} opacity={calm ? 0.35 : 0.6} /> : null}
      {children}
      {topBar ? <TopBar beat={beat} progress={info.progress} /> : null}
      {badge ? <Badge stamp={stamp} stampAt={stampAt} /> : null}
      {captions ? <Captions lines={info.lines} top={captionTop} /> : null}
      {hasCards ? <Cards cards={info.cards} top={L.cardTop} /> : null}
      {footer ? <Footer extra={footerExtra} /> : null}
      <EnergyBar progress={info.progress} globalFrame={info.globalFrame} calm={calm} />
      {voice ? (
        <Sequence from={Math.round(VO_LEAD * fps)} layout="none" name="Voice-over">
          <Audio src={staticFile(narration)} name={`VO ${beat.id}`} />
        </Sequence>
      ) : null}
      {flash && T.glow > 0 ? (
        <Sequence from={0} durationInFrames={4} layout="none" name="Flash">
          <Flash peak={0.45} />
        </Sequence>
      ) : null}
      {overlay}
    </AbsoluteFill>
  );
};
