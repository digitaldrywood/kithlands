#!/usr/bin/env python3
"""Export human-reviewable previews for all generated walk sheets.

Outputs:
  <output-dir>/index.html
  <output-dir>/{class}/{class}_sheet_4x.png
  <output-dir>/{class}/{class}_preview.gif
  <output-dir>/{class}/{class}_{dir}.gif

The goal is reviewability, not runtime usage. This script makes it easy to
inspect each class one-by-one before integrating walk assets.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from PIL import Image

CELL = 128
SCALE = 4
FRAME_MS = 180
OUT_BG = (18, 22, 26, 255)
PANEL_BG = (32, 38, 44, 255)
LABEL_BG = (10, 12, 16, 220)
WHITE = (245, 245, 245, 255)
DIRS = ["down", "up", "left", "right"]

REPO_ROOT = Path(__file__).resolve().parent.parent
WALK_DIR = REPO_ROOT / "client" / "public" / "sprites" / "walk"
OUT_DIR = REPO_ROOT / "client" / "tmp" / "walk-previews"


def scale_frame(frame: Image.Image) -> Image.Image:
    return frame.resize((frame.width * SCALE, frame.height * SCALE), Image.Resampling.NEAREST)


def extract_row(sheet: Image.Image, row_idx: int) -> list[Image.Image]:
    frames = []
    for col_idx in range(4):
        frame = sheet.crop(
            (
                col_idx * CELL,
                row_idx * CELL,
                (col_idx + 1) * CELL,
                (row_idx + 1) * CELL,
            )
        )
        frames.append(frame)
    return frames


def direction_gif(frames: list[Image.Image], out_path: Path) -> None:
    scaled = [scale_frame(frame).convert("RGBA") for frame in frames]
    scaled[0].save(
        out_path,
        save_all=True,
        append_images=scaled[1:],
        duration=FRAME_MS,
        loop=0,
        disposal=2,
        transparency=0,
    )


def panel_frame(frame: Image.Image, label: str) -> Image.Image:
    scaled = scale_frame(frame).convert("RGBA")
    panel = Image.new("RGBA", (scaled.width + 24, scaled.height + 48), PANEL_BG)
    panel.paste(scaled, (12, 12), scaled)
    label_box = Image.new("RGBA", (panel.width, 24), LABEL_BG)
    panel.paste(label_box, (0, panel.height - 24), label_box)
    return panel


def preview_gif(rows: dict[str, list[Image.Image]], out_path: Path) -> None:
    layout = [("down", 0, 0), ("up", 1, 0), ("left", 0, 1), ("right", 1, 1)]
    sample_panel = panel_frame(rows["down"][0], "down")
    frame_w, frame_h = sample_panel.size
    canvas_w = frame_w * 2 + 16
    canvas_h = frame_h * 2 + 16
    gif_frames = []

    for frame_idx in range(4):
        canvas = Image.new("RGBA", (canvas_w, canvas_h), OUT_BG)
        for dir_name, gx, gy in layout:
            panel = panel_frame(rows[dir_name][frame_idx], dir_name)
            px = gx * frame_w + (16 if gx else 0)
            py = gy * frame_h + (16 if gy else 0)
            canvas.paste(panel, (px, py), panel)
        gif_frames.append(canvas)

    gif_frames[0].save(
        out_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=FRAME_MS,
        loop=0,
        disposal=2,
        transparency=0,
    )


def export_sheet(sheet: Image.Image, out_path: Path) -> None:
    enlarged = sheet.resize((sheet.width * SCALE, sheet.height * SCALE), Image.Resampling.NEAREST)
    enlarged.save(out_path)


def write_index(entries: list[dict[str, str]], out_dir: Path, title: str) -> None:
    cards = []
    for entry in entries:
        cls = entry["class"]
        cards.append(
            f"""
            <article class="card">
              <h2>{cls}</h2>
              <p><img src="{entry['preview_rel']}" alt="{cls} animated preview"></p>
              <p><a href="{entry['sheet_rel']}">Sheet PNG</a></p>
              <p class="links">
                <a href="{entry['down_rel']}">Down</a>
                <a href="{entry['up_rel']}">Up</a>
                <a href="{entry['left_rel']}">Left</a>
                <a href="{entry['right_rel']}">Right</a>
              </p>
            </article>
            """
        )

    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
    <title>{title}</title>
  <style>
    body {{
      margin: 0;
      padding: 24px;
      background: #11161b;
      color: #f4f4f4;
      font-family: monospace;
    }}
    h1 {{
      margin-top: 0;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }}
    .card {{
      background: #1d252c;
      border: 1px solid #36424d;
      border-radius: 10px;
      padding: 14px;
    }}
    .card img {{
      width: 100%;
      image-rendering: pixelated;
      background: #0d1014;
      border: 1px solid #2f3a43;
    }}
    .links a {{
      margin-right: 10px;
    }}
    a {{
      color: #8dc7ff;
    }}
  </style>
</head>
<body>
  <h1>{title}</h1>
  <p>Generated review surface for all walk sheets. Inspect the animated GIFs before merging.</p>
  <div class="grid">
    {''.join(cards)}
  </div>
</body>
</html>
"""
    (out_dir / "index.html").write_text(html)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        default=str(WALK_DIR),
        help="Directory containing *_walk.png sheets",
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
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_dir = Path(args.source_dir)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, str]] = []

    for sheet_path in sorted(source_dir.glob("*_walk.png")):
        class_id = sheet_path.stem.removesuffix("_walk")
        class_dir = out_dir / class_id
        class_dir.mkdir(parents=True, exist_ok=True)

        sheet = Image.open(sheet_path).convert("RGBA")
        rows = {dir_name: extract_row(sheet, idx) for idx, dir_name in enumerate(DIRS)}

        sheet_out = class_dir / f"{class_id}_sheet_4x.png"
        preview_out = class_dir / f"{class_id}_preview.gif"
        export_sheet(sheet, sheet_out)
        preview_gif(rows, preview_out)

        entry = {
            "class": class_id,
            "sheet_rel": f"{class_id}/{sheet_out.name}",
            "preview_rel": f"{class_id}/{preview_out.name}",
        }

        for dir_name in DIRS:
            dir_out = class_dir / f"{class_id}_{dir_name}.gif"
            direction_gif(rows[dir_name], dir_out)
            entry[f"{dir_name}_rel"] = f"{class_id}/{dir_out.name}"

        entries.append(entry)

    write_index(entries, out_dir, args.title)
    print(out_dir / "index.html")


if __name__ == "__main__":
    main()
