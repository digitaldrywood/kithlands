#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
source "$repo_root/scripts/worktree-env.sh"

cd "$repo_root/client"

PLAYWRIGHT_TMP="$PWD/tmp"
PLAYWRIGHT_HOME="$PLAYWRIGHT_TMP/home"
PLAYWRIGHT_XDG_CONFIG="$PLAYWRIGHT_TMP/xdg-config"
PLAYWRIGHT_XDG_CACHE="$PLAYWRIGHT_TMP/xdg-cache"
PLAYWRIGHT_BROWSERS="$PLAYWRIGHT_TMP/ms-playwright"

classes=(
  warrior
  brawler
  rogue
  mender
  cinder
  wayfarer
  knight
  champion
  shadow
  sage
  pyromancer
  wanderer
)

mkdir -p \
  "$PLAYWRIGHT_HOME" \
  "$PLAYWRIGHT_XDG_CONFIG" \
  "$PLAYWRIGHT_XDG_CACHE" \
  "$PLAYWRIGHT_BROWSERS"

for class_id in "${classes[@]}"; do
  echo "== walk audit: ${class_id} =="
  HOME="$PLAYWRIGHT_HOME" \
    XDG_CONFIG_HOME="$PLAYWRIGHT_XDG_CONFIG" \
    XDG_CACHE_HOME="$PLAYWRIGHT_XDG_CACHE" \
    PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS" \
    VITE_PORT="$VITE_PORT" \
    npx playwright test \
      --config=e2e/playwright.config.js \
      e2e/walk-all-classes.spec.js \
      --retries=1 \
      --grep "${class_id} keeps"
done
