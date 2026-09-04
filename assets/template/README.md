# Vertical video template v2 (Remotion 4.0.520)

Turns `content/*.json` into a 3:4 Chinese explainer video (`Main`, 1080×1440), a 9:16 short cut (`Short`, 1080×1920), a `Cover` still and one still composition per beat (`Beat-<id>` / `ShortBeat-<id>`).

## The one rule

**The model edits `content/*.json` only. Never `src/`.** Everything visual is derived from the JSON + `public/` media:

| file | what it is |
| --- | --- |
| `content/brief.json` | theme (`neon` / `paper` / `editorial`), target length, short version, persona, account |
| `content/script.json` | `meta` (brand, source, footer…), `chapters[]`, `beats[]` — one beat = one scene |
| `content/bench.json` | benchmark tables (`hero` model + rows); `lowerIsBetter`, `note`, row `flag` |
| `content/sources.json` | quotes that back opinion (`take`) beats |
| `content/narration-durations.json` | `{ "<beat id>": seconds }` written by the TTS script; scenes stretch/shrink to it |

Schemas live in `../../schemas/`; run `node ../../scripts/lint_content.mjs <project>` before rendering.

## public/ paths the template consumes

```
public/clips/NN.mp4        demo clip (h264, 30 fps)      + public/clips/NN.bg.mp4  pre-blurred twin (background)
public/images/NN.jpg|png   images / screenshots
public/gen/<id>.mp4|png    generated broll / plates      + public/gen/<id>.bg.mp4  twin (optional)
public/gen/cover.png       optional Cover background
public/narration/<beat id>.mp3   voice-over per beat (ids from script.json)
public/bgm.wav             music (looped, ducked under voice)
public/sfx/{whoosh,hit,riser,tick}.wav
public/fonts/*.ttf         files listed in the theme (theme.ts fontFiles); missing → CSS fallback stack
public/badge.png           account badge (else an initials disc)
```

Everything is optional except the JSON: a missing file degrades (plate instead of clip, disc instead of badge, silence instead of sfx) and never crashes.

## Beat kinds

`hook promise chapter bench clip kinetic quote steps image screenshot scorecard take broll summary cta outro` — each beat carries a payload object named after its kind (`beat.clip`, `beat.bench`, …) plus optional `narration`, `lines[]` (captions, ≤ 14 weighted chars, one hot word), `cards[]`, `short: true` (included in `Short`), `minSeconds` / `maxSeconds`, `sfx`, `transition`.

Durations: with a voice-over the scene is `VO + 0.25 s lead + 0.5 s tail`; without, a per-kind base length by tier. Chapter cards only appear for tiers `m` / `l` (target > 90 s) and never in `Short`.

## Commands

```
npm i
npx tsc                                   # type check (npm run lint)
npx remotion studio                       # preview
npx remotion still Beat-hook out/hook.png --frame=30
npx remotion render Main out/main.mp4 --codec=h264 --crf=18
npx remotion render Short out/short.mp4 --codec=h264 --crf=18
```

## Source map (for maintainers)

`src/content.ts` loads + validates the JSON · `src/narration.ts` fits durations/captions/cards · `src/timeline.ts` beats → frames, transitions, sfx, VO spans · `src/clipSchedule.ts` piecewise playback rate for clips (`resultAt`) · `src/Video.tsx` TransitionSeries + bgm ducking + sfx · `src/Root.tsx` compositions · `src/scenes/*` one file per kind · `src/components/*` shared UI · `src/layout.ts` / `src/theme.ts` tokens (maintainer-owned).
