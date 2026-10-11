# Warrior walk production

Tool: built-in `image_gen`. Reference identity: the existing Warrior atlas,
then the reviewed east strip for the remaining directions. The four reviewed
384x64 rows are retained here; generated originals and their SHA-256 hashes
are recorded in `metadata.json` and retained under `client/tmp/warrior-polish/`.

## Prompt specification

Generate one direction and six separated sequential walk poses. Preserve silver
plate, gold trim, blue plume, blue cape and sword. Use readable alternate foot
reach, a bent passing knee, planted-leg support, subtle body bob, counterrotation
and a trailing cape. Preserve head dimensions and scale across the strip. Leave
transparent padding. No text, grid, scenery or baked shadow.

Pose order: contact A, down A, passing A, high A, contact B, down B. East and west
use true profiles; south faces the viewer; north shows the back and cape.

## Installation

`scripts/normalize_character64_row.py` isolates six complete source components,
uses one shared scale per row, registers on helmet mass, anchors feet at y=62,
and samples with nearest interpolation. It rejects cell-boundary breaches and
zeros RGB outside the alpha mask. It does not draw or synthesize poses.

The runtime atlas remains 384x512, with six 64x64 columns and eight direction
rows. The shipped cardinal movement model retains its established diagonal-row
duplicates. `shared/field_presentation.json` sets Warrior's gait to two tiles
per cycle. Runtime movement remains distance-driven and server-authoritative.

Acceptance evidence and commands: `docs/WARRIOR_MEADOW_BATTLE_PROOF.md`.
