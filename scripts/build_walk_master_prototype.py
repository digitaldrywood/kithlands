#!/usr/bin/env python3
"""Build a coherent walk prototype from stable master frames.

Uses one chosen master frame per direction, then synthesizes the 4-frame walk
cycle deterministically by shifting segmented body parts. This avoids the
frame-to-frame identity drift from AI-generated independent frames.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
PROTO_DIR = REPO_ROOT / "client" / "tmp" / "walk-prototypes"
CELL = 128
SHEET = CELL * 4

MASTERS = {
    "down": PROTO_DIR / "warrior_proto_c_down_f3.png",
    "up": PROTO_DIR / "warrior_proto_c_up_f0.png",
    "left": PROTO_DIR / "warrior_proto_c_left_f0.png",
    "right": PROTO_DIR / "warrior_proto_c_right_f2.png",
}


def alpha_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    bbox = img.getbbox()
    if bbox is None:
        return (0, 0, CELL, CELL)
    return bbox


def split_front_back(base: Image.Image) -> dict[str, tuple[int, int, int, int]]:
    x0, y0, x1, y1 = alpha_bbox(base)
    w = x1 - x0
    h = y1 - y0
    cx = x0 + w // 2
    head_y = y0 + int(h * 0.22)
    chest_y = y0 + int(h * 0.52)
    waist_y = y0 + int(h * 0.72)
    arm_inner = max(x0 + 1, x0 + int(w * 0.28))
    arm_outer = min(x1 - 1, x1 - int(w * 0.28))

    return {
        "head": (x0, y0, x1, head_y),
        "torso": (arm_inner, head_y, arm_outer, waist_y),
        "left_arm": (x0, head_y, arm_inner, waist_y),
        "right_arm": (arm_outer, head_y, x1, waist_y),
        "hips": (x0, chest_y, x1, waist_y),
        "left_leg": (x0, waist_y, cx, y1),
        "right_leg": (cx, waist_y, x1, y1),
    }


def split_side(base: Image.Image, facing: str) -> dict[str, tuple[int, int, int, int]]:
    x0, y0, x1, y1 = alpha_bbox(base)
    w = x1 - x0
    h = y1 - y0
    head_y = y0 + int(h * 0.26)
    chest_y = y0 + int(h * 0.54)
    waist_y = y0 + int(h * 0.73)
    mid_x = x0 + w // 2

    if facing == "left":
        front_x0, front_x1 = x0, mid_x
        back_x0, back_x1 = mid_x, x1
    else:
        front_x0, front_x1 = mid_x, x1
        back_x0, back_x1 = x0, mid_x

    return {
        "head": (x0, y0, x1, head_y),
        "torso": (x0, head_y, x1, waist_y),
        "front_arm": (front_x0, chest_y - 4, front_x1, waist_y),
        "back_arm": (back_x0, chest_y - 4, back_x1, waist_y),
        "front_leg": (front_x0, waist_y, front_x1, y1),
        "back_leg": (back_x0, waist_y, back_x1, y1),
    }


FRONT_BACK_OFFSETS = [
    {
        "head": (0, 0),
        "torso": (0, 0),
        "left_arm": (-1, 0),
        "right_arm": (1, 0),
        "hips": (0, 0),
        "left_leg": (-1, 0),
        "right_leg": (1, 0),
    },
    {
        "head": (-2, -1),
        "torso": (-1, 0),
        "left_arm": (2, 0),
        "right_arm": (-3, 1),
        "hips": (-1, 0),
        "left_leg": (-3, 2),
        "right_leg": (2, 0),
    },
    {
        "head": (0, -2),
        "torso": (0, 0),
        "left_arm": (0, 0),
        "right_arm": (0, 0),
        "hips": (0, 0),
        "left_leg": (0, 0),
        "right_leg": (0, 0),
    },
    {
        "head": (2, -1),
        "torso": (1, 0),
        "left_arm": (3, 1),
        "right_arm": (-2, 0),
        "hips": (1, 0),
        "left_leg": (-2, 0),
        "right_leg": (3, 2),
    },
]


SIDE_OFFSETS = {
    "left": [
        {
            "head": (0, 0),
            "torso": (0, 0),
            "front_arm": (0, 0),
            "back_arm": (0, 0),
            "front_leg": (0, 0),
            "back_leg": (0, 0),
        },
        {
            "head": (-2, -1),
            "torso": (-2, 0),
            "front_arm": (-3, 1),
            "back_arm": (2, -1),
            "front_leg": (-4, 2),
            "back_leg": (2, 0),
        },
        {
            "head": (0, -2),
            "torso": (0, 0),
            "front_arm": (0, 0),
            "back_arm": (0, 0),
            "front_leg": (-1, 0),
            "back_leg": (1, 0),
        },
        {
            "head": (2, -1),
            "torso": (2, 0),
            "front_arm": (2, -1),
            "back_arm": (-3, 1),
            "front_leg": (2, 0),
            "back_leg": (-4, 2),
        },
    ],
    "right": [
        {
            "head": (0, 0),
            "torso": (0, 0),
            "front_arm": (0, 0),
            "back_arm": (0, 0),
            "front_leg": (0, 0),
            "back_leg": (0, 0),
        },
        {
            "head": (2, -1),
            "torso": (2, 0),
            "front_arm": (3, 1),
            "back_arm": (-2, -1),
            "front_leg": (4, 2),
            "back_leg": (-2, 0),
        },
        {
            "head": (0, -2),
            "torso": (0, 0),
            "front_arm": (0, 0),
            "back_arm": (0, 0),
            "front_leg": (1, 0),
            "back_leg": (-1, 0),
        },
        {
            "head": (-2, -1),
            "torso": (-2, 0),
            "front_arm": (-2, -1),
            "back_arm": (3, 1),
            "front_leg": (-2, 0),
            "back_leg": (4, 2),
        },
    ],
}


def pose_frame(base: Image.Image, direction: str, frame_idx: int) -> Image.Image:
    if direction in ("down", "up"):
        segments = split_front_back(base)
        offsets = FRONT_BACK_OFFSETS[frame_idx]
        draw_order = ["left_leg", "right_leg", "hips", "torso", "left_arm", "right_arm", "head"]
    else:
        segments = split_side(base, direction)
        offsets = SIDE_OFFSETS[direction][frame_idx]
        draw_order = ["back_leg", "front_leg", "torso", "back_arm", "front_arm", "head"]

    frame = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    for key in draw_order:
        x0, y0, x1, y1 = segments[key]
        part = base.crop((x0, y0, x1, y1))
        dx, dy = offsets[key]
        frame.paste(part, (x0 + dx, y0 + dy), part)
    return frame


def build_sheet() -> Image.Image:
    sheet = Image.new("RGBA", (SHEET, SHEET), (0, 0, 0, 0))
    for row_idx, direction in enumerate(["down", "up", "left", "right"]):
        base = Image.open(MASTERS[direction]).convert("RGBA")
        for col_idx in range(4):
            frame = pose_frame(base, direction, col_idx)
            sheet.paste(frame, (col_idx * CELL, row_idx * CELL), frame)
    return sheet


def main() -> None:
    out_path = PROTO_DIR / "warrior_proto_d_walk.png"
    sheet = build_sheet()
    sheet.save(out_path)
    print(out_path)


if __name__ == "__main__":
    main()
