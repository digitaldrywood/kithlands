#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
from pathlib import Path


def run(cmd):
    return subprocess.run(cmd, check=True, text=True, capture_output=True)


def identify(path):
    out = run(["magick", "identify", "-format", "%w %h", str(path)]).stdout
    width, height = out.split()
    return int(width), int(height)


def connected_components(path, key, fuzz):
    cmd = [
        "magick",
        str(path),
        "-fuzz",
        fuzz,
        "-transparent",
        key,
        "-alpha",
        "extract",
        "-threshold",
        "1%",
        "-define",
        "connected-components:verbose=true",
        "-connected-components",
        "8",
        "null:",
    ]
    result = subprocess.run(cmd, text=True, capture_output=True)
    text = result.stdout + result.stderr
    boxes = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("Objects") or ":" not in line:
            continue
        parts = line.split()
        if len(parts) < 4:
            continue
        box = parts[1]
        area_raw = parts[3]
        try:
            size, offset = box.split("+", 1)
            w, h = size.split("x", 1)
            x, y = offset.split("+", 1)
            area = float(area_raw)
        except ValueError:
            continue
        boxes.append(
            {
                "x": int(x),
                "y": int(y),
                "width": int(w),
                "height": int(h),
                "area": area,
            }
        )
    return boxes


def main():
    parser = argparse.ArgumentParser(
        description="Extract an 8-frame runtime walk row from a generated strip using connected components."
    )
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--key", default="#ff00ff")
    parser.add_argument("--fuzz", default="12%")
    parser.add_argument("--padding", type=int, default=18)
    parser.add_argument("--metadata")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    if not input_path.exists():
        print(f"input not found: {input_path}", file=sys.stderr)
        return 1

    image_w, image_h = identify(input_path)
    boxes = connected_components(input_path, args.key, args.fuzz)
    candidates = [
        b
        for b in boxes
        if b["area"] > 10000
        and b["width"] < image_w * 0.4
        and b["height"] < image_h * 0.8
    ]
    candidates = sorted(candidates, key=lambda b: b["area"], reverse=True)[:8]
    candidates = sorted(candidates, key=lambda b: b["x"])

    if len(candidates) != 8:
        print(f"expected 8 sprite components, found {len(candidates)}", file=sys.stderr)
        print(json.dumps(candidates, indent=2), file=sys.stderr)
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    workdir = output_path.parent / f".{output_path.stem}.frames"
    workdir.mkdir(parents=True, exist_ok=True)
    frame_paths = []

    for i, box in enumerate(candidates):
        x = max(0, box["x"] - args.padding)
        y = max(0, box["y"] - args.padding)
        right = min(image_w, box["x"] + box["width"] + args.padding)
        bottom = min(image_h, box["y"] + box["height"] + args.padding)
        crop_w = right - x
        crop_h = bottom - y
        frame_path = workdir / f"frame_{i}.png"
        run(
            [
                "magick",
                str(input_path),
                "-crop",
                f"{crop_w}x{crop_h}+{x}+{y}",
                "+repage",
                "-alpha",
                "set",
                "-fuzz",
                args.fuzz,
                "-transparent",
                args.key,
                "-trim",
                "+repage",
                "-resize",
                "116x116>",
                "-background",
                "none",
                "-gravity",
                "south",
                "-extent",
                "128x128",
                str(frame_path),
            ]
        )
        frame_paths.append(str(frame_path))

    run(
        [
            "magick",
            "montage",
            *frame_paths,
            "-tile",
            "8x1",
            "-geometry",
            "128x128+0+0",
            "-background",
            "none",
            str(output_path),
        ]
    )

    metadata = {
        "input": str(input_path),
        "output": str(output_path),
        "source_size": [image_w, image_h],
        "components": candidates,
    }
    if args.metadata:
        Path(args.metadata).parent.mkdir(parents=True, exist_ok=True)
        Path(args.metadata).write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
