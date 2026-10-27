#!/bin/sh
set -eu
# Nearest-neighbor preserves pixel edges; discard the draft's translucent halo.
magick generated-source.png -crop 840x720+340+155 +repage -filter point \
  -resize 56x56 -channel A -threshold 45% +channel -background none \
  -gravity south -extent 64x60 -gravity north -extent 64x64 PNG32:candidate-64.png
