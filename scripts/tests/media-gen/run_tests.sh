#!/usr/bin/env bash
# Offline tests for scripts/media_provider.py + scripts/grok_media.py. No network, no grok calls:
#   --provider none plan mode for every command, --placeholder stand-ins (PNG dims, mp4 without audio, bg twin,
#   gen.json), ingest of a synthetic mp4 with an audio track, prompt hygiene, grok_media.py --help / doctor / --dry-run.
# Usage: scripts/tests/media-gen/run_tests.sh [-v]     (needs python3 + PIL, ffmpeg, ffprobe)
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$(cd "$HERE/../.." && pwd)"
MP="$SCRIPTS/media_provider.py"
GM="$SCRIPTS/grok_media.py"
VERBOSE="${1:-}"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/a2v-media-gen.XXXXXX")"
P="$TMP/project"
mkdir -p "$P/public"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0; FAILED=()

ok()   { PASS=$((PASS + 1)); [ -n "$VERBOSE" ] && echo "  ok   $1" || true; }
bad()  { FAIL=$((FAIL + 1)); FAILED+=("$1"); echo "  FAIL $1${2:+: $2}"; }
check() { # check <name> <command...>  → passes when the command exits 0
  local name="$1"; shift
  if "$@" >"$TMP/out" 2>"$TMP/err"; then ok "$name"; else bad "$name" "$(tail -c 300 "$TMP/err" | tr '\n' ' ')"; fi
}
check_fails() { # check_fails <name> <command...> → passes when the command exits non-zero
  local name="$1"; shift
  if "$@" >"$TMP/out" 2>"$TMP/err"; then bad "$name" "expected a non-zero exit"; else ok "$name"; fi
}
py() { python3 - "$@"; }
export -n XAI_API_KEY 2>/dev/null || true
unset XAI_API_KEY

for tool in python3 ffmpeg ffprobe; do
  command -v "$tool" >/dev/null || { echo "media-gen tests: missing $tool"; exit 2; }
done
python3 -c "import PIL" 2>/dev/null || { echo "media-gen tests: python3 needs PIL (pip install pillow)"; exit 2; }

echo "media-gen tests in $TMP"

# ---- grok_media.py: help, doctor (offline), dry-run ----------------------------------------------------------------
check "grok_media --help" python3 "$GM" --help
grep -q "image_gen" "$TMP/out" && ok "grok_media help mentions image_gen" || bad "grok_media help mentions image_gen"
python3 "$GM" doctor >"$TMP/out" 2>"$TMP/err"; rc=$?
if py "$TMP/out" <<'EOF'
import json, sys
d = json.load(open(sys.argv[1]))
assert "ok" in d and "auth" in d and "ffprobe" in d, d
EOF
then ok "grok_media doctor prints a JSON report (exit $rc)"; else bad "grok_media doctor prints a JSON report"; fi
if [ -x "$HOME/.grok/bin/grok" ] || command -v grok >/dev/null; then
  [ "$rc" -eq 0 ] && ok "grok_media doctor ok on a machine with grok" || bad "grok_media doctor ok on a machine with grok" "exit $rc"
fi
check "grok_media image --dry-run" python3 "$GM" image -o "$TMP/dry.png" --prompt "x" --aspect 3:4 --dry-run
py "$TMP/out" <<'EOF' && ok "dry-run names --tools image_gen and aspect_ratio" || bad "dry-run names --tools image_gen and aspect_ratio"
import json, sys
d = json.load(open(sys.argv[1]))
assert d["dryRun"] and d["tool"] == "image_gen" and d["args"]["aspect_ratio"] == "3:4"
i = d["cmd"].index("--tools"); assert d["cmd"][i + 1] == "image_gen"
assert "--max-turns" in d["cmd"] and "--verbatim" in d["cmd"]
EOF
check_fails "grok_media i2v rejects duration 7" python3 "$GM" i2v -o "$TMP/x.mp4" --image "$GM" --duration 7 --dry-run
check_fails "grok_media image rejects aspect auto" python3 "$GM" image -o "$TMP/x.png" --prompt "x" --aspect auto --dry-run

# ---- media_provider.py: --provider none plan mode for every command --------------------------------------------------
plan() { # plan <name> <expected steps> <args...>
  local name="$1" steps="$2"; shift 2
  if python3 "$MP" --provider none --json "$@" >"$TMP/out" 2>"$TMP/err" && py "$TMP/out" "$steps" <<'EOF'
import json, sys
d = json.load(open(sys.argv[1])); n = int(sys.argv[2])
assert d["ok"] and d["provider"] == "none", d
assert len(d["planned"]) == n, (len(d["planned"]), [p["step"] for p in d["planned"]])
assert not d["outputs"], d["outputs"]
EOF
  then ok "plan $name"; else bad "plan $name" "$(tail -c 300 "$TMP/err" "$TMP/out" | tr '\n' ' ')"; fi
}
plan "image"  1 image  --project "$P" --id x-one --prompt "a lamp on a desk" --aspect 1:1 --use concept
plan "video"  3 video  --project "$P" --id hook --prompt "a worker at midnight" --aspect 3:4
plan "cover"  1 cover  --project "$P" --prompt "a worker at midnight"
plan "plates" 6 plates --project "$P" --style "abstract flowing neon ribbons" --count 2
plan "broll"  3 broll  --project "$P" --id meaning-tax --prompt "paper forms turning into a checklist" --concept
plan "badge"  2 badge  --project "$P" --name "小李看AI" --prompt "friendly cat with headphones"
plan "list"   0 list   --project "$P"
[ ! -e "$P/public/gen" ] && ok "plan mode writes nothing" || bad "plan mode writes nothing" "$(ls "$P/public/gen")"
python3 "$MP" --provider none --json --theme paper cover --project "$P" --prompt "a worker" >"$TMP/out" 2>/dev/null
py "$TMP/out" <<'EOF' && ok "prompt = style block + subject + negatives" || bad "prompt = style block + subject + negatives"
import json, sys
d = json.load(open(sys.argv[1])); p = d["planned"][0]["prompt"]
assert p.startswith("Style: Warm cream paper"), p
assert "Subject: a worker." in p and p.endswith("no text, no numbers, no letters, no logos, no user interface, no charts, no watermark."), p
EOF
python3 "$MP" --provider none --json video --project "$P" --id m --from "$GM" --prompt "slow push-in" >"$TMP/out" 2>"$TMP/err" \
  && bad "--from must point at an image" || { grep -q "not an image" "$TMP/err" && ok "--from must point at an image" || bad "--from must point at an image" "no clean error"; }
check_fails "provider grok-rest is a stub without XAI_API_KEY" python3 "$MP" --provider grok-rest cover --project "$P" --prompt "a lamp"
check_fails "bad id rejected" python3 "$MP" --provider none image --project "$P" --id "Bad_ID" --prompt "a lamp"
check_fails "seconds must be 6 or 10" python3 "$MP" --provider none video --project "$P" --id v --prompt "a lamp" --seconds 8
check_fails "missing project dir" python3 "$MP" --provider none cover --project "$TMP/nope" --prompt "a lamp"

# ---- prompt hygiene ------------------------------------------------------------------------------------------------
check_fails "digits rejected" python3 "$MP" --provider none cover --project "$P" --prompt "3 workers at midnight"
check "digits pass with --allow-ui" python3 "$MP" --provider none --allow-ui cover --project "$P" --prompt "3 workers at midnight"
check_fails "界面 rejected" python3 "$MP" --provider none broll --project "$P" --id u --prompt "a glowing dashboard 界面"
check_fails "UI rejected" python3 "$MP" --provider none broll --project "$P" --id u --prompt "a clean UI mockup"
check_fails "图表 rejected in --style" python3 "$MP" --provider none plates --project "$P" --style "图表 background"
check "UI passes with --allow-ui" python3 "$MP" --provider none --allow-ui broll --project "$P" --id u --prompt "a clean UI mockup"
check "fullwidth digits rejected" bash -c "! python3 '$MP' --provider none cover --project '$P' --prompt '３个人'"

# ---- --placeholder: real files offline ----------------------------------------------------------------------------
check "placeholder cover" python3 "$MP" --provider none --placeholder --theme neon cover --project "$P" --prompt "a worker at midnight"
check "placeholder video --from cover" python3 "$MP" --provider none --placeholder video --project "$P" --id hook --from gen/cover.png --seconds 6 --resolution 720p --aspect 3:4 --prompt "slow push-in"
check "placeholder badge" python3 "$MP" --provider none --placeholder badge --project "$P" --name "小李看AI" --prompt "friendly cat with headphones"
check "placeholder broll 9:16 10s" python3 "$MP" --provider none --placeholder --theme editorial broll --project "$P" --id meaning-tax --prompt "paper forms turning into a checklist" --aspect 9:16 --seconds 10
check "placeholder keeps existing without --force" python3 "$MP" --provider none --placeholder cover --project "$P" --prompt "something else"
grep -q "keeping it" "$TMP/err" && ok "existing output is reused" || bad "existing output is reused"

# synthetic clip with an audio track → ingest must strip it
ffmpeg -v error -y -f lavfi -i "testsrc2=s=1920x1080:r=25:d=3" -f lavfi -i "sine=frequency=440:d=3" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$TMP/hand.mp4" || bad "ffmpeg synthetic clip"
check "ingest synthetic mp4" python3 "$MP" ingest --project "$P" --id hand-clip --in "$TMP/hand.mp4" --source grok-build --prompt "hand made"
python3 -c "from PIL import Image; Image.new('RGB', (640, 480), (200, 40, 40)).save('$TMP/hand.jpg')"
check "ingest jpg → png" python3 "$MP" ingest --project "$P" --id hand-still --in "$TMP/hand.jpg"

py "$P" <<'EOF' && ok "placeholder outputs verified (dims, no audio, bg twins, badge copy, gen.json)" || bad "placeholder outputs verified" "$(tail -c 400 "$TMP/err" 2>/dev/null | tr '\n' ' ')"
import json, subprocess, sys
from pathlib import Path
from PIL import Image
P = Path(sys.argv[1]); gen = P / "public" / "gen"

def probe(f):
    d = json.loads(subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(f)], capture_output=True, text=True).stdout)
    v = next(s for s in d["streams"] if s["codec_type"] == "video")
    return {"w": int(v["width"]), "h": int(v["height"]), "fps": v["r_frame_rate"], "codec": v["codec_name"], "pix": v["pix_fmt"],
            "audio": any(s["codec_type"] == "audio" for s in d["streams"]), "dur": float(d["format"]["duration"])}

def ratio(w, h, aw, ah): assert abs(w / h - aw / ah) < 0.02, (w, h, aw, ah)

with Image.open(gen / "cover.png") as im: ratio(im.width, im.height, 3, 4); assert im.width >= 800, im.size
with Image.open(gen / "badge.png") as im: assert im.width == im.height >= 512, im.size
with Image.open(P / "public" / "badge.png") as im: assert im.size == (512, 512), im.size
with Image.open(gen / "meaning-tax.png") as im: ratio(im.width, im.height, 9, 16)
with Image.open(gen / "hand-still.png") as im: assert im.size == (640, 480)
for name, secs in (("hook", 6), ("meaning-tax", 10), ("hand-clip", 3)):
    main, bg = gen / f"{name}.mp4", gen / f"{name}.bg.mp4"
    assert main.is_file() and bg.is_file(), name
    m, b = probe(main), probe(bg)
    assert not m["audio"] and not b["audio"], (name, "audio track survived")
    assert m["codec"] == "h264" and m["pix"] == "yuv420p" and m["fps"] == "30/1", m
    assert abs(m["dur"] - secs) < 0.3, (name, m["dur"])
    assert b["w"] == 270 and b["fps"] == "30/1", b
    assert m["w"] <= 1600, m
ratio(probe(gen / "hook.mp4")["w"], probe(gen / "hook.mp4")["h"], 3, 4)
entries = json.loads((gen / "gen.json").read_text())
assert isinstance(entries, list)
keys = {(e["id"], e["kind"]) for e in entries}
for want in [("cover", "image"), ("hook", "video"), ("badge", "image"), ("meaning-tax", "image"), ("meaning-tax", "video"), ("hand-clip", "video"), ("hand-still", "image")]:
    assert want in keys, (want, keys)
for e in entries:
    for k in ("id", "kind", "file", "w", "h", "prompt", "provider", "createdAt"):
        assert k in e, (e["id"], k)
    assert (P / "public" / e["file"]).is_file(), e["file"]
    if e["kind"] == "video":
        assert e["seconds"] > 0 and e["bg"] == f"gen/{e['id']}.bg.mp4", e
    assert e["file"].startswith("gen/"), e["file"]
assert next(e for e in entries if e["id"] == "hook")["from"] == "gen/cover.png"
assert next(e for e in entries if e["id"] == "hand-clip")["provider"] == "grok-build"
assert next(e for e in entries if e["id"] == "badge")["account"] == "小李看AI"
assert len(keys) == len(entries), "duplicate id/kind in gen.json"
EOF

check "list --json" python3 "$MP" --json list --project "$P"
py "$TMP/out" <<'EOF' && ok "list returns every entry" || bad "list returns every entry"
import json, sys
d = json.load(open(sys.argv[1])); assert d["ok"] and len(d["outputs"]) >= 7, len(d["outputs"])
EOF

# ---- summary -------------------------------------------------------------------------------------------------------
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo "media-gen tests: $PASS/$TOTAL passed"
  exit 0
fi
echo "media-gen tests: $FAIL/$TOTAL FAILED — ${FAILED[*]}"
exit 1
