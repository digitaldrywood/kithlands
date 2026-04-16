#!/usr/bin/env python3
"""Build aligned walk sheets from neutral master frames.

Reads neutral masters from client/tmp/walk-masters/{class}_{dir}.png, then
builds 4-frame walk sheets deterministically. Right-facing masters are mirrored
from left-facing masters to keep the style coherent and reduce generation cost.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
MASTER_DIR = REPO_ROOT / "client" / "tmp" / "walk-masters"
OUT_DIR = REPO_ROOT / "client" / "tmp" / "walk-prototypes"
CELL = 128
SHEET = CELL * 4
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--class-id", action="append", choices=CLASS_IDS, help="Limit build to one or more classes")
    parser.add_argument("--suffix", default="proto_d", help="Output suffix before _walk.png")
    return parser.parse_args()


def alpha_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    bbox = img.getbbox()
    if bbox is None:
        return (0, 0, CELL, CELL)
    return bbox


def scale_to_body_height(img: Image.Image, target_h: int) -> Image.Image:
    x0, y0, x1, y1 = alpha_bbox(img)
    body = img.crop((x0, y0, x1, y1))
    height = y1 - y0
    if height <= 0:
        return img
    scale = target_h / height
    new_w = max(1, round(body.width * scale))
    new_h = max(1, round(body.height * scale))
    resized = body.resize((new_w, new_h), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    x = (CELL - new_w) // 2
    y = CELL - new_h - 8
    canvas.paste(resized, (x, y), resized)
    return canvas


def prepare_master(direction: str, img: Image.Image, target_h: int) -> Image.Image:
    return scale_to_body_height(img, target_h)


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
        "cape": (back_x0, chest_y - 6, back_x1, y1),
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
            "cape": (0, 0),
            "torso": (0, 0),
            "front_arm": (0, 0),
            "back_arm": (0, 0),
            "front_leg": (0, 0),
            "back_leg": (0, 0),
        },
        {
            "head": (-2, -1),
            "cape": (2, 1),
            "torso": (-2, 0),
            "front_arm": (-3, 1),
            "back_arm": (2, -1),
            "front_leg": (-4, 2),
            "back_leg": (2, 0),
        },
        {
            "head": (0, -2),
            "cape": (1, 0),
            "torso": (0, 0),
            "front_arm": (0, 0),
            "back_arm": (0, 0),
            "front_leg": (-1, 0),
            "back_leg": (1, 0),
        },
        {
            "head": (2, -1),
            "cape": (-2, 1),
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
            "cape": (0, 0),
            "torso": (0, 0),
            "front_arm": (0, 0),
            "back_arm": (0, 0),
            "front_leg": (0, 0),
            "back_leg": (0, 0),
        },
        {
            "head": (2, -1),
            "cape": (-2, 1),
            "torso": (2, 0),
            "front_arm": (3, 1),
            "back_arm": (-2, -1),
            "front_leg": (4, 2),
            "back_leg": (-2, 0),
        },
        {
            "head": (0, -2),
            "cape": (-1, 0),
            "torso": (0, 0),
            "front_arm": (0, 0),
            "back_arm": (0, 0),
            "front_leg": (1, 0),
            "back_leg": (-1, 0),
        },
        {
            "head": (-2, -1),
            "cape": (2, 1),
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
        draw_order = ["cape", "back_leg", "front_leg", "torso", "back_arm", "front_arm", "head"]
    frame = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    for key in draw_order:
        x0, y0, x1, y1 = segments[key]
        part = base.crop((x0, y0, x1, y1))
        dx, dy = offsets[key]
        frame.paste(part, (x0 + dx, y0 + dy), part)
    return frame


def load_masters(class_id: str) -> dict[str, Image.Image]:
    down = Image.open(MASTER_DIR / f"{class_id}_down.png").convert("RGBA")
    up = Image.open(MASTER_DIR / f"{class_id}_up.png").convert("RGBA")
    left = Image.open(MASTER_DIR / f"{class_id}_left.png").convert("RGBA")
    right = left.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    return {"down": down, "up": up, "left": left, "right": right}


def build_sheet_for_class(class_id: str) -> Image.Image:
    raw_masters = load_masters(class_id)
    target_h = max(alpha_bbox(raw_masters[d])[3] - alpha_bbox(raw_masters[d])[1] for d in raw_masters)
    masters = {
        direction: prepare_master(direction, raw_masters[direction], target_h)
        for direction in ["down", "up", "left", "right"]
    }
    sheet = Image.new("RGBA", (SHEET, SHEET), (0, 0, 0, 0))
    for row_idx, direction in enumerate(["down", "up", "left", "right"]):
        base = masters[direction]
        for col_idx in range(4):
            frame = pose_frame(base, direction, col_idx)
            sheet.paste(frame, (col_idx * CELL, row_idx * CELL), frame)
    return sheet


def main() -> None:
    args = parse_args()
    classes = args.class_id or CLASS_IDS
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for class_id in classes:
        out_path = OUT_DIR / f"{class_id}_{args.suffix}_walk.png"
        sheet = build_sheet_for_class(class_id)
        sheet.save(out_path)
        print(out_path)


if __name__ == "__main__":
    main()
