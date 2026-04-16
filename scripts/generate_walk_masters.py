#!/usr/bin/env python3
"""Generate neutral overworld walk masters for each class via Gemini.

Generates only the stable base frames needed for the deterministic walk-sheet
builder: down, up, and left. Right is mirrored from left in the builder so we
reduce cost and consistency drift.
"""

from __future__ import annotations

import argparse
import base64
from collections import deque
import io
import json
import os
import subprocess
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
SPRITES_DIR = REPO_ROOT / "client" / "public" / "sprites"
OUT_DIR = REPO_ROOT / "client" / "tmp" / "walk-masters"
STYLE_REF = OUT_DIR / "style_ref.png"
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-image")
API_KEY = os.environ.get("GEMINI_API_KEY", "")
CELL = 128

CLASS_IDENTITY = {
    "warrior": "silver plate armor, blue cape, knight silhouette, small sword",
    "brawler": "orange gi, muscular monk silhouette, wrapped fists, unarmed martial artist",
    "rogue": "dark leather armor, green hooded cloak, rogue silhouette, dagger",
    "mender": "white and blue robes, healer silhouette, staff with crystal",
    "cinder": "dark purple robe, black mage silhouette, tall pointed hat, glowing eyes, staff",
    "wayfarer": "travel-worn brown cloak, wide-brim hat, walking staff, satchel, adventurer silhouette",
    "knight": "ornate gold-trimmed plate armor, white cape, holy knight silhouette, longsword",
    "champion": "battle-hardened martial champion silhouette, red headband, powerful gauntlets, unarmed",
    "shadow": "black armor, dark purple cloak, assassin silhouette, twin daggers, glowing violet eyes",
    "sage": "ornate white and gold robes, sage silhouette, glowing staff, halo-like ornament",
    "pyromancer": "crimson and black robes, pyromancer silhouette, fire crystal staff, flame motifs",
    "wanderer": "weathered adventurer gear, dual-colored cloak, sword and staff, experienced wanderer silhouette",
}

CLASS_IDS = list(CLASS_IDENTITY.keys())

DIRECTION_REFS = {
    "down": "player_down.png",
    "up": "player_up.png",
    "left": "player_left.png",
}

DIRECTION_LABELS = {
    "down": "front/down view, standing toward the camera",
    "up": "back/up view, standing away from the camera",
    "left": "left profile view, standing left",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--class-id", action="append", choices=CLASS_IDS, help="Limit generation to one or more classes")
    return parser.parse_args()


def ensure_api_key() -> None:
    if API_KEY:
        return
    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("GEMINI_API_KEY="):
                os.environ["GEMINI_API_KEY"] = line.split("=", 1)[1].strip().strip('"').strip("'")
                return
    raise SystemExit("GEMINI_API_KEY not set")


def base64_part(path: Path) -> dict:
    return {
        "inlineData": {
            "mimeType": "image/png",
            "data": base64.b64encode(path.read_bytes()).decode(),
        }
    }


def generate_image(parts: list[dict], *, aspect_ratio: str = "1:1") -> Image.Image:
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {"aspectRatio": aspect_ratio, "imageSize": "1K"},
        },
    }
    req_file = f"/tmp/gemini-walk-master-req-{os.getpid()}.json"
    resp_file = f"/tmp/gemini-walk-master-resp-{os.getpid()}.json"
    with open(req_file, "w") as f:
        json.dump(payload, f)

    result = subprocess.run(
        [
            "curl",
            "-s",
            "-o",
            resp_file,
            "-w",
            "%{http_code}",
            "-X",
            "POST",
            f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={os.environ['GEMINI_API_KEY']}",
            "-H",
            "Content-Type: application/json",
            "-d",
            f"@{req_file}",
        ],
        capture_output=True,
        text=True,
        timeout=180,
    )
    if result.stdout.strip() != "200":
        raise RuntimeError(f"Gemini HTTP {result.stdout.strip()}")
    data = json.loads(Path(resp_file).read_text())
    response_parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    for part in response_parts:
        if "inlineData" in part:
            raw = base64.b64decode(part["inlineData"]["data"])
            return Image.open(io.BytesIO(raw)).convert("RGBA")
    raise RuntimeError("No image part in Gemini response")


def remove_background(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a and r > 120 and b > 120 and g < 120:
                px[x, y] = (0, 0, 0, 0)

    w, h = img.size
    queue = deque()
    seen: set[tuple[int, int]] = set()

    def is_bg(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        return a > 0 and r < 24 and g < 24 and b < 24

    for x in range(w):
        queue.append((x, 0))
        queue.append((x, h - 1))
    for y in range(h):
        queue.append((0, y))
        queue.append((w - 1, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        seen.add((x, y))
        if not is_bg(x, y):
            continue
        px[x, y] = (0, 0, 0, 0)
        queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
    return img


def fit_frame(img: Image.Image) -> Image.Image:
    scale = min(CELL / img.width, CELL / img.height)
    width = max(1, round(img.width * scale))
    height = max(1, round(img.height * scale))
    resized = img.resize((width, height), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    x = (CELL - width) // 2
    y = CELL - height - 8
    canvas.paste(resized, (x, y), resized)
    return canvas


def build_style_reference() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    board = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    positions = [
        ("player_down.png", (0, 0)),
        ("player_up.png", (128, 0)),
        ("player_left.png", (0, 128)),
        ("player_right.png", (128, 128)),
    ]
    for name, pos in positions:
        img = Image.open(SPRITES_DIR / name).convert("RGBA").resize((128, 128), Image.Resampling.NEAREST)
        board.paste(img, pos, img)
    board.save(STYLE_REF)


def prompt_for(class_id: str, direction: str) -> str:
    return (
        "Create one single full-body overworld sprite frame on a solid bright "
        "magenta #FF00FF background. Classic JRPG overworld style, not a "
        "portrait, not a strip, not multiple poses. Keep the camera angle "
        f"locked to {DIRECTION_LABELS[direction]}. This is a neutral standing "
        "base frame, not a step pose. Keep the sprite centered in the square "
        "with the feet visible and the silhouette readable. Use the first "
        "reference image for general overworld readability, the second "
        "reference image for the exact facing/style of this direction, and "
        "the third reference image only for class identity cues: "
        f"{CLASS_IDENTITY[class_id]}."
    )


def main() -> None:
    args = parse_args()
    ensure_api_key()
    build_style_reference()
    classes = args.class_id or CLASS_IDS

    for class_id in classes:
        portrait = SPRITES_DIR / f"{class_id}.png"
        for direction, ref_name in DIRECTION_REFS.items():
            out_path = OUT_DIR / f"{class_id}_{direction}.png"
            print(f"generate {out_path.name}")
            img = generate_image(
                [
                    base64_part(STYLE_REF),
                    base64_part(SPRITES_DIR / ref_name),
                    base64_part(portrait),
                    {"text": prompt_for(class_id, direction)},
                ]
            )
            img = fit_frame(remove_background(img))
            img.save(out_path)
            print(f"saved {out_path}")


if __name__ == "__main__":
    main()
