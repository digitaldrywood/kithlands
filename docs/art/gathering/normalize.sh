#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
output="${1:-client/tmp/gathering-normalized}"
mkdir -p "$output"
# Cutout alpha cleanup and point-sampling only; preserve the source artwork.
# Keep proportions, then align every prop to the same 64x48 bottom-center cell.
for spec in iron-outcrop:56x40 mythril-outcrop:56x40 meadow-herbs:42x36 fallen-hardwood:54x34; do
  name="${spec%%:*}"
  bounds="${spec#*:}"
  magick "docs/art/gathering/source/$name.png" \
    -channel A -threshold 60% +channel -trim +repage \
    -filter point -resize "$bounds" -background none -gravity south \
    -extent 64x48 "$output/$name.png"
done
