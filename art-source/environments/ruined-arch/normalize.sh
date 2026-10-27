#!/bin/sh
set -eu
# From this directory; nearest-neighbor export preserves hard pixel edges.
magick generated-source.png -crop 732x632+278+325 +repage -filter point \
  -resize 56x56 -background none -gravity south -extent 64x60 \
  -gravity north -extent 64x64 PNG32:candidate-64.png
