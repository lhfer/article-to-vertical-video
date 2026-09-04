#!/usr/bin/env bash
# run_tests.sh — self-test for the media scripts (B2): fetch_page, download_media, contact_sheet, propose_trims,
# make_sfx, make_bgm, master_audio, tts_seed2 (--dry-run), template_checksums, doctor, fetch_fonts (cache check).
#
# Usage: scripts/tests/media/run_tests.sh [--keep] [--help]
#   Builds a temp workdir with synthetic media (ffmpeg testsrc2 / lavfi), runs every script through it and
#   asserts on the outputs. Needs ffmpeg/ffprobe/python3; uses `uv run --with curl_cffi --with trafilatura`
#   for fetch_page.py when uv is present (plain python3 otherwise). Shell scripts run under /bin/bash (3.2 on
#   macOS) when it exists, so the bash-3.2 quirks stay covered.
#   The one network test (https://openai.com/index/gpt-6-astra/) only WARNS when the network is unavailable;
#   SKIP_NETWORK=1 skips it. Never calls the TTS API (no SEED_AUDIO_KEY needed).
#   --keep   keep the temp workdir (path printed at the end)
set -uo pipefail

usage() { sed -n '2,/^set -uo/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'; }
KEEP=0
for a in "$@"; do case "$a" in -h|--help) usage; exit 0 ;; --keep) KEEP=1 ;; *) echo "unknown argument: $a" >&2; exit 2 ;; esac; done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SK="$(cd "${HERE}/../../.." && pwd)"
S="${SK}/scripts"
FX="${HERE}/fixtures"
BASH_BIN="bash"; [ -x /bin/bash ] && BASH_BIN="/bin/bash"
if command -v uv >/dev/null 2>&1; then PYF=(uv run --quiet --with curl_cffi --with trafilatura python3); else PYF=(python3); fi
W="$(mktemp -d "${TMPDIR:-/tmp}/a2v-media-tests.XXXXXX")"
LOG="${W}/log"; mkdir -p "${LOG}"
PASS=0; FAIL=0; WARN=0; FAILED=""
ok()   { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); FAILED="${FAILED} $1"; printf 'FAIL  %s%s\n' "$1" "${2:+ — $2}"; }
warn() { WARN=$((WARN+1)); printf 'WARN  %s%s\n' "$1" "${2:+ — $2}"; }
check() {  # check <name> <python expression using pathlib/json, must be truthy>  (W is available as env)
  if W="$W" python3 -c "import json, pathlib, os, sys; W = pathlib.Path(os.environ['W']); sys.exit(0 if ($2) else 1)" 2>"${LOG}/check.err"; then ok "$1"; else bad "$1" "$(tail -1 "${LOG}/check.err" 2>/dev/null)"; fi
}
run() {  # run <log name> <cmd…> → exit status, output in log
  local name="$1"; shift
  "$@" >"${LOG}/${name}.out" 2>"${LOG}/${name}.err"
}

for t in ffmpeg ffprobe python3; do command -v "$t" >/dev/null 2>&1 || { echo "FAIL: $t missing" >&2; exit 1; }; done
echo "workdir ${W}"

# ------------------------------------------------------------------ fetch_page.py: fixture html
if run fetch_html "${PYF[@]}" "${S}/fetch_page.py" --from-html "${FX}/page.html" "${W}/fetch" --json; then
  check "fetch_page --from-html: media counts (7 images / 6 mp4 / 3 embeds)" \
    "(lambda m: sum(x['kind']=='image' for x in m)==7 and sum(x['kind']=='mp4' for x in m)==6 and sum(x['kind']=='embed' for x in m)==3)(json.load(open(W/'fetch/media.json')))"
  check "fetch_page --from-html: srcset largest / picture / data-src / mmbiz / og:image / payload resolved" \
    "(lambda u: 'https://example.com/img/chart-1600.jpg' in u and 'https://example.com/img/picture-2000.webp' in u and 'https://cdn.example.com/img/lazy.png' in u and 'https://mmbiz.qpic.cn/mmbiz_jpg/AbCdEf123/640?wx_fmt=jpeg' in u and 'https://cdn.example.com/share/og.png' in u and 'https://videos.ctfassets.net/kftzwdyauwt9/abc123/def456/fixture-demo.mp4' in u and not any('header-banner' in x or 'nav-logo' in x or 'footer-logo' in x or 'pixel.gif' in x or 'logo.svg' in x for x in u))([x['url'] for x in json.load(open(W/'fetch/media.json'))])"
  check "fetch_page --from-html: order is 0..n-1 in page order, mpvideo iframe → embed with w/h" \
    "(lambda m: [x['order'] for x in m]==list(range(len(m))) and any(x['kind']=='embed' and 'mpvideo' in x['url'] and x['w']==1920 for x in m))(json.load(open(W/'fetch/media.json')))"
  check "fetch_page --from-html: article.md starts with '# title' and keeps the table numbers" \
    "(lambda t: t.startswith('# Fixture Launch Page') and '72.6%' in t and 'Terminal-Bench 2.0' in t and len(t) > 800)((W/'fetch/article.md').read_text())"
  check "fetch_page --from-html: --json summary" \
    "(lambda j: j['ok'] and j['images']==7 and j['mp4s']==6 and j['embeds']==3 and j['source']['kind']=='html' and j['source']['title']=='Fixture Launch Page')(json.load(open(W/'log/fetch_html.out')))"
else bad "fetch_page --from-html" "$(tail -2 "${LOG}/fetch_html.err")"; fi

# ------------------------------------------------------------------ fetch_page.py: --from-text
printf 'GPT-6 Astra 发布了\n\n第一段正文。\n第二段正文，含数字 72.6%%。\n' > "${W}/notes.txt"
if run fetch_text python3 "${S}/fetch_page.py" --from-text "${W}/notes.txt" "${W}/fetch_text" --json; then
  check "fetch_page --from-text: '# ' title prefixed, body verbatim, empty media.json" \
    "(W/'fetch_text/article.md').read_text().startswith('# GPT-6 Astra 发布了\n\n第一段正文。') and json.load(open(W/'fetch_text/media.json'))==[]"
else bad "fetch_page --from-text" "$(tail -2 "${LOG}/fetch_text.err")"; fi
if python3 "${S}/fetch_page.py" >/dev/null 2>&1; then bad "fetch_page: no args must exit non-zero"; else ok "fetch_page: no args exits non-zero; --help works: $(python3 "${S}/fetch_page.py" --help | head -1 | cut -c1-40)…"; fi

# ------------------------------------------------------------------ fetch_page.py: real network (warn-only)
if [ "${SKIP_NETWORK:-0}" = 1 ]; then warn "fetch_page network test skipped (SKIP_NETWORK=1)"
elif run fetch_net "${PYF[@]}" "${S}/fetch_page.py" "https://openai.com/index/gpt-6-astra/" "${W}/net" --json; then
  if W="$W" python3 -c "import json,os; j=json.load(open(os.environ['W']+'/log/fetch_net.out')); import sys; sys.exit(0 if j['status']==200 and j['mp4s']>=10 else 1)"; then
    ok "fetch_page live: openai.com/index/gpt-6-astra/ → HTTP 200, $(python3 -c "import json; j=json.load(open('${W}/log/fetch_net.out')); print(j['mp4s'],'mp4s,',j['images'],'images,',j['embeds'],'embeds,',j['chars'],'chars')")"
  else warn "fetch_page live: fetched but unexpected counts" "$(head -c 200 "${LOG}/fetch_net.out")"; fi
else warn "fetch_page live fetch failed (network / Cloudflare?) — not counted as a failure" "$(tail -1 "${LOG}/fetch_net.err" | cut -c1-120)"; fi

# ------------------------------------------------------------------ synthetic media → download_media.sh
mkdir -p "${W}/assets/raw/img" "${W}/project/content"
ffmpeg -v error -y -f lavfi -i "testsrc2=size=1600x900:rate=30" -f lavfi -i "sine=frequency=440:sample_rate=48000" -t 20 \
  -pix_fmt yuv420p -c:v libx264 -preset veryfast -c:a aac -shortest "${W}/assets/raw/01.mp4"
ffmpeg -v error -y -f lavfi -i "testsrc=size=1200x800:rate=1" -frames:v 1 "${W}/img1200.png"
ffmpeg -v error -y -f lavfi -i "testsrc=size=300x200:rate=1" -frames:v 1 "${W}/small.png"
cp "${W}/img1200.png" "${W}/assets/raw/img/extra.png"      # hand-dropped image → next index
cat > "${W}/assets/media.json" <<EOF
[{"kind":"mp4","url":"https://example.invalid/clip1.mp4","title":"Clip one","alt":"demo","size":0,"w":0,"h":0,"order":0},
 {"kind":"image","url":"file://${W}/img1200.png","title":"Image one","alt":"An image","size":0,"w":1200,"h":800,"order":1},
 {"kind":"image","url":"file://${W}/small.png","title":"Small","alt":"","size":0,"w":300,"h":200,"order":2},
 {"kind":"embed","url":"https://player.vimeo.com/video/1","title":"","alt":"","size":0,"w":0,"h":0,"order":3}]
EOF
if run download "${BASH_BIN}" "${S}/download_media.sh" "${W}"; then
  check "download_media: clips.json (01 = pre-placed raw, 1600x900, 20 s, hasAudio, bg twin)" \
    "(lambda c: len(c)==1 and c[0]['index']==1 and c[0]['src']=='clips/01.mp4' and c[0]['bg']=='clips/01.bg.mp4' and c[0]['w']==1600 and c[0]['h']==900 and c[0]['hasAudio'] and 19.5 < c[0]['duration'] < 20.5 and c[0]['sourceUrl'].endswith('clip1.mp4'))(json.load(open(W/'assets/clips.json')))"
  BGW="$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "${W}/project/public/clips/01.bg.mp4" 2>/dev/null)"
  if [ "${BGW}" = 270 ] && ! ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${W}/project/public/clips/01.bg.mp4" | grep -q audio; then ok "download_media: 01.bg.mp4 is 270 px wide and silent"; else bad "download_media: bg twin" "width=${BGW}"; fi
  check "download_media: images.json (01 from file:// 1200x800, small 02 skipped, hand-dropped extra.png → 03)" \
    "(lambda i: [x['index'] for x in i]==[1,3] and i[0]['src']=='images/01.jpg' and i[0]['w']==1200 and i[0]['h']==800 and i[0]['alt']=='An image' and i[1]['sourceFile']=='extra.png' and (W/'project/public/images/01.jpg').exists() and (W/'project/public/images/03.jpg').exists() and not (W/'project/public/images/02.jpg').exists())(json.load(open(W/'assets/images.json')))"
  T0="$(date +%s)"; run download2 "${BASH_BIN}" "${S}/download_media.sh" "${W}"; T1="$(date +%s)"
  if [ $((T1 - T0)) -le 5 ] && grep -q "2 images" "${LOG}/download2.out"; then ok "download_media: idempotent second run ($((T1 - T0)) s, outputs reused)"; else bad "download_media: second run" "$(tail -1 "${LOG}/download2.out")"; fi
else bad "download_media.sh" "$(tail -3 "${LOG}/download.err")"; fi

# ------------------------------------------------------------------ contact_sheet.sh
if run sheet "${BASH_BIN}" "${S}/contact_sheet.sh" "${W}"; then
  check "contact_sheet: frames/01.jpg + all.jpg" "(W/'assets/frames/01.jpg').stat().st_size > 1000 and (W/'assets/frames/all.jpg').stat().st_size > 1000"
else bad "contact_sheet.sh" "$(tail -2 "${LOG}/sheet.err")"; fi

# ------------------------------------------------------------------ propose_trims.py
if run trims python3 "${S}/propose_trims.py" "${W}" --tier m; then
  check "propose_trims: trims.json['01'] has 3 windows with from<to, resultAt inside, score, Chinese reasons" \
    "(lambda t: len(t['01'])==3 and all(w['from'] < w['to'] and w['from'] >= 0.5 and w['from'] <= w['resultAt'] <= w['to'] and isinstance(w['score'], (int, float)) and w['reasons'] and any(ord(ch) > 0x4e00 for ch in w['reasons'][0]) for w in t['01']) and all(abs((w['to']-w['from']) - 12) < 0.01 for w in t['01']))(json.load(open(W/'assets/trims.json')))"
  grep -q "clip" "${LOG}/trims.out" && ok "propose_trims: prints a table" || bad "propose_trims: table output"
else bad "propose_trims.py" "$(tail -2 "${LOG}/trims.err")"; fi

# ------------------------------------------------------------------ make_sfx.py
if run sfx python3 "${S}/make_sfx.py" "${W}/project"; then
  SFX_OK=1
  for spec in whoosh:0.45 hit:0.35 riser:1.6 tick:0.08; do
    n="${spec%%:*}"; want="${spec##*:}"
    d="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${W}/project/public/sfx/${n}.wav" 2>/dev/null || echo 0)"
    python3 -c "import sys; d=float('${d}'); w=float('${want}'); sys.exit(0 if abs(d-w) <= 0.1*w else 1)" || { SFX_OK=0; bad "make_sfx: ${n}.wav duration ${d}s (want ${want} ± 10%)"; }
  done
  [ "${SFX_OK}" = 1 ] && ok "make_sfx: whoosh/hit/riser/tick.wav durations within ± 10%"
  PK="$(ffmpeg -v info -i "${W}/project/public/sfx/hit.wav" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-*[0-9.]*\) dB.*/\1/p')"
  python3 -c "import sys; sys.exit(0 if abs(float('${PK}') + 3.0) < 0.2 else 1)" && ok "make_sfx: peak −3 dBFS (hit.wav ${PK} dB)" || bad "make_sfx: peak" "hit.wav max_volume ${PK} dB"
else bad "make_sfx.py" "$(tail -2 "${LOG}/sfx.err")"; fi

# ------------------------------------------------------------------ make_bgm.py
if run bgm python3 "${S}/make_bgm.py" "${W}/project" --energy "${FX}/storyboard.json" --seconds 10; then
  D="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${W}/project/public/bgm.wav" 2>/dev/null || echo 0)"
  python3 -c "import sys; sys.exit(0 if float('${D}') >= 33.8 + 2 - 0.05 else 1)" && ok "make_bgm: bgm.wav ${D}s ≥ last beat end + 2 (35.8)" || bad "make_bgm: length" "${D}s"
  check "make_bgm: bgm.json has sections (pad for E≤2, groove+octave for E≥4) and risers ending at beat starts" \
    "(lambda j: j['kit']=='synth' and j['bpm']==128 and len(j['sections'])>=7 and any(s['mode']=='pad' and s['id']=='ch-1' for s in j['sections']) and any(s['mode']=='groove+octave' and s['id']=='bench-1' for s in j['sections']) and any(abs(r['end']-16.8) < 0.01 for r in j['risers']))(json.load(open(W/'project/public/bgm.json')))"
  PK="$(ffmpeg -v info -i "${W}/project/public/bgm.wav" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-*[0-9.]*\) dB.*/\1/p')"
  python3 -c "import sys; sys.exit(0 if abs(float('${PK}') + 6.0) < 0.3 else 1)" && ok "make_bgm: peak −6 dBFS (${PK} dB)" || bad "make_bgm: peak" "${PK} dB"
  if run bgm_lofi python3 "${S}/make_bgm.py" "${W}/project_lofi" --kit lofi --seconds 6 && run bgm_min python3 "${S}/make_bgm.py" "${W}/project_min" --kit minimal --seconds 6; then
    check "make_bgm: lofi (96 BPM) and minimal (110 BPM) kits render" "json.load(open(W/'project_lofi/public/bgm.json'))['bpm']==96 and json.load(open(W/'project_min/public/bgm.json'))['bpm']==110"
  else bad "make_bgm: kits" "$(tail -1 "${LOG}/bgm_lofi.err") $(tail -1 "${LOG}/bgm_min.err")"; fi
else bad "make_bgm.py" "$(tail -2 "${LOG}/bgm.err")"; fi

# ------------------------------------------------------------------ master_audio.sh
ffmpeg -v error -y -f lavfi -i "testsrc2=size=320x240:rate=30" -f lavfi -i "sine=frequency=440:sample_rate=48000" -af "volume=-30dB" -t 5 \
  -pix_fmt yuv420p -c:v libx264 -preset veryfast -c:a aac -shortest "${W}/quiet.mp4"
if run master "${BASH_BIN}" "${S}/master_audio.sh" "${W}/quiet.mp4" "${W}/out/mastered.mp4"; then
  LUFS="$(ffmpeg -hide_banner -nostats -i "${W}/out/mastered.mp4" -vn -af ebur128 -f null - 2>&1 | sed -n 's/.*I: *\(-*[0-9.]*\) LUFS.*/\1/p' | tail -1)"
  python3 -c "import sys; sys.exit(0 if abs(float('${LUFS}') + 15) <= 1.5 else 1)" && ok "master_audio: output ${LUFS} LUFS (target −15 ± 1.5), video copied" || bad "master_audio: loudness" "${LUFS} LUFS"
  ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "${W}/out/mastered.mp4" | grep -q h264 && grep -q "LUFS" "${LOG}/master.out" && ok "master_audio: prints before → after LUFS" || bad "master_audio: output/report"
else bad "master_audio.sh" "$(tail -2 "${LOG}/master.err")"; fi

# ------------------------------------------------------------------ tts_seed2.py --dry-run
cp "${FX}/project/content/brief.json" "${FX}/project/content/script.json" "${W}/project/content/"
if run tts env -u SEED_AUDIO_KEY python3 "${S}/tts_seed2.py" "${W}/project" --dry-run --json; then
  check "tts_seed2 --dry-run: durations file has every narrated id (hook, clip-1, cta) and not the chapter" \
    "(lambda d: sorted(d)==['clip-1','cta','hook'] and all(v >= 1.0 for v in d.values()) and all((W/'project/public/narration'/(k+'.mp3')).exists() for k in d))(json.load(open(W/'project/content/narration-durations.json')))"
  check "tts_seed2 --dry-run: mp3s exist for hook/clip-1/cta, --json summary mode=dry-run" \
    "all((W/'project/public/narration'/(k+'.mp3')).stat().st_size > 500 for k in ('hook','clip-1','cta')) and json.load(open(W/'log/tts.out'))['mode']=='dry-run'"
  if env -u SEED_AUDIO_KEY python3 "${S}/tts_seed2.py" "${W}/project" >"${LOG}/tts_nokey.out" 2>"${LOG}/tts_nokey.err"; then bad "tts_seed2 without key must fail"; else
    if grep -q "export SEED_AUDIO_KEY" "${LOG}/tts_nokey.err" && ! grep -q "/Users/" "${LOG}/tts_nokey.err"; then ok "tts_seed2: missing key → exit 3 with env hint, no user path"; else bad "tts_seed2: missing-key message" "$(cat "${LOG}/tts_nokey.err")"; fi; fi
  run tts_sample env -u SEED_AUDIO_KEY python3 "${S}/tts_seed2.py" --sample "试听一句话" --out "${W}/out/sample.mp3" --dry-run && [ -s "${W}/out/sample.mp3" ] && ok "tts_seed2 --sample --dry-run → out/sample.mp3" || bad "tts_seed2 --sample"
else bad "tts_seed2.py --dry-run" "$(tail -2 "${LOG}/tts.err")"; fi

# ------------------------------------------------------------------ template_checksums.sh / doctor.sh / fetch_fonts.sh
if run sums "${BASH_BIN}" "${S}/template_checksums.sh"; then
  N="$(wc -l < "${LOG}/sums.out" | tr -d ' ')"
  [ "${N}" -ge 10 ] && ! grep -qE '(^|/)(content|public)/' "${LOG}/sums.out" && ok "template_checksums: ${N} lines, no content/ or public/ entries" || bad "template_checksums" "${N} lines"
else bad "template_checksums.sh" "$(tail -2 "${LOG}/sums.err")"; fi
if run doctor "${BASH_BIN}" "${S}/doctor.sh" --json; then
  check "doctor --json: valid JSON, ok=true, no FAIL" "(lambda j: j['ok'] is True and j['fails']==0 and len(j['checks']) >= 10)(json.load(open(W/'log/doctor.out')))"
  ! grep -q "unbound variable" "${LOG}/doctor.err" && ok "doctor under ${BASH_BIN} ($("${BASH_BIN}" -c 'echo ${BASH_VERSION%%(*}')): no unbound-variable errors" || bad "doctor: bash 3.2 unbound variable" "$(grep unbound "${LOG}/doctor.err" | head -1)"
else bad "doctor.sh --json (exit $?)" "$(tail -2 "${LOG}/doctor.err")"; fi
"${BASH_BIN}" "${S}/fetch_fonts.sh" --help >/dev/null 2>&1 && ok "fetch_fonts --help" || bad "fetch_fonts --help"
FC="${XDG_CACHE_HOME:-$HOME/.cache}/article-to-vertical-video/fonts"
if [ -s "${FC}/NotoSansSC-Bold.ttf" ]; then
  if run fonts "${BASH_BIN}" "${S}/fetch_fonts.sh" "${W}/fonts" && [ -s "${W}/fonts/NotoSansSC-Bold.ttf" ] && [ -s "${W}/fonts/fonts.json" ]; then ok "fetch_fonts: copies from cache → fonts.json ($(grep -c OK "${LOG}/fonts.out") fonts)"; else bad "fetch_fonts from cache" "$(tail -1 "${LOG}/fonts.err")"; fi
else warn "fetch_fonts: cache empty — run: bash scripts/fetch_fonts.sh --cache-only (needs network)"; fi

# ------------------------------------------------------------------ summary
echo
echo "media tests: ${PASS} passed, ${FAIL} failed, ${WARN} warnings${FAILED:+ — failed:${FAILED}}  (workdir ${W})"
if [ "${KEEP}" = 0 ] && [ "${FAIL}" = 0 ]; then rm -rf "${W}"; fi
[ "${FAIL}" = 0 ]
