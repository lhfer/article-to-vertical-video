// Types mirroring ../../schemas/*.json one-to-one. The schemas are the authority; if these disagree, fix these.
// The model never edits this file. Scenes read content through content.ts and these types.

export type BriefType = "launch-explainer" | "news-brief" | "case-reel" | "tutorial" | "opinion" | "comparison" | "data-story";
export type Tier = "xs" | "s" | "m" | "l";
export type Platform = "xhs-3x4" | "wechat-3x4" | "douyin-9x16" | "xhs-9x16";
export type ThemeName = "neon" | "paper" | "editorial";
export type Mode = "template" | "director";

export type Brief = {
  type: BriefType;
  targetSeconds: number;
  tier?: Tier;
  platforms: Platform[];
  shortVersion?: { enabled?: boolean; targetSeconds?: number; script?: "auto-cut" | "separate" };
  persona: { viewpoint: string; voiceStyle?: string; phrasebank?: string };
  account?: { name?: string; badge?: string };
  theme: ThemeName;
  mode: Mode;
  language: "zh-CN";
  source?: { url?: string; title?: string; fetchedAt?: string; kind?: "url" | "html" | "text" };
  generation?: { provider?: "grok-cli" | "grok-rest" | "none"; allow?: ("cover" | "hook" | "plates" | "concept" | "broll" | "badge")[] };
  tts?: { provider?: "seed2" | "xai" | "none"; speaker?: string; rate?: number; style?: string };
  notes?: string;
};

export const tierOf = (targetSeconds: number): Tier => (targetSeconds <= 30 ? "xs" : targetSeconds <= 90 ? "s" : targetSeconds <= 240 ? "m" : "l");

export type Line = { text: string; hot: string[]; kind?: "fact" | "take"; t?: number; d?: number };

export type Card =
  | { t: number; d: number; kind: "stat"; label: string; value: number; unit?: string; prev?: number; prevLabel?: string; sub?: string; lowerIsBetter?: boolean; source?: string }
  | { t: number; d: number; kind: "chip"; text: string; source?: string }
  | { t: number; d: number; kind: "quote"; text: string; sub?: string; source?: string };

export type Rect = { x: number; y: number; w: number; h: number };
export type Take = { text: string; source?: string };

export type BeatKind =
  | "hook" | "promise" | "chapter" | "bench" | "clip" | "kinetic" | "quote" | "steps"
  | "image" | "screenshot" | "scorecard" | "take" | "broll" | "summary" | "cta" | "outro";
export type Role = "open" | "evidence" | "so-what" | "turn" | "payoff" | "close";
export type SfxKind = "whoosh" | "hit" | "riser" | "tick" | "none";
export type TransitionKind = "cut" | "fade" | "slide" | "whip" | "zoom" | "wipe" | "iris";

export type HookPayload = { text: string; sub?: string; visual: { kind: "broll" | "image" | "clip" | "text"; src?: string; w?: number; h?: number; from?: number; to?: number } };
export type PromisePayload = { text: string; items?: string[] };
export type BenchPayload = { tables: string[]; mode: "duel" | "table"; heading: string; footnote?: string };
export type ClipPayload = { src: string; w: number; h: number; from: number; to: number; rate: number; tag: string; focus?: Rect; resultAt?: number; bg?: "blur" | "plate" | "none" };
export type KineticPayload = { text: string; sub?: string };
export type QuotePayload = { text: string; by: string };
export type StepsPayload = { title: string; items: string[] };
export type ImagePayload = { src: string; w: number; h: number; focus?: Rect; caption?: string };
export type ScreenshotPayload = { src: string; w: number; h: number; highlight: Rect; label: string };
export type ScorecardPayload = { title: string; rows: { label: string; value: number; unit?: string; max?: number; hero?: boolean }[] };
export type TakePayload = { text: string; source?: string };
export type BrollPayload = { src: string; w: number; h: number; prompt?: string; caption?: string };
export type SummaryPayload = { title: string; items: string[] };
export type CtaPayload = { question: string; sub?: string };
export type OutroPayload = { lines: string[] };

export type Beat = {
  id: string;
  kind: BeatKind;
  role?: Role;
  chapter?: string;
  short?: boolean;
  narration?: string;
  takes?: Take[];
  lines?: Line[];
  cards?: Card[];
  minSeconds?: number;
  maxSeconds?: number;
  energy?: number;
  sfx?: SfxKind;
  transition?: TransitionKind;
  hook?: HookPayload;
  promise?: PromisePayload;
  bench?: BenchPayload;
  clip?: ClipPayload;
  kinetic?: KineticPayload;
  quote?: QuotePayload;
  steps?: StepsPayload;
  image?: ImagePayload;
  screenshot?: ScreenshotPayload;
  scorecard?: ScorecardPayload;
  take?: TakePayload;
  broll?: BrollPayload;
  summary?: SummaryPayload;
  cta?: CtaPayload;
  outro?: OutroPayload;
};

export type Chapter = { id: string; num: string; title: string; sub?: string };

export type Script = {
  meta: { brand: string; brandAccent?: string; source: string; tagline?: string; finalLine?: string; footer: string; bottomNote?: string };
  chapters: Chapter[];
  beats: Beat[];
};

export type BenchRow = { model: string; value: number; flag?: string };
export type BenchTable = { name: string; alias?: string; unit: string; lowerIsBetter?: boolean; note?: string; rows: BenchRow[] };
export type Bench = { hero: string; tables: Record<string, BenchTable> };

export type Source = { id: string; url: string; title?: string; quote: string; fetchedAt?: string };
export type Sources = { sources: Source[] };

export type Durations = Record<string, number>;

// Props every scene component receives. Scenes get layout/theme from hooks, not props.
export type SceneProps = { beat: Beat; index: number; globalStart: number; totalFrames: number };
