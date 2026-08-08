#!/usr/bin/env python3
"""Publish walk sheets from reviewed directional master art.

This script intentionally does not synthesize sprites from front-facing
portraits or procedural rectangles. Kithlands needs rich, readable field
sprites with real front/back/profile art.

Expected inputs:
  client/tmp/walk-masters/{class}_{direction}.png

Required directions per class:
  down, up, left

Right-facing masters are mirrored from left-facing masters for consistency.
The assembler builds the 4-frame cycle and publishes:
  client/public/sprites/walk/{class}_walk.png
"""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
MASTER_DIR = REPO_ROOT / "client" / "tmp" / "walk-masters"
PUBLIC_WALK_DIR = REPO_ROOT / "client" / "public" / "sprites" / "walk"
PROTOTYPE_DIR = REPO_ROOT / "client" / "tmp" / "walk-prototypes"
BUILDER = REPO_ROOT / "scripts" / "build_walk_master_sheets.py"

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

DIRECTIONS = ["down", "up", "left"]


def missing_masters() -> list[Path]:
    missing: list[Path] = []
    for class_id in CLASS_IDS:
        for direction in DIRECTIONS:
            path = MASTER_DIR / f"{class_id}_{direction}.png"
            if not path.exists():
                missing.append(path)
    return missing


def main() -> int:
    missing = missing_masters()
    if missing:
        print("Missing reviewed directional walk masters.", file=sys.stderr)
        print("", file=sys.stderr)
        print("Do not regenerate from portraits. Create proper rich overworld", file=sys.stderr)
        print("masters first, then rerun this script.", file=sys.stderr)
        print("", file=sys.stderr)
        for path in missing[:20]:
            print(f"  missing: {path.relative_to(REPO_ROOT)}", file=sys.stderr)
        if len(missing) > 20:
            print(f"  ...and {len(missing) - 20} more", file=sys.stderr)
        return 1

    PUBLIC_WALK_DIR.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [sys.executable, str(BUILDER), "--suffix", "reviewed"],
        check=True,
        cwd=REPO_ROOT,
    )
    for class_id in CLASS_IDS:
        src = PROTOTYPE_DIR / f"{class_id}_reviewed_walk.png"
        dst = PUBLIC_WALK_DIR / f"{class_id}_walk.png"
        if not src.exists():
            raise FileNotFoundError(src)
        dst.write_bytes(src.read_bytes())
        print(f"published {dst.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
