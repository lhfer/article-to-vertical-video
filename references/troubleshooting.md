# Troubleshooting and things learned the hard way

## Fetching
- openai.com: `curl` / host web-fetch tools 403, built-in browsers 500, `yt-dlp` 403. `uv run --with curl_cffi --with trafilatura python3 scripts/fetch_page.py` (Chrome impersonation) → 200. Do not spend turns on other fetch methods first. Video assets live in the Next.js `__next_f` payload as `//videos.ctfassets.net/...mp4` (plain curl downloads them). Vimeo `player.vimeo.com/video/<id>` embeds return 403 even impersonated with a Referer; stop after one try and list them in the report.
- Fallbacks: `--from-html <file>` when the user saved the page, `--from-text <file>` for pasted text (sets `brief.source.kind`). 微信公众号 pages: images are in `data-src`, video is an `mpvideo` iframe (not downloadable); 36kr/虎嗅 sometimes serve a login wall — ask for a saved HTML.
- Tables extracted from HTML come out one cell per line for some sections and glue footnote digits onto cells (`70.2% 3`, `28.4%16`); read them with the footnote list beside you. `check_numbers.mjs` catches the slips.
- `timeout` does not exist on macOS; use the scripts' own `--socket-timeout` / python timeouts.

## Page drift
- Launch pages get edited within hours of publication (OpenAI changed Terminal-Bench 57.7 → 57.9, FrontierMath competitor scores, the hallucination row and footnote numbering the same afternoon). Re-run `fetch_page.py` + `check_numbers.mjs` right before the final render, write the fetch time into `brief.source.fetchedAt` and the report. If numbers moved, fix `bench.json` and re-run only the affected TTS lines (`--only`).

## Media
- Demo clips from launch pages are usually silent (`hasAudio: false` in `clips.json`) → captions are authored from the article, not transcribed. Say so in the report.
- 4K and 100 fps sources decode slowly in Chrome; `download_media.sh` transcodes to ≤ 1600 px / 30 fps and writes the pre-blurred `NN.bg.mp4` twin (270 px) the template uses as background, so no scene decodes two full-size videos.
- If a clip does have speech: `ffmpeg -i in.mp4 -ar 16000 -ac 1 -c:a pcm_s16le a.wav && whisper-cli -m <ggml model> -l en -oj -ojf --prompt "<proper nouns>" -f a.wav -of out`, then translate and distribute each sentence's [start, end] across Chinese phrase chunks by character count. `whisper-cli` is optional (`doctor.sh` reports it).
- `propose_trims.py` ranks windows by scene changes + motion energy; still look at the contact sheet before accepting `from/to`, and keep the moment the result appears (`resultAt`).
- Generated videos (Grok Imagine) come **with an audio track**; `media_provider.py` strips it (`-an`) and transcodes like clips. If you ingest a file by hand, strip audio yourself or it will fight the narration.
- grok CLI limits: `image_to_video` is 6 or 10 s only, 480p or 720p, ~40 s per clip, ~20 s per image; no text-to-video headless; consistency across shots only via edit-chaining from one plate. 1080p or longer clips need `--provider grok-rest` (XAI_API_KEY, per-second billing).
- Remotion copies `public/` into its bundle without following symlinks; put real files (or hard links) in `public/clips/`, `public/gen/`, `public/fonts/`.

## Content / lint
- `旁白太长` (L-VO-LONG): the voice-over for a clip is longer than the footage can cover even at 0.75× → shorten the narration or widen `from/to`. L-DEAD-AIR is the opposite (footage outlasts the voice) → raise `rate`, narrow `from/to`, or add a sentence.
- Turn position outside 35–75 % in the storyboard → move the `role: "turn"` beat (the losing tables) to mid-video; a late turn is the v1 mistake.
- `check_numbers` MISS on a number that is about the video itself ("3 分钟讲清 3 件事") → write it in Chinese numerals (三分钟). Bare small integers are reported as "unchecked", not missing.
- `L-GLOSSARY` warns when the first mention of a table has no alias → add `alias` to the table in `bench.json` or say the glossary alias in that beat's narration.
- Template checksum mismatch in `doctor.sh` → someone edited `assets/template/src`. The model writes `content/*.json` only. Restore the template (`rsync` from the skill again) and put the change into JSON, or, if the template itself needs a fix, hand it to the maintainer (DESIGN.md).

## Remotion template
- Composition ids allow only `a-zA-Z0-9`, CJK and `-`; beat ids are `^[a-z0-9][a-z0-9-]*$` (no underscores) so `Beat-<id>` / `ShortBeat-<id>` are always valid.
- Preview scale must keep integer dimensions: use `--scale=0.25` or `--scale=0.5` (1080×1440 → 270×360 / 540×720; 1080×1920 → 270×480 / 540×960). `--scale=0.35` fails (1440 × 0.35 = 503.99…).
- Gradient text (`background-clip: text`) plus `filter: drop-shadow` plus `scale` renders as smeared blocks. The theme's `hotStyle()` avoids the combination; do not add drop-shadows to hot words in director mode.
- Video `objectFit` is a component prop on `@remotion/media` `<Video>`, not CSS (CSS object-fit renders as contain). Fixed in v2; if a background shows dark bands top/bottom, this regressed.
- The blurred background `<Video>` is `muted`; two audible decoders = audio twice.
- Render speed: ~11 fps at 1080×1440 on an M-series Mac with the v1 double-decoder; v2 with `.bg.mp4` twins renders 2–4× faster. Budget 5–15 minutes for a 3–5 minute video; run it detached (hosts.md). `--gl=angle` can help filter-heavy frames but has memory-leak risk on long renders; `OffthreadVideo` is not faster here.
- Stat count-up: `Number.isInteger(value)` decides integer formatting (not the animated number), so `40 分钟` never shows as `40.0`; the shown value is clamped at `value × 1.015` and at 100 for `%`.
- `narration-durations.json` must exist (`{}` until TTS has run) because `content.ts` imports it; missing ids mean "no voice for that beat" and the scene falls back to its base seconds.
- Fonts: `FontLoader` loads `public/fonts/*.ttf` via `@remotion/fonts`; PingFang SC is the macOS fallback. First still with Chinese text is the font check — boxes → `doctor.sh --fix-fonts`.
- Beat vs voice: bgm.wav mean ≈ −10 dB; at the theme base volume (0.18–0.22) it sits ≈ −23 dB under narration and ducks ×0.4 while a VO span is active. Raising the base above 0.3 buries the voice.
- Determinism: no `Math.random` / `Date` in scenes; particle seeds are functions of the scene index, so re-renders are frame-identical.

## Audio
- Loudness target **−15 LUFS** (true peak −1.5, LRA 7): `bash scripts/master_audio.sh in.mp4 out.mp4 [-15]` runs two-pass `loudnorm` on the rendered file. v1 output measured −19.4 LUFS and sounded quiet in feeds. Verify with `ffmpeg -i out.mp4 -af loudnorm=print_format=summary -f null -`.
- SFX are synthesized (`make_sfx.py`: whoosh / hit / riser / tick); no samples, no licensing. BGM is synthesized per energy curve (`make_bgm.py --energy out/storyboard.json`); regenerate after the storyboard changes.

## TTS
- Seed Audio 1.0 (`/api/v3/tts/create`, `X-Api-Key`) takes a `text_prompt` describing speaker + tone but does not validate `speaker` (a fake id returns 200), so you cannot lock a named voice with it.
- Seed-TTS 2.0 (`/api/v3/tts/unidirectional`, headers `X-Api-Key` + `X-Api-Resource-Id: seed-tts-2.0`) locks the voice by id and takes tone via `additions: {"context_texts": ["…"]}` (serialized JSON string). Response is NDJSON lines with base64 `data`; code 20000000 ends the stream. 1.0-era ids (`*_mars_bigtts`, `*_moon_bigtts`) fail with 55000000 "resource ID is mismatched".
- speech_rate: 0 ≈ 6.6 chars/s, 20 ≈ 8.0, 28 ≈ 8.4, 35 ≈ 10. Users called 0 "太慢", 35 "太快".
- `SEED_AUDIO_KEY` missing → the script exits with a hint; load `config.env` (`set -a; source …; set +a`). Never paste the key into chat or content files.
- Re-run with `--only id1,id2 --force` after editing a few lines; regenerating everything costs quota and can drift the voice.

## Platforms and delivery
- 视频号 (`wechat-3x4`): key content inside the central 6:7 (1080×1260); the template's platform tokens handle it, but check a still — top brand bar and bottom footer are the usual victims.
- 抖音 9:16: right column and bottom ~350 px are UI; the `Short` variant keeps captions above that.
- File size: `--crf=18` gives ~30 MB/min at 1080×1440; `--crf=20` or `-maxrate` brings a 5-minute video to 60–80 MB when an upload limit bites. Keep `out/<slug>-v1.mp4` etc. when re-rendering after feedback so the user can compare.
- How to hand the mp4/stills to the user and how to run the render detached differ per host: `references/hosts.md`.
