# article-to-vertical-video v2 — design contract

Maintainer notes. Not loaded by the skill at runtime. Everything below is the contract that the
scripts, the Remotion template and the docs agree on. When in doubt, this file wins.

## 0. Goals (from the 2026-09-03 review and the user's decisions)

1. Generic content line: any article type (launch page, news, case reel, tutorial, opinion,
   comparison, data story), any target length (15 s – 10 min), not only AI launch pages.
2. Two outputs from one content set: 小红书 3:4 long master (1080×1440) + 9:16 short cut (1080×1920).
3. Model-robust: a weaker model must be able to produce a publishable video by filling JSON slots
   that pass `lint_content.mjs`; strong models may enable `director` mode for extras, but every
   product passes the same lint. Scene code is locked: the model writes JSON, never TSX.
4. Honesty layering: `facts` (numbers/dates/prices only from the article, script-verified) and
   `takes` (opinions; may cite outside sources listed in `sources.json`; marked on screen).
5. Host-portable: Claude Code, Cursor, Codex, Gemini CLI, Grok Build. No host-specific tool names in
   SKILL.md; host differences live in `references/hosts.md`.
6. Grok Imagine (via grok CLI built-in tools, Grok Heavy subscription, no budget cap) for cover,
   hook shot, chapter plates, "意味着" concept shots, B-roll for articles without video. Generated
   visuals never carry numbers and never pose as product demos. No AI label on screen (user decision).
7. One voice everywhere: Seed-TTS 2.0 `zh_male_qingshuangnanda_uranus_bigtts`, rate 28.
8. Persistent account identity: account name + badge on screen; badge "stamps" when a take appears.
9. Review flow: brief → fetch → media → script JSON + lint → storyboard.md (user reviews) → TTS →
   low-res preview → HD render Main + Short → publish pack.

## 1. Directory layout (skill root = this directory)

```
SKILL.md                     host-agnostic workflow, < 250 lines
DESIGN.md                    this file (maintainers)
schemas/                     brief / script / bench / sources JSON schemas (the contract)
scripts/
  doctor.sh                  prerequisites + template checksum + fonts (--fix-fonts)
  fetch_page.py              curl_cffi + trafilatura; images + videos; --from-html/--from-text
  download_media.sh          videos → clips/NN.mp4 + clips/NN.bg.mp4 (pre-blurred); images → images/NN.jpg
  contact_sheet.sh           8-frame sheets
  propose_trims.py           scene-change + motion energy → assets/trims.json
  lint_content.mjs           schema + editorial rules → exit 1 on errors
  storyboard.py              content JSON → storyboard.md + rhythm metrics
  check_numbers.mjs          facts vs article.md (context-aware), takes vs sources.json
  tts_seed2.py               script.json narration → public/narration/<id>.mp3 + content/narration-durations.json
  make_bgm.py                synthesized bed, sections follow the storyboard energy curve
  make_sfx.py                whoosh / hit / riser / tick wavs (synthesized, no samples)
  master_audio.sh            two-pass loudnorm on the rendered mp4
  media_provider.py          image | video | cover | plates | broll | badge | ingest | list via grok-cli | grok-rest | none
  grok_media.py              headless grok CLI wrapper (copied from sprite-anim-forge)
  fetch_fonts.sh             Noto Sans SC + Smiley Sans (OFL) into project/public/fonts
references/
  briefs.md                  content-type narrative templates × duration tiers × platform specs
  content-guide.md           story skeleton, rhythm targets, glossary rules, persona phrasebank, facts/takes
  hosts.md                   per-host table: skill dir, send file, long jobs, ask user, media, keys, fetch
  themes.md                  neon / paper / editorial: when to pick which
  troubleshooting.md
  voices.md
  glossary.json              term → 人话 alias + anchor sentence
  banned-words.txt           播音腔 words that fail lint in narration
  examples/                  good/bad hooks, narration, captions per beat kind
  example-gpt6/content/      the GPT-6 launch page converted to v2 JSON (fixture + worked example)
assets/template/             Remotion project (copied to <workdir>/project)
evals/evals.json             5 evals
```

Working directory produced per video (`<workdir>`):

```
assets/   page.html article.md media.json clips.json images.json trims.json frames/ raw/
project/  content/{brief,script,bench,sources,narration-durations}.json  public/{clips,images,narration,sfx,gen,fonts,bgm.wav,badge.png}  src/ (locked template)
out/      storyboard.md stills/ preview-main.mp4 preview-short.mp4 <slug>.mp4 <slug>-short.mp4 cover.png publish.md report.md
```

## 2. Content contract (JSON, single source of truth)

All four files live in `<workdir>/project/content/`. The template imports them (resolveJsonModule);
the scripts read them directly. TypeScript types in `assets/template/src/types.ts` mirror the
schemas in `schemas/` one-to-one. Schemas are the authority; if a type and a schema disagree, fix the type.

### 2.1 brief.json (`schemas/brief.schema.json`)

```jsonc
{
  "type": "launch-explainer",            // launch-explainer | news-brief | case-reel | tutorial | opinion | comparison | data-story
  "targetSeconds": 200,                  // 15..900; tier derived: xs ≤30, s ≤90, m ≤240, l >240
  "platforms": ["xhs-3x4"],              // xhs-3x4 | wechat-3x4 | douyin-9x16 | xhs-9x16
  "shortVersion": { "enabled": true, "targetSeconds": 75, "script": "auto-cut" },   // auto-cut | separate
  "persona": { "viewpoint": "普通用户 / 打工人视角", "voiceStyle": "青春活泼…", "phrasebank": "worker" },
  "account": { "name": "小李看AI", "badge": "badge.png" },     // badge is a file in project/public/, optional
  "theme": "neon",                       // neon | paper | editorial
  "mode": "template",                    // template | director
  "language": "zh-CN",
  "source": { "url": "…", "title": "…", "fetchedAt": "2026-09-03T15:21:00+08:00" },
  "generation": { "provider": "grok-cli", "allow": ["cover", "hook", "plates", "concept", "broll"] },   // provider grok-cli | grok-rest | none
  "tts": { "provider": "seed2", "speaker": "zh_male_qingshuangnanda_uranus_bigtts", "rate": 28, "style": "…" }
}
```

Duration tiers drive defaults (chapter card length, scene base seconds, event-interval targets):

| tier | targetSeconds | chapter card | max scene w/o VO | visual event interval | structure |
|---|---|---|---|---|---|
| xs | 15–30 | none | 4 s | ≤ 2 s | hook → 1 evidence → cta |
| s | 31–90 | none | 6 s | ≤ 3 s | hook → 3 beats → turn → cta |
| m | 91–240 | 0.8 s | 10 s | ≤ 6 s | hook → promise → 3–4 chapters → turn → summary → cta |
| l | 241–900 | 1.4 s | 14 s | ≤ 8 s | hook → promise (with 目录) → chapters with recap every ~60 s → turn → summary → cta |

### 2.2 script.json (`schemas/script.schema.json`)

```jsonc
{
  "meta": { "brand": "GPT-6", "brandAccent": "ASTRA", "source": "OPENAI · 2026", "tagline": "…", "finalLine": "…",
            "footer": "数据来源：… · 竞品分数为厂商报告值", "bottomNote": "30fps · 3:4 · 中文解说版" },
  "chapters": [ { "id": "cu", "num": "01", "title": "全球最强的电脑操作模型", "sub": "Computer use" } ],
  "beats": [ /* ordered */ ]
}
```

A **beat** is one scene. Common fields:

```jsonc
{
  "id": "hook",                 // ^[a-z0-9][a-z0-9-]*$  (no underscores; also the composition id suffix and narration id)
  "kind": "hook",               // see table
  "role": "open",               // open | evidence | so-what | turn | payoff | close   (narrative role; lint needs exactly one "turn" for tiers m/l)
  "chapter": "cu",              // optional, for the top bar
  "short": true,                // include in the 9:16 short cut
  "narration": "…",             // spoken text for this beat (facts and takes together, as spoken)
  "takes": [ { "text": "我觉得…", "source": "s1" } ],   // sentences inside narration/lines that are opinions; source must exist in sources.json (source optional when the take brings no outside info)
  "lines": [ { "text": "…", "hot": ["…"], "kind": "fact" } ],   // on-screen captions, ≤ 14 weighted chars, exactly one hot word that occurs in text
  "cards": [ { "t": 3.5, "d": 6, "kind": "stat", "label": "…", "value": 72.6, "unit": "%", "prev": 65.7, "prevLabel": "…", "sub": "…" } ],
  "minSeconds": 4, "maxSeconds": 16,     // optional clamps for the fitted length
  "energy": 3,                  // 1..5, drives bgm sections and sfx defaults
  "sfx": "hit",                 // whoosh | hit | riser | tick | none  (director mode may set; template mode uses defaults by kind)
  "transition": "whip"          // cut | fade | slide | whip | zoom | wipe | iris  (transition INTO this beat; director mode may set)
}
```

Beat kinds and their specific payload (field named after the kind):

| kind | payload | renders |
|---|---|---|
| `hook` | `{ text, sub?, visual: { kind: "broll"\|"image"\|"clip"\|"text", src?, from?, to? } }` | ≤ 3 s opener: viewer's stake, big text over a generated/real visual |
| `promise` | `{ text, items?: string[] }` | "3 分钟讲清 3 件事…", optional 目录 list (tier l) |
| `chapter` | — (uses `chapter`) | chapter card (skipped in short cut and tiers xs/s) |
| `bench` | `{ tables: string[], mode: "duel"\|"table", heading }` | duel = hero vs best rival one number at a time, others collapse; table = full table flash (≤ 1.5 s) |
| `clip` | `{ src, w, h, from, to, rate, tag, focus?: {x,y,w,h}, resultAt?, bg: "blur"\|"plate"\|"none" }` | demo footage; focus = Ken Burns target in source px; resultAt = source second where playback eases to 1× |
| `kinetic` | `{ text, sub? }` | one big spoken phrase, word-by-word |
| `quote` | `{ text, by }` | typewriter quote card |
| `steps` | `{ title, items: string[] }` | numbered steps / list, one item per beat of narration |
| `image` | `{ src, w, h, focus?, caption? }` | article image with Ken Burns |
| `screenshot` | `{ src, w, h, highlight: {x,y,w,h}, label }` | screenshot with a highlight box zoom |
| `scorecard` | `{ title, rows: [{ label, value, unit, max? }] }` | compact comparison for non-benchmark data |
| `take` | `{ text, source? }` | opinion card with the badge stamp |
| `broll` | `{ src, w, h, prompt?, caption? }` | generated or stock motion plate under captions |
| `summary` | `{ title, items: string[] }` | screenshot-worthy 总结卡 (收藏点) |
| `cta` | `{ question, sub? }` | comment-bait question |
| `outro` | `{ lines: string[] }` | closing lines + brand |

Rules the template enforces: `bench` needs `bench.json`; `clip.src` is relative to `project/public/`; all `src` files must exist (lint checks). Cards: max 2 per beat, no time overlap. Captions `t`/`d` are optional and ignored when narration audio exists (retimed by character weight).

### 2.3 bench.json

```jsonc
{ "hero": "GPT-6 Astra",
  "tables": { "osworld": { "name": "OSWorld 2.0 · 电脑操作", "alias": "电脑操作考试", "unit": "%", "lowerIsBetter": false,
                           "note": "Claude 分数由第三方复现", "rows": [ { "model": "GPT-6 Astra", "value": 72.6 }, { "model": "Claude Opus 5", "value": 70.2, "flag": "*" } ] } } }
```

### 2.4 sources.json

```jsonc
{ "sources": [ { "id": "s1", "url": "https://…", "title": "…", "quote": "the sentence that supports the take", "fetchedAt": "…" } ] }
```

### 2.5 narration-durations.json

`{ "<beat id>": seconds }`, written by `tts_seed2.py`. Missing id = no voice for that beat.

## 3. Template contract (`assets/template/src`)

```
index.ts, Root.tsx          Main (1080×1440), Short (1080×1920), Cover (still), and per-beat compositions "Beat-<id>" (variant main) for stills
types.ts                    mirrors the schemas (written by the maintainer; agents extend only when the schema changes)
layout.ts                   VARIANTS, tokens, LayoutProvider/useLayout() (written by the maintainer)
theme.ts                    THEMES (neon/paper/editorial), ThemeProvider/useTheme() (written by the maintainer)
content.ts                  loads content/*.json, validates presence, exports BRIEF, SCRIPT, BENCH, SOURCES, DURATIONS
narration.ts                fitSeconds (grows AND shrinks), fitLines, fitCards, voSpan
timeline.ts                 buildTimeline(variant): Item[] with frames, transition, sfx cues, VO spans; TOTAL per variant
Video.tsx                   <VideoRoot variant> renders TransitionSeries + bgm (ducked) + sfx
scenes/<Kind>.tsx           one component per beat kind, props { beat, index, globalStart, totalFrames }
components/                 Backdrop, Captions, Cards, Badge, TopBar, EnergyBar, Flash, Particles, Sfx, FontLoader
```

Fixed rules:

- Scenes never read `brief.json` directly for layout; they call `useLayout()` and `useTheme()`.
- Every absolute coordinate comes from `layout.ts` tokens (safe areas, caption top, card top, video box). No literal `top: 1110` in scenes.
- Scene length: `fitSeconds(beat)` = VO + lead + tail, where VO = the measured duration from `narration-durations.json` when TTS has run, else an estimate from the narration text (chars / 8.4) so a preview rendered before TTS has the same length as the storyboard; beats without narration get `baseSeconds(kind, tier)` capped by the tier's max scene without VO; a clip scene is never shorter than its footage `(to − from) / rate`; clamped by `minSeconds/maxSeconds`. For clips the playback rate adapts within [rate floor, rate]; if the footage still cannot cover the scene, lint fails before render ("旁白太长"). BGM ducks only around measured (real) voice-over.
- **Timing constants (single source of truth — template `narration.ts`, `lint_content.mjs` and `storyboard.py` must all use these exact values):** `VO_LEAD = 0.25 s`, `VO_TAIL = 0.5 s`, `RATE_FLOOR = 0.75`, clip scene = `max(VO fit, (to − from) / rate)`, chapter card = 0 s (xs, s) / 0.8 s (m) / 1.4 s (l), narration estimate without audio = 8.4 chars/s at rate 28 (character-weighted: CJK 1, ASCII 0.5, punctuation 0.3). Change them here first, then in all three places.
- Transitions: template mode picks by (previous kind → next kind) from `theme.transitions`; director mode may override per beat via `beat.transition`.
- SFX: `theme.sfx[kind]` default; `beat.sfx` overrides. `<Sfx>` mounts `<Audio>` from `public/sfx/*.wav` at the cut.
- BGM: `public/bgm.wav`, volume = theme base × duck (×0.4 while a VO span is active, 0.3 s ramps).
- Fonts: `FontLoader` loads `public/fonts/*.woff2|ttf` via `@remotion/fonts` `loadFont` when present, else falls back to the theme's system stack. Never crash on missing fonts.
- Determinism: no `Math.random`, no `Date`; particle seeds are pure functions of index.
- No two `<Video>` decoders per scene: backgrounds use `clips/NN.bg.mp4` (pre-blurred, 270 px) or a theme plate.
- Known v1 bugs to fix: `objectFit` must be the component prop, not CSS; `trimAfter` + rate floor; unique SVG pattern ids per scene instance; sanitize composition ids; caption overlap clamp; integer formatting (`Number.isInteger(value)` decides, not the animated number); `TOTAL_FRAMES` computed inside `calculateMetadata` or per composition, not at module scope.

Composition ids: `Main`, `Short`, `Cover`, `Beat-<id>` (main variant), `ShortBeat-<id>`.

## 4. Scripts contract

All scripts: `--help`, non-zero exit on failure, JSON summary on stdout when `--json`, human text otherwise. No hard-coded user paths. Keys via env (`SEED_AUDIO_KEY`), optional `config.env` next to the workdir loaded by SKILL.md instructions.

- `lint_content.mjs <project_dir> [--json] [--strict]` — errors block; warnings listed. Rules: see `references/content-guide.md` §Lint. Must run without npm dependencies (Node built-ins only).
- `storyboard.py <project_dir> [--out out/storyboard.md]` — table: # | 时间 | 场景类型 | 画面 | 屏幕文字 | 旁白 | 音效/转场 | 情绪; then metrics: total est. seconds vs target, per-kind share, dead air, longest gap between visual events, turn position, short-cut total. Uses durations when present, else estimates from characters (8.4 chars/s).
- `check_numbers.mjs <project_dir> <article.md> [--json]` — facts: bench rows need the model name within 160 chars of the value (same table block) or the value with unit adjacent; card/caption/narration/outro numbers with a unit or a decimal or ≥ 3 significant digits must appear with the unit; bare small integers are reported as "unchecked" not "missing". Takes: numbers in take sentences are checked against `sources.json` quotes. Prints matched context for every value.
- `fetch_page.py <url|--from-html F|--from-text F> <out_dir>` — page.html, article.md (trafilatura markdown with tables; regex fallback), media.json with `kind: mp4|embed|image`.
- `download_media.sh <workdir>` — clips + bg clips + images + clips.json/images.json.
- `propose_trims.py <workdir> [--tier m]` — trims.json with ranked windows and reasons.
- `tts_seed2.py <project_dir> [--only a,b] [--force] [--sample "text"]` — reads script.json beats' narration.
- `make_bgm.py <project_dir> [--energy out/storyboard.json] [--kit synth|lofi|minimal] [--bpm N]` — sections by the storyboard's energy curve (`beats[].{start,seconds,energy}`), writes `public/bgm.wav` + `bgm.json`; `make_sfx.py <project_dir>` → `public/sfx/{whoosh,hit,riser,tick}.wav`.
- `master_audio.sh <in.mp4> <out.mp4> [-15]` — loudnorm two-pass.
- `media_provider.py [--provider grok-cli|grok-rest|none] [--theme T] [--placeholder] image|video|cover|plates|broll|badge|ingest|list …` — outputs under `project/public/gen/` + `gen.json`; videos are transcoded like clips (h264, 30 fps, audio stripped) and get a `.bg.mp4` blurred twin; `video --from IMG` = image→video (prompt = motion), without `--from` = text→image→video (prompt = picture, `--motion` = camera); `badge` also writes the trimmed 512² `public/badge.png`; `--provider none` prints the plan, `--placeholder` writes theme-coloured stand-ins. Generated sources are referenced as `gen/<id>.png|mp4` (lint must allow `gen/` like `clips/`). Details: `references/media-generation.md`.
- `doctor.sh [--fix-fonts] [--json]` — node ≥ 20, npm, ffmpeg/ffprobe, python3, uv or pip (curl_cffi, trafilatura), whisper-cli (optional), grok CLI (optional), SEED_AUDIO_KEY (optional), template checksum vs `assets/template/CHECKSUMS`.

## 5. Phases and owners

- A (template core): content loader, layout wiring, timeline/variants, narration fit, themes wiring, Bench duel, Clip focus, Captions/Cards/Badge/TopBar/EnergyBar, SFX + ducking, fonts loader, bug fixes, Cover still; placeholder content in v2 JSON; tsc + stills + low-res Main/Short renders.
- A2 (after A, same agent): remaining scene kinds (hook, promise, kinetic, quote, steps, image, screenshot, scorecard, take, broll, summary, cta, outro) + registry.
- B1: lint_content.mjs, storyboard.py, check_numbers.mjs (+ fixtures and self-tests).
- B2: fetch_page.py, download_media.sh, propose_trims.py, doctor.sh, master_audio.sh, make_sfx.py, make_bgm.py, fetch_fonts.sh.
- B3: SKILL.md, references/*, glossary.json, banned-words.txt, examples/, evals, GPT-6 example converted to v2 JSON.
- B4: media_provider.py + grok_media.py + smoke test with one real generation.
- C (integration): run the example through lint → storyboard → scaffold → stills → low-res Main + Short; fix; package `articletoverticalvideo-v2.skill`.

## 6. Acceptance for v2

1. `doctor.sh` passes on this Mac; `npm i && npx tsc` clean in a fresh copy of the template.
2. GPT-6 example in v2 JSON passes `lint_content.mjs` and `check_numbers.mjs`; `storyboard.md` shows zero dead air > 1.2 s and a turn between 35–75 %.
3. `Main` and `Short` render at `--scale 0.25` end to end from the example; stills of hook, bench duel, clip with focus, take, summary, cta, cover look right (human check by the maintainer).
4. No file under `assets/template/src` is referenced from SKILL.md as something the model edits.
5. SKILL.md < 250 lines, front matter = spec fields only (`name`, `description` ≤ 1024, `compatibility`, `metadata` flat strings).
