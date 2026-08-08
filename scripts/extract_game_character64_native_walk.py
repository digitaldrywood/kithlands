#!/usr/bin/env python3
"""Normalize a generated Game Character 64 walk atlas into native 64px cells."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def parse_hex_color(value: str) -> tuple[int, int, int]:
    cleaned = value.strip().lstrip("#")
    if len(cleaned) != 6:
        raise argparse.ArgumentTypeError("expected a 6-digit hex color")
    return tuple(int(cleaned[i : i + 2], 16) for i in (0, 2, 4))


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    return sum((a[i] - b[i]) * (a[i] - b[i]) for i in range(3))


def remove_edge_key(
    frame: Image.Image,
    key: tuple[int, int, int],
    threshold: int,
) -> Image.Image:
    image = frame.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    limit = threshold * threshold
    queue: deque[tuple[int, int]] = deque()
    seen: set[tuple[int, int]] = set()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in seen:
            continue
        seen.add((x, y))
        r, g, b, a = pixels[x, y]
        if a == 0 or color_distance((r, g, b), key) > limit:
            continue
        pixels[x, y] = (r, g, b, 0)
        if x > 0:
            queue.append((x - 1, y))
        if x < width - 1:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y < height - 1:
            queue.append((x, y + 1))

    return image


def remove_residue(
    frame: Image.Image,
    key: tuple[int, int, int],
    threshold: int,
) -> Image.Image:
    image = frame.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    limit = threshold * threshold
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a > 0 and color_distance((r, g, b), key) <= limit:
                pixels[x, y] = (r, g, b, 0)
    return image


def remove_small_components(
    frame: Image.Image,
    min_area: int,
    low_component_top_ratio: float,
    low_component_max_area: int,
) -> Image.Image:
    if min_area <= 0:
        return frame

    image = frame.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    seen: set[tuple[int, int]] = set()

    for y in range(height):
        for x in range(width):
            if (x, y) in seen or pixels[x, y][3] == 0:
                continue

            queue: deque[tuple[int, int]] = deque([(x, y)])
            component: list[tuple[int, int]] = []
            seen.add((x, y))
            while queue:
                cx, cy = queue.popleft()
                component.append((cx, cy))
                for nx, ny in (
                    (cx - 1, cy),
                    (cx + 1, cy),
                    (cx, cy - 1),
                    (cx, cy + 1),
                ):
                    if (
                        nx < 0
                        or nx >= width
                        or ny < 0
                        or ny >= height
                        or (nx, ny) in seen
                        or pixels[nx, ny][3] == 0
                    ):
                        continue
                    seen.add((nx, ny))
                    queue.append((nx, ny))

            min_y = min(py for _, py in component)
            is_low_detached = (
                low_component_max_area > 0
                and len(component) <= low_component_max_area
                and min_y >= height * low_component_top_ratio
            )
            if len(component) < min_area or is_low_detached:
                for px, py in component:
                    r, g, b, _ = pixels[px, py]
                    pixels[px, py] = (r, g, b, 0)

    return image


def fit_frame(frame: Image.Image, cell: int, inset: int) -> Image.Image:
    bbox = frame.getbbox()
    canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    if bbox is None:
        return canvas

    sprite = frame.crop(bbox)
    max_size = cell - inset * 2
    scale = min(max_size / sprite.width, max_size / sprite.height, 1.0)
    size = (
        max(1, round(sprite.width * scale)),
        max(1, round(sprite.height * scale)),
    )
    sprite = sprite.resize(size, Image.Resampling.LANCZOS)

    x = (cell - sprite.width) // 2
    y = cell - sprite.height - inset
    canvas.alpha_composite(sprite, (x, y))
    return canvas


def extract(args: argparse.Namespace) -> None:
    source = Image.open(args.input).convert("RGBA")
    out = Image.new(
        "RGBA",
        (args.columns * args.cell, args.rows * args.cell),
        (0, 0, 0, 0),
    )
    src_cell_w = source.width / args.columns
    src_cell_h = source.height / args.rows

    for row in range(args.rows):
        for col in range(args.columns):
            box = (
                round(col * src_cell_w),
                round(row * src_cell_h),
                round((col + 1) * src_cell_w),
                round((row + 1) * src_cell_h),
            )
            frame = source.crop(box)
            frame = remove_edge_key(frame, args.key, args.edge_threshold)
            frame = remove_residue(frame, args.key, args.residue_threshold)
            frame = remove_small_components(
                frame,
                args.min_component_area,
                args.low_component_top_ratio,
                args.low_component_max_area,
            )
            frame = fit_frame(frame, args.cell, args.inset)
            out.alpha_composite(frame, (col * args.cell, row * args.cell))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    out.save(args.output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--columns", type=int, default=6)
    parser.add_argument("--rows", type=int, default=8)
    parser.add_argument("--cell", type=int, default=64)
    parser.add_argument("--inset", type=int, default=0)
    parser.add_argument("--key", type=parse_hex_color, default="#00ff00")
    parser.add_argument("--edge-threshold", type=int, default=110)
    parser.add_argument("--residue-threshold", type=int, default=72)
    parser.add_argument("--min-component-area", type=int, default=32)
    parser.add_argument("--low-component-top-ratio", type=float, default=0.68)
    parser.add_argument("--low-component-max-area", type=int, default=500)
    extract(parser.parse_args())


if __name__ == "__main__":
    main()
