#!/usr/bin/env python3
"""Produce a composition-hint PNG that we hand to Gemini 2.5 Flash Image as
a reference image alongside the biome text prompt.

The template is not an annotated schematic — annotations in the reference
leak into the painting. Instead it renders a soft blocked-out mockup of
the target painting's structure:

  - Upper 1/3  : sky (gradient)
  - Mid band   : distant horizon silhouette hint
  - Lower mid  : open ground plane
  - Bottom     : solid dark band (will be covered by the UI strip in game)
  - Combatant zones (left + right thirds, y=100-320): filled with sky/ground
    colors only — no subjects, so Gemini sees those regions as atmospheric
    and keeps them clear in the generated painting.
  - Small central silhouette hint at (x≈400, y≈350) so the model knows to
    put the painting's focal subject there.

Gemini accepts inline_data up to 14 images; we only send one.

Usage:
    python3 scripts/make_layout_template.py <motif> [out_path]

If out_path is omitted, writes to tmp/layout_templates/<motif>.png.

Palettes per motif are tuned so the reference already hints at the biome
color mood — forest uses greens, snow uses pale blues, etc. This biases
Gemini toward the right palette without us repeating it in the prompt.
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:
    sys.path.insert(0, "/tmp/kith-venv/lib/python3.12/site-packages")
    from PIL import Image, ImageDraw, ImageFilter

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "tmp" / "layout_templates"

W, H = 800, 600

# (sky_top, sky_bottom, horizon_silhouette, ground_plane, focal_hint)
# RGB tuples. Chosen to suggest biome mood without locking detail.
PALETTES = {
    "plains": ((180, 200, 220), (240, 220, 190), (60, 80, 50), (110, 150, 80), (80, 100, 60)),
    "forest": ((130, 170, 200), (230, 220, 180), (40, 70, 40), (80, 120, 60), (60, 90, 45)),
    "dunes": ((180, 200, 220), (240, 200, 140), (180, 140, 90), (220, 180, 120), (170, 130, 80)),
    "mountains": ((150, 170, 200), (220, 220, 220), (90, 100, 120), (140, 150, 160), (80, 90, 110)),
    "snow": ((190, 210, 230), (240, 240, 245), (180, 190, 210), (230, 235, 245), (150, 170, 200)),
    "marsh": ((140, 150, 140), (200, 190, 140), (60, 80, 60), (90, 110, 90), (50, 70, 50)),
    "shore": ((170, 200, 220), (240, 210, 180), (120, 140, 160), (210, 195, 170), (130, 150, 170)),
    "interior": ((60, 50, 40), (120, 90, 60), (40, 30, 20), (80, 60, 40), (180, 140, 80)),
}


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_template(motif: str, out_path: Path):
    if motif not in PALETTES:
        raise SystemExit(f"unknown motif: {motif}")
    sky_top, sky_bottom, horizon, ground, focal = PALETTES[motif]

    img = Image.new("RGB", (W, H), sky_top)
    draw = ImageDraw.Draw(img)

    # Sky gradient (y=0..400)
    for y in range(0, 400):
        t = y / 400.0
        draw.line([(0, y), (W, y)], fill=lerp(sky_top, sky_bottom, t))

    # Distant horizon silhouette band (y=320..400). This hints "distant
    # scenery goes here" so the painting places treelines / mountain
    # silhouettes / far buildings at the correct depth.
    horizon_img = Image.new("RGB", (W, 90), horizon)
    hd = ImageDraw.Draw(horizon_img)
    # Add gentle undulation so it doesn't read as a flat bar.
    for x in range(0, W, 20):
        import math
        dip = int(20 * math.sin(x * 0.03))
        hd.rectangle([x, 0, x + 20, 40 + dip], fill=sky_bottom)
    horizon_img = horizon_img.filter(ImageFilter.GaussianBlur(radius=8))
    img.paste(horizon_img, (0, 320))

    # Open ground plane (y=400..470)
    for y in range(400, 470):
        t = (y - 400) / 70.0
        draw.line([(0, y), (W, y)], fill=lerp(horizon, ground, t))

    # Focal silhouette hint — low, short, centered between combatants. Must
    # fit entirely between y=400 and y=460 (well below the combatant zones
    # which end at y=320). If the silhouette reaches up higher than y=370,
    # Gemini reads it as "draw a tall tower here" and the result rises into
    # both combatant zones. Keep it small.
    # Mountains is special-cased below: no focal silhouette at all (the
    # natural "mountain" subject is tall peaks, and any focal hint biases
    # the model toward a central tower).
    if motif != "mountains":
        focal_img = Image.new("RGBA", (100, 60), (0, 0, 0, 0))
        fd = ImageDraw.Draw(focal_img)
        # Low squat shape — like a boulder or bush, not a tree.
        fd.ellipse([10, 10, 90, 60], fill=focal + (200,))
        focal_img = focal_img.filter(ImageFilter.GaussianBlur(radius=5))
        img.paste(focal_img, (350, 400), focal_img)

    # HUD occlusion band (y=470..600). Solid dark so the model knows this
    # area is throwaway and doesn't put anything interesting there.
    draw.rectangle([0, 470, W, H], fill=(20, 25, 35))
    # Thin highlight at top edge mirroring the in-game FF6 strip.
    draw.rectangle([0, 470, W, 472], fill=(200, 215, 235))

    # Combatant zones: explicitly painted with the sky/ground continuation
    # so Gemini sees them as "already empty." Rectangles are semi-transparent
    # overlays that soften any residual detail from the blur steps.
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    # Left combatant zone: x=80..430, y=100..320
    od.rectangle([80, 100, 430, 320], fill=sky_bottom + (60,))
    # Right combatant zone: x=460..720, y=100..320
    od.rectangle([460, 100, 720, 320], fill=sky_bottom + (60,))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

    # Soft overall blur so the template reads as "rough composition mood
    # board" rather than a hard schematic. Annotations or sharp edges
    # would leak into the output.
    img = img.filter(ImageFilter.GaussianBlur(radius=3))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "PNG")
    return out_path


def main():
    if len(sys.argv) < 2:
        print("usage: make_layout_template.py <motif> [out_path]")
        sys.exit(2)
    motif = sys.argv[1]
    out = (
        Path(sys.argv[2])
        if len(sys.argv) >= 3
        else OUT_DIR / f"{motif}.png"
    )
    path = make_template(motif, out)
    print(f"wrote {path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
