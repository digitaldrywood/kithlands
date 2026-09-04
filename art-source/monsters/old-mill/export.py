"""Export static battle candidates from alpha-bearing generated sources.

Run from this directory with Pillow installed. This only normalizes the source
alpha fringe and resamples; it never synthesizes poses or infers sheet layouts.
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
# Occupancy controls apparent size in the existing center-origin renderer.
SIZES = {
    "mill_bat": (128, 82),
    "briar_spider": (128, 94),
    "rust_beetle": (128, 88),
    "moss_slime": (128, 80),
    "millroot_warden": (192, 180),
}

manifest = {}
preview = Image.new("RGB", (800, 245), "#1b2430")
draw = ImageDraw.Draw(preview)
for index, (monster_id, (canvas, extent)) in enumerate(SIZES.items()):
    source = Image.open(ROOT / "source" / f"{monster_id}.png").convert("RGBA")
    # Model cutouts have a nearly invisible alpha halo. Discard that fringe;
    # keep the opaque silhouette, including intentional holes between limbs.
    alpha = source.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    source.putalpha(alpha)
    source_bounds = alpha.getbbox()
    sprite = source.crop(source_bounds)
    sprite.thumbnail((extent, extent), Image.Resampling.LANCZOS)
    sprite.putalpha(sprite.getchannel("A").point(lambda a: 255 if a >= 128 else 0))
    candidate = Image.new("RGBA", (canvas, canvas))
    top = (canvas - sprite.height) // 2
    # Ground the short creatures on the renderer's separate shadow. The bat
    # keeps its airborne center and the tall guardian already covers its base.
    if monster_id in ("briar_spider", "rust_beetle", "moss_slime"):
        top = round(canvas * 0.9) - sprite.height
    candidate.paste(sprite, ((canvas - sprite.width) // 2, top))
    candidate.save(ROOT / "candidates" / f"{monster_id}.png")
    manifest[monster_id] = {
        "canvas": [canvas, canvas],
        "source_bounds": source_bounds,
        "occupied_bounds": candidate.getchannel("A").getbbox(),
        "origin": [0.5, 0.5],
        "runtime_path": f"client/public/sprites/monsters/{monster_id}.png",
    }
    display = candidate.resize((164, 164), Image.Resampling.NEAREST)
    preview.paste(display, (index * 160 - 2, 25), display)
    draw.text((index * 160 + 8, 208), monster_id, fill="#ffffff")
preview.save(ROOT / "candidates" / "battle-scale-contact.png")
(ROOT / "export.json").write_text(json.dumps(manifest, indent=2) + "\n")
