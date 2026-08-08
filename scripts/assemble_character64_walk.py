#!/usr/bin/env python3
"""Assemble validated cardinal walk rows into the native 8-direction atlas."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ROW_SOURCES = (
    "south",
    "south",
    "east",
    "north",
    "north",
    "north",
    "west",
    "south",
)


def load_row(path: Path, expected_size: tuple[int, int]) -> Image.Image:
    row = Image.open(path).convert("RGBA")
    if row.size != expected_size:
        raise SystemExit(
            f"{path}: expected {expected_size[0]}x{expected_size[1]}, "
            f"got {row.width}x{row.height}"
        )
    return row


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--south", type=Path, required=True)
    parser.add_argument("--north", type=Path, required=True)
    parser.add_argument("--east", type=Path, required=True)
    parser.add_argument("--west", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cell", type=int, default=64)
    parser.add_argument("--frames", type=int, default=6)
    args = parser.parse_args()

    expected = (args.cell * args.frames, args.cell)
    rows = {
        direction: load_row(getattr(args, direction), expected)
        for direction in ("south", "north", "east", "west")
    }
    atlas = Image.new(
        "RGBA", (expected[0], args.cell * len(ROW_SOURCES)), (0, 0, 0, 0)
    )
    for row_index, source in enumerate(ROW_SOURCES):
        atlas.alpha_composite(rows[source], (0, row_index * args.cell))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(args.output)
    print(args.output)


if __name__ == "__main__":
    main()
