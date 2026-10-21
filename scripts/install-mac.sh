#!/bin/bash
# Mac 用：アプリを作ってアプリケーションフォルダに入れ、起動する。
# 使い方: npm run install-app（AI Hub） / npm run install-plan-app（企画・絵コンテ）
#   引数: [electron-builder の設定ファイル] [アプリ名]
set -euo pipefail
cd "$(dirname "$0")/.."

config="${1:-}"
name="${2:-AI Hub}"

if [ -n "$config" ]; then
  npx electron-builder --mac dir --publish never --config "$config"
else
  npx electron-builder --mac dir --publish never
fi

app=$(find dist dist-plan -maxdepth 2 -name "$name.app" -type d 2>/dev/null | head -1)
if [ -z "$app" ]; then echo "$name.app が見つかりませんでした" >&2; exit 1; fi

dest="/Applications"
[ -w "$dest" ] || dest="$HOME/Applications"
mkdir -p "$dest"
osascript -e "quit app \"$name\"" 2>/dev/null || true
rm -rf "$dest/$name.app"
cp -R "$app" "$dest/"
echo "入れました: $dest/$name.app"
open "$dest/$name.app"
