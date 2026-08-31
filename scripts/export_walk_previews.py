#!/usr/bin/env python3
"""Export human-reviewable previews for the canonical runtime walk sheets.

The runtime contract is intentionally strict: twelve class atlases, 64x64
cells, six stride poses, and eight directional rows. Generated artifacts live
under client/tmp and are review aids, never runtime assets.
"""

from __future__ import annotations

import argparse
from html import escape
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CELL = 64
COLUMNS = 6
SCALE = 4
FRAME_MS = 180
OUT_BG = (18, 22, 26, 255)
PANEL_BG = (32, 38, 44, 255)
WHITE = (245, 245, 245, 255)
DIRECTIONS = [
    ("south", "S"),
    ("south-east", "SE"),
    ("east", "E"),
    ("north-east", "NE"),
    ("north", "N"),
    ("north-west", "NW"),
    ("west", "W"),
    ("south-west", "SW"),
]
POSES = ["Contact A", "Down A", "Passing A", "High A", "Contact B", "Down B"]
CLASS_IDS = [
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
ROWS = len(DIRECTIONS)
SHEET_WIDTH = CELL * COLUMNS
SHEET_HEIGHT = CELL * ROWS

REPO_ROOT = Path(__file__).resolve().parent.parent
WALK_DIR = REPO_ROOT / "client" / "public" / "sprites" / "walk"
OUT_DIR = REPO_ROOT / "client" / "tmp" / "walk-previews"


def scale_frame(frame: Image.Image) -> Image.Image:
    return frame.resize(
        (frame.width * SCALE, frame.height * SCALE), Image.Resampling.NEAREST
    )


def validate_sheet(sheet: Image.Image, sheet_path: Path) -> None:
    if sheet.size != (SHEET_WIDTH, SHEET_HEIGHT):
        raise ValueError(
            f"{sheet_path}: expected {SHEET_WIDTH}x{SHEET_HEIGHT} "
            f"({CELL}px, {COLUMNS} columns, {ROWS} rows), got "
            f"{sheet.width}x{sheet.height}"
        )


def extract_rows(sheet: Image.Image) -> dict[str, list[Image.Image]]:
    rows: dict[str, list[Image.Image]] = {}
    for row_idx, (direction, _) in enumerate(DIRECTIONS):
        rows[direction] = [
            sheet.crop(
                (
                    col_idx * CELL,
                    row_idx * CELL,
                    (col_idx + 1) * CELL,
                    (row_idx + 1) * CELL,
                )
            )
            for col_idx in range(COLUMNS)
        ]
    return rows


def export_sheet(sheet: Image.Image, out_path: Path) -> None:
    enlarged = sheet.resize(
        (sheet.width * SCALE, sheet.height * SCALE), Image.Resampling.NEAREST
    )
    enlarged.save(out_path)


def export_direction_strip(
    rows: dict[str, list[Image.Image]], out_path: Path
) -> None:
    font = ImageFont.load_default()
    label_width = 112
    gap = 16
    frame_size = CELL * SCALE
    canvas_width = label_width + gap + frame_size * COLUMNS
    canvas_height = (frame_size + gap) * ROWS - gap
    canvas = Image.new("RGBA", (canvas_width, canvas_height), OUT_BG)
    draw = ImageDraw.Draw(canvas)

    for row_idx, (direction, abbreviation) in enumerate(DIRECTIONS):
        y = row_idx * (frame_size + gap)
        draw.rectangle((0, y, label_width, y + frame_size), fill=PANEL_BG)
        draw.text((10, y + 12), abbreviation, fill=WHITE, font=font)
        draw.text((10, y + 30), direction, fill=WHITE, font=font)
        for col_idx, frame in enumerate(rows[direction]):
            x = label_width + gap + col_idx * frame_size
            scaled = scale_frame(frame).convert("RGBA")
            canvas.paste(scaled, (x, y), scaled)

    canvas.save(out_path)


def export_frame_grid(rows: dict[str, list[Image.Image]], out_path: Path) -> None:
    font = ImageFont.load_default()
    label_width = 112
    header_height = 36
    gap = 16
    frame_size = CELL * SCALE
    canvas_width = label_width + gap + frame_size * COLUMNS
    canvas_height = header_height + gap + (frame_size + gap) * ROWS - gap
    canvas = Image.new("RGBA", (canvas_width, canvas_height), OUT_BG)
    draw = ImageDraw.Draw(canvas)

    for col_idx, pose in enumerate(POSES):
        x = label_width + gap + col_idx * frame_size
        draw.rectangle((x, 0, x + frame_size, header_height), fill=PANEL_BG)
        draw.text((x + 10, 6), f"F{col_idx} {pose}", fill=WHITE, font=font)

    for row_idx, (direction, abbreviation) in enumerate(DIRECTIONS):
        y = header_height + gap + row_idx * (frame_size + gap)
        draw.rectangle((0, y, label_width, y + frame_size), fill=PANEL_BG)
        draw.text((10, y + 12), abbreviation, fill=WHITE, font=font)
        draw.text((10, y + 30), direction, fill=WHITE, font=font)
        for col_idx, frame in enumerate(rows[direction]):
            x = label_width + gap + col_idx * frame_size
            scaled = scale_frame(frame).convert("RGBA")
            canvas.paste(scaled, (x, y), scaled)

    canvas.save(out_path)


def export_all_direction_gif(
    rows: dict[str, list[Image.Image]], out_path: Path
) -> None:
    font = ImageFont.load_default()
    frame_size = CELL * SCALE
    label_height = 28
    columns = 4
    grid_rows = 2
    frames: list[Image.Image] = []

    for pose_idx in range(COLUMNS):
        canvas = Image.new(
            "RGBA",
            (columns * frame_size, grid_rows * (frame_size + label_height)),
            OUT_BG,
        )
        draw = ImageDraw.Draw(canvas)
        for direction_idx, (direction, abbreviation) in enumerate(DIRECTIONS):
            x = (direction_idx % columns) * frame_size
            y = (direction_idx // columns) * (frame_size + label_height)
            scaled = scale_frame(rows[direction][pose_idx]).convert("RGBA")
            canvas.paste(scaled, (x, y), scaled)
            draw.rectangle(
                (x, y + frame_size, x + frame_size, y + frame_size + label_height),
                fill=PANEL_BG,
            )
            draw.text(
                (x + 8, y + frame_size + 8),
                f"{abbreviation}  {direction}",
                fill=WHITE,
                font=font,
            )
        frames.append(canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=255))

    frames[0].save(
        out_path,
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_MS,
        loop=0,
        disposal=2,
    )


def write_index(entries: list[dict[str, str]], out_dir: Path, title: str) -> None:
    cards = []
    for entry in entries:
        class_id = escape(entry["class"])
        panels = "".join(
            f"""
            <div class="anim-panel">
              <strong>{escape(abbreviation)} · {escape(direction)}</strong>
              <canvas data-dir="{escape(direction)}" width="64" height="64"></canvas>
            </div>
            """
            for direction, abbreviation in DIRECTIONS
        )
        cards.append(
            f"""
            <article class="card" data-class="{class_id}">
              <h2>{class_id}</h2>
              <div class="anim-grid" data-sheet="{entry['sheet_rel']}">
                {panels}
              </div>
              <div class="links">
                <a href="{entry['gif_rel']}">8-direction GIF</a>
                <a href="{entry['strip_rel']}">direction contact sheet</a>
                <a href="{entry['frames_rel']}">pose grid</a>
                <a href="{entry['sheet_rel']}">atlas 4x</a>
              </div>
            </article>
            """
        )

    direction_rows = ", ".join(
        f'"{direction}": {row_idx}'
        for row_idx, (direction, _) in enumerate(DIRECTIONS)
    )
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escape(title)}</title>
  <style>
    body {{ margin: 0; padding: 24px; background: #11161b; color: #f4f4f4; font-family: monospace; }}
    h1 {{ margin-top: 0; }}
    .contract {{ color: #b9c7d5; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 16px; }}
    .card {{ background: #1d252c; border: 1px solid #36424d; border-radius: 10px; padding: 14px; }}
    .anim-grid {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }}
    .anim-panel {{ background: #0d1014; border: 1px solid #2f3a43; padding: 8px; text-align: center; }}
    .anim-panel strong {{ display: block; min-height: 28px; margin-bottom: 6px; font-size: 11px; }}
    .anim-panel canvas {{ width: 96px; height: 96px; image-rendering: pixelated; }}
    .links {{ display: flex; flex-wrap: wrap; gap: 10px; }}
    a {{ color: #8dc7ff; }}
  </style>
</head>
<body>
  <h1>{escape(title)}</h1>
  <p class="contract">Canonical runtime proof: 12 classes · 384×512 RGBA · 64×64 cells · 6 stride poses · 8 directional rows.</p>
  <p class="contract">Diagonal rows reuse the nearest cardinal artwork until independent diagonal movement is implemented.</p>
  <div class="grid">{''.join(cards)}</div>
  <script>
    const DIR_ROW = {{ {direction_rows} }};
    const SOURCE_CELL = {CELL * SCALE};
    const OUTPUT_CELL = {CELL};
    const FRAME_COUNT = {COLUMNS};
    for (const grid of document.querySelectorAll('.anim-grid')) {{
      const img = new Image();
      img.src = grid.dataset.sheet;
      img.onload = () => {{
        const canvases = [...grid.querySelectorAll('canvas')];
        let frame = 0;
        const draw = () => {{
          for (const canvas of canvases) {{
            const row = DIR_ROW[canvas.dataset.dir];
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, OUTPUT_CELL, OUTPUT_CELL);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, frame * SOURCE_CELL, row * SOURCE_CELL, SOURCE_CELL, SOURCE_CELL, 0, 0, OUTPUT_CELL, OUTPUT_CELL);
          }}
          frame = (frame + 1) % FRAME_COUNT;
        }};
        draw();
        window.setInterval(draw, {FRAME_MS});
      }};
    }}
  </script>
</body>
</html>
"""
    (out_dir / "index.html").write_text(html, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        default=str(WALK_DIR),
        help="Directory containing canonical <class>_walk.png sheets",
    )
    parser.add_argument(
        "--output-dir",
        default=str(OUT_DIR),
        help="Directory to write preview artifacts into",
    )
    parser.add_argument(
        "--title",
        default="Kithlands Walk Previews",
        help="Heading/title for the generated index page",
    )
    parser.add_argument(
        "--classes",
        nargs="+",
        default=CLASS_IDS,
        help="Class IDs to export (defaults to all twelve runtime classes)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_dir = Path(args.source_dir)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, str]] = []

    for class_id in args.classes:
        sheet_path = source_dir / f"{class_id}_walk.png"
        if not sheet_path.is_file():
            raise FileNotFoundError(f"missing runtime walk sheet: {sheet_path}")

        class_dir = out_dir / class_id
        class_dir.mkdir(parents=True, exist_ok=True)
        with Image.open(sheet_path) as source:
            sheet = source.convert("RGBA")
        validate_sheet(sheet, sheet_path)
        rows = extract_rows(sheet)

        sheet_out = class_dir / f"{class_id}_sheet_4x.png"
        strip_out = class_dir / f"{class_id}_directions_4x.png"
        frames_out = class_dir / f"{class_id}_frames_4x.png"
        gif_out = class_dir / f"{class_id}_all_directions_4x.gif"
        export_sheet(sheet, sheet_out)
        export_direction_strip(rows, strip_out)
        export_frame_grid(rows, frames_out)
        export_all_direction_gif(rows, gif_out)

        entries.append(
            {
                "class": class_id,
                "sheet_rel": f"{class_id}/{sheet_out.name}",
                "strip_rel": f"{class_id}/{strip_out.name}",
                "frames_rel": f"{class_id}/{frames_out.name}",
                "gif_rel": f"{class_id}/{gif_out.name}",
            }
        )

    write_index(entries, out_dir, args.title)
    print(out_dir / "index.html")


if __name__ == "__main__":
    main()
