#!/usr/bin/env python3
"""Generate a few review-only overworld walk-sheet prototypes via Gemini.

This is intentionally not a runtime asset pipeline. It creates a small number
of candidate 4x4 walk sheets under client/tmp/walk-prototypes/ so humans can
judge whether the art direction is converging on classic JRPG overworld sprites
before any wider rollout.
"""

from __future__ import annotations

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

PROMPTS = [
    (
        "warrior_proto_a_walk.png",
        "warrior",
        (
            "Create a classic JRPG overworld walk sprite sheet for an armored "
            "warrior. Use the first reference image for the target overworld "
            "scale and sprite readability. Use the second reference image only "
            "for class identity cues: silver armor, blue cape, knight feel. "
            "STRICT layout: 4 rows x 4 columns, each cell a full-body sprite. "
            "Row 1 faces down/front, row 2 faces up/back, row 3 faces left "
            "profile, row 4 faces right profile. Columns are idle, left-step, "
            "idle, right-step. Make it read like classic Final Fantasy or "
            "Dragon Quest overworld sprites: chibi body, simple shading, clear "
            "legs and feet, readable silhouette, no portrait detail, no soft "
            "painting, no anti-aliased concept art. The same character must "
            "appear in all 16 cells. Solid bright magenta #FF00FF background."
        ),
    ),
    (
        "rogue_proto_a_walk.png",
        "rogue",
        (
            "Create a classic JRPG overworld walk sprite sheet for a rogue. "
            "Use the first reference image for the target overworld scale and "
            "simplicity. Use the second reference image only for identity "
            "cues: green hood, dark leather gear, dagger, thief silhouette. "
            "STRICT layout: 4 rows x 4 columns, each cell a full-body sprite. "
            "Row 1 faces down/front, row 2 faces up/back, row 3 faces left "
            "profile, row 4 faces right profile. Columns are idle, left-step, "
            "idle, right-step. Keep the legs visible and readable. Make it "
            "chunky, low-res, and classic JRPG overworld style rather than "
            "detailed illustration. Solid bright magenta #FF00FF background."
        ),
    ),
    (
        "mender_proto_a_walk.png",
        "mender",
        (
            "Create a classic JRPG overworld walk sprite sheet for a healer "
            "or white mage. Use the first reference image for target scale and "
            "the second reference image only for class identity cues: white "
            "and blue robe, staff, gentle healer silhouette. STRICT layout: "
            "4 rows x 4 columns, each cell a full-body sprite. Row 1 faces "
            "down/front, row 2 faces up/back, row 3 faces left profile, row 4 "
            "faces right profile. Columns are idle, left-step, idle, "
            "right-step. Classic Final Fantasy style overworld readability: "
            "clear head/body/feet, simple shading, no portrait realism, same "
            "character in every cell. Solid bright magenta #FF00FF background."
        ),
    ),
]


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
    mime = "image/png"
    return {
        "inlineData": {
            "mimeType": mime,
            "data": base64.b64encode(path.read_bytes()).decode(),
        }
    }


def generate_image(parts: list[dict]) -> Image.Image:
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {
                "aspectRatio": "1:1",
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
    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    for part in parts:
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


def main() -> None:
    ensure_api_key()
    build_style_reference()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"style-ref {STYLE_REF}")
    for filename, class_id, prompt in PROMPTS:
        out_path = OUT_DIR / filename
        portrait_path = SPRITES_DIR / f"{class_id}.png"
        print(f"generate {filename}")
        img = generate_image(
            [
                base64_part(STYLE_REF),
                base64_part(portrait_path),
                {"text": prompt},
            ]
        )
        img = remove_magenta(img)
        img = img.resize((512, 512), Image.Resampling.NEAREST)
        img.save(out_path)
        print(f"saved {out_path}")


if __name__ == "__main__":
    main()
