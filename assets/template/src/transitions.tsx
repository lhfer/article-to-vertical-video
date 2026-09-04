import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { linearTiming, springTiming } from "@remotion/transitions";
import type { TransitionPresentation, TransitionPresentationComponentProps, TransitionTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { iris } from "@remotion/transitions/iris";
import type { TransitionKind } from "./types";

/**
 * Transition mapping shipped:
 *   cut   → no <Transition> at all (plain sequence boundary; the incoming scene flashes itself)
 *   fade  → fade, linear
 *   slide → slide from-right, spring
 *   whip  → slide from-right with a snappy spring + WhipOverlay (blur + brightness burst)
 *   zoom  → custom presentation: outgoing 1 → 1.15 + fade, incoming 0.9 → 1
 *   wipe  → wipe from-left, linear
 *   iris  → iris (exported by @remotion/transitions 4.0.520)
 */

type ZoomProps = { width: number; height: number };

const ZoomPresentation: React.FC<TransitionPresentationComponentProps<ZoomProps>> = ({ children, presentationDirection, presentationProgress }) => {
  const p = presentationProgress;
  const entering = presentationDirection === "entering";
  const scale = entering ? interpolate(p, [0, 1], [0.9, 1]) : interpolate(p, [0, 1], [1, 1.15]);
  const opacity = entering ? interpolate(p, [0, 0.6, 1], [0, 1, 1]) : interpolate(p, [0, 0.7, 1], [1, 0.4, 0]);
  return <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: "50% 50%", opacity }}>{children}</AbsoluteFill>;
};

export const zoom = (props: ZoomProps): TransitionPresentation<ZoomProps> => ({ component: ZoomPresentation, props });

/**
 * Short blur + brightness burst laid over a whip-slide. Mounted by VideoRoot in a plain <Sequence> spanning the
 * transition (TransitionSeries.Overlay may not sit next to a Transition, so it is rendered above the series instead).
 */
export const WhipOverlay: React.FC<{ durationInFrames: number; color: string }> = ({ durationInFrames, color }) => {
  const frame = useCurrentFrame();
  const p = Math.min(1, Math.max(0, frame / Math.max(1, durationInFrames)));
  const strength = Math.sin(p * Math.PI);
  // No backdrop-filter (Chrome mirrors the backdrop at transformed edges); a moving speed-streak + brightness lift instead.
  const alpha = (a: number) =>
    Math.round(Math.min(255, Math.max(0, a * 255)))
      .toString(16)
      .padStart(2, "0");
  const x = interpolate(p, [0, 1], [120, -20]);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `${color}${alpha(strength * 0.1)}` }} />
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${x}%`,
          width: "60%",
          background: `linear-gradient(90deg, ${color}00 0%, ${color}${alpha(strength * 0.28)} 35%, ${color}${alpha(strength * 0.28)} 65%, ${color}00 100%)`,
          transform: "skewX(-18deg)",
        }}
      />
    </AbsoluteFill>
  );
};

export type LoosePresentation = TransitionPresentation<Record<string, unknown>>;
export type Presentation = { presentation: LoosePresentation; timing: TransitionTiming };
// TransitionSeries.Transition is generic over the presentation props; erase them so one switch can return any presentation.
const loose = <T extends Record<string, unknown>>(p: TransitionPresentation<T>): LoosePresentation => p as unknown as LoosePresentation;

/** Presentation + timing for a kind; `cut` returns null (caller renders no transition). */
export const presentationFor = (kind: TransitionKind, frames: number, size: { width: number; height: number }): Presentation | null => {
  const linear = linearTiming({ durationInFrames: frames });
  const snappy = springTiming({ config: { damping: 200, stiffness: 400 }, durationInFrames: frames, durationRestThreshold: 0.001 });
  const soft = springTiming({ config: { damping: 30, stiffness: 160 }, durationInFrames: frames, durationRestThreshold: 0.001 });
  switch (kind) {
    case "cut":
      return null;
    case "fade":
      return { presentation: loose(fade()), timing: linear };
    case "slide":
      return { presentation: loose(slide({ direction: "from-right" })), timing: soft };
    case "whip":
      return { presentation: loose(slide({ direction: "from-right" })), timing: snappy };
    case "zoom":
      return { presentation: loose(zoom(size)), timing: linear };
    case "wipe":
      return { presentation: loose(wipe({ direction: "from-left" })), timing: linear };
    case "iris":
      return { presentation: loose(iris(size)), timing: linear };
    default:
      return { presentation: loose(fade()), timing: linear };
  }
};
