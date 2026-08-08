#!/usr/bin/env python3
"""Fail when fixed-grid sprite cells contain detached opaque fragments."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def component_count(frame: Image.Image, min_area: int) -> int:
    pixels = frame.load()
    seen: set[tuple[int, int]] = set()
    count = 0
    for y in range(frame.height):
        for x in range(frame.width):
            if (x, y) in seen or pixels[x, y][3] == 0:
                continue
            queue = deque([(x, y)])
            seen.add((x, y))
            area = 0
            while queue:
                cx, cy = queue.popleft()
                area += 1
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= frame.width or ny >= frame.height:
                        continue
                    if (nx, ny) in seen or pixels[nx, ny][3] == 0:
                        continue
                    seen.add((nx, ny))
                    queue.append((nx, ny))
            if area >= min_area:
                count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--cell", type=int, default=64)
    parser.add_argument("--columns", type=int, required=True)
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("--min-area", type=int, default=16)
    args = parser.parse_args()

    image = Image.open(args.input).convert("RGBA")
    failures = []
    for row in range(args.rows):
        for col in range(args.columns):
            frame = image.crop(
                (
                    col * args.cell,
                    row * args.cell,
                    (col + 1) * args.cell,
                    (row + 1) * args.cell,
                ),
            )
            count = component_count(frame, args.min_area)
            if count > 1:
                failures.append(f"cell {row}:{col} has {count} components")
    if failures:
        raise SystemExit("\n".join(failures))
    print(f"ok: {args.input}")


if __name__ == "__main__":
    main()
