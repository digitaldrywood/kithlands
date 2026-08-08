#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/export_walk_cycle_gif.sh SHEET.png OUTPUT_DIR [class_id]

Exports animated GIF previews from a runtime walk sheet. The sheet must use
128px cells and row order down/up/left/right. The number of columns is inferred
from the sheet width, so this can preview both 4-frame and 8-frame cycles.

Outputs:
  OUTPUT_DIR/{class}_left_loop.gif
  OUTPUT_DIR/{class}_right_loop.gif
  OUTPUT_DIR/{class}_side_compare.gif
USAGE
}

if [[ $# -lt 2 || $# -gt 3 ]]; then
  usage >&2
  exit 2
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick 'magick' is required." >&2
  exit 1
fi

sheet=$1
out_dir=$2
class_id=${3:-$(basename "$sheet" _walk.png)}

if [[ ! -f "$sheet" ]]; then
  echo "Sheet not found: $sheet" >&2
  exit 1
fi

read -r width height < <(magick identify -format '%w %h\n' "$sheet")
if (( width % 128 != 0 || height != 512 )); then
  echo "Expected 128px cells and 512px height; got ${width}x${height}" >&2
  exit 1
fi

cols=$((width / 128))
mkdir -p "$out_dir"
workdir=$(mktemp -d "${TMPDIR:-/tmp}/kithlands-walk-gif.XXXXXX")
trap 'rm -rf "$workdir"' EXIT

make_loop() {
  local row=$1
  local name=$2
  local frame_args=()
  for ((i = 0; i < cols; i++)); do
    local frame="$workdir/${name}_${i}.png"
    magick "$sheet" -crop "128x128+$((i * 128))+$((row * 128))" +repage \
      -resize 384x384 -background '#1a1f24' -gravity center -extent 448x448 \
      "$frame"
    frame_args+=("$frame")
  done
  magick -delay 10 -loop 0 "${frame_args[@]}" "$out_dir/${class_id}_${name}_loop.gif"
}

make_loop 2 left
make_loop 3 right

magick "$out_dir/${class_id}_left_loop.gif" "$out_dir/${class_id}_right_loop.gif" \
  +append "$out_dir/${class_id}_side_compare.gif"

echo "$out_dir/${class_id}_side_compare.gif"
