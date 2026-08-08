#!/usr/bin/env python3
"""Generate one reference-grounded 64px character animation row.

This is the supported production path for character sprites. It generates one
direction/action row, extracts exactly six 64x64 frames, and leaves the row in
tmp for review. It does not install assets into the game by itself.
"""

from __future__ import annotations

import argparse
import base64
import os
import subprocess
from pathlib import Path

from openai import OpenAI


ROOT = Path(__file__).resolve().parents[1]
PYTHON = Path(
    os.environ.get(
        "KITHLANDS_PYTHON",
        "/Users/corylanou/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3",
    )
)
SKILL_DIR = Path("/Users/corylanou/.codex/skills/game-character-64")
EXTRACT_ROW = ROOT / "scripts" / "extract_character64_row_by_components.py"
PIXEL_SNAP = SKILL_DIR / "scripts" / "pixel_snap.py"
VALIDATE = SKILL_DIR / "scripts" / "validate_64_sheet.py"

DIRECTION_COPY = {
    "south": "front-facing, walking toward camera",
    "south-east": "three-quarter front facing down-right",
    "east": "true right-facing side profile",
    "north-east": "three-quarter back facing up-right",
    "north": "back-facing, walking away from camera",
    "north-west": "three-quarter back facing up-left",
    "west": "true left-facing side profile",
    "south-west": "three-quarter front facing down-left",
}

WALK_FRAMES = 6
POSE_COPY = (
    "Columns left-to-right are the six walk-cycle poses: contact A, down A, "
    "passing, high, contact B, down B. Frame 2 must be a clear passing pose "
    "with the free foot under the body. Frames 0 and 4 must use opposite lead "
    "feet. Do not use only two extreme stride poses or duplicate neighboring "
    "poses. Keep the head and torso anchored while the hips, legs, arms, cape, "
    "and equipment follow the gait with restrained secondary motion."
)

CLASS_FALLBACKS = {
    "warrior": "blue-haired armored sword warrior with blue cloak",
    "brawler": "bald martial artist in orange gi",
    "rogue": "hooded rogue in dark leather and green cloak",
    "mender": "white-magic healer in ivory and pale blue robes holding a staff",
    "cinder": "fire caster in crimson robe with ember accents and small wand",
    "wayfarer": "tan-cloaked traveler with light armor and satchel",
    "knight": "silver plate knight with blue cape and longsword",
    "champion": "orange-and-gold martial champion",
    "shadow": "green-black cloaked assassin",
    "sage": "white-blue holy sage with gold trim and staff",
    "pyromancer": "red-and-gold fire mage with wand",
    "wanderer": "seasoned cloaked adventurer with sword and pack",
}


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, cwd=ROOT, check=True)


def prompt_for(class_id: str, direction: str, action: str) -> str:
    identity = CLASS_FALLBACKS.get(class_id, class_id)
    if action != "walk":
        raise ValueError("only walk rows are supported by this script right now")
    return (
        "Create ONE sprite animation row only, not a full atlas.\n"
        f"Output exactly {WALK_FRAMES} separated full-body pixel-art frames in one horizontal row.\n"
        f"Character: preserve the provided reference image exactly; fallback identity is {identity}.\n"
        f"Direction: {direction} ({DIRECTION_COPY[direction]}). Every frame must face this same direction.\n"
        f"{POSE_COPY}\n"
        "Flat pure #ff00ff chroma-key background. No shadows, no floor, no labels, no UI, no frame numbers.\n"
        "Keep head, torso, clothing colors, weapon, and proportions locked across all frames. "
        "Keep the full body inside each frame with a small margin; do not crop hair, robe, weapon, feet, or effects. "
        "Modern vibrant pixel-remaster JRPG sprite style, hard pixel-art edges, readable at 64x64."
    )


def generate_source(client: OpenAI, class_id: str, direction: str, action: str, reference: Path, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with reference.open("rb") as image:
        result = client.images.edit(
            model="gpt-image-1.5",
            image=image,
            prompt=prompt_for(class_id, direction, action),
            size="1536x1024",
            quality="medium",
            input_fidelity="high",
            n=1,
        )
    out.write_bytes(base64.b64decode(result.data[0].b64_json))


def normalize_row(source: Path, row: Path, clean: Path, qa_dir: Path) -> None:
    run(
        [
            str(PYTHON),
            str(EXTRACT_ROW),
            "--input",
            str(source),
            "--output",
            str(row),
            "--metadata",
            str(qa_dir / f"{row.stem}.components.json"),
            "--frames",
            str(WALK_FRAMES),
        ],
    )
    run(
        [
            str(PYTHON),
            str(PIXEL_SNAP),
            "--input",
            str(row),
            "--output",
            str(clean),
            "--cell",
            "64",
            "--palette",
            "96",
            "--scale-mode",
            "nearest",
            "--alpha-threshold",
            "24",
        ],
    )
    run(
        [
            str(PYTHON),
            str(VALIDATE),
            "--input",
            str(clean),
            "--rows",
            "1",
            "--columns",
            str(WALK_FRAMES),
            "--json-out",
            str(qa_dir / f"{clean.stem}.validation.json"),
            "--contact-sheet",
            str(qa_dir / f"{clean.stem}.contact.png"),
        ],
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--class-id", required=True)
    parser.add_argument("--direction", required=True, choices=sorted(DIRECTION_COPY))
    parser.add_argument("--action", default="walk", choices=["walk"])
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    reference = args.reference or ROOT / "client" / "public" / "sprites" / f"{args.class_id}.png"
    if not reference.exists():
        raise SystemExit(f"reference image not found: {reference}")

    work = ROOT / "client" / "tmp" / "game-character-64" / args.class_id / "rows"
    qa = ROOT / "client" / "tmp" / "game-character-64" / args.class_id / "qa" / "rows"
    stem = f"{args.class_id}-{args.action}-{args.direction}"
    source = work / "generated" / f"{stem}-source.png"
    row = work / "extracted" / f"{stem}-row.png"
    clean = work / "final" / f"{stem}-row-clean.png"
    if clean.exists() and not args.force:
        print(clean)
        return

    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    generate_source(client, args.class_id, args.direction, args.action, reference, source)
    normalize_row(source, row, clean, qa)
    print(clean)


if __name__ == "__main__":
    main()
