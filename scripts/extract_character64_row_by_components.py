#!/usr/bin/env python3
"""Extract one 64px animation row from a generated row image.

This is the row-first counterpart to the full-atlas extractor. It expects a
single generated row/strip and refuses to output anything unless exactly the
requested number of sprite components can be isolated left-to-right.
"""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

from PIL import Image


def parse_hex_color(value: str) -> tuple[int, int, int]:
    value = value.strip().lstrip("#")
    if len(value) != 6:
        raise argparse.ArgumentTypeError("expected #rrggbb")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def color_distance_sq(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    return sum((a[i] - b[i]) ** 2 for i in range(3))


def remove_key(image: Image.Image, key: tuple[int, int, int], threshold: int) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    limit = threshold * threshold
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a > 0 and color_distance_sq((r, g, b), key) <= limit:
                # Zero the hidden RGB channels as well as alpha. Resampling
                # transparent key-colored pixels otherwise bleeds the chroma
                # color back into the fitted sprite edge.
                pixels[x, y] = (0, 0, 0, 0)
    return image


def components(image: Image.Image, min_area: int) -> list[dict]:
    pixels = image.load()
    seen: set[tuple[int, int]] = set()
    found: list[dict] = []
    for y in range(image.height):
        for x in range(image.width):
            if (x, y) in seen or pixels[x, y][3] == 0:
                continue
            queue = deque([(x, y)])
            seen.add((x, y))
            pts: list[tuple[int, int]] = []
            while queue:
                cx, cy = queue.popleft()
                pts.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= image.width or ny >= image.height:
                        continue
                    if (nx, ny) in seen or pixels[nx, ny][3] == 0:
                        continue
                    seen.add((nx, ny))
                    queue.append((nx, ny))
            if len(pts) >= min_area:
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                found.append(
                    {
                        "x": min(xs),
                        "y": min(ys),
                        "width": max(xs) - min(xs) + 1,
                        "height": max(ys) - min(ys) + 1,
                        "area": len(pts),
                    }
                )
    return found


def fit_frame(frame: Image.Image, cell: int, inset: int) -> Image.Image:
    bbox = frame.getchannel("A").getbbox()
    canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    if not bbox:
        return canvas
    sprite = frame.crop(bbox)
    max_size = cell - inset * 2
    scale = min(max_size / sprite.width, max_size / sprite.height, 1.0)
    size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
    sprite = sprite.resize(size, Image.Resampling.LANCZOS)
    canvas.alpha_composite(sprite, ((cell - sprite.width) // 2, cell - sprite.height - inset))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--key", type=parse_hex_color, default="#ff00ff")
    parser.add_argument("--key-threshold", type=int, default=72)
    parser.add_argument("--min-area", type=int, default=500)
    parser.add_argument("--padding", type=int, default=18)
    parser.add_argument("--cell", type=int, default=64)
    parser.add_argument("--inset", type=int, default=2)
    parser.add_argument("--frames", type=int, default=8)
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    keyed = remove_key(source, args.key, args.key_threshold)
    boxes = components(keyed, args.min_area)
    boxes = [
        b
        for b in boxes
        if b["width"] < source.width * 0.35
        and b["height"] < source.height * 0.9
        and b["width"] > 12
        and b["height"] > 20
    ]
    boxes = sorted(boxes, key=lambda b: b["area"], reverse=True)[: args.frames]
    boxes = sorted(boxes, key=lambda b: b["x"])
    if len(boxes) != args.frames:
        raise SystemExit(
            f"expected {args.frames} sprite components, found {len(boxes)}"
        )
    areas = sorted(b["area"] for b in boxes)
    median_area = areas[len(areas) // 2]
    weak = [b for b in boxes if b["area"] < median_area * 0.45]
    edge_fragments = [
        b for b in boxes if b["x"] <= 3 or b["x"] + b["width"] >= source.width - 3
    ]
    if weak or edge_fragments:
        raise SystemExit(
            f"rejected row: components are not {args.frames} complete frames "
            f"(weak={len(weak)}, edge_fragments={len(edge_fragments)})"
        )

    out = Image.new(
        "RGBA", (args.cell * args.frames, args.cell), (0, 0, 0, 0)
    )
    for i, box in enumerate(boxes):
        x0 = max(0, box["x"] - args.padding)
        y0 = max(0, box["y"] - args.padding)
        x1 = min(source.width, box["x"] + box["width"] + args.padding)
        y1 = min(source.height, box["y"] + box["height"] + args.padding)
        frame = keyed.crop((x0, y0, x1, y1))
        out.alpha_composite(fit_frame(frame, args.cell, args.inset), (i * args.cell, 0))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    out.save(args.output)
    metadata = {
        "input": str(args.input),
        "output": str(args.output),
        "sourceSize": [source.width, source.height],
        "components": boxes,
    }
    if args.metadata:
        args.metadata.parent.mkdir(parents=True, exist_ok=True)
        args.metadata.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
