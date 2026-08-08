# Character Animation Production Contract

Status: authoritative for runtime walk animation as of 2026-08-08.

This document records the walk-animation workflow accepted in the actual game.
It supersedes every older Kithlands document that describes 128px cells,
1024x512 sheets, four-row atlases, eight walk columns, or conversion from a
free-form full sprite sheet.

Attack animation is a separate asset contract and is not approved by this walk
acceptance.

## Accepted Runtime Contract

Every playable class uses a native walk atlas at:

```text
client/public/sprites/walk/<class-id>_walk.png
```

The contract is:

- transparent RGBA PNG;
- 384x512 sheet;
- 64x64 cells;
- 6 columns and 8 direction rows;
- bottom-center feet origin;
- identical runtime scale and origin for idle and moving frames;
- no baked ground shadow, alpha fringe, or disconnected pixels below the feet.

Direction rows are:

1. south
2. south-east
3. east
4. north-east
5. north
6. north-west
7. west
8. south-west

The current game uses the cardinal rows: down -> south, right -> east,
up -> north, and left -> west. The assembly script fills diagonal rows from
the nearest validated cardinal source until diagonal movement is implemented.
Do not describe those duplicate rows as independently authored diagonal art.

Walk columns are:

1. Contact A
2. Down A
3. Passing A
4. High A
5. Contact B
6. Down B

All twelve runtime classes use the `gameCharacter64` format declared in
`client/src/scenes/walkFrame.js`. Do not switch a class back to a legacy sheet,
guess sheet geometry, or add a second production format.

## Supported Production Workflow

Generate one direction row at a time from an approved identity reference. Do
not generate or crop a complete atlas from a text-only image.

The supported generator is:

```sh
python3 scripts/generate_character64_row_openai.py \
  --class-id warrior \
  --direction east \
  --reference path/to/approved-reference.png
```

Generated source, extracted rows, contact sheets, metadata, and rejected
candidates stay under `client/tmp/`. They do not enter runtime directories
until reviewed.

For each class:

1. Lock identity, palette, silhouette, equipment, proportions, and scale.
2. Generate south, north, east, and west as separate six-frame rows.
3. Extract exactly six components with
   `scripts/extract_character64_row_by_components.py --frames 6`.
4. Pixel-snap and validate at 64x64 without changing the character's apparent
   size or feet anchor.
5. Repair individual failed frames or rows; do not regenerate accepted rows.
6. Assemble with `scripts/assemble_character64_walk.py`.
7. Run the static, runtime, and visual gates below before installation claims.

Chroma removal must set RGB to zero wherever alpha becomes zero. Hidden color
data at transparent edges can create visible fringe during scaled rendering.

## Acceptance Criteria

Reject a row when any of these are true:

- south does not show the front, north does not show the back, or east/west are
  not readable profiles;
- the character changes identity, equipment, palette, or apparent scale;
- idle and moving frames use different geometry or anchors;
- the head snaps, the torso separates, or the feet read as skipping/sliding;
- hair, clothing, equipment, effects, or feet touch a cell edge;
- a frame is cut, split, empty, or contains disconnected debris;
- only two extreme stride poses alternate;
- the loop works in a debugger but fails in the actual World or Town scene.

## Required Validation

Run the static contract audit for all runtime classes:

```sh
python3 skills/kithlands-visual-production/scripts/audit_walk_sheets.py \
  client/public/sprites/walk \
  --classes warrior brawler rogue mender cinder wayfarer knight champion \
    shadow sage pyromancer wanderer \
  --columns 6 --rows 8 --mode enforce
```

Run client tests and the production build:

```sh
cd client
npm test -- --run
npm run build
```

Run all three motion proofs against the worktree-local client:

```sh
cd client
VITE_PORT="$VITE_PORT" npx playwright test --config=e2e/playwright.config.js \
  e2e/walk-all-classes.spec.js
VITE_PORT="$VITE_PORT" npx playwright test --config=e2e/playwright.config.js \
  e2e/world-space-cycle.spec.js
VITE_PORT="$VITE_PORT" npx playwright test --config=e2e/playwright.config.js \
  e2e/world-walk-audit-party.spec.js
```

Then inspect motion in the actual game:

- `/?noEncounters=1` verifies the real party and Space-to-cycle behavior.
- `/?walkAudit=1&noEncounters=1` creates a temporary development-only party
  containing all twelve classes; Space cycles every class without changing a
  real save.
- `/sprites.html` is useful for cell and loop inspection, but it does not
  replace in-game approval.

The walk sheets reached acceptance only after all twelve classes were cycled
and walked in the actual audit game on 2026-08-08. Automated checks prove
geometry, indexing, texture selection, stable scale/origin, and frame changes;
human review proves that the motion reads correctly. Both are required for
future changes.
