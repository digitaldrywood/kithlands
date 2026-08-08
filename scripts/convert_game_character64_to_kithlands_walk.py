#!/usr/bin/env python3
"""Convert a game-character-64 atlas into a Kithlands 128px walk sheet.

The installed skill's default walk-only atlas is 8 rows x 6 columns at 64x64:
south, south-east, east, north-east, north, north-west, west, south-west.

Kithlands currently consumes a 4 row x 8 column atlas at 128x128:
down, up, left, right.

This converter maps south/north/west/east into down/up/left/right, upscales
with nearest-neighbor, and expands 6 walk frames into 8 runtime frames.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


SKILL_DIRECTIONS = [
    "south",
    "south-east",
    "east",
    "north-east",
    "north",
    "north-west",
    "west",
    "south-west",
]

KITHLANDS_ROWS = [
    ("down", "south"),
    ("up", "north"),
    ("left", "west"),
    ("right", "east"),
]

# Preserve all six source frames, then use two in-betweens to return cleanly.
FRAME_EXPANSION_6_TO_8 = [0, 1, 2, 3, 4, 5, 4, 3]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="64px skill atlas")
    parser.add_argument("--output", required=True, help="Kithlands 128px walk sheet")
    parser.add_argument("--columns", type=int, default=6)
    parser.add_argument("--rows", type=int, default=8)
    parser.add_argument("--cell", type=int, default=64)
    parser.add_argument("--out-cell", type=int, default=128)
    args = parser.parse_args()

    source = Path(args.input)
    output = Path(args.output)
    with Image.open(source) as opened:
        atlas = opened.convert("RGBA")

    expected = (args.columns * args.cell, args.rows * args.cell)
    if atlas.size != expected:
        raise SystemExit(
            f"input atlas is {atlas.width}x{atlas.height}; expected {expected[0]}x{expected[1]}"
        )

    row_by_direction = {direction: i for i, direction in enumerate(SKILL_DIRECTIONS)}
    result = Image.new("RGBA", (8 * args.out_cell, 4 * args.out_cell), (0, 0, 0, 0))

    for target_row, (_target_dir, source_dir) in enumerate(KITHLANDS_ROWS):
        source_row = row_by_direction[source_dir]
        for target_col, source_col in enumerate(FRAME_EXPANSION_6_TO_8):
            box = (
                source_col * args.cell,
                source_row * args.cell,
                (source_col + 1) * args.cell,
                (source_row + 1) * args.cell,
            )
            frame = atlas.crop(box).resize(
                (args.out_cell, args.out_cell),
                resample=Image.Resampling.NEAREST,
            )
            result.alpha_composite(frame, (target_col * args.out_cell, target_row * args.out_cell))

    output.parent.mkdir(parents=True, exist_ok=True)
    result.save(output)
    print(f"Wrote {output}: {result.width}x{result.height}")


if __name__ == "__main__":
    main()
