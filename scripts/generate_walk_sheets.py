#!/usr/bin/env python3
"""Generate walk sprite sheets from existing directional player sprites.

Creates a 512x512 PNG per class with 4 rows (down/up/left/right) x 4 cols
(walk cycle frames). Walk animation is a subtle vertical bob:
  frame 0: base position
  frame 1: shifted up 2px (mid-step)
  frame 2: base position (other foot)
  frame 3: shifted up 2px (mid-step return)

Each class reuses the directional player_{dir}.png sprites (128x128)
since we don't have per-class directional art yet. The class's front-facing
{class}.png is used for the down row so each class looks distinct when walking
south (the most common view).

Usage:
  python3 scripts/generate_walk_sheets.py

Output:
  client/public/sprites/walk/{class}_walk.png for each class
"""

import os
from PIL import Image

SPRITE_DIR = os.path.join(os.path.dirname(__file__), "..", "client", "public", "sprites")
WALK_DIR = os.path.join(SPRITE_DIR, "walk")
CELL = 128
SHEET = CELL * 4  # 512x512

CLASSES = [
    "warrior", "brawler", "rogue", "mender", "cinder", "wayfarer",
    "knight", "champion", "shadow", "sage", "pyromancer", "wanderer",
]

DIRS = ["down", "up", "left", "right"]

BOB_OFFSETS = [0, -2, 0, -2]


def load_direction_sprite(class_id: str, direction: str) -> Image.Image:
    """Load the best available sprite for a class + direction.

    For 'down': use the class-specific front-facing sprite ({class}.png)
    resized to 128x128 so each class looks distinct walking south.
    For up/left/right: use the generic player_{dir}.png which has correct
    directional poses.
    """
    if direction == "down":
        class_path = os.path.join(SPRITE_DIR, f"{class_id}.png")
        if os.path.exists(class_path):
            img = Image.open(class_path).convert("RGBA")
            return img.resize((CELL, CELL), Image.LANCZOS)

    player_path = os.path.join(SPRITE_DIR, f"player_{direction}.png")
    if os.path.exists(player_path):
        img = Image.open(player_path).convert("RGBA")
        if img.size != (CELL, CELL):
            img = img.resize((CELL, CELL), Image.LANCZOS)
        return img

    raise FileNotFoundError(
        f"Missing sprite for {class_id} direction={direction}: "
        f"tried {player_path}"
    )


def make_walk_sheet(class_id: str) -> Image.Image:
    """Build a 512x512 walk sheet for one class."""
    sheet = Image.new("RGBA", (SHEET, SHEET), (0, 0, 0, 0))

    for row_idx, direction in enumerate(DIRS):
        base = load_direction_sprite(class_id, direction)
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
