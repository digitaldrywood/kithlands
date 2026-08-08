#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/extract_walk_row.sh INPUT.png OUTPUT_ROW.png [cols]

Converts a reviewed one-direction walk-cycle row into the runtime row format:
8 transparent 128x128 cells, contact/down/passing/high/contact/down/passing/high.

The input must be a single horizontal row of equal-width frames. Use this for
row-by-row generation attempts instead of trying to coerce a failed full sheet.
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

input=$1
output=$2
cols=${3:-8}

if [[ ! -f "$input" ]]; then
  echo "Input image not found: $input" >&2
  exit 1
fi

if [[ "$cols" -ne 8 ]]; then
  echo "Only 8-frame walk rows are accepted." >&2
  exit 1
fi

read -r width height < <(magick identify -format '%w %h\n' "$input")
if (( width % cols != 0 )); then
  echo "Input width ${width} is not evenly divisible by ${cols} frames." >&2
  exit 1
fi

workdir=$(mktemp -d "${TMPDIR:-/tmp}/kithlands-walk-row.XXXXXX")
trap 'rm -rf "$workdir"' EXIT

cell_w=$((width / cols))
mkdir -p "$workdir/frames" "$(dirname "$output")"

for ((c = 0; c < cols; c++)); do
  magick "$input" -crop "${cell_w}x${height}+$((c * cell_w))+0" +repage \
    -alpha set -fuzz 28% -transparent '#ff00ff' \
    -trim +repage -resize '116x116>' \
    -background none -gravity south -extent 128x128 \
    "$workdir/frames/frame_${c}.png"
done

frame_args=()
for ((c = 0; c < cols; c++)); do
  frame_args+=("$workdir/frames/frame_${c}.png")
done

magick montage "${frame_args[@]}" \
  -tile "${cols}x1" -geometry 128x128+0+0 -background none "$output"

magick identify -format 'Wrote %f: %wx%h %[channels]\n' "$output"
