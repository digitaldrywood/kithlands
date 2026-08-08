#!/usr/bin/env python3
"""Generate native Game Character 64 walk/attack sheets with OpenAI Images.

Deprecated: this script generates full atlases from text prompts. That path is
blocked by default because it repeatedly produced wrong-facing and clipped rows.
Use scripts/generate_character64_row_openai.py for production row-first work.
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
EXTRACT = ROOT / "scripts" / "extract_game_character64_native_walk.py"
PIXEL_SNAP = SKILL_DIR / "scripts" / "pixel_snap.py"
VALIDATE = SKILL_DIR / "scripts" / "validate_64_sheet.py"

CLASS_IDENTITIES = {
    "warrior": "blue-haired armored sword warrior with a steel breastplate, blue cloak, and heroic front-line silhouette",
    "brawler": "bald muscular martial artist in an orange gi, wrist wraps, bare-handed fighting stance, sturdy boots",
    "rogue": "nimble hooded rogue in dark leather and green cloak, dagger at belt, quick scout silhouette",
    "mender": "kind white-magic healer in ivory and pale blue robes, short staff, warm gentle silhouette",
    "cinder": "young black-magic fire caster in crimson robe with ember accents, small wand, lively spellcaster silhouette",
    "wayfarer": "versatile traveler adventurer with tan cloak, light armor, short sword, satchel, practical explorer silhouette",
    "knight": "promoted royal knight in polished silver plate with blue cape and longsword, heavier than warrior",
    "champion": "promoted bare-handed champion in ornate orange-and-gold martial garb, powerful veteran fighter",
    "shadow": "promoted stealth assassin in deep green and black cloak, dagger and bow details, sleek silhouette",
    "sage": "promoted holy sage in elegant white-blue robes with gold trim, staff and calm healer presence",
    "pyromancer": "promoted fire mage in deep red and gold robes, ember mantle, wand, confident arcane silhouette",
    "wanderer": "promoted master adventurer in layered travel cloak and light armor, sword and pack, seasoned explorer",
}


def prompt_for(class_id: str, action: str) -> str:
    identity = CLASS_IDENTITIES[class_id]
    if action == "walk":
        action_copy = (
            "WALK spritesheet atlas: exact 8 columns x 8 rows = 64 frames. "
            "Rows top-to-bottom: south/front, south-east, east/profile, north-east, "
            "north/back, north-west, west/profile, south-west. Columns left-to-right: "
            "8 smooth walk frames with contact, down, passing, high, opposite contact, "
            "opposite down, opposite passing, opposite high poses. Natural walking, "
            "no skipping, no bouncing."
        )
    elif action == "attack":
        action_copy = (
            "ATTACK spritesheet atlas: exact 8 columns x 8 rows = 64 frames. "
            "Rows top-to-bottom: south/front attack, south-east attack, east/profile "
            "attack, north-east attack, north/back attack, north-west attack, "
            "west/profile attack, south-west attack. Columns left-to-right: ready, "
            "wind-up, strike, impact extension, follow-through, recoil, recover, ready. "
            "Animate the equipped weapon or class action close to the body; no detached "
            "projectiles crossing cell boundaries."
        )
    else:
        raise ValueError(action)

    return (
        f"Create a complete game-ready pixel-art {action_copy}\n\n"
        f"Character identity: {identity}.\n\n"
        "Modern vibrant pixel-remaster JRPG style, readable 64x64 sprites, one "
        "character only, same identity in every frame, full body inside every cell. "
        "Flat pure #00ff00 chroma-key background across all empty space. No text, "
        "no labels, no UI, no frame numbers, no shadows, no floor. Feet must touch "
        "the bottom of each cell after cropping. Keep head and torso stable between "
        "frames; movement should come mainly from legs, arms, cloak, weapon, and "
        "subtle shoulder rotation. Hard pixel-art edges, rich but controlled palette."
    )


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, cwd=ROOT, check=True)


def generate_source(client: OpenAI, class_id: str, action: str, out: Path) -> None:
    if out.exists():
        return
    result = client.images.generate(
        model="gpt-image-1.5",
        prompt=prompt_for(class_id, action),
        size="1024x1536",
        quality="medium",
        n=1,
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(base64.b64decode(result.data[0].b64_json))


def normalize(class_id: str, action: str, source: Path) -> Path:
    work = ROOT / "client" / "tmp" / "game-character-64" / class_id
    final = work / "final" / f"{class_id}-{action}-native-8x8.png"
    clean = work / "final" / f"{class_id}-{action}-native-8x8-clean.png"
    qa = work / "qa"
    installed_dir = ROOT / "client" / "public" / "sprites" / action
    installed = installed_dir / f"{class_id}_{action}.png"

    run(
        [
            str(PYTHON),
            str(EXTRACT),
            "--input",
            str(source),
            "--output",
            str(final),
            "--columns",
            "8",
            "--rows",
            "8",
            "--cell",
            "64",
            "--inset",
            "0",
            "--min-component-area",
            "32",
            "--low-component-top-ratio",
            "0.70",
            "--low-component-max-area",
            "420",
        ],
    )
    run(
        [
            str(PYTHON),
            str(PIXEL_SNAP),
            "--input",
            str(final),
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
    qa.mkdir(parents=True, exist_ok=True)
    run(
        [
            str(PYTHON),
            str(VALIDATE),
            "--input",
            str(clean),
            "--rows",
            "8",
            "--columns",
            "8",
            "--json-out",
            str(qa / f"validation-{action}.json"),
            "--contact-sheet",
            str(qa / f"contact-sheet-{action}.png"),
        ],
    )
    installed_dir.mkdir(parents=True, exist_ok=True)
    installed.write_bytes(clean.read_bytes())
    return installed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--classes", nargs="+", default=list(CLASS_IDENTITIES))
    parser.add_argument("--actions", nargs="+", default=["walk", "attack"])
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument(
        "--allow-full-atlas",
        action="store_true",
        help="Deprecated escape hatch. Use only for throwaway exploration, never direct runtime install.",
    )
    args = parser.parse_args()

    if not args.allow_full_atlas:
        raise SystemExit(
            "Full-atlas generation is blocked. Use "
            "scripts/generate_character64_row_openai.py to generate one "
            "reference-grounded row at a time, then assemble only accepted rows."
        )

    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    for class_id in args.classes:
        if class_id not in CLASS_IDENTITIES:
            raise SystemExit(f"unknown class: {class_id}")
        for action in args.actions:
            source = (
                ROOT
                / "client"
                / "tmp"
                / "game-character-64"
                / class_id
                / "generated"
                / f"{class_id}-{action}-source-gpt-image-1.5.png"
            )
            installed = (
                ROOT
                / "client"
                / "public"
                / "sprites"
                / action
                / f"{class_id}_{action}.png"
            )
            if args.skip_existing and installed.exists():
                print(f"skip {installed}")
                continue
            print(f"generating {class_id} {action}")
            generate_source(client, class_id, action, source)
            print(f"normalizing {source}")
            print(f"installed {normalize(class_id, action, source)}")


if __name__ == "__main__":
    main()
