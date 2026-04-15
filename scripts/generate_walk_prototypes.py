#!/usr/bin/env python3
"""Generate review-only overworld walk prototypes via Gemini.

This version intentionally generates one 4-frame row per facing, then composes
the rows into a single 4x4 walk sheet. That makes the model solve a much
simpler problem than "invent a full sheet at once" and gives us a cleaner way
to reject bad choreography.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import subprocess
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
SPRITES_DIR = REPO_ROOT / "client" / "public" / "sprites"
OUT_DIR = REPO_ROOT / "client" / "tmp" / "walk-prototypes"
STYLE_REF = OUT_DIR / "style_ref.png"
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-image")
API_KEY = os.environ.get("GEMINI_API_KEY", "")
CELL = 128
SHEET = CELL * 4

WARRIOR_IDENTITY = (
    "silver plate armor, blue cape, knight silhouette, small sword, classic "
    "JRPG overworld proportions"
)

ROW_SPECS = [
    (
        "down",
        (
            "Create a single horizontal strip containing exactly 4 full-body "
            "overworld sprite frames of the same armored warrior walking "
            "TOWARD the camera in a classic JRPG style. Keep the camera angle "
            "locked to a front/down view in all four frames. Do not rotate the "
            "character. Do not switch to a side or back view. The 4 frames "
            "must form a real walk cycle in order: frame 1 neutral/contact, "
            "frame 2 left leg forward with opposite arm swing, frame 3 "
            "passing/neutral variant, frame 4 right leg forward with opposite "
            "arm swing. Keep the head and torso anchored, only the limbs and "
            "cape should shift naturally. Use the first reference image only "
            "for overworld sprite style/scale and the second reference image "
            f"only for warrior identity cues: {WARRIOR_IDENTITY}. "
            "Use a solid bright magenta #FF00FF background."
        ),
    ),
    (
        "up",
        (
            "Create a single horizontal strip containing exactly 4 full-body "
            "overworld sprite frames of the same armored warrior walking AWAY "
            "from the camera in a classic JRPG style. Keep the camera angle "
            "locked to a back/up view in all four frames. Do not rotate the "
            "character. Do not show the face from the front. The 4 frames "
            "must form a real walk cycle in order: frame 1 neutral/contact, "
            "frame 2 left leg forward with opposite arm swing, frame 3 "
            "passing/neutral variant, frame 4 right leg forward with opposite "
            "arm swing. Keep the back silhouette readable and the cape motion "
            "subtle. Use the first reference image only for overworld sprite "
            "style/scale and the second reference image only for warrior "
            f"identity cues: {WARRIOR_IDENTITY}. Use a solid bright magenta "
            "#FF00FF background."
        ),
    ),
    (
        "left",
        (
            "Create a single horizontal strip containing exactly 4 full-body "
            "overworld sprite frames of the same armored warrior walking LEFT "
            "in a classic JRPG style. Keep the camera angle locked to a left "
            "profile view in all four frames. Do not rotate toward the front "
            "or back. The 4 frames must form a real walk cycle in order: "
            "frame 1 neutral/contact, frame 2 left leg forward with opposite "
            "arm swing, frame 3 passing/neutral variant, frame 4 right leg "
            "forward with opposite arm swing. Keep the torso stable and make "
            "the legs read clearly. Use the first reference image only for "
            "overworld sprite style/scale and the second reference image only "
            f"for warrior identity cues: {WARRIOR_IDENTITY}. Use a solid "
            "bright magenta #FF00FF background."
        ),
    ),
    (
        "right",
        (
            "Create a single horizontal strip containing exactly 4 full-body "
            "overworld sprite frames of the same armored warrior walking "
            "RIGHT in a classic JRPG style. Keep the camera angle locked to a "
            "right profile view in all four frames. Do not rotate toward the "
            "front or back. The 4 frames must form a real walk cycle in order: "
            "frame 1 neutral/contact, frame 2 left leg forward with opposite "
            "arm swing, frame 3 passing/neutral variant, frame 4 right leg "
            "forward with opposite arm swing. Keep the torso stable and make "
            "the legs read clearly. Use the first reference image only for "
            "overworld sprite style/scale and the second reference image only "
            f"for warrior identity cues: {WARRIOR_IDENTITY}. Use a solid "
            "bright magenta #FF00FF background."
        ),
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--class-id",
        default="warrior",
        choices=["warrior"],
        help="Prototype class to generate",
    )
    parser.add_argument(
        "--name",
        default="warrior_proto_b",
        help="Output basename without _walk.png suffix",
    )
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


def generate_image(parts: list[dict], *, aspect_ratio: str) -> Image.Image:
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {
                "aspectRatio": aspect_ratio,
                "imageSize": "1K",
            },
        },
    }

    req_file = f"/tmp/gemini-walk-proto-req-{os.getpid()}.json"
    resp_file = f"/tmp/gemini-walk-proto-resp-{os.getpid()}.json"
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


def remove_magenta(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a and r > 120 and b > 120 and g < 120:
                px[x, y] = (0, 0, 0, 0)
    return img


def fit_row(img: Image.Image) -> Image.Image:
    scale = min(SHEET / img.width, CELL / img.height)
    width = max(1, round(img.width * scale))
    height = max(1, round(img.height * scale))
    resized = img.resize((width, height), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (SHEET, CELL), (0, 0, 0, 0))
    x = (SHEET - width) // 2
    y = (CELL - height) // 2
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
        img = (
            Image.open(SPRITES_DIR / name)
            .convert("RGBA")
            .resize((128, 128), Image.Resampling.NEAREST)
        )
        board.paste(img, pos, img)
    board.save(STYLE_REF)


def compose_sheet(rows: list[Image.Image]) -> Image.Image:
    sheet = Image.new("RGBA", (SHEET, SHEET), (0, 0, 0, 0))
    for row_idx, row_img in enumerate(rows):
        sheet.paste(row_img, (0, row_idx * CELL), row_img)
    return sheet


def main() -> None:
    args = parse_args()
    ensure_api_key()
    build_style_reference()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    portrait_path = SPRITES_DIR / f"{args.class_id}.png"
    row_images: list[Image.Image] = []

    print(f"style-ref {STYLE_REF}")
    for direction, prompt in ROW_SPECS:
        out_path = OUT_DIR / f"{args.name}_{direction}.png"
        print(f"generate {out_path.name}")
        img = generate_image(
            [
                base64_part(STYLE_REF),
                base64_part(portrait_path),
                {"text": prompt},
            ],
            aspect_ratio="16:9",
        )
        img = fit_row(remove_magenta(img))
        img.save(out_path)
        row_images.append(img)
        print(f"saved {out_path}")

    sheet = compose_sheet(row_images)
    sheet_path = OUT_DIR / f"{args.name}_walk.png"
    sheet.save(sheet_path)
    print(f"saved {sheet_path}")


if __name__ == "__main__":
    main()
