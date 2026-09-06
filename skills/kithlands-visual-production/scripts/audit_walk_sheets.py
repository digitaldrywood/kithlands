#!/usr/bin/env python3
"""Audit Kithlands walk-sheet geometry against the canonical six-column/eight-row contract."""

from __future__ import annotations

import argparse
import json
import struct
import sys
import zlib
from collections import deque
from pathlib import Path


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
DEFAULT_CLASSES = (
    "warrior",
    "brawler",
    "rogue",
    "mender",
    "cinder",
    "wayfarer",
    "knight",
    "champion",
    "shadow",
    "sage",
    "pyromancer",
    "wanderer",
)


def png_header(path: Path) -> dict[str, int]:
    with path.open("rb") as handle:
        signature = handle.read(8)
        length = struct.unpack(">I", handle.read(4))[0]
        chunk_type = handle.read(4)
        data = handle.read(length)

    if signature != PNG_SIGNATURE or chunk_type != b"IHDR" or len(data) < 13:
        raise ValueError("not a valid PNG with an IHDR header")

    width, height, bit_depth, color_type, compression, filtering, interlace = (
        struct.unpack(">IIBBBBB", data[:13])
    )
    return {
        "width": width,
        "height": height,
        "bit_depth": bit_depth,
        "color_type": color_type,
        "compression": compression,
        "filtering": filtering,
        "interlace": interlace,
    }


def decode_rgba(path: Path) -> tuple[dict[str, int], bytes]:
    with path.open("rb") as handle:
        data = handle.read()

    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("not a valid PNG")

    offset = len(PNG_SIGNATURE)
    header: dict[str, int] | None = None
    compressed = bytearray()
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8]
        chunk_data = data[offset + 8 : offset + 8 + length]
        offset += 12 + length
        if chunk_type == b"IHDR":
            values = struct.unpack(">IIBBBBB", chunk_data[:13])
            header = dict(
                zip(
                    (
                        "width",
                        "height",
                        "bit_depth",
                        "color_type",
                        "compression",
                        "filtering",
                        "interlace",
                    ),
                    values,
                    strict=True,
                )
            )
        elif chunk_type == b"IDAT":
            compressed.extend(chunk_data)
        elif chunk_type == b"IEND":
            break

    if header is None:
        raise ValueError("PNG has no IHDR chunk")
    if header["bit_depth"] != 8 or header["color_type"] != 6:
        raise ValueError("frame analysis requires an 8-bit RGBA PNG")
    if header["interlace"] != 0:
        raise ValueError("frame analysis does not support interlaced PNGs")

    width = header["width"]
    height = header["height"]
    bytes_per_pixel = 4
    stride = width * bytes_per_pixel
    raw = zlib.decompress(bytes(compressed))
    expected = height * (stride + 1)
    if len(raw) != expected:
        raise ValueError(f"unexpected decompressed size {len(raw)} (want {expected})")

    pixels = bytearray(height * stride)
    previous = bytearray(stride)
    source_offset = 0
    for y in range(height):
        filter_type = raw[source_offset]
        source_offset += 1
        scanline = bytearray(raw[source_offset : source_offset + stride])
        source_offset += stride
        for x in range(stride):
            left = scanline[x - bytes_per_pixel] if x >= bytes_per_pixel else 0
            up = previous[x]
            upper_left = previous[x - bytes_per_pixel] if x >= bytes_per_pixel else 0
            if filter_type == 1:
                scanline[x] = (scanline[x] + left) & 0xFF
            elif filter_type == 2:
                scanline[x] = (scanline[x] + up) & 0xFF
            elif filter_type == 3:
                scanline[x] = (scanline[x] + ((left + up) // 2)) & 0xFF
            elif filter_type == 4:
                estimate = left + up - upper_left
                distances = (
                    abs(estimate - left),
                    abs(estimate - up),
                    abs(estimate - upper_left),
                )
                predictor = (left, up, upper_left)[distances.index(min(distances))]
                scanline[x] = (scanline[x] + predictor) & 0xFF
            elif filter_type != 0:
                raise ValueError(f"unsupported PNG filter {filter_type}")
        start = y * stride
        pixels[start : start + stride] = scanline
        previous = scanline
    return header, bytes(pixels)


def frame_bounds(
    rgba: bytes,
    image_width: int,
    cell: int,
    column: int,
    row: int,
    alpha_threshold: int,
) -> dict[str, object]:
    occupied: set[tuple[int, int]] = set()
    x0 = column * cell
    y0 = row * cell
    for local_y in range(cell):
        for local_x in range(cell):
            pixel = ((y0 + local_y) * image_width + x0 + local_x) * 4
            if rgba[pixel + 3] > alpha_threshold:
                occupied.add((local_x, local_y))

    if not occupied:
        return {"column": column, "row": row, "empty": True}

    xs = [point[0] for point in occupied]
    ys = [point[1] for point in occupied]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    remaining = set(occupied)
    components: list[int] = []
    while remaining:
        queue = deque([remaining.pop()])
        size = 0
        while queue:
            point_x, point_y = queue.popleft()
            size += 1
            for neighbor in (
                (point_x - 1, point_y),
                (point_x + 1, point_y),
                (point_x, point_y - 1),
                (point_x, point_y + 1),
            ):
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    queue.append(neighbor)
        components.append(size)

    components.sort(reverse=True)
    return {
        "column": column,
        "row": row,
        "empty": False,
        "bounds": {"left": min_x, "top": min_y, "right": max_x, "bottom": max_y},
        "width": max_x - min_x + 1,
        "height": max_y - min_y + 1,
        "center_x": round((min_x + max_x) / 2, 2),
        "pixels": len(occupied),
        "edge_touch": min_x == 0 or min_y == 0 or max_x == cell - 1 or max_y == cell - 1,
        "components": components[:8],
    }


def analyze_frames(
    path: Path,
    cell: int,
    columns: int,
    rows: int,
    alpha_threshold: int,
) -> tuple[list[dict[str, object]], list[str]]:
    header, rgba = decode_rgba(path)
    frames = [
        frame_bounds(rgba, header["width"], cell, column, row, alpha_threshold)
        for row in range(rows)
        for column in range(columns)
    ]
    errors: list[str] = []
    empty_labels = [
        f"r{frame['row']}c{frame['column']}" for frame in frames if frame["empty"]
    ]
    edge_labels = [
        f"r{frame['row']}c{frame['column']}"
        for frame in frames
        if not frame["empty"] and frame["edge_touch"]
    ]
    if empty_labels:
        sample = ", ".join(empty_labels[:8])
        suffix = "..." if len(empty_labels) > 8 else ""
        errors.append(f"{len(empty_labels)} empty frames ({sample}{suffix})")
    if edge_labels:
        sample = ", ".join(edge_labels[:8])
        suffix = "..." if len(edge_labels) > 8 else ""
        errors.append(f"{len(edge_labels)} frames touch a cell edge ({sample}{suffix})")

    for row in range(rows):
        row_frames = [
            frame for frame in frames if frame["row"] == row and not frame["empty"]
        ]
        if len(row_frames) != columns:
            continue
        baselines = [frame["bounds"]["bottom"] for frame in row_frames]
        tops = [frame["bounds"]["top"] for frame in row_frames]
        centers = [frame["center_x"] for frame in row_frames]
        heights = [frame["height"] for frame in row_frames]
        if max(baselines) - min(baselines) > 3:
            errors.append(
                f"row {row} baseline drift is {max(baselines) - min(baselines)}px (max 3px)"
            )
        if max(tops) - min(tops) > 5:
            errors.append(f"row {row} top drift is {max(tops) - min(tops)}px (max 5px)")
        if max(centers) - min(centers) > 6:
            errors.append(
                f"row {row} horizontal center drift is {max(centers) - min(centers):.1f}px (max 6px)"
            )
        if max(heights) - min(heights) > 6:
            errors.append(
                f"row {row} occupied-height drift is {max(heights) - min(heights)}px (max 6px)"
            )
    return frames, errors


def audit_sheet(
    path: Path,
    cell: int,
    columns: int,
    rows: int,
    alpha_threshold: int,
) -> dict[str, object]:
    expected_width = cell * columns
    expected_height = cell * rows
    result: dict[str, object] = {
        "path": str(path),
        "expected": {
            "width": expected_width,
            "height": expected_height,
            "cell": cell,
            "columns": columns,
            "rows": rows,
        },
        "errors": [],
    }

    if not path.exists():
        result["errors"].append("missing file")
        result["ok"] = False
        return result

    try:
        header = png_header(path)
    except (OSError, ValueError, struct.error) as exc:
        result["errors"].append(str(exc))
        result["ok"] = False
        return result

    result["actual"] = header
    if header["width"] != expected_width:
        result["errors"].append(
            f"width {header['width']} does not equal {expected_width}"
        )
    if header["height"] != expected_height:
        result["errors"].append(
            f"height {header['height']} does not equal {expected_height}"
        )
    if header["bit_depth"] != 8:
        result["errors"].append(f"bit depth {header['bit_depth']} is not 8")
    if header["color_type"] not in (4, 6):
        result["errors"].append(
            f"color type {header['color_type']} has no explicit alpha channel"
        )
    if header["interlace"] != 0:
        result["errors"].append("interlaced PNGs are not supported by the audit")

    if not result["errors"]:
        try:
            frames, frame_errors = analyze_frames(
                path, cell, columns, rows, alpha_threshold
            )
            result["frames"] = frames
            result["errors"].extend(frame_errors)
        except (OSError, ValueError, struct.error, zlib.error) as exc:
            result["errors"].append(f"frame analysis failed: {exc}")

    result["ok"] = not result["errors"]
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sheet_dir", type=Path)
    parser.add_argument("--cell", type=int, default=64)
    parser.add_argument("--columns", type=int, default=6)
    parser.add_argument("--rows", type=int, default=8)
    parser.add_argument("--alpha-threshold", type=int, default=8)
    parser.add_argument(
        "--classes",
        nargs="+",
        default=DEFAULT_CLASSES,
        help="Class IDs to audit (default: all runtime classes)",
    )
    parser.add_argument(
        "--mode",
        choices=("report", "enforce"),
        default="report",
        help="Report exits zero; enforce exits non-zero when any sheet fails",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    results = [
        audit_sheet(
            args.sheet_dir / f"{class_id}_walk.png",
            args.cell,
            args.columns,
            args.rows,
            args.alpha_threshold,
        )
        for class_id in args.classes
    ]
    failures = [result for result in results if not result["ok"]]

    if args.json:
        print(
            json.dumps(
                {
                    "contract": {
                        "cell": args.cell,
                        "columns": args.columns,
                    "rows": args.rows,
                    "alpha_threshold": args.alpha_threshold,
                    },
                    "passed": len(results) - len(failures),
                    "failed": len(failures),
                    "results": results,
                },
                indent=2,
            )
        )
    else:
        for result in results:
            status = "PASS" if result["ok"] else "FAIL"
            actual = result.get("actual", {})
            dimensions = (
                f"{actual.get('width', '?')}x{actual.get('height', '?')}"
            )
            print(f"{status:4} {Path(result['path']).name:28} {dimensions}")
            for error in result["errors"]:
                print(f"     - {error}")
        print(f"\n{len(results) - len(failures)} passed; {len(failures)} failed")

    return 1 if args.mode == "enforce" and failures else 0


if __name__ == "__main__":
    sys.exit(main())
