#!/usr/bin/env bash
# End-to-end acceptance for the skill (DESIGN.md §6):
#   example content → lint → check_numbers (when an article is available) → storyboard → scaffold template
#   → real or synthetic media for every referenced clip/image → fonts (from cache) → sfx + bgm → tsc
#   → stills per beat kind (Main + Short) + Cover → low-res Main and Short renders → contact sheets.
# Usage: e2e.sh [workdir] [example_dir]
#   ARTICLE=/path/article.md   optional; default <example_dir>/article.md when present → enables check_numbers
#   CLIPS_DIR=/path/clips      optional; real NN.mp4 (+ NN.bg.mp4) copied into project/public/clips first
#   FONTS_DIR=/path/fonts      optional; default ~/.cache/article-to-vertical-video/fonts → copied to public/fonts
#   NODE_MODULES_FROM=/path    optional; a node_modules dir to copy instead of running npm i
#   SKIP_RENDER=1              stop after the stills
set -euo pipefail
SK="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
W="${1:-/tmp/a2v-e2e}"
EX="${2:-$SK/references/example-gpt6}"
ARTICLE="${ARTICLE:-}"; [ -z "$ARTICLE" ] && [ -f "$EX/article.md" ] && ARTICLE="$EX/article.md"
FONTS_DIR="${FONTS_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/article-to-vertical-video/fonts}"
T0=$(date +%s)
say() { printf '\n\033[1;36m== %s\033[0m (%ss)\n' "$*" "$(( $(date +%s) - T0 ))"; }

say "workdir $W · example $EX · article ${ARTICLE:-none}"
[ -d "$EX/content" ] || { echo "example content dir missing: $EX/content" >&2; exit 1; }
mkdir -p "$W/out/stills" "$W/assets"

# keep node_modules across runs; wipe everything else in project/
if [ -d "$W/project/node_modules" ]; then mv "$W/project/node_modules" "$W/.node_modules_keep"; fi
rm -rf "$W/project"; mkdir -p "$W/project"
rsync -a --exclude node_modules --exclude content "$SK/assets/template/" "$W/project/"
cp -R "$EX/content" "$W/project/content"
[ -f "$W/project/content/narration-durations.json" ] || echo '{}' > "$W/project/content/narration-durations.json"
mkdir -p "$W/project/public/clips" "$W/project/public/images" "$W/project/public/narration" "$W/project/public/sfx" "$W/project/public/gen" "$W/project/public/fonts"
if [ -d "$W/.node_modules_keep" ]; then mv "$W/.node_modules_keep" "$W/project/node_modules"
elif [ -n "${NODE_MODULES_FROM:-}" ] && [ -d "$NODE_MODULES_FROM" ]; then say "copy node_modules from $NODE_MODULES_FROM"; cp -R "$NODE_MODULES_FROM" "$W/project/node_modules"; fi

if [ -n "${CLIPS_DIR:-}" ] && [ -d "$CLIPS_DIR" ]; then
  say "real clips from $CLIPS_DIR"
  cp "$CLIPS_DIR"/*.mp4 "$W/project/public/clips/"
  ls "$W/project/public/clips" | tr '\n' ' '; echo
fi
if [ -d "$FONTS_DIR" ] && ls "$FONTS_DIR"/*.ttf >/dev/null 2>&1; then
  say "fonts from $FONTS_DIR"
  for f in "$FONTS_DIR"/*.ttf; do case "$(basename "$f")" in *-VF.ttf) ;; *) cp "$f" "$W/project/public/fonts/" ;; esac; done
  ls "$W/project/public/fonts" | tr '\n' ' '; echo
else
  echo "no fonts in $FONTS_DIR (system fallback stack will be used; run scripts/fetch_fonts.sh to populate the cache)"
fi

say "synthetic media for every src referenced by script.json that is still missing"
python3 - "$W/project" <<'PY'
import json, pathlib, subprocess, sys
proj = pathlib.Path(sys.argv[1]); pub = proj / "public"
script = json.load(open(proj / "content/script.json", encoding="utf8"))
def bgtwin(dst):
    bg = dst.with_name(dst.stem + ".bg.mp4")
    if not bg.exists():
        subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", str(dst), "-vf", "scale=270:-2,gblur=sigma=14,eq=brightness=-0.3:saturation=1.4,fps=30", "-an", "-c:v", "libx264", "-crf", "28", "-pix_fmt", "yuv420p", str(bg)])
def clip(src, w, h, seconds):
    dst = pub / src
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists():
        subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=size={w}x{h}:rate=30", "-t", str(seconds), "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "veryfast", str(dst)])
        print("  synthetic clip", src)
    bgtwin(dst)
def image(src, w, h):
    dst = pub / src
    if dst.exists(): return
    dst.parent.mkdir(parents=True, exist_ok=True)
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc=size={w}x{h}:rate=1", "-frames:v", "1", str(dst)])
    print("  synthetic image", src)
for b in script["beats"]:
    k = b["kind"]; p = b.get(k) or {}
    if k == "clip":
        clip(p["src"], p["w"], p["h"], max(float(p["to"]) + 2, 12))
    elif k in ("image", "screenshot"):
        image(p["src"], p["w"], p["h"])
    elif k == "broll":
        clip(p["src"], p["w"], p["h"], 8)
    elif k == "hook":
        v = p.get("visual", {})
        if v.get("kind") in ("broll", "clip") and v.get("src"): clip(v["src"], v.get("w", 1600), v.get("h", 900), max(float(v.get("to", 6)) + 2, 8))
        if v.get("kind") == "image" and v.get("src"): image(v["src"], v.get("w", 1080), v.get("h", 1440))
print("media ready:", len(list(pub.glob("clips/*.mp4"))), "clips,", len(list(pub.glob("images/*"))), "images,", len(list(pub.glob("gen/*"))), "gen")
PY

say "doctor (informational)"
bash "$SK/scripts/doctor.sh" || true

say "lint"
node "$SK/scripts/lint_content.mjs" "$W/project"

if [ -n "$ARTICLE" ] && [ -f "$ARTICLE" ]; then
  say "check_numbers"
  node "$SK/scripts/check_numbers.mjs" "$W/project" "$ARTICLE"
else
  say "check_numbers skipped (set ARTICLE=/path/article.md)"
fi

say "storyboard"
python3 "$SK/scripts/storyboard.py" "$W/project" --out "$W/out/storyboard.md" --json "$W/out/storyboard.json"
head -30 "$W/out/storyboard.md"

say "npm + sfx + bgm + tsc"
cd "$W/project"
if [ ! -d node_modules ]; then npm i --silent --no-audit --no-fund; fi
python3 "$SK/scripts/make_sfx.py" "$W/project"
python3 "$SK/scripts/make_bgm.py" "$W/project" --energy "$W/out/storyboard.json"
npx tsc -p .

say "stills (first beat of each kind, Main + Short, frame ≈ 45 % into the beat) + Cover"
python3 - "$W/project" "$W/out/storyboard.json" > "$W/out/stills/plan.txt" <<'PY'
import json, sys
s = json.load(open(sys.argv[1] + "/content/script.json", encoding="utf8"))
sb = json.load(open(sys.argv[2], encoding="utf8"))
secs = {b["id"]: float(b.get("seconds") or 4) for b in sb.get("beats", [])}
seen = {}
short = {b["id"] for b in s["beats"] if b.get("short") is True}
for b in s["beats"]:
    seen.setdefault(b["kind"], b["id"])
for bid in seen.values():
    frame = max(2, int(secs.get(bid, 4) * 30 * 0.45))
    print(bid, frame, "short" if bid in short else "-")
PY
while read -r id frame inshort; do
  npx remotion still "Beat-$id" "$W/out/stills/$id.png" --frame="$frame" --scale=0.5 --log=error
  if [ "$inshort" = "short" ]; then
    npx remotion still "ShortBeat-$id" "$W/out/stills/short-$id.png" --frame="$frame" --scale=0.5 --log=error
  fi
done < "$W/out/stills/plan.txt"
npx remotion still Cover "$W/out/stills/cover.png" --scale=0.5 --log=error
ls "$W/out/stills"
# 4-up sheets for a quick look
python3 - "$W/out/stills" <<'PY'
import pathlib, subprocess, sys
d = pathlib.Path(sys.argv[1])
for prefix, files in (("main", sorted(p for p in d.glob("*.png") if not p.name.startswith(("sheet", "short-")))),
                      ("short", sorted(d.glob("short-*.png")))):
    for i in range(0, len(files), 4):
        chunk = files[i:i+4]
        args = ["ffmpeg", "-v", "error", "-y"]
        for f in chunk: args += ["-i", str(f)]
        fc = "".join(f"[{j}]" for j in range(len(chunk))) + f"hstack={len(chunk)}" if len(chunk) > 1 else "null"
        args += ["-filter_complex", fc, str(d / f"sheet-{prefix}-{i//4+1}.png")]
        subprocess.check_call(args)
print("sheets:", sorted(p.name for p in d.glob("sheet-*.png")))
PY

if [ "${SKIP_RENDER:-0}" = "1" ]; then say "SKIP_RENDER=1 → done → $W/out"; exit 0; fi

say "low-res renders"
npx remotion render Main "$W/out/preview-main.mp4" --scale=0.25 --log=error
npx remotion render Short "$W/out/preview-short.mp4" --scale=0.25 --log=error
for f in preview-main preview-short; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$W/out/$f.mp4")
  echo "$f: ${d}s"
  ffmpeg -v error -y -i "$W/out/$f.mp4" -vf "fps=24/$d,scale=180:-1,tile=8x3" -frames:v 1 "$W/out/$f-sheet.jpg"
done
say "done → $W/out"
