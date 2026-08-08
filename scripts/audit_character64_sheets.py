#!/usr/bin/env python3
"""Audit Kithlands 64x64 character walk/attack sheets.

This catches the non-negotiable sprite-sheet contract failures before visual
review: wrong dimensions, empty frames, edge clipping, and rows whose sprite
bounding boxes drift so far that animation is likely to pop or appear cut.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


CELL = 64
EXPECTED_ROWS = 8
EXPECTED_COLUMNS_8 = 8
EXPECTED_COLUMNS_6 = 6
ROW_NAMES = [
    "south",
    "south-east",
    "east",
    "north-east",
    "north",
    "north-west",
    "west",
    "south-west",
]


def alpha_count(frame: Image.Image) -> int:
    return sum(frame.getchannel("A").histogram()[1:])


def bbox(frame: Image.Image) -> tuple[int, int, int, int] | None:
    return frame.getchannel("A").getbbox()


def edge_count(frame: Image.Image, margin: int = 1) -> int:
    alpha = frame.getchannel("A")
    w, h = alpha.size
    total = 0
    for box in (
        (0, 0, w, margin),
        (0, h - margin, w, h),
        (0, 0, margin, h),
        (w - margin, 0, w, h),
    ):
        total += sum(alpha.crop(box).histogram()[1:])
    return total


def audit_sheet(path: Path, expected_columns: int | None = None) -> dict:
    with Image.open(path) as opened:
        image = opened.convert("RGBA")

    columns = image.width // CELL if image.width % CELL == 0 else 0
    rows = image.height // CELL if image.height % CELL == 0 else 0
    expected_columns = expected_columns or columns
    expected_size = (expected_columns * CELL, EXPECTED_ROWS * CELL)
    errors: list[str] = []
    warnings: list[str] = []
    cells: list[dict] = []
    row_summaries: list[dict] = []

    if image.size != expected_size:
        errors.append(
            f"size {image.width}x{image.height}, expected {expected_size[0]}x{expected_size[1]}"
        )
    if rows != EXPECTED_ROWS:
        errors.append(f"row count {rows}, expected {EXPECTED_ROWS}")
    if columns != expected_columns:
        errors.append(f"column count {columns}, expected {expected_columns}")

    scan_rows = min(rows, EXPECTED_ROWS)
    scan_columns = min(columns, expected_columns)
    for row in range(scan_rows):
        row_boxes = []
        row_pixels = []
        row_edge_pixels = 0
        for col in range(scan_columns):
            frame = image.crop(
                (col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL)
            )
            pixels = alpha_count(frame)
            frame_bbox = bbox(frame)
            edges = edge_count(frame)
            row_edge_pixels += edges
            if pixels < 120:
                errors.append(f"{ROW_NAMES[row]} frame {col} is empty/sparse ({pixels}px)")
            if edges > 24:
                errors.append(f"{ROW_NAMES[row]} frame {col} touches cell edge ({edges}px)")
            if frame_bbox:
                row_boxes.append(frame_bbox)
            row_pixels.append(pixels)
            cells.append(
                {
                    "row": row,
                    "rowName": ROW_NAMES[row],
                    "column": col,
                    "pixels": pixels,
                    "bbox": frame_bbox,
                    "edgePixels": edges,
                }
            )
        if row_boxes:
            min_left = min(b[0] for b in row_boxes)
            max_right = max(b[2] for b in row_boxes)
            min_top = min(b[1] for b in row_boxes)
            max_bottom = max(b[3] for b in row_boxes)
            center_xs = [((b[0] + b[2]) / 2) for b in row_boxes]
            center_ys = [((b[1] + b[3]) / 2) for b in row_boxes]
            drift_x = max(center_xs) - min(center_xs)
            drift_y = max(center_ys) - min(center_ys)
            if drift_x > 14:
                warnings.append(f"{ROW_NAMES[row]} horizontal center drifts {drift_x:.1f}px")
            if drift_y > 10:
                warnings.append(f"{ROW_NAMES[row]} vertical center drifts {drift_y:.1f}px")
            row_summaries.append(
                {
                    "row": row,
                    "rowName": ROW_NAMES[row],
                    "pixelsMin": min(row_pixels),
                    "pixelsMax": max(row_pixels),
                    "edgePixels": row_edge_pixels,
                    "unionBBox": [min_left, min_top, max_right, max_bottom],
                    "driftX": round(drift_x, 2),
                    "driftY": round(drift_y, 2),
                }
            )

    return {
        "file": str(path),
        "width": image.width,
        "height": image.height,
        "columns": columns,
        "rows": rows,
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "rowSummaries": row_summaries,
        "cells": cells,
    }


def draw_contact_card(path: Path, audit: dict, output: Path) -> None:
    with Image.open(path) as opened:
        image = opened.convert("RGBA")
    columns = max(1, audit["columns"])
    rows = max(1, audit["rows"])
    scale = 2
    label_w = 86
    label_h = 24
    pad = 2
    out = Image.new(
        "RGBA",
        (
            label_w + columns * (CELL * scale + pad) + pad,
            label_h + rows * (CELL * scale + pad) + pad,
        ),
        (18, 24, 34, 255),
    )
    draw = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype("Arial.ttf", 11)
    except OSError:
        font = ImageFont.load_default()
    draw.text((6, 5), path.stem, fill=(245, 245, 245, 255), font=font)
    for col in range(columns):
        x = label_w + col * (CELL * scale + pad) + pad
        draw.text((x + 4, 5), str(col), fill=(220, 220, 220, 255), font=font)
    for row in range(rows):
        y = label_h + row * (CELL * scale + pad) + pad
        draw.text((6, y + 54), ROW_NAMES[row] if row < len(ROW_NAMES) else str(row), fill=(220, 220, 220, 255), font=font)
        for col in range(columns):
            frame = image.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))
            bg = Image.new("RGBA", (CELL, CELL), (225, 225, 225, 255))
            bg_draw = ImageDraw.Draw(bg)
            for by in range(0, CELL, 8):
                for bx in range(0, CELL, 8):
                    if (bx // 8 + by // 8) % 2:
                        bg_draw.rectangle((bx, by, bx + 7, by + 7), fill=(245, 245, 245, 255))
            bg.alpha_composite(frame)
            scaled = bg.resize((CELL * scale, CELL * scale), Image.Resampling.NEAREST)
            x = label_w + col * (CELL * scale + pad) + pad
            out.alpha_composite(scaled, (x, y))
            cell = next((c for c in audit["cells"] if c["row"] == row and c["column"] == col), None)
            color = (255, 72, 72, 255) if cell and cell["edgePixels"] > 24 else (34, 160, 88, 255)
            draw.rectangle((x, y, x + CELL * scale - 1, y + CELL * scale - 1), outline=color, width=2)
    output.parent.mkdir(parents=True, exist_ok=True)
    out.convert("RGB").save(output)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sprites-dir", default="client/public/sprites")
    parser.add_argument("--out-dir", default="client/tmp/game-character-64/audit")
    args = parser.parse_args()

    sprites_dir = Path(args.sprites_dir)
    out_dir = Path(args.out_dir)
    classes = [
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
    ]
    report = {"walk": {}, "attack": {}}
    for kind in ("walk", "attack"):
        for cls in classes:
            path = sprites_dir / kind / f"{cls}_{kind}.png"
            if not path.exists():
                report[kind][cls] = {"ok": False, "errors": ["missing file"], "warnings": []}
                continue
            expected_columns = EXPECTED_COLUMNS_6 if kind == "walk" and cls == "warrior" else EXPECTED_COLUMNS_8
            audit = audit_sheet(path, expected_columns)
            report[kind][cls] = audit
            draw_contact_card(path, audit, out_dir / f"{cls}-{kind}-contact.png")

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "audit.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    summary = []
    for kind, items in report.items():
        for cls, audit in items.items():
            summary.append(
                {
                    "kind": kind,
                    "class": cls,
                    "ok": audit.get("ok", False),
                    "errors": len(audit.get("errors", [])),
                    "warnings": len(audit.get("warnings", [])),
                    "firstError": (audit.get("errors") or [""])[0],
                    "firstWarning": (audit.get("warnings") or [""])[0],
                }
            )
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    if any(not item["ok"] for item in summary):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
