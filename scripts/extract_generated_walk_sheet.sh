#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/extract_generated_walk_sheet.sh INPUT.png OUTPUT.png [row_y_csv] [cols]

Converts a reviewed generated walk-sheet image into the Phaser runtime format:
transparent PNG, 128px cells, row order down/up/left/right.

row_y_csv is optional. Use it when generated rows are not evenly spaced, e.g.
  0,300,600,900
USAGE
}

if [[ $# -lt 2 || $# -gt 4 ]]; then
  usage >&2
  exit 2
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick 'magick' is required." >&2
  exit 1
fi

input=$1
output=$2
row_y_csv=${3:-}
cols=${4:-8}

if [[ ! -f "$input" ]]; then
  echo "Input image not found: $input" >&2
  exit 1
fi

read -r width height < <(magick identify -format '%w %h\n' "$input")
if [[ -z "$row_y_csv" ]]; then
  row_y_csv="0,$((height / 4)),$(((height * 2) / 4)),$(((height * 3) / 4))"
fi

IFS=',' read -r -a row_y <<< "$row_y_csv"
if [[ ${#row_y[@]} -ne 4 ]]; then
  echo "row_y_csv must contain exactly four comma-separated y offsets." >&2
  exit 1
fi

workdir=$(mktemp -d "${TMPDIR:-/tmp}/kithlands-walk-sheet.XXXXXX")
trap 'rm -rf "$workdir"' EXIT
mkdir -p "$workdir/frames"

if [[ "$cols" -ne 4 && "$cols" -ne 8 ]]; then
  echo "cols must be 4 or 8." >&2
  exit 1
fi

cell_w=$(((width + cols - 1) / cols))
cell_h=$(((height + 3) / 4))
crop_h=$cell_h

for r in 0 1 2 3; do
  y=${row_y[$r]}
  for ((c = 0; c < cols; c++)); do
    x=$(((c * width + cols - 1) / cols))
    idx=$((r * cols + c))
    magick "$input" -crop "${cell_w}x${crop_h}+${x}+${y}" +repage \
      -alpha set -fuzz 28% -transparent '#ff00ff' \
      -trim +repage -resize '116x116>' \
      -background none -gravity south -extent 128x128 \
      "$workdir/frames/frame_${idx}.png"
  done
done

mkdir -p "$(dirname "$output")"
frame_args=()
for ((i = 0; i < cols * 4; i++)); do
  frame_args+=("$workdir/frames/frame_${i}.png")
done
magick montage "${frame_args[@]}" \
  -tile "${cols}x4" -geometry 128x128+0+0 -background none "$output"

magick identify -format 'Wrote %f: %wx%h %[channels]\n' "$output"
