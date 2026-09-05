#!/usr/bin/env python3
"""Render the authored landmark atlas into normalized runtime PNGs."""

from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art-source/environments/overworld-landmarks/overworld-landmarks-source.svg"
SOURCE_PREVIEW = SOURCE.with_suffix(".png")
RUNTIME = ROOT / "client/public/sprites/world/landmarks"
CONTACT = ROOT / "docs/art/overworld-landmarks/contact-sheet.png"
ASSETS = [
    ("settlement-hearth", 0, 0, 64),
    ("settlement-bell", 1, 0, 64),
    ("temple-sun", 2, 0, 64),
    ("temple-moon", 3, 0, 64),
    ("dungeon-ruins", 0, 1, 64),
    ("dungeon-cave", 1, 1, 64),
    ("isolated-cottage", 2, 1, 64),
    ("isolated-watchhouse", 3, 1, 64),
    ("natural-grove", 0, 2, 64),
    ("natural-spring", 1, 2, 64),
    ("badge-old-mill", 2, 2, 32),
    ("badge-forgotten-shrine", 3, 2, 32),
]


def require(command):
    resolved = shutil.which(command)
    if not resolved:
        raise SystemExit(f"required command not found: {command}")
    return resolved


def run(*args):
    subprocess.run(args, check=True)


def main():
    renderer = require("rsvg-convert")
    magick = require("magick")
    RUNTIME.mkdir(parents=True, exist_ok=True)
    CONTACT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kithlands-landmarks-") as tmp:
        tmp_dir = Path(tmp)
        run(renderer, str(SOURCE), "-o", str(SOURCE_PREVIEW))
        atlas = SOURCE_PREVIEW
        previews = []
        for name, column, row, size in ASSETS:
            output = RUNTIME / f"{name}.png"
            run(
                magick,
                str(atlas),
                "-crop",
                f"128x128+{column * 128}+{row * 128}",
                "+repage",
                "-filter",
                "point",
                "-resize",
                f"{size}x{size}",
                "-strip",
                "PNG32:" + str(output),
            )
            preview = tmp_dir / f"{name}.png"
            run(magick, str(output), "-filter", "point", "-resize", "96x96", str(preview))
            previews.append(str(preview))
        cells = []
        for index, preview in enumerate(previews):
            x, y = (index % 4) * 136, (index // 4) * 128
            label = ASSETS[index][0]
            cells.append(
                f'<image href="{Path(preview).as_uri()}" x="{x + 20}" y="{y + 4}" '
                f'width="96" height="96"/><text x="{x + 68}" y="{y + 118}" '
                f'text-anchor="middle">{label}</text>'
            )
        contact_svg = tmp_dir / "contact.svg"
        contact_svg.write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="544" height="384">'
            '<rect width="544" height="384" fill="#122019"/>'
            '<g fill="#f1dfb4" font-family="sans-serif" font-size="11">'
            + "".join(cells)
            + "</g></svg>",
            encoding="utf-8",
        )
        run(renderer, str(contact_svg), "-o", str(CONTACT))


if __name__ == "__main__":
    main()
