#!/bin/sh
set -eu
# Export only: crop transparent padding, retain alpha, normalize the frame.
# Bounds include two source pixels around alpha>=8; the original is preserved.
# Run from this directory. Output remains a candidate until visually approved.
magick generated-source.png -crop 1126x965+95+105 +repage -filter point \
  -resize 56x56 -background none -gravity south -extent 64x60 \
  -gravity north -extent 64x64 PNG32:candidate-64.png
magick generated-spring-source.png -crop 1129x968+93+105 +repage -filter point \
  -resize 56x56 -background none -gravity south -extent 64x60 \
  -gravity north -extent 64x64 PNG32:candidate-spring-64.png
