---
name: article-to-vertical-video
description: Turn any article — a URL, saved HTML or pasted text; launch page, news, case study, tutorial, opinion essay, comparison or data story — into a vertical Chinese explainer video with Remotion — a 3:4 long master (1080×1440) plus a 9:16 short cut (1080×1920), big animated Chinese captions, stat cards, benchmark duels when the page has comparison tables, the page's own demo clips with focus zoom, Grok-generated cover / hook shot / B-roll when the page has no video, a synthesized beat and SFX, and a casual first-person Seed-TTS 2.0 voice-over with marked, sourced takes (观点) for 小红书 / 抖音 / 视频号. Use whenever the user gives a link or text and wants a 竖版视频、短视频、长视频、解说视频、宣传视频、发布解读、带观点的解读、小红书视频、抖音视频、带字幕的视频, a 9:16 or 3:4 cut, wants to "把这篇做成视频" / "任意文章做成视频", or wants captions/配音 added to downloaded clips — even if they don't say Remotion. Handles Cloudflare-blocked sites (openai.com etc.), silent demo clips, pages without tables or videos, and target lengths from 15 s to 10 min.
compatibility: Requires node>=20, ffmpeg/ffprobe, python3 with uv (curl_cffi, trafilatura); optional whisper-cli, grok CLI (Grok Heavy) for generated visuals; SEED_AUDIO_KEY for voice-over.
metadata:
  version: "2.0.0"
  author: "xiaoli"
  updated: "2026-09-03"
---

# Article → vertical Chinese explainer video (3:4 master + 9:16 short)

One article in, two H.264 mp4s out — `Main` 1080×1440 for 小红书 / 视频号 and `Short` 1080×1920 for 抖音 / 小红书 9:16 — with every number on screen traceable to the article and every opinion marked as one. Scripts are deterministic; you are creative only inside `content/*.json`.

`<skill>` below is the directory containing this SKILL.md (Claude Code exposes it as `${CLAUDE_SKILL_DIR}`; other hosts: resolve it yourself, e.g. the path this file was loaded from). `<workdir>` is a fresh folder (the one the user is in, or one they name) with `assets/`, `project/`, `out/`. Every script prints usage with `--help`. Host-specific matters — handing files to the user, running long renders, asking questions, media tools, keys — are in [references/hosts.md](references/hosts.md); do not improvise them.

## What the user gets

`out/<slug>.mp4` (Main), `out/<slug>-short.mp4` (Short), `out/cover.png`, `out/storyboard.md` (reviewed before any audio), `out/report.md` (what was fetched, skipped, assumed, sourced), `out/publish.md` (titles, first comment, hashtags), plus `project/content/*.json` — the whole video as data, re-renderable.

## Rules that hold in every step

- **Facts come from the article only.** Numbers, dates, prices, quotes on screen or in narration must appear in `assets/article.md` (`check_numbers.mjs` verifies). News coverage disagrees with launch pages; the page wins. Unpublished specs are said as such: "参数规模：官方未公布".
- **Losing tables are included.** The `turn` beat (没赢的地方) is mandatory for tiers m/l and is what makes the rest credible. Competitor numbers are vendor-reported — the footer says so.
- **Takes are marked and sourced.** Opinions live in `takes[]` / `take` beats, get the badge stamp + "观点" on screen, and any take carrying a number cites `sources.json` with a verbatim quote you actually fetched. Never invent a quote.
- **Generated visuals never carry numbers and never pose as demos.** Only `hook.visual`, `broll`, `Cover`, plates and the badge may be generated; `clip` / `image` / `screenshot` beats hold the article's own media. No AI label on screen (user decision); prompts and provider are recorded in `public/gen/gen.json` and the report.
- **You write `project/content/*.json` only, never `project/src/`.** `doctor.sh` checks the template checksum; a mismatch means someone edited scene code — restore the template and express the change in JSON.
- **One voice for the account**: Seed-TTS 2.0 `zh_male_qingshuangnanda_uranus_bigtts`, rate 28 ([references/voices.md](references/voices.md)). Never regenerate all lines to fix two.
- **Text before audio, audio before render.** The storyboard is reviewed first; a full render is the last thing you spend time on.

## Workflow

### 0. Brief (2 min) — `bash <skill>/scripts/doctor.sh` first

Infer the brief from the user's prompt and a first look at the page; ask only about items you cannot infer (type, target length, platform, persona, theme) and ask them all in one message. Write `<workdir>/project/content/brief.json` (schema `schemas/brief.schema.json`; types, tiers and platforms in [references/briefs.md](references/briefs.md)):

```json
{ "type": "launch-explainer", "targetSeconds": 200, "platforms": ["xhs-3x4"],
  "shortVersion": { "enabled": true, "targetSeconds": 75, "script": "auto-cut" },
  "persona": { "viewpoint": "打工人视角：能替我干什么、该信几分、等还是换", "voiceStyle": "青春活泼的大学生男生口吻…", "phrasebank": "worker" },
  "account": { "name": "你的账号名" }, "theme": "neon", "mode": "template", "language": "zh-CN",
  "source": { "url": "https://…", "kind": "url" },
  "generation": { "provider": "grok-cli", "allow": ["cover", "hook", "broll"] },
  "tts": { "provider": "seed2", "speaker": "zh_male_qingshuangnanda_uranus_bigtts", "rate": 28 } }
```

Defaults when the user says nothing: 3:4 master + auto-cut short, theme by type ([references/themes.md](references/themes.md)), `worker` persona, `template` mode. Suggest a `config.env` next to the workdir for `SEED_AUDIO_KEY` (see `config.example.env`); load it with `set -a; source …/config.env; set +a` before step 6.

### 1. Fetch (2 min)

```bash
mkdir -p <workdir>/assets
uv run --with curl_cffi --with trafilatura python3 <skill>/scripts/fetch_page.py "<url>" <workdir>/assets
# fallbacks: --from-html <saved page.html> | --from-text <pasted.txt>   (instead of the url)
```

Chrome impersonation gets past the Cloudflare walls that block curl, host fetch tools and yt-dlp (openai.com 403/500 to all of those); do not try other methods first. Output: `page.html`, `article.md` (with tables), `media.json` (`mp4 | embed | image`). **Read `article.md` in full** before designing anything; keep the footnotes beside the tables. Record `brief.source.fetchedAt`.

### 2. Media (5 min)

```bash
bash <skill>/scripts/download_media.sh <workdir>        # clips/NN.mp4 + NN.bg.mp4, images/NN.jpg, assets/clips.json + images.json
bash <skill>/scripts/contact_sheet.sh <workdir>         # assets/frames/NN.jpg (8 frames) + all.jpg
python3 <skill>/scripts/propose_trims.py <workdir> --tier m   # assets/trims.json: ranked from/to windows
```

Look at the sheets before accepting any trim: name what is on screen, pick the `focus` rect and the `resultAt` moment. `clips.json` gives `src/w/h/hasAudio`; demo clips are usually silent, so captions are authored from the article (whisper only when a clip actually talks — troubleshooting.md). Vimeo/YouTube embeds 403 even impersonated: try once, list them in the report. A page with no media is fine: the beats become cards, kinetic text, scorecards and generated B-roll.

### 3. Insight + script (the creative step)

Answer the 7 insight questions in [references/content-guide.md](references/content-guide.md) §7 in writing (对普通人意味着什么 / 最反直觉的一点 / 页面没说的 / 横向对比的坑 / 一句话判断 / 分人群建议 / 争议点做 CTA), then write `script.json`, `bench.json`, `sources.json` (and `narration-durations.json` = `{}`) following the story skeleton for the brief type and tier in briefs.md: `hook(open)` ≤ 3 s stating the viewer's stake → `promise` → chapters, each 主张 → 证据 (`bench` duel, 1–2 `clip`) → 所以呢 (`take`) → 但是 → `turn` at 35–75 % → screenshot-worthy `summary` → contentious `cta` → `outro`. Captions ≤ 14 weighted chars with exactly one `hot` word; narration ≈ 8.4 chars/s, first/second person, no words from `references/banned-words.txt`; alias on first mention of every benchmark (`references/glossary.json`); every 意味着 names a task. Mark `short: true` on hook + 3 strongest beats + turn + cta. A complete worked example: `references/example-gpt6/content/`.

```bash
node <skill>/scripts/lint_content.mjs <workdir>/project --article <workdir>/assets/article.md   # schema + editorial rules + numbers (N-MISS); fix until 0 errors
node <skill>/scripts/check_numbers.mjs <workdir>/project <workdir>/assets/article.md   # standalone number audit: every fact found; takes vs sources.json
```

Exit codes on both: 0 clean · 1 errors (or unreadable input) · 2 usage error (or warnings under `--strict`). Rule codes and what each one means: [references/lint-rules.md](references/lint-rules.md). `check_numbers` skips 近/约/两/几 approximations and leaves bare ≤ 2-digit integers "unchecked" — read those by eye.

Generated visuals, only for uses listed in `brief.generation.allow`, per [references/media-generation.md](references/media-generation.md):

```bash
python3 <skill>/scripts/media_provider.py --provider grok-cli cover --project <workdir>/project --prompt "…"
python3 <skill>/scripts/media_provider.py --provider grok-cli video --project <workdir>/project --id hook --from gen/cover.png --prompt "运镜…"
python3 <skill>/scripts/media_provider.py --provider grok-cli broll --project <workdir>/project --id meaning-c1 --concept --prompt "隐喻…"
python3 <skill>/scripts/media_provider.py --provider grok-cli badge --project <workdir>/project --name "账号名" --prompt "…"   # once per account
```

### 4. Storyboard review (the user's first look)

```bash
python3 <skill>/scripts/storyboard.py <workdir>/project --out <workdir>/out/storyboard.md --json <workdir>/out/storyboard.json
```

Hand `storyboard.md` to the user (hosts.md) with the metrics it prints: estimated total vs target, turn position, longest gap between visual events, short-cut total. Iterate on text here — a wording change costs seconds now and a render later. Continue only when the user is happy with angle, chapters and takes.

### 5. Scaffold + preview (5 min)

```bash
rsync -a --exclude node_modules --exclude content <skill>/assets/template/ <workdir>/project/   # keeps your content/
cd <workdir>/project && npm i
bash <skill>/scripts/fetch_fonts.sh <workdir>/project/public/fonts        # from the per-user cache; downloads once
python3 <skill>/scripts/make_sfx.py <workdir>/project
python3 <skill>/scripts/make_bgm.py <workdir>/project --energy <workdir>/out/storyboard.json
npx tsc -p .
npx remotion still Beat-<id> ../out/stills/<id>.png --frame=<F> --scale=0.5   # hook, one bench, one clip, take, summary, cta
#   <F> ≈ 45 % into the beat: round(seconds × 30 × 0.45) using `seconds` from out/storyboard.json — chapter cards last < 1 s, so a fixed --frame=60 would fall off the end
npx remotion render Main ../out/preview-main.mp4 --scale=0.25
```

Composition ids: `Main`, `Short`, `Cover`, `Beat-<id>`, `ShortBeat-<id>`. Scale must keep integer pixels (0.25 / 0.5). Stack the stills (`ffmpeg hstack`) and make a contact sheet of the preview; actually look: Chinese glyphs (boxes → `doctor.sh --fix-fonts`), caption wrapping, cards vs captions, focus rect on the right thing, bars inside the frame. Fix JSON, re-lint, re-still.

### 6. Voice (3 min, needs `SEED_AUDIO_KEY`)

```bash
python3 <skill>/scripts/tts_seed2.py <workdir>/project --sample "家人们，今天必须聊聊这个。" --out ../out/sample.mp3   # first time the user hears the voice
python3 <skill>/scripts/tts_seed2.py <workdir>/project                    # all beats → public/narration/<id>.mp3 + content/narration-durations.json
python3 <skill>/scripts/tts_seed2.py <workdir>/project --only hook,cta --force   # after editing a few lines
```

Hand the sample to the user before generating everything. Then re-run lint (now `L-DEAD-AIR` and `旁白太长` are measurable) and the storyboard; fix by shortening narration, moving `from/to`, or raising `rate`. Scenes stretch to the audio, so long narration = slow video.

### 7. Render (5–15 min per output; run detached per hosts.md)

Launch pages drift within hours: re-run step 1's fetch and `check_numbers.mjs` first, and update `fetchedAt`.

```bash
cd <workdir>/project
npx remotion render Main  ../out/<slug>-raw.mp4       --codec=h264 --crf=18 --log=info
npx remotion render Short ../out/<slug>-short-raw.mp4 --codec=h264 --crf=18 --log=info
bash <skill>/scripts/master_audio.sh ../out/<slug>-raw.mp4 ../out/<slug>.mp4              # −15 LUFS, two-pass
bash <skill>/scripts/master_audio.sh ../out/<slug>-short-raw.mp4 ../out/<slug>-short.mp4
ffprobe -v error -show_entries stream=codec_type,width,height -show_entries format=duration -of csv=p=0 ../out/<slug>.mp4
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 ../out/<slug>.mp4); ffmpeg -y -i ../out/<slug>.mp4 -vf "fps=18/$d,scale=300:-1,tile=6x3" -frames:v 1 ../out/sheet.jpg
```

Look at the sheet (start, chapter cards, a bench, a clip with focus, the turn, summary, cta), then hand both mp4s to the user.

### 8. Publish pack (3 min)

```bash
python3 <skill>/scripts/media_provider.py --provider grok-cli cover --project <workdir>/project --prompt "…"   # if not done in step 3
cd <workdir>/project && npx remotion still Cover ../out/cover.png
```

Write `out/publish.md`: 3 title candidates (≤ 20 chars, each with a number and a conflict — "综合分排第四，它到底强在哪"), a pinned first comment (source link + one take), 8–12 hashtags. Write `out/report.md`: fetch time, unreachable media, silent clips, takes with their sources, generated shots used (id + prompt), numbers not in the article (should be none), anything assumed. Deliver per hosts.md.

## Template mode vs director mode (`brief.mode`)

`template` (default, any model): fill JSON slots; the theme decides transitions, SFX, BGM kit and hot-word style; lint is the gate. `director` (strong models, or when the user asks for a distinct look): additionally set per-beat `transition` / `sfx`, propose B-roll and concept-shot prompts, add hook and take variants for the user to pick, choose theme and fonts. Locked in both modes: scene code, canvas sizes, safe areas, honesty rules, the lint.

## Iterating with the user

Users react to voice first, then pacing, then structure, then numbers. Expect 2–3 rounds: voice (send samples, not renders) → pacing (storyboard metrics, preview at 0.25) → angle/chapters → details. Each HD render costs 5–15 minutes, so batch fixes: collect everything you can verify with lint, stills and samples before rendering again. Keep `out/<slug>-v1.mp4` when re-rendering so the user can compare. If the page changed, fix the numbers, re-TTS only the affected beats (`--only … --force`), re-render.

## References

- [references/briefs.md](references/briefs.md) — content types, duration tiers, platforms, short-cut selection
- [references/content-guide.md](references/content-guide.md) — story skeleton, rhythm, captions, cards, bench duels, narration, insight questions, facts vs takes, phrasebanks, lint
- [references/examples/](references/examples/) — good/bad hooks, narration, captions, takes · [references/example-gpt6/](references/example-gpt6/) — full worked example
- [references/media-generation.md](references/media-generation.md) — Grok Imagine cover / hook / plates / B-roll / badge · [references/themes.md](references/themes.md) · [references/voices.md](references/voices.md)
- [references/hosts.md](references/hosts.md) — per-host: files, long jobs, questions, media tools, keys · [references/troubleshooting.md](references/troubleshooting.md)
