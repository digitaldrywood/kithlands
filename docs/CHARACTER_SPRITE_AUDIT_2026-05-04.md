# Character Sprite Audit - 2026-05-04

## Verdict

The current generated walk and attack sheets are not production-acceptable.
The runtime mapping is not the main failure. The source atlases generated for
most classes do not obey the required row direction contract, and several
frames are clipped at cell boundaries.

The previous pipeline generated complete 8x8 atlases from text prompts and then
extracted cells. That process let failed rows pass into the game because the
geometry looked plausible even when the art direction was wrong.

## Runtime Contract

Current native 64px walk sheets are expected to be:

- `64x64` cells
- `8` rows
- `6` or `8` columns depending on sheet format
- row order:
  `south`, `south-east`, `east`, `north-east`, `north`, `north-west`, `west`,
  `south-west`

The game-facing directions map as:

- down -> `south`
- up -> `north`
- right -> `east`
- left -> `west`

## Hard Failures Found

Automated audit output:

- JSON: `client/tmp/game-character-64/audit/audit.json`
- Summary: `client/tmp/game-character-64/audit/summary.json`
- Per-sheet contact cards:
  `client/tmp/game-character-64/audit/<class>-<walk|attack>-contact.png`

Examples confirmed by visual inspection:

- `cinder_walk`: source atlas is essentially all rear-facing. The installed
  sheet also has a cropped/cut lower row, so the character can appear sliced
  during movement.
- `mender_walk`: direction rows are mixed. Some rows expected to be side/profile
  or front/back are partially rotated, causing backwards walking in one
  direction.
- `knight_walk`: visually less disruptive in motion, but source rows are still
  mostly back/profile and do not fully honor the row contract.
- attack sheets broadly fail edge/contact checks and should not be considered
  production-ready.

## Root Cause

The full-atlas prompt was not strong enough to enforce:

- exact direction per row
- exact frame boundaries
- stable character identity across rows
- no clipped body parts or shadows
- no row-to-row orientation drift

The extraction script did what it was asked to do: divide the generated image
into a grid and fit frames. It cannot repair a source atlas where every row is
the wrong direction or the subject crosses cell boundaries.

## Corrective Plan

1. Stop installing text-only full-atlas generations directly into
   `client/public/sprites/walk` or `client/public/sprites/attack`.
2. Generate and validate one row at a time, using the accepted class portrait
   as identity reference and a pose/direction prompt as structure.
3. Assemble sheets only from rows that pass:
   - correct direction
   - no clipping
   - stable head/torso
   - real contact/down/passing/high poses
   - clean alpha/chroma removal
4. Keep the runtime no-encounters flag on during review:
   `http://127.0.0.1:3706/?noEncounters=1`
5. Do not mark a class complete until `/sprites.html` and the in-game world/town
   walk preview both pass visual review.

## Immediate Quarantine Rule

Only sheets with manually verified row direction and no hard clipping should be
enabled for runtime use. Failed sheets should remain visible in the sprite
debugger for review, but should not be treated as accepted production assets.
