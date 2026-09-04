import type React from "react";
import type { BeatKind, SceneProps } from "../types";
import { Bench } from "./Bench";
import { Broll } from "./Broll";
import { ChapterTitle } from "./ChapterTitle";
import { Clip } from "./Clip";
import { Cta } from "./Cta";
import { Hook } from "./Hook";
import { Image } from "./Image";
import { Kinetic } from "./Kinetic";
import { Outro } from "./Outro";
import { Promise } from "./Promise";
import { Quote } from "./Quote";
import { Scorecard } from "./Scorecard";
import { Screenshot } from "./Screenshot";
import { Steps } from "./Steps";
import { Summary } from "./Summary";
import { Take } from "./Take";

/** kind → scene component. Every kind in BeatKind must be present (checked by the Record type). */
export const SCENES: Record<BeatKind, React.FC<SceneProps>> = {
  hook: Hook,
  promise: Promise,
  chapter: ChapterTitle,
  bench: Bench,
  clip: Clip,
  kinetic: Kinetic,
  quote: Quote,
  steps: Steps,
  image: Image,
  screenshot: Screenshot,
  scorecard: Scorecard,
  take: Take,
  broll: Broll,
  summary: Summary,
  cta: Cta,
  outro: Outro,
};

export const sceneFor = (kind: BeatKind): React.FC<SceneProps> => SCENES[kind];
