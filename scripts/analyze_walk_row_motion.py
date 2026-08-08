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


def alpha_bbox(path, crop):
    command = [
        "magick",
        str(path),
        "-crop",
        crop,
        "+repage",
        "-alpha",
        "extract",
        "-threshold",
        "1%",
        "-format",
        "%@",
        "info:",
    ]
    raw = run(command).stdout.strip()
    # ImageMagick reports WIDTHxHEIGHT+X+Y.
    size, x, y = raw.split("+", 2)
    width, height = size.split("x", 1)
    return {
        "x": int(x),
        "y": int(y),
        "width": int(width),
        "height": int(height),
    }


def frame_rgba(path, crop, cell_size):
    raw = subprocess.run(
        [
            "magick",
            str(path),
            "-crop",
            crop,
            "+repage",
            "-depth",
            "8",
            "rgba:-",
        ],
        check=True,
        capture_output=True,
    ).stdout
    expected = cell_size * cell_size * 4
    if len(raw) != expected:
        raise RuntimeError(f"expected {expected} RGBA bytes, got {len(raw)}")
    return raw


def blue_hair_bbox(path, crop, cell_size):
    raw = frame_rgba(path, crop, cell_size)
    xs = []
    ys = []
    for y in range(cell_size):
        for x in range(cell_size):
            idx = (y * cell_size + x) * 4
            r, g, b, a = raw[idx], raw[idx + 1], raw[idx + 2], raw[idx + 3]
            # Restrict to the upper half so blue cloak/armor does not dominate.
            if (
                a > 24
                and y < cell_size * 0.58
                and b > 70
                and b > r * 1.15
                and b > g * 1.05
                and r < 120
            ):
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return {
        "x": min(xs),
        "y": min(ys),
        "width": max(xs) - min(xs) + 1,
        "height": max(ys) - min(ys) + 1,
        "center_x": round(sum(xs) / len(xs), 2),
        "center_y": round(sum(ys) / len(ys), 2),
        "pixel_count": len(xs),
    }


def frame_metrics(path, row, frame, cell_size):
    crop = f"{cell_size}x{cell_size}+{frame * cell_size}+{row * cell_size}"
    bbox = alpha_bbox(path, crop)
    hair = blue_hair_bbox(path, crop, cell_size)
    center_x = bbox["x"] + bbox["width"] / 2
    center_y = bbox["y"] + bbox["height"] / 2
    baseline_y = bbox["y"] + bbox["height"]
    return {
        "frame": frame,
        "bbox": bbox,
        "top_y": bbox["y"],
        "baseline_y": baseline_y,
        "center_x": round(center_x, 2),
        "center_y": round(center_y, 2),
        "height": bbox["height"],
        "width": bbox["width"],
        "hair": hair,
    }


def with_deltas(frames):
    previous = None
    for frame in frames:
        if previous is None:
            frame["delta"] = {
                "top_y": 0,
                "baseline_y": 0,
                "center_x": 0,
                "center_y": 0,
                "height": 0,
                "hair_center_x": 0,
                "hair_center_y": 0,
                "hair_top_y": 0,
            }
        else:
            previous_hair = previous.get("hair") or {}
            current_hair = frame.get("hair") or {}
            frame["delta"] = {
                "top_y": round(frame["top_y"] - previous["top_y"], 2),
                "baseline_y": round(frame["baseline_y"] - previous["baseline_y"], 2),
                "center_x": round(frame["center_x"] - previous["center_x"], 2),
                "center_y": round(frame["center_y"] - previous["center_y"], 2),
                "height": round(frame["height"] - previous["height"], 2),
                "hair_center_x": round(
                    current_hair.get("center_x", 0) - previous_hair.get("center_x", 0),
                    2,
                )
                if current_hair and previous_hair
                else None,
                "hair_center_y": round(
                    current_hair.get("center_y", 0) - previous_hair.get("center_y", 0),
                    2,
                )
                if current_hair and previous_hair
                else None,
                "hair_top_y": round(
                    current_hair.get("y", 0) - previous_hair.get("y", 0),
                    2,
                )
                if current_hair and previous_hair
                else None,
            }
        previous = frame
    return frames


def summarize(
    frames,
    max_top_delta,
    max_center_delta,
    max_baseline_delta,
    max_hair_center_x_delta,
    max_hair_center_delta,
    max_hair_top_delta,
):
    top_deltas = [abs(f["delta"]["top_y"]) for f in frames[1:]]
    center_deltas = [abs(f["delta"]["center_y"]) for f in frames[1:]]
    baseline_deltas = [abs(f["delta"]["baseline_y"]) for f in frames[1:]]
    height_deltas = [abs(f["delta"]["height"]) for f in frames[1:]]
    hair_center_deltas = [
        abs(f["delta"]["hair_center_y"])
        for f in frames[1:]
        if f["delta"].get("hair_center_y") is not None
    ]
    hair_center_x_deltas = [
        abs(f["delta"]["hair_center_x"])
        for f in frames[1:]
        if f["delta"].get("hair_center_x") is not None
    ]
    hair_top_deltas = [
        abs(f["delta"]["hair_top_y"])
        for f in frames[1:]
        if f["delta"].get("hair_top_y") is not None
    ]
    warnings = []
    for frame in frames[1:]:
        if abs(frame["delta"]["top_y"]) > max_top_delta:
            warnings.append(
                f"f{frame['frame']} top/head moved {frame['delta']['top_y']}px from prior frame"
            )
        if abs(frame["delta"]["center_y"]) > max_center_delta:
            warnings.append(
                f"f{frame['frame']} body center moved {frame['delta']['center_y']}px from prior frame"
            )
        if abs(frame["delta"]["baseline_y"]) > max_baseline_delta:
            warnings.append(
                f"f{frame['frame']} baseline moved {frame['delta']['baseline_y']}px from prior frame"
            )
        if (
            frame["delta"].get("hair_center_x") is not None
            and abs(frame["delta"]["hair_center_x"]) > max_hair_center_x_delta
        ):
            warnings.append(
                f"f{frame['frame']} hair center moved {frame['delta']['hair_center_x']}px horizontally from prior frame"
            )
        if (
            frame["delta"].get("hair_center_y") is not None
            and abs(frame["delta"]["hair_center_y"]) > max_hair_center_delta
        ):
            warnings.append(
                f"f{frame['frame']} hair center moved {frame['delta']['hair_center_y']}px vertically from prior frame"
            )
        if (
            frame["delta"].get("hair_top_y") is not None
            and abs(frame["delta"]["hair_top_y"]) > max_hair_top_delta
        ):
            warnings.append(
                f"f{frame['frame']} hair top moved {frame['delta']['hair_top_y']}px from prior frame"
            )
    return {
        "max_abs_top_delta": max(top_deltas) if top_deltas else 0,
        "max_abs_center_y_delta": max(center_deltas) if center_deltas else 0,
        "max_abs_baseline_delta": max(baseline_deltas) if baseline_deltas else 0,
        "max_abs_height_delta": max(height_deltas) if height_deltas else 0,
        "max_abs_hair_center_x_delta": max(hair_center_x_deltas)
        if hair_center_x_deltas
        else 0,
        "max_abs_hair_center_y_delta": max(hair_center_deltas)
        if hair_center_deltas
        else 0,
        "max_abs_hair_top_delta": max(hair_top_deltas) if hair_top_deltas else 0,
        "warnings": warnings,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Measure frame-to-frame motion consistency for 128px walk rows."
    )
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--row", type=int, default=0)
    parser.add_argument("--cell-size", type=int, default=128)
    parser.add_argument("--max-top-delta", type=float, default=8)
    parser.add_argument("--max-center-delta", type=float, default=7)
    parser.add_argument("--max-baseline-delta", type=float, default=3)
    parser.add_argument("--max-hair-center-x-delta", type=float, default=5)
    parser.add_argument("--max-hair-center-delta", type=float, default=5)
    parser.add_argument("--max-hair-top-delta", type=float, default=4)
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    if not input_path.exists():
        print(f"input not found: {input_path}", file=sys.stderr)
        return 1

    width, height = identify(input_path)
    if width % args.cell_size != 0 or height % args.cell_size != 0:
        print(
            f"expected image divisible by {args.cell_size}px cells; got {width}x{height}",
            file=sys.stderr,
        )
        return 1
    cols = width // args.cell_size
    rows = height // args.cell_size
    if args.row < 0 or args.row >= rows:
        print(f"row {args.row} out of range for {rows} rows", file=sys.stderr)
        return 1

    frames = [
        frame_metrics(input_path, args.row, frame, args.cell_size)
        for frame in range(cols)
    ]
    frames = with_deltas(frames)
    summary = summarize(
        frames,
        args.max_top_delta,
        args.max_center_delta,
        args.max_baseline_delta,
        args.max_hair_center_x_delta,
        args.max_hair_center_delta,
        args.max_hair_top_delta,
    )
    result = {
        "input": str(input_path),
        "source_size": [width, height],
        "row": args.row,
        "cell_size": args.cell_size,
        "thresholds": {
            "max_top_delta": args.max_top_delta,
            "max_center_delta": args.max_center_delta,
            "max_baseline_delta": args.max_baseline_delta,
            "max_hair_center_x_delta": args.max_hair_center_x_delta,
            "max_hair_center_delta": args.max_hair_center_delta,
            "max_hair_top_delta": args.max_hair_top_delta,
        },
        "summary": summary,
        "frames": frames,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
