# Overworld Landmark Source

This atlas is the authored source for the bounded issue #268 landmark slice.
The symbols are original Kithlands art drawn on a 2x pixel grid with a shared
earth, stone, teal, moss, and gold palette. They have transparent backgrounds,
dark outlines, and one consistent southeast shadow direction.

`overworld-landmarks-source.svg` contains ten 128x128 source cells and two
badge cells. Run `python3 scripts/generate_overworld_landmarks.py` from the
repository root to render normalized 64x64 runtime markers, 32x32 adventure
badges, and the labeled contact sheet. Runtime classification and associations
live in `shared/overworld_landmarks.json`; filenames never decide behavior.

The source order is row-major:

1. settlement-hearth, settlement-bell, temple-sun, temple-moon
2. dungeon-ruins, dungeon-cave, isolated-cottage, isolated-watchhouse
3. natural-grove, natural-spring, badge-old-mill, badge-forgotten-shrine
