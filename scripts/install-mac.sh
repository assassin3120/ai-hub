#!/bin/bash
# Mac 用：AI Hub.app を作ってアプリケーションフォルダに入れ、起動する。
# 使い方: npm run install-app
set -euo pipefail
cd "$(dirname "$0")/.."

npx electron-builder --mac dir --publish never

app=$(find dist -maxdepth 2 -name 'AI Hub.app' -type d | head -1)
if [ -z "$app" ]; then echo "AI Hub.app が見つかりませんでした" >&2; exit 1; fi

dest="/Applications"
[ -w "$dest" ] || dest="$HOME/Applications"
mkdir -p "$dest"
osascript -e 'quit app "AI Hub"' 2>/dev/null || true
rm -rf "$dest/AI Hub.app"
cp -R "$app" "$dest/"
echo "入れました: $dest/AI Hub.app"
open "$dest/AI Hub.app"
