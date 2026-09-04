#!/usr/bin/env bash
# Package this skill directory into a .skill zip (the format Claude Code / claude.ai accept).
# Usage: package_skill.sh [out.skill]   (default: ../articletoverticalvideo-v2.skill next to the skill dir)
# Excludes maintainer-only and generated files: DESIGN.md, scripts/tests, node_modules, public media, caches.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="$(basename "$HERE")"
OUT="${1:-$(dirname "$HERE")/articletoverticalvideo-v2.skill}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/$NAME"
rsync -a "$HERE/" "$TMP/$NAME/" \
  --include '.gitkeep' \
  --exclude DESIGN.md --exclude 'scripts/tests' --exclude node_modules --exclude '.DS_Store' \
  --exclude 'assets/template/public/clips/*' --exclude 'assets/template/public/images/*' \
  --exclude 'assets/template/public/narration/*' --exclude 'assets/template/public/gen/*' \
  --exclude 'assets/template/public/fonts/*' --exclude 'assets/template/public/sfx/*' \
  --exclude 'assets/template/public/bgm.wav' --exclude 'assets/template/out' --exclude '__pycache__' \
  --exclude 'config.env'
( cd "$TMP" && rm -f "$OUT" && zip -qr "$OUT" "$NAME" )
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
unzip -l "$OUT" | tail -1
