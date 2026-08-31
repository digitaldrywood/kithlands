#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/export_walk_cycle_gif.sh SHEET.png OUTPUT_DIR [class_id]

Exports side-motion GIF previews from a canonical runtime walk sheet. The sheet
must be 384x512 with 64px cells, six stride columns, and eight directional rows
(south, south-east, east, north-east, north, north-west, west, south-west).

Outputs:
  OUTPUT_DIR/{class}_west_loop.gif
  OUTPUT_DIR/{class}_east_loop.gif
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
if (( width != 384 || height != 512 )); then
  echo "Expected canonical 384x512 walk sheet; got ${width}x${height}" >&2
  exit 1
fi

cell=64
cols=6
mkdir -p "$out_dir"
workdir=$(mktemp -d "${TMPDIR:-/tmp}/kithlands-walk-gif.XXXXXX")
trap 'rm -rf "$workdir"' EXIT

make_loop() {
  local row=$1
  local name=$2
  local frame_args=()
  for ((i = 0; i < cols; i++)); do
    local frame="$workdir/${name}_${i}.png"
    magick "$sheet" -crop "${cell}x${cell}+$((i * cell))+$((row * cell))" +repage \
      -resize 256x256 -background '#1a1f24' -gravity center -extent 304x304 \
      "$frame"
    frame_args+=("$frame")
  done
  magick -delay 10 -loop 0 "${frame_args[@]}" "$out_dir/${class_id}_${name}_loop.gif"
}

make_loop 6 west
make_loop 2 east

magick "$out_dir/${class_id}_west_loop.gif" "$out_dir/${class_id}_east_loop.gif" \
  +append "$out_dir/${class_id}_side_compare.gif"

echo "$out_dir/${class_id}_side_compare.gif"
