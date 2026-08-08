#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/expand_walk_sheet_to_8.sh INPUT_4x4.png OUTPUT_8x4.png

Compatibility helper only. Converts an existing 4-frame-per-direction runtime
walk sheet into the new 8-frame-per-direction runtime layout so the game stays
playable while final 8-frame art is generated and reviewed.
USAGE
}

if [[ $# -ne 2 ]]; then
  usage >&2
  exit 2
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick 'magick' is required." >&2
  exit 1
fi

input=$1
output=$2

read -r width height < <(magick identify -format '%w %h\n' "$input")
if [[ "$width" -eq 1024 && "$height" -eq 512 ]]; then
  cp "$input" "$output"
  exit 0
fi
if [[ "$width" -ne 512 || "$height" -ne 512 ]]; then
  echo "Expected 512x512 or 1024x512 sheet; got ${width}x${height}" >&2
  exit 1
fi

workdir=$(mktemp -d "${TMPDIR:-/tmp}/kithlands-walk-expand.XXXXXX")
trap 'rm -rf "$workdir"' EXIT

# Repeat the source contact/pass/contact/pass cycle once. This is a temporary
# compatibility bridge, not final art.
src_cols=(0 1 2 3 0 1 2 3)
for r in 0 1 2 3; do
  for c in 0 1 2 3 4 5 6 7; do
    src=${src_cols[$c]}
    magick "$input" -crop "128x128+$((src * 128))+$((r * 128))" +repage \
      "$workdir/frame_$((r * 8 + c)).png"
  done
done

mkdir -p "$(dirname "$output")"
magick montage \
  "$workdir/frame_0.png" "$workdir/frame_1.png" "$workdir/frame_2.png" "$workdir/frame_3.png" \
  "$workdir/frame_4.png" "$workdir/frame_5.png" "$workdir/frame_6.png" "$workdir/frame_7.png" \
  "$workdir/frame_8.png" "$workdir/frame_9.png" "$workdir/frame_10.png" "$workdir/frame_11.png" \
  "$workdir/frame_12.png" "$workdir/frame_13.png" "$workdir/frame_14.png" "$workdir/frame_15.png" \
  "$workdir/frame_16.png" "$workdir/frame_17.png" "$workdir/frame_18.png" "$workdir/frame_19.png" \
  "$workdir/frame_20.png" "$workdir/frame_21.png" "$workdir/frame_22.png" "$workdir/frame_23.png" \
  "$workdir/frame_24.png" "$workdir/frame_25.png" "$workdir/frame_26.png" "$workdir/frame_27.png" \
  "$workdir/frame_28.png" "$workdir/frame_29.png" "$workdir/frame_30.png" "$workdir/frame_31.png" \
  -tile 8x4 -geometry 128x128+0+0 -background none "$output"

magick identify -format 'Wrote %f: %wx%h %[channels]\n' "$output"
