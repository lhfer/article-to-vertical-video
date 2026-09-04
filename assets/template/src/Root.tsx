import React from "react";
import { Composition, Still, type CalculateMetadataFunction } from "remotion";
import { getLayout, type Variant } from "./layout";
import { BRIEF, SCRIPT } from "./content";
import { buildTimeline } from "./timeline";
import { BeatRoot, VideoRoot, timelineInput } from "./Video";
import { Cover } from "./Cover";

const ID_RE = /^[a-z0-9-]+$/;
const assertId = (id: string) => {
  if (!ID_RE.test(id)) throw new Error(`Beat id "${id}" must match ${ID_RE} (lowercase letters, digits, dashes) so it can be used as a Remotion composition id.`);
  return id;
};

const metadataFor =
  (variant: Variant): CalculateMetadataFunction<{ variant: Variant }> =>
  () => {
    const tl = buildTimeline(variant, timelineInput());
    return { durationInFrames: tl.totalFrames, fps: tl.fps };
  };

export const RemotionRoot: React.FC = () => {
  // computed in render (never module-scope totals): the same numbers calculateMetadata will produce at render time
  const main = buildTimeline("main", timelineInput());
  const short = buildTimeline("short", timelineInput());
  const ML = getLayout("main");
  const SL = getLayout("short");
  SCRIPT.beats.forEach((b) => assertId(b.id));
  const shortEnabled = BRIEF.shortVersion?.enabled !== false;
  return (
    <>
      <Composition id="Main" component={VideoRoot} width={ML.W} height={ML.H} fps={ML.fps} durationInFrames={main.totalFrames} defaultProps={{ variant: "main" as Variant }} calculateMetadata={metadataFor("main")} />
      {shortEnabled ? (
        <Composition id="Short" component={VideoRoot} width={SL.W} height={SL.H} fps={SL.fps} durationInFrames={short.totalFrames} defaultProps={{ variant: "short" as Variant }} calculateMetadata={metadataFor("short")} />
      ) : null}
      <Still id="Cover" component={Cover} width={ML.W} height={ML.H} />
      {main.items.map((it) => (
        <Composition key={`Beat-${it.beat.id}`} id={`Beat-${it.beat.id}`} component={BeatRoot} width={ML.W} height={ML.H} fps={ML.fps} durationInFrames={it.frames} defaultProps={{ variant: "main" as Variant, id: it.beat.id }} />
      ))}
      {shortEnabled
        ? short.items.map((it) => (
            <Composition key={`ShortBeat-${it.beat.id}`} id={`ShortBeat-${it.beat.id}`} component={BeatRoot} width={SL.W} height={SL.H} fps={SL.fps} durationInFrames={it.frames} defaultProps={{ variant: "short" as Variant, id: it.beat.id }} />
          ))
        : null}
    </>
  );
};
