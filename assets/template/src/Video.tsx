import React, { useMemo } from "react";
import { AbsoluteFill, Sequence, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { LayoutProvider, type Variant } from "./layout";
import { ThemeProvider, getTheme } from "./theme";
import { BENCH, BRIEF, DURATIONS, SCRIPT } from "./content";
import { buildTimeline, type Item, type Timeline } from "./timeline";
import { BGM_FILE, hasStatic } from "./assets";
import { FontLoader } from "./components/FontLoader";
import { Sfx } from "./components/Sfx";
import { sceneFor } from "./scenes";
import { WhipOverlay, presentationFor } from "./transitions";

export const timelineInput = () => ({ brief: BRIEF, script: SCRIPT, bench: BENCH, durations: DURATIONS });

const DUCK = 0.4; // bgm multiplier while a voice-over plays
const DUCK_RAMP = 0.3; // seconds
const FADE_IN = 1;
const FADE_OUT = 2;

/** BGM volume at a global frame: base × fade-in × fade-out × duck (0.3 s linear ramps around every VO span). */
export const bgmVolume = (frame: number, fps: number, totalFrames: number, base: number, spans: { fromFrame: number; toFrame: number }[]): number => {
  const fadeIn = Math.min(1, frame / (FADE_IN * fps));
  const fadeOut = Math.min(1, Math.max(0, (totalFrames - frame) / (FADE_OUT * fps)));
  const ramp = DUCK_RAMP * fps;
  let d = 0;
  for (const s of spans) {
    const inRamp = Math.min(1, Math.max(0, (frame - (s.fromFrame - ramp)) / ramp));
    const outRamp = Math.min(1, Math.max(0, (s.toFrame + ramp - frame) / ramp));
    d = Math.max(d, Math.min(inRamp, outRamp));
  }
  const duck = 1 - (1 - DUCK) * d;
  return Math.max(0, Math.min(1, base * fadeIn * fadeOut * duck));
};

const SceneAt: React.FC<{ item: Item; total: number }> = ({ item, total }) => {
  const Scene = sceneFor(item.beat.kind);
  return <Scene beat={item.beat} index={item.index} globalStart={item.startFrame} totalFrames={total} />;
};

/** The whole video for one variant: transitions, sfx cues, bgm with ducking. Narration audio lives inside each scene. */
export const VideoRoot: React.FC<{ variant: Variant; timeline?: Timeline }> = ({ variant, timeline }) => {
  const { fps, width, height } = useVideoConfig();
  const tl = useMemo(() => timeline ?? buildTimeline(variant, timelineInput()), [variant, timeline]);
  const theme = getTheme(BRIEF.theme);
  const total = tl.totalFrames;
  const spans = tl.items.flatMap((it) => (it.vo ? [it.vo] : []));
  const hasBgm = hasStatic(BGM_FILE);
  const children: React.ReactNode[] = [];
  tl.items.forEach((it, i) => {
    if (i > 0 && it.transition !== "cut" && it.transitionFrames > 0) {
      const p = presentationFor(it.transition, it.transitionFrames, { width, height });
      if (p) children.push(<TransitionSeries.Transition key={`t-${it.beat.id}`} presentation={p.presentation} timing={p.timing} />);
    }
    children.push(
      <TransitionSeries.Sequence key={it.beat.id} durationInFrames={it.frames} name={`${it.index + 1} ${it.beat.kind} · ${it.beat.id}`}>
        <SceneAt item={it} total={total} />
      </TransitionSeries.Sequence>,
    );
  });
  return (
    <LayoutProvider variant={variant}>
      <ThemeProvider name={BRIEF.theme}>
        <FontLoader />
        <AbsoluteFill style={{ backgroundColor: theme.colors.bg }}>
          <TransitionSeries>{children}</TransitionSeries>
          {tl.items.map((it) =>
            it.transition === "whip" && it.transitionFrames > 0 ? (
              <Sequence key={`whip-${it.beat.id}`} from={it.startFrame} durationInFrames={it.transitionFrames} layout="none" name={`whip ${it.beat.id}`}>
                <WhipOverlay durationInFrames={it.transitionFrames} color={theme.colors.fg} />
              </Sequence>
            ) : null,
          )}
          {tl.items.map((it) =>
            it.sfx !== "none" ? (
              <Sequence key={`sfx-${it.beat.id}`} from={Math.max(0, it.startFrame + Math.floor(it.transitionFrames / 2))} durationInFrames={Math.round(1.5 * fps)} layout="none" name={`sfx ${it.sfx}`}>
                <Sfx name={it.sfx} />
              </Sequence>
            ) : null,
          )}
          {hasBgm ? <Audio src={staticFile(BGM_FILE)} loop volume={(f) => bgmVolume(f, fps, total, theme.bgm.base, spans)} name="bgm" /> : null}
        </AbsoluteFill>
      </ThemeProvider>
    </LayoutProvider>
  );
};

/** One beat standalone (Beat-<id> / ShortBeat-<id> compositions). */
export const BeatRoot: React.FC<{ variant: Variant; id: string }> = ({ variant, id }) => {
  const tl = useMemo(() => buildTimeline(variant, timelineInput()), [variant]);
  const it = tl.items.find((x) => x.beat.id === id);
  if (!it) {
    return <AbsoluteFill style={{ backgroundColor: "#000", color: "#fff", justifyContent: "center", alignItems: "center", fontSize: 40 }}>beat "{id}" is not part of the {variant} timeline</AbsoluteFill>;
  }
  return (
    <LayoutProvider variant={variant}>
      <ThemeProvider name={BRIEF.theme}>
        <FontLoader />
        <SceneAt item={it} total={tl.totalFrames} />
      </ThemeProvider>
    </LayoutProvider>
  );
};
