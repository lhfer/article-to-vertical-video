# Hosts: Claude Code · Cursor · Codex · Gemini CLI · Grok Build

SKILL.md is host-agnostic: it says "hand the file to the user", "run detached", "ask the user". This table
says what that means on each host. `<skill>` = the directory containing SKILL.md. Scripts, schemas and the
Remotion template are identical everywhere; only the five verbs below differ.

| | Claude Code | Cursor | Codex | Gemini CLI | Grok Build |
|---|---|---|---|---|---|
| **Install dir** | `~/.claude/skills/<name>` | `~/.agents/skills` (also reads `~/.cursor/skills`, `.cursor/skills`, and `~/.claude/skills` for compatibility) | `~/.agents/skills` (project `.agents/skills` first) | `~/.agents/skills` or `~/.gemini/skills` | `~/.grok/skills`, `~/.agents/skills`, also `~/.claude/skills` |
| **Resolve `<skill>`** | `${CLAUDE_SKILL_DIR}` is substituted in SKILL.md | the path this SKILL.md was loaded from (no variable) | same | same | same — no path substitution of any kind |
| **Hand a file to the user** | `SendUserFile` when the tool exists (Remote Control / cloud sessions), else print the absolute path | print the absolute path; the user opens it from the editor | print the absolute path | print the absolute path | print the absolute path |
| **Run a > 10-minute render** | run detached and poll: `nohup npx remotion render … > ../out/render.log 2>&1 &`, then a wait loop (`until ! pgrep -f "remotion render Main" >/dev/null; do sleep 10; done; tail -c 300 ../out/render.log`) or the `Monitor` tool when available (timeout up to 3,600,000 ms) | `Shell` with a long `block_until_ms` (up to ~2 h), or start it with `block_until_ms: 0` and check with `AwaitShell` | run in the terminal with a trailing `&`, poll `pgrep -f "remotion render"` and `tail` the log | same as Codex | same as Codex |
| **Ask the user a question** | `AskUserQuestion` | plain question in chat, then stop the turn | `AskQuestion`-style tool when present, else plain question and stop | plain question and stop (Gemini also asks the user's consent when the skill activates) | `ask_user_question` |
| **Media generation** | `python3 <skill>/scripts/media_provider.py --provider grok-cli …` (wraps `grok -p` headless via `grok_media.py`) | same | same | same | call the built-in `image_gen` / `image_edit` / `image_to_video` / `reference_to_video` tools directly, then register each output: `python3 <skill>/scripts/media_provider.py ingest --project <workdir>/project --id <id> --in <file> [--kind image\|video]` |
| **Fetching pages** | `fetch_page.py` (curl_cffi) — the built-in `WebFetch` gets 403 on Cloudflare sites | `fetch_page.py` | `fetch_page.py` | `fetch_page.py` | `fetch_page.py`. grok's `web_fetch` is **off by default** (`GROK_WEB_FETCH=1` + allow-list) — never rely on it |
| **TTS key** | `SEED_AUDIO_KEY` from the environment; keep a `config.env` next to the workdir (see `config.example.env`) and load it with `set -a; source config.env; set +a` before `tts_seed2.py` | same | same | same | same |

## Host quirks worth knowing

- **Claude Code**: `SendUserFile` has a 30 MiB remote limit; a 60–150 MB mp4 is desktop-only — say it once,
  do not apologize twice. A foreground `Bash` call dies at 10 minutes; a 3–5 minute video renders in
  8–15 minutes on an M-series Mac, so always detach. `${CLAUDE_SKILL_DIR}` only exists in SKILL.md text, not
  inside scripts — scripts locate the skill root from their own path.
- **Cursor**: agents inherit the user's shell, so `uv`, `ffmpeg`, `node` on PATH work as in a terminal.
  Cursor Cloud Agents only see **project** skills (`.cursor/skills`, `.agents/skills` in the repo), not
  `~/.agents/skills`; copy or symlink the skill into the repo for cloud runs. No file-sending tool: print the
  absolute path and, for stills, embed them with `![alt](/abs/path.png)` in chat.
- **Codex**: reads `.agents/skills` → `~/.agents/skills`; an optional `agents/openai.yaml` next to
  SKILL.md can declare UI hints and whether implicit triggering is allowed. Long jobs: background `&` +
  poll; Codex may prompt for approval on each shell command in restricted modes — batch commands with `&&`.
- **Gemini CLI**: asks the user's consent when a skill activates (expected, not an error). Reads
  `~/.gemini/skills` and `~/.agents/skills`.
- **Grok Build**: media tools (`image_gen`, `image_edit`, `image_to_video`, `reference_to_video`) need a
  SuperGrok subscription and are unavailable in ZDR (zero-data-retention) mode; `image_to_video` is 6 or
  10 s at 480p/720p; outputs land in the session's `images/N.jpg` / `videos/N.mp4` and carry an audio track
  (`media_provider.py ingest` strips it and makes the `.bg.mp4` twin). Ignores `compatibility` and
  `license` front-matter fields (harmless). Headless `grok -p --tools image_edit|image_to_video` working is a
  local calibration, not a documented promise — if it stops, fall back to the built-in tools in an
  interactive session.
- **Every host**: never write `/Users/<name>/…` paths into content or scripts; the only user-specific
  inputs are `<workdir>`, `SEED_AUDIO_KEY` and, optionally, `XAI_API_KEY` (only for `--provider grok-rest`).

## Install (all hosts at once)

Keep one source directory and symlink it into the two locations the hosts read:

```bash
SRC=/path/to/article-to-vertical-video
mkdir -p ~/.claude/skills ~/.agents/skills
ln -sfn "$SRC" ~/.claude/skills/article-to-vertical-video
ln -sfn "$SRC" ~/.agents/skills/article-to-vertical-video
bash "$SRC/scripts/doctor.sh"
```

Then check `/skills` (or the host's equivalent) in each host and make sure the skill is listed once, not
twice (Cursor and Grok Build read both directories — remove the `~/.claude/skills` link on those machines if
you see duplicates).
