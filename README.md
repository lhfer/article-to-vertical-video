# article-to-vertical-video

An Agent Skill that turns any article (URL, saved HTML or pasted text) into a Chinese vertical explainer
video with Remotion: a 3:4 long master (1080×1440, 小红书 / 视频号) and a 9:16 short cut (1080×1920,
抖音 / 小红书) from one content set — animated captions, stat cards, benchmark duels, the page's own demo
clips, Grok-generated cover / B-roll where the page has no media, a synthesized beat, and a Seed-TTS 2.0
voice-over. Facts on screen come only from the article; opinions are marked as 观点 and sourced.

The agent reads `SKILL.md` and writes `project/content/*.json`; the scripts and the locked Remotion template
do the rest.

## Install

Keep this directory as the source of truth and symlink it into the skill folders your hosts read:

```bash
SRC="$(pwd)"                                              # this directory
mkdir -p ~/.claude/skills ~/.agents/skills
ln -sfn "$SRC" ~/.claude/skills/article-to-vertical-video   # Claude Code
ln -sfn "$SRC" ~/.agents/skills/article-to-vertical-video   # Cursor, Codex, Gemini CLI, Copilot, Grok Build
bash scripts/doctor.sh --fix-fonts                          # prerequisites, template checksum, fonts
```

`doctor.sh` needs node ≥ 20, npm, ffmpeg/ffprobe, python3 (uv preferred, for curl_cffi + trafilatura);
optional: whisper-cli, grok CLI (Grok Heavy) for generated visuals, `SEED_AUDIO_KEY` for the voice
(`config.example.env`). Per-host details (Cursor Cloud, Gemini consent, Grok Build tools): `references/hosts.md`.

## The 9 steps

| # | step | command(s) | output |
|---|---|---|---|
| 0 | Brief | `bash scripts/doctor.sh`; write `project/content/brief.json` | type, length, platform, persona, theme |
| 1 | Fetch | `uv run --with curl_cffi --with trafilatura python3 scripts/fetch_page.py <url> assets` (`--from-html` / `--from-text`) | `article.md`, `media.json` |
| 2 | Media | `download_media.sh`, `contact_sheet.sh`, `propose_trims.py` | `clips/NN.mp4` + `.bg.mp4`, `images/`, `frames/`, `trims.json` |
| 3 | Insight + script | write `script.json` `bench.json` `sources.json`; `lint_content.mjs`; `check_numbers.mjs`; `media_provider.py` for allowed generated shots | lint-clean content |
| 4 | Storyboard | `storyboard.py project --out out/storyboard.md --json out/storyboard.json` | user review before audio |
| 5 | Scaffold + preview | `rsync` template, `npm i`, `fetch_fonts.sh`, `make_sfx.py`, `make_bgm.py --energy`, `tsc`, `remotion still`, `render --scale=0.25` | stills, `preview-main.mp4` |
| 6 | Voice | `tts_seed2.py --sample` then full; re-lint, re-storyboard | `narration/*.mp3`, `narration-durations.json` |
| 7 | Render | `remotion render Main` / `Short` `--codec=h264 --crf=18`; `master_audio.sh` | `<slug>.mp4`, `<slug>-short.mp4` |
| 8 | Publish pack | `media_provider.py cover`, `remotion still Cover` | `cover.png`, `publish.md`, `report.md` |

## Layout

`SKILL.md` (workflow, < 250 lines) · `schemas/` (content contract) · `scripts/` (all take `--help`) ·
`assets/template/` (Remotion project, copied per video; the model never edits `src/`) · `references/`
(briefs, content guide, hosts, themes, voices, troubleshooting, media generation, glossary, banned words,
examples, the GPT-6 worked example) · `evals/` (5 evals + fixtures).

Maintainer notes and the contract every part agrees on: `DESIGN.md`.

## Tests

```bash
for t in scripts/tests/*/run_tests.sh; do bash "$t"; done      # unit tests per script group
bash scripts/tests/e2e.sh /tmp/a2v-e2e                          # example → lint → storyboard → template → stills → low-res Main + Short
SKIP_RENDER=1 bash scripts/tests/e2e.sh /tmp/a2v-e2e            # stop after the stills
node scripts/lint_content.mjs references/example-gpt6            # the worked example must stay lint-clean
node scripts/check_numbers.mjs references/example-gpt6 references/example-gpt6/article.md
```
