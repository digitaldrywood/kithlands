#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/validate_walk_candidate.sh INPUT.png [cols rows]

Checks whether a generated walk-cycle candidate can be split into an even grid.
The default target is the runtime source contract: 8 columns x 4 rows.
USAGE
}

if [[ $# -lt 1 || $# -gt 3 ]]; then
  usage >&2
  exit 2
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick 'magick' is required." >&2
  exit 1
fi

input=$1
cols=${2:-8}
rows=${3:-4}

if [[ ! -f "$input" ]]; then
  echo "Input image not found: $input" >&2
  exit 1
fi

read -r width height channels < <(magick identify -format '%w %h %[channels]\n' "$input")

echo "Candidate: $input"
echo "Native: ${width}x${height} ${channels}"
echo "Expected grid: ${cols} columns x ${rows} rows"

if (( width % cols != 0 )); then
  echo "FAIL: width ${width} is not evenly divisible by ${cols} columns." >&2
  exit 1
fi

if (( height % rows != 0 )); then
  echo "FAIL: height ${height} is not evenly divisible by ${rows} rows." >&2
  exit 1
fi

cell_w=$((width / cols))
cell_h=$((height / rows))
echo "PASS: even grid with ${cell_w}x${cell_h} source cells."
