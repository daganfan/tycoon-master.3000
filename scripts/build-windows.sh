#!/usr/bin/env bash
# Rebuilds the lightweight Windows app in "Play On Windows/".
#
# The app is Neutralino: a ~2.5 MB launcher that shows the game in the browser
# engine already built into Windows 10/11 (WebView2). The game files are packed
# into resources.neu (an ASAR archive) next to the .exe.
#
# Usage (from the repo root):  bash scripts/build-windows.sh
set -euo pipefail
NEU_VERSION=6.10.0
OUT="Play On Windows"
STAGE="$(mktemp -d)"
DL="$(mktemp -d)"

npm run build
mkdir -p "$STAGE/www" "$OUT"
cp -r dist/. "$STAGE/www/"
cp desktop/neutralino/neutralino.config.json "$STAGE/"
node -e "require('@electron/asar').createPackage(process.argv[1], process.argv[2]).then(() => console.log('packed resources.neu'))" \
  "$STAGE" "$OUT/resources.neu"

curl -sSL -o "$DL/neu.zip" "https://github.com/neutralinojs/neutralinojs/releases/download/v$NEU_VERSION/neutralinojs-v$NEU_VERSION.zip"
unzip -q -o "$DL/neu.zip" neutralino-win_x64.exe -d "$DL"
cp "$DL/neutralino-win_x64.exe" "$OUT/TycoonMaster3000.exe"
cp desktop/PLAY-README.txt "$OUT/README.txt"
echo "Built: $OUT"
ls -la "$OUT"
