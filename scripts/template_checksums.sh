#!/usr/bin/env bash
# template_checksums.sh — print (or write) sha256 checksums of the locked Remotion template.
#
# Usage: template_checksums.sh [--write] [--root <skill root>] [--help]
#   prints "<sha256>  <path relative to assets/template>" for every file under assets/template/src/**
#   plus remotion.config.ts, package.json, tsconfig.json — sorted by path.
#   Not covered (per-project data, never "locked code"): content/*.json, public/**, node_modules, *.json under src/.
#   --write   also writes the list to assets/template/CHECKSUMS (doctor.sh compares against it)
#   --root    skill root (default: the parent directory of this script)
set -euo pipefail

usage() { sed -n '2,/^set -euo/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
WRITE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --write) WRITE=1 ;;
    --root) ROOT="$(cd "${2:?--root needs a directory}" && pwd)"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

TPL="$ROOT/assets/template"
[ -d "$TPL/src" ] || { echo "FAIL: $TPL/src not found (wrong --root?)" >&2; exit 1; }

sha() {  # portable sha256 of one file → hex only
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else echo "FAIL: neither shasum nor sha256sum available" >&2; exit 1; fi
}

list() {
  (
    cd "$TPL"
    find src -type f ! -name '.DS_Store' ! -name '*.json' ! -path '*/node_modules/*' | LC_ALL=C sort
    for f in remotion.config.ts package.json tsconfig.json; do [ -f "$f" ] && echo "$f"; done
  ) | LC_ALL=C sort -u
}

OUT="$(list | while IFS= read -r rel; do printf '%s  %s\n' "$(sha "$TPL/$rel")" "$rel"; done)"
if [ -z "$OUT" ]; then echo "FAIL: no template files found under $TPL" >&2; exit 1; fi

if [ "$WRITE" = 1 ]; then
  printf '%s\n' "$OUT" > "$TPL/CHECKSUMS"
  echo "wrote $(printf '%s\n' "$OUT" | wc -l | tr -d ' ') checksums -> $TPL/CHECKSUMS" >&2
else
  printf '%s\n' "$OUT"
fi
