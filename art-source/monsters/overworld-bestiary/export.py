"""Export static overworld monster candidates from generated sources.

Run from any directory with Pillow installed. The script only normalizes the
source alpha, crops, and resamples; it never generates or infers artwork.
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parents[2]
SIZES = {
    "bramblehog": (256, 230),
    "mire_toad": (256, 230),
    "frosthorn": (256, 226),
    "ridge_rook": (256, 230),
}
ALPHA_CUTOFF = 235

manifest = {}
preview = Image.new("RGB", (1024, 310), "#0a1b30")
draw = ImageDraw.Draw(preview)
for index, (monster_id, (canvas, extent)) in enumerate(SIZES.items()):
    source = Image.open(ROOT / "source" / f"{monster_id}.png").convert("RGBA")
    alpha = source.getchannel("A").point(
        lambda value: 255 if value >= ALPHA_CUTOFF else 0
    )
    source.putalpha(alpha)
    source_bounds = alpha.getbbox()
    if source_bounds is None:
        raise ValueError(f"{monster_id}: source has no pixels above alpha cutoff")
    sprite = source.crop(source_bounds)
    sprite.thumbnail((extent, extent), Image.Resampling.LANCZOS)
    sprite.putalpha(
        sprite.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
    )
    candidate = Image.new("RGBA", (canvas, canvas))
    left = (canvas - sprite.width) // 2
    top = min((canvas - sprite.height) // 2, round(canvas * 0.94) - sprite.height)
    candidate.paste(sprite, (left, top), sprite)
    candidate.save(ROOT / "candidates" / f"{monster_id}.png")
    runtime_path = Path("client/public/sprites/monsters") / f"{monster_id}.png"
    candidate.save(REPO_ROOT / runtime_path)
    manifest[monster_id] = {
        "canvas": [canvas, canvas],
        "source_bounds": source_bounds,
        "alpha_cutoff": ALPHA_CUTOFF,
        "occupied_bounds": candidate.getchannel("A").getbbox(),
        "origin": [0.5, 0.5],
        "runtime_path": runtime_path.as_posix(),
    }
    display = candidate.resize((230, 230), Image.Resampling.NEAREST)
    preview.paste(display, (index * 256 + 13, 10), display)
    draw.text((index * 256 + 20, 270), monster_id, fill="#ffffff")

preview.save(ROOT / "candidates" / "battle-scale-contact.png")
(ROOT / "export.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"exported {len(manifest)} monster sprites")
