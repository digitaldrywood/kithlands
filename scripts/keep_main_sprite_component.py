#!/usr/bin/env python3
"""Remove detached sprite fragments from fixed-grid transparent sheets."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def components(frame: Image.Image) -> list[list[tuple[int, int]]]:
    pixels = frame.load()
    seen: set[tuple[int, int]] = set()
    found: list[list[tuple[int, int]]] = []
    for y in range(frame.height):
        for x in range(frame.width):
            if (x, y) in seen or pixels[x, y][3] == 0:
                continue
            queue = deque([(x, y)])
            seen.add((x, y))
            pts: list[tuple[int, int]] = []
            while queue:
                cx, cy = queue.popleft()
                pts.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= frame.width or ny >= frame.height:
                        continue
                    if (nx, ny) in seen or pixels[nx, ny][3] == 0:
                        continue
                    seen.add((nx, ny))
                    queue.append((nx, ny))
            found.append(pts)
    return found


def clean_frame(frame: Image.Image, min_keep_ratio: float) -> Image.Image:
    frame = frame.convert("RGBA")
    comps = components(frame)
    if not comps:
        return frame
    largest = max(len(c) for c in comps)
    keep: set[tuple[int, int]] = set()
    for comp in comps:
        if len(comp) == largest or len(comp) >= largest * min_keep_ratio:
            keep.update(comp)
    pixels = frame.load()
    for y in range(frame.height):
        for x in range(frame.width):
            if pixels[x, y][3] > 0 and (x, y) not in keep:
                r, g, b, _ = pixels[x, y]
                pixels[x, y] = (r, g, b, 0)
    return frame


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cell", type=int, default=64)
    parser.add_argument("--columns", type=int, required=True)
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("--min-keep-ratio", type=float, default=0.08)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    out = Image.new("RGBA", source.size, (0, 0, 0, 0))
    for row in range(args.rows):
        for col in range(args.columns):
            box = (
                col * args.cell,
                row * args.cell,
                (col + 1) * args.cell,
                (row + 1) * args.cell,
            )
            out.alpha_composite(
                clean_frame(source.crop(box), args.min_keep_ratio),
                (col * args.cell, row * args.cell),
            )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    out.save(args.output)


if __name__ == "__main__":
    main()
