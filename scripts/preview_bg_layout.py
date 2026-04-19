#!/usr/bin/env python3
"""Composite committed battle backgrounds with greybox overlays showing
the in-game combatant and HUD zones.

Produces, for every PNG under `<bgdir>/*.png`, a companion
`tmp/proof/bg_composites/<name>_composite.png` that stamps the enemy zone
(screen-left), party zone (screen-right), and HUD strip (bottom 130 px) as
semi-transparent greybox rectangles on top of the painting. Reviewers can
eyeball whether the painting's focal subject would clash with combatants
without firing up the dev server.

Usage:
    python3 scripts/preview_bg_layout.py [<bgdir>]
        (default bgdir: client/public/backgrounds)
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.path.insert(0, "/tmp/kith-venv/lib/python3.12/site-packages")
    from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BG_DIR = REPO_ROOT / "client" / "public" / "backgrounds"
OUT_DIR = REPO_ROOT / "tmp" / "proof" / "bg_composites"

# In-game zones in 800x600 Phaser coords.
# Enemy sprites drawn in drawEnemies(battle.js:886): x=80..430, y=100..320.
# Party sprites placed by buildPartyBattleLayout: x=460..720, y=100..320.
# HUD bottom strip (issue #258) covers y=470..600.
ENEMY_ZONE = (80, 100, 430, 320)
PARTY_ZONE = (460, 100, 720, 320)
HUD_ZONE = (0, 470, 800, 600)


def overlay_rect(draw, rect, fill_rgba, outline_rgba, label, font):
    x0, y0, x1, y1 = rect
    overlay = Image.new("RGBA", (x1 - x0, y1 - y0), fill_rgba)
    draw._image.paste(overlay, (x0, y0), overlay)
    draw.rectangle(rect, outline=outline_rgba, width=3)
    draw.text((x0 + 8, y0 + 6), label, font=font, fill=outline_rgba)


def composite_one(src_path: Path, out_path: Path):
    img = Image.open(src_path).convert("RGBA")
    if img.size != (800, 600):
        img = img.resize((800, 600), Image.LANCZOS)

    try:
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 14
        )
    except OSError:
        font = ImageFont.load_default()

    draw = ImageDraw.Draw(img, "RGBA")
    # Monkey-patch the draw to expose image for paste inside overlay_rect.
    draw._image = img

    overlay_rect(
        draw, ENEMY_ZONE, (255, 80, 80, 90), (255, 200, 200, 255), "ENEMY", font
    )
    overlay_rect(
        draw, PARTY_ZONE, (80, 160, 255, 90), (200, 220, 255, 255), "PARTY", font
    )
    overlay_rect(
        draw, HUD_ZONE, (40, 40, 40, 170), (240, 240, 240, 255), "HUD STRIP", font
    )

    # Label in the corner so reviewers know which variant this is.
    title = src_path.stem
    bbox = draw.textbbox((0, 0), title, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.rectangle((8, 8, 8 + tw + 12, 8 + th + 12), fill=(0, 0, 0, 180))
    draw.text((14, 12), title, font=font, fill=(255, 230, 140, 255))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(out_path, "PNG")


def main():
    bg_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_BG_DIR
    if not bg_dir.exists():
        print(f"ERROR: background dir not found: {bg_dir}")
        sys.exit(2)

    pngs = sorted(
        p
        for p in bg_dir.rglob("*.png")
        if "@2x" not in p.stem and not p.stem.endswith("_composite")
    )
    if not pngs:
        print(f"no backgrounds under {bg_dir}")
        return

    for png in pngs:
        rel = png.relative_to(bg_dir).with_suffix("")
        out = OUT_DIR / f"{rel}_composite.png"
        composite_one(png, out)
        print(f"wrote {out.relative_to(REPO_ROOT)}")

    print(f"done. {len(pngs)} composites under {OUT_DIR.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
