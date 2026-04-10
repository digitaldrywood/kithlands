#!/usr/bin/env python3
"""Regenerate contaminated sprites with verification.

Reads the asset manifest from generate_sprites.py, generates each target
sprite, verifies low green-speckle contamination, and retries up to 3
times if the result is still contaminated.
"""

import sys
import os
import importlib.util

sys.path.insert(0, "/tmp/kith-venv/lib/python3.12/site-packages")
from PIL import Image  # noqa: E402

# Load generate_sprites.py as a module
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "gs", os.path.join(HERE, "generate_sprites.py")
)
gs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gs)

# Targets provided on command line; fallback to full contaminated set
if len(sys.argv) > 1:
    TARGETS = set(sys.argv[1:])
else:
    TARGETS = set()


def contamination_pct(path):
    img = Image.open(path).convert("RGBA")
    pixels = img.load()
    w, h = img.size
    speckle = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if 0 < a < 250 and g > max(r, b) and g > 60:
                speckle += 1
    return 100 * speckle / (w * h)


def regen_one(filename, size, prompt, max_attempts=3, threshold=1.0):
    path = os.path.join(gs.SPRITES_DIR, filename)
    for attempt in range(1, max_attempts + 1):
        print(f"  [attempt {attempt}] {filename}...")
        if not gs.generate_and_process(prompt, path, size):
            continue
        pct = contamination_pct(path)
        if pct < threshold:
            print(f"  ✓ {filename} clean at {pct:.2f}%")
            return True
        print(f"  ⚠ {filename} contaminated at {pct:.2f}%, retrying...")
    print(f"  ✗ {filename} failed all {max_attempts} attempts")
    return False


def main():
    all_sprites = (
        list(gs.CLASS_SPRITES)
        + list(gs.WALK_SPRITES)
        + list(gs.WALK_ANIMATION_FRAMES)
        + list(gs.MONSTER_SPRITES)
        + list(gs.NPC_SPRITES)
        + list(gs.UI_ICONS)
        + list(gs.UI_ELEMENTS)
    )
    to_regen = [(f, s, p) for f, s, p in all_sprites if f in TARGETS]
    if not to_regen:
        print(f"No targets matched. Available files: {len(all_sprites)}")
        for t in sorted(TARGETS):
            print(f"  requested: {t}")
        return 1

    print(f"Regenerating {len(to_regen)} sprites...")
    success = 0
    for filename, size, prompt in to_regen:
        if regen_one(filename, size, prompt):
            success += 1
    print(f"\nDone: {success}/{len(to_regen)} clean")
    return 0 if success == len(to_regen) else 2


if __name__ == "__main__":
    sys.exit(main())
