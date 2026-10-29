#!/usr/bin/env python3
"""Fit an inspected six-component row with one scale and helmet registration.

Unlike independent bounding-box fits, this preserves relative pose heights.
The generated source must contain one direction with six separated figures.
"""
import argparse
import json
from pathlib import Path

from PIL import Image

from extract_character64_row_by_components import components


def normalize(source, output, height):
    image = Image.open(source).convert("RGBA")
    # Reject translucent fringe before component isolation and nearest sampling.
    image.putalpha(image.getchannel("A").point(lambda a: 255 if a >= 96 else 0))
    boxes = sorted(components(image, 500), key=lambda b: b["area"], reverse=True)[:6]
    boxes.sort(key=lambda b: b["x"])
    if len(boxes) != 6:
        raise ValueError(f"expected six complete figures, got {len(boxes)}")
    scale = height / max(b["height"] for b in boxes)
    row = Image.new("RGBA", (384, 64))
    registrations = []
    for index, box in enumerate(boxes):
        x, y, w, h = (box[k] for k in ("x", "y", "width", "height"))
        frame = image.crop((x, y, x + w, y + h))
        # Register on the helmet rather than cape/sword bounding-box width.
        alpha = frame.getchannel("A")
        points = [(px, py) for py in range(int(h * .2), int(h * .35))
                  for px in range(w) if alpha.getpixel((px, py))]
        center = sum(px for px, _ in points) / len(points)
        size = (round(w * scale), round(h * scale))
        fitted = frame.resize(size, Image.Resampling.NEAREST)
        dx, dy = round(32 - center * scale), 62 - size[1]
        if dx < 2 or dx + size[0] > 62 or dy < 2:
            raise ValueError(f"pose {index} breaches cell safety: {dx}, {dy}, {size}")
        row.alpha_composite(fitted, (index * 64 + dx, dy))
        registrations.append({"source_box": box, "helmet_x": center, "dest": [dx, dy]})
    # Zero hidden RGB after normalization, preserving clean transparent edges.
    row.putdata([(r, g, b, a) if a else (0, 0, 0, 0)
                 for r, g, b, a in row.getdata()])
    output.parent.mkdir(parents=True, exist_ok=True)
    row.save(output)
    output.with_suffix(".json").write_text(json.dumps({
        "source": str(source), "shared_scale": scale,
        "cell": 64, "feet_baseline": 62, "registrations": registrations,
    }, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--height", type=int, default=58)
    args = parser.parse_args()
    normalize(args.input, args.output, args.height)
