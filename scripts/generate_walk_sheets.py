#!/usr/bin/env python3
"""Generate per-class walk sprite sheets from the class overworld art.

Creates a 512x512 PNG per class with 4 rows (down/up/left/right) x 4 cols
(walk cycle frames). Each row uses four distinct poses:
  frame 0: idle A
  frame 1: left-foot stride
  frame 2: idle B (counter-sway)
  frame 3: right-foot stride

The previous version mixed a class-specific south row with generic
player_{dir}.png rows for the other directions. That preserved directionality
but broke character identity: moving left/right/up visibly swapped the party
leader into an unrelated placeholder human. This generator keeps every row
class-consistent by deriving directional variants from the class sprite itself
and then animating body segments so movement reads like a walk cycle instead of
a simple vertical bob.

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


def alpha_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    bbox = img.getbbox()
    if bbox is None:
        return (0, 0, CELL, CELL)
    return bbox


def split_segments(base: Image.Image) -> tuple[dict[str, tuple[int, int, int, int]], tuple[int, int, int, int]]:
    bbox = alpha_bbox(base)
    x0, y0, x1, y1 = bbox
    width = x1 - x0
    height = y1 - y0
    cx = x0 + width // 2

    head_y = y0 + int(height * 0.22)
    chest_y = y0 + int(height * 0.58)
    waist_y = y0 + int(height * 0.72)
    left_arm_x = x0 + int(width * 0.28)
    right_arm_x = x1 - int(width * 0.28)
    overlap = max(2, height // 32)

    segments = {
        "head": (x0, y0, x1, min(y1, head_y + overlap)),
        "torso": (
            left_arm_x,
            max(y0, head_y - overlap),
            right_arm_x,
            min(y1, chest_y + overlap),
        ),
        "left_arm": (x0, max(y0, head_y - overlap), left_arm_x, min(y1, chest_y + overlap * 2)),
        "right_arm": (
            right_arm_x,
            max(y0, head_y - overlap),
            x1,
            min(y1, chest_y + overlap * 2),
        ),
        "hips": (x0, max(y0, chest_y - overlap), x1, min(y1, waist_y + overlap)),
        "left_leg": (x0, max(y0, waist_y - overlap), cx + overlap, y1),
        "right_leg": (max(x0, cx - overlap), max(y0, waist_y - overlap), x1, y1),
    }
    return segments, bbox


def frame_offsets(direction: str) -> list[dict[str, tuple[int, int]]]:
    if direction in ("down", "up"):
        return [
            {
                "head": (0, 0),
                "torso": (-2, 0),
                "left_arm": (-2, 0),
                "right_arm": (2, 0),
                "hips": (0, 0),
                "left_leg": (0, 0),
                "right_leg": (0, 0),
            },
            {
                "head": (-2, -1),
                "torso": (-4, -1),
                "left_arm": (3, 1),
                "right_arm": (-3, -1),
                "hips": (-2, 0),
                "left_leg": (-6, 2),
                "right_leg": (4, -1),
            },
            {
                "head": (0, 0),
                "torso": (2, 0),
                "left_arm": (2, 0),
                "right_arm": (-2, 0),
                "hips": (0, 0),
                "left_leg": (2, 0),
                "right_leg": (-2, 0),
            },
            {
                "head": (2, -1),
                "torso": (4, -1),
                "left_arm": (-3, -1),
                "right_arm": (3, 1),
                "hips": (2, 0),
                "left_leg": (4, -1),
                "right_leg": (-6, 2),
            },
        ]

    return [
        {
            "head": (0, 0),
            "torso": (0, 0),
            "left_arm": (-2, 0),
            "right_arm": (2, 0),
            "hips": (0, 0),
            "left_leg": (0, 0),
            "right_leg": (0, 0),
        },
        {
            "head": (-2, -1),
            "torso": (-2, -1),
            "left_arm": (4, 1),
            "right_arm": (-2, -1),
            "hips": (0, 0),
            "left_leg": (6, 1),
            "right_leg": (-4, 0),
        },
        {
            "head": (0, 0),
            "torso": (0, 0),
            "left_arm": (2, 0),
            "right_arm": (-2, 0),
            "hips": (0, 0),
            "left_leg": (2, 0),
            "right_leg": (-2, 0),
        },
        {
            "head": (2, -1),
            "torso": (2, -1),
            "left_arm": (-2, -1),
            "right_arm": (4, 1),
            "hips": (0, 0),
            "left_leg": (-4, 0),
            "right_leg": (6, 1),
        },
    ]


def pose_frame(base: Image.Image, direction: str, frame_idx: int) -> Image.Image:
    segments, bbox = split_segments(base)
    offsets = frame_offsets(direction)[frame_idx]
    frame = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))

    # Paint back-to-front so stride pieces overlap naturally.
    draw_order = ["left_leg", "right_leg", "hips", "torso", "left_arm", "right_arm", "head"]
    for key in draw_order:
        region = segments[key]
        part = base.crop(region)
        dx, dy = offsets[key]
        frame.paste(part, (region[0] + dx, region[1] + dy), part)

    # Keep the feet grounded if the stride lifted the whole silhouette.
    new_bbox = frame.getbbox()
    if new_bbox:
        _, _, _, y1 = bbox
        _, _, _, new_y1 = new_bbox
        foot_adjust = y1 - new_y1
        if foot_adjust:
            grounded = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            grounded.paste(frame, (0, foot_adjust), frame)
            frame = grounded

    return frame


def make_walk_sheet(class_id: str) -> Image.Image:
    """Build a 512x512 walk sheet for one class."""
    sheet = Image.new("RGBA", (SHEET, SHEET), (0, 0, 0, 0))
    variants = directional_variants(class_id)

    for row_idx, direction in enumerate(DIRS):
        base = variants[direction]
        for col_idx in range(4):
            frame = pose_frame(base, direction, col_idx)
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
