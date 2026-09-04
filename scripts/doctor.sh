#!/usr/bin/env bash
# doctor.sh — check everything the article-to-vertical-video skill needs on this machine.
#
# Usage: doctor.sh [--fix-fonts] [--json] [--root <skill root>] [--help]
#   --fix-fonts   download the OFL fonts (calls fetch_fonts.sh) when they are missing
#   --json        machine-readable summary on stdout (human lines go to stderr)
#   --root        skill root (default: the parent directory of this script)
# Prints PASS / WARN / FAIL lines (中文) with a fix for each problem.
# Exit 1 only when a hard requirement fails (node ≥ 20, npm, ffmpeg, ffprobe, python3 ≥ 3.9).
set -uo pipefail

usage() { sed -n '2,/^set -uo/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
FIX_FONTS=0; JSON=0
while [ $# -gt 0 ]; do
  case "$1" in
    --fix-fonts) FIX_FONTS=1 ;;
    --json) JSON=1 ;;
    --root) ROOT="$(cd "${2:?--root needs a directory}" && pwd)"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

FAILS=0; WARNS=0
RESULTS=()   # name<TAB>status<TAB>detail<TAB>fix

report() {   # report <status> <name> <detail> [fix]
  local st="$1" name="$2" detail="$3" fix="${4:-}"
  case "$st" in FAIL) FAILS=$((FAILS+1)) ;; WARN) WARNS=$((WARNS+1)) ;; esac
  RESULTS+=("$name"$'\t'"$st"$'\t'"$detail"$'\t'"$fix")
  local line="$st  $name: $detail"
  [ -n "$fix" ] && line="$line  → 修复: $fix"
  if [ "$JSON" = 1 ]; then echo "$line" >&2; else echo "$line"; fi
}

ver_ge() {  # ver_ge <have> <want>  (dotted numeric compare)
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -t. -k1,1n -k2,2n -k3,3n | head -1)" = "$2" ]
}

# --- node / npm ---------------------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  NV="$(node --version 2>/dev/null | sed 's/^v//')"
  # NOTE: always write ${VAR} when non-ASCII text follows a variable — /bin/bash 3.2 in a non-UTF-8 locale
  # otherwise glues the first byte of the CJK character onto the variable name ("NV�: unbound variable").
  if ver_ge "${NV}" "20.0.0"; then report PASS node "v${NV}（需要 ≥ 20）"
  else report FAIL node "v${NV} 太旧（需要 ≥ 20）" "安装 Node 20+（nvm install 22 或 brew install node）"; fi
else report FAIL node "未安装" "安装 Node 20+（nvm install 22 或 brew install node）"; fi
if command -v npm >/dev/null 2>&1; then report PASS npm "$(npm --version 2>/dev/null)"
else report FAIL npm "未安装" "随 Node 一起安装（nvm install 22）"; fi

# --- ffmpeg / ffprobe -----------------------------------------------------------------------
if command -v ffmpeg >/dev/null 2>&1; then report PASS ffmpeg "$(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}')"
else report FAIL ffmpeg "未安装" "brew install ffmpeg"; fi
if command -v ffprobe >/dev/null 2>&1; then report PASS ffprobe "$(ffprobe -version 2>/dev/null | head -1 | awk '{print $3}')"
else report FAIL ffprobe "未安装" "brew install ffmpeg（自带 ffprobe）"; fi

# --- python3 --------------------------------------------------------------------------------
if command -v python3 >/dev/null 2>&1; then
  PV="$(python3 -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])' 2>/dev/null)"
  if ver_ge "${PV}" "3.9.0"; then report PASS python3 "${PV}（需要 ≥ 3.9）"
  else report FAIL python3 "${PV} 太旧（需要 ≥ 3.9）" "brew install python@3.12"; fi
else report FAIL python3 "未安装" "brew install python@3.12"; fi

# --- uv or pip packages ---------------------------------------------------------------------
if command -v uv >/dev/null 2>&1; then
  report PASS uv "$(uv --version 2>/dev/null | awk '{print $2}')（fetch_page.py 通过 uv run --with curl_cffi --with trafilatura 运行）"
else
  if python3 -c 'import curl_cffi, trafilatura' >/dev/null 2>&1; then
    report PASS uv "未安装，但 python3 已能 import curl_cffi + trafilatura（fetch_page.py 可直接用 python3 运行）"
  else
    report WARN uv "未安装，且 python3 缺少 curl_cffi / trafilatura（抓取网页会失败）" "brew install uv  或  pip3 install curl_cffi trafilatura"
  fi
fi

# --- optional tools -------------------------------------------------------------------------
if command -v whisper-cli >/dev/null 2>&1; then report PASS whisper-cli "$(command -v whisper-cli)（可选：给有人声的素材转写字幕）"
else report WARN whisper-cli "未安装（可选：只有素材里有人声时才需要）" "brew install whisper-cpp"; fi

GROK=""
if command -v grok >/dev/null 2>&1; then GROK="$(command -v grok)"; elif [ -x "$HOME/.grok/bin/grok" ]; then GROK="$HOME/.grok/bin/grok"; fi
if [ -n "$GROK" ]; then
  # offline auth check via grok_media.py doctor (auth.json present?) — no network call
  GROK_AUTH="$(python3 "$HERE/grok_media.py" doctor 2>/dev/null | sed -n 's/^ *"auth": *"\([^"]*\)".*/\1/p' | head -1)"
  if [ "${GROK_AUTH:-}" = "present" ]; then report PASS grok "${GROK}，已登录（可选：Grok Imagine 生成封面 / 章节板 / B-roll）"
  else report WARN grok "${GROK} 已安装但未登录（可选：不登录就用 brief.generation.provider = none）" "运行 grok 并登录一次（写入 ~/.grok/auth.json）"; fi
else report WARN grok "未找到 grok CLI（可选：没有它就用 brief.generation.provider = none，不生成 AI 画面）" "安装 grok CLI 到 PATH 或 ~/.grok/bin/grok"; fi

if [ -n "${SEED_AUDIO_KEY:-}" ]; then report PASS SEED_AUDIO_KEY "已设置（解锁 Seed-TTS 2.0 配音：tts_seed2.py）"
else report WARN SEED_AUDIO_KEY "未设置（可选：没有它就没有配音，视频按字数估算时长）" "export SEED_AUDIO_KEY=...  或  set -a; source config.env; set +a"; fi

# --- curl (downloads: media, fonts) -----------------------------------------------------------
if command -v curl >/dev/null 2>&1; then report PASS curl "$(curl --version 2>/dev/null | head -1 | awk '{print $2}')"
else report WARN curl "未安装（download_media.sh / fetch_fonts.sh 需要）" "brew install curl"; fi

# --- fonts ----------------------------------------------------------------------------------
FONT_DIR="$ROOT/assets/template/public/fonts"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/article-to-vertical-video/fonts"
FONT_FILES="NotoSansSC-Bold.ttf NotoSansSC-Black.ttf NotoSerifSC-Bold.ttf SmileySans-Oblique.ttf"
missing_fonts() {  # missing_fonts <dir> → names not present (or too small) in <dir>
  local f; for f in $FONT_FILES; do
    if [ ! -s "$1/$f" ] || [ "$(stat -f%z "$1/$f" 2>/dev/null || stat -c%s "$1/$f" 2>/dev/null || echo 0)" -lt 300000 ]; then printf '%s ' "$f"; fi
  done
}
MF="$(missing_fonts "$FONT_DIR")"; MC="$(missing_fonts "$CACHE_DIR")"
if [ -n "$MF" ] && [ "$FIX_FONTS" = 1 ]; then
  echo "…下载字体（fetch_fonts.sh → ${FONT_DIR}）" >&2
  bash "$HERE/fetch_fonts.sh" "$FONT_DIR" >&2 || true
  MF="$(missing_fonts "$FONT_DIR")"; MC="$(missing_fonts "$CACHE_DIR")"
fi
if [ -z "$MF" ]; then report PASS fonts "4 个字体文件齐全（assets/template/public/fonts）"
elif [ -z "$MC" ]; then report PASS fonts "4 个字体文件在缓存 ${CACHE_DIR}（scaffold 时复制到 project/public/fonts）" "bash scripts/fetch_fonts.sh 可复制到模板"
else report WARN fonts "缺少字体: ${MF}${MC:+（缓存也缺: ${MC}）}（可选：缺失时用系统字体 PingFang，跨机器渲染可能出现方块）" "bash scripts/doctor.sh --fix-fonts  或  bash scripts/fetch_fonts.sh"; fi

# --- template integrity ---------------------------------------------------------------------
TPL="$ROOT/assets/template"
if [ ! -d "$TPL/src" ]; then
  report FAIL template "assets/template/src 不存在（skill 目录不完整）" "重新解压 / 重新安装 skill"
elif [ ! -f "$TPL/CHECKSUMS" ]; then
  report WARN template "no checksum file yet（assets/template/CHECKSUMS 不存在，无法校验模板是否被改动）" "bash scripts/template_checksums.sh --write"
else
  CUR="$(bash "$HERE/template_checksums.sh" --root "$ROOT" 2>/dev/null)"
  if [ -z "$CUR" ]; then
    report WARN template "无法计算校验和" "检查 shasum / sha256sum 是否可用"
  else
    CHANGED="$(diff <(printf '%s\n' "$CUR") "$TPL/CHECKSUMS" | grep '^[<>]' | awk '{print $3}' | sort -u | tr '\n' ' ')"
    if [ -z "$CHANGED" ]; then report PASS template "$(printf '%s\n' "$CUR" | wc -l | tr -d ' ') 个模板文件与 CHECKSUMS 一致（锁定的场景代码未被改动）"
    else report WARN template "模板文件与 CHECKSUMS 不一致: $CHANGED" "模型不应改 assets/template/src；如果是维护者有意修改，运行 bash scripts/template_checksums.sh --write"; fi
  fi
fi

# --- summary --------------------------------------------------------------------------------
if [ "$JSON" = 1 ]; then
  python3 - "$FAILS" "$WARNS" "${RESULTS[@]}" <<'PY'
import json, sys
fails, warns, rows = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3:]
checks = []
for r in rows:
    name, st, detail, fix = (r.split("\t") + ["", "", ""])[:4]
    c = {"name": name, "status": st, "detail": detail}
    if fix: c["fix"] = fix
    checks.append(c)
print(json.dumps({"ok": fails == 0, "fails": fails, "warns": warns, "checks": checks}, ensure_ascii=False, indent=2))
PY
fi
if [ "$FAILS" -gt 0 ]; then
  echo "结论: $FAILS 项 FAIL，$WARNS 项 WARN —— 先修 FAIL 再继续" >&2; exit 1
else
  echo "结论: 全部硬性要求通过，$WARNS 项 WARN（可选项）" >&2; exit 0
fi
