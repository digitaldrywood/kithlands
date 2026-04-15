#!/usr/bin/env python3
"""Generate per-class walk sprite sheets from the class overworld art.

Creates a 512x512 PNG per class with 4 rows (down/up/left/right) x 4 cols
(walk cycle frames). Walk animation is a subtle vertical bob:
  frame 0: base position
  frame 1: shifted up 2px (mid-step)
  frame 2: base position (other foot)
  frame 3: shifted up 2px (mid-step return)

The previous version mixed a class-specific south row with generic
player_{dir}.png rows for the other directions. That preserved directionality
but broke character identity: moving left/right/up visibly swapped the party
leader into an unrelated placeholder human. This generator keeps every row
class-consistent by deriving directional variants from the class sprite itself.

Usage:
  python3 scripts/generate_walk_sheets.py

Output:
  client/public/sprites/walk/{class}_walk.png for each class
"""

import os
from PIL import Image, ImageEnhance, ImageOps

SPRITE_DIR = os.path.join(os.path.dirname(__file__), "..", "client", "public", "sprites")
WALK_DIR = os.path.join(SPRITE_DIR, "walk")
CELL = 128
SHEET = CELL * 4  # 512x512
SPRITE_BOTTOM = CELL - 6

CLASSES = [
    "warrior", "brawler", "rogue", "mender", "cinder", "wayfarer",
    "knight", "champion", "shadow", "sage", "pyromancer", "wanderer",
]

DIRS = ["down", "up", "left", "right"]

BOB_OFFSETS = [0, -2, 0, -2]


try:
    RESAMPLE = Image.Resampling.NEAREST
except AttributeError:
    RESAMPLE = Image.NEAREST


def load_class_sprite(class_id: str) -> Image.Image:
    class_path = os.path.join(SPRITE_DIR, f"{class_id}.png")
    if not os.path.exists(class_path):
        raise FileNotFoundError(f"Missing class sprite: {class_path}")
    return Image.open(class_path).convert("RGBA")


def fitted_canvas(
    img: Image.Image,
    *,
    max_w: int,
    max_h: int,
    brightness: float = 1.0,
    saturation: float = 1.0,
    mirror: bool = False,
    x_shift: int = 0,
) -> Image.Image:
    """Fit a class sprite into a 128x128 cell while keeping its feet grounded."""
    if mirror:
        img = ImageOps.mirror(img)
    if brightness != 1.0:
        img = ImageEnhance.Brightness(img).enhance(brightness)
    if saturation != 1.0:
        img = ImageEnhance.Color(img).enhance(saturation)

    scale = min(max_w / img.width, max_h / img.height)
    width = max(1, round(img.width * scale))
    height = max(1, round(img.height * scale))
    resized = img.resize((width, height), RESAMPLE)

    canvas = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    x = (CELL - width) // 2 + x_shift
    y = SPRITE_BOTTOM - height
    canvas.paste(resized, (x, y), resized)
    return canvas


def directional_variants(class_id: str) -> dict[str, Image.Image]:
    """Build consistent directional variants from one class portrait.

    These are still stylized approximations, but they preserve character
    identity in every direction instead of swapping to generic placeholder art.
    """
    base = load_class_sprite(class_id)
    down = fitted_canvas(base, max_w=102, max_h=114)
    up = fitted_canvas(base, max_w=96, max_h=110, brightness=0.72, saturation=0.7)
    left = fitted_canvas(base, max_w=82, max_h=112, x_shift=-7)
    right = fitted_canvas(base, max_w=82, max_h=112, mirror=True, x_shift=7)
    return {
        "down": down,
        "up": up,
        "left": left,
        "right": right,
    }


def make_walk_sheet(class_id: str) -> Image.Image:
    """Build a 512x512 walk sheet for one class."""
    sheet = Image.new("RGBA", (SHEET, SHEET), (0, 0, 0, 0))
    variants = directional_variants(class_id)

    for row_idx, direction in enumerate(DIRS):
        base = variants[direction]
        for col_idx in range(4):
            frame = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            y_offset = BOB_OFFSETS[col_idx]
            frame.paste(base, (0, y_offset), base)
            sheet.paste(frame, (col_idx * CELL, row_idx * CELL))

    return sheet


def main():
    os.makedirs(WALK_DIR, exist_ok=True)

    for cls in CLASSES:
        sheet = make_walk_sheet(cls)
        out_path = os.path.join(WALK_DIR, f"{cls}_walk.png")
        sheet.save(out_path, "PNG")
        print(f"  {cls}_walk.png ({sheet.size[0]}x{sheet.size[1]})")

    print(f"\nGenerated {len(CLASSES)} walk sheets in {WALK_DIR}")


if __name__ == "__main__":
    main()
