#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/assemble_walk_sheet_from_rows.sh DOWN_ROW.png UP_ROW.png LEFT_ROW.png RIGHT_ROW.png OUTPUT_SHEET.png

Assembles four accepted 1024x128 runtime rows into a 1024x512 runtime walk
sheet with row order down/up/left/right.
USAGE
}

if [[ $# -ne 5 ]]; then
  usage >&2
  exit 2
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick 'magick' is required." >&2
  exit 1
fi

down=$1
up=$2
left=$3
right=$4
output=$5

for row in "$down" "$up" "$left" "$right"; do
  if [[ ! -f "$row" ]]; then
    echo "Row image not found: $row" >&2
    exit 1
  fi
  read -r width height < <(magick identify -format '%w %h\n' "$row")
  if [[ "$width" -ne 1024 || "$height" -ne 128 ]]; then
    echo "Expected ${row} to be 1024x128; got ${width}x${height}." >&2
    exit 1
  fi
done

mkdir -p "$(dirname "$output")"
magick "$down" "$up" "$left" "$right" -append "$output"
magick identify -format 'Wrote %f: %wx%h %[channels]\n' "$output"
