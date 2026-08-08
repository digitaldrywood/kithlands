# Visual Validation Contract

## Evidence Levels

Use precise language:

- `structurally valid`: files have expected type and dimensions.
- `wired`: the runtime loads the intended asset key.
- `mechanically verified`: automated input produces expected state and frame
  changes.
- `visually accepted`: a human or visual reviewer inspected current in-game
  proof against explicit criteria.

Never promote a lower evidence level to a higher claim.

## Character Proof Matrix

For every changed class require:

| Context | Directions | Required proof |
| --- | --- | --- |
| Sprite debugger | all 8 | contact sheet plus live loop |
| Overland | south, north, east, west | idle, mid-stride, stopped-after-walk |
| Settlement | south, north, east, west | movement trace or frame sequence |
| Interior | at least 2 | no clipping or scale change |
| Battle attack | battle-facing direction | full attack sequence and return to idle |

Audit these properties:

- correct class texture after leader cycling;
- correct front/back/profile direction;
- fixed rendered size between idle and motion;
- fixed feet anchor and no floating debris;
- no clipped bounds;
- controlled head motion;
- visible passing poses and planted-foot contact;
- no legacy portrait or fallback texture flash.

## Scene Proof Matrix

For changed maps or UI, capture:

- 1440x900 desktop;
- 390x844 mobile portrait;
- the default local gameplay viewport used by existing E2E tests;
- all overlays open and closed;
- keyboard and pointer/touch paths when both are supported;
- before/after transitions that can reveal stale layers or depth errors.

Check text containment, alignment, overlap, focus, disabled states, contrast,
camera framing, sprite occlusion, collision agreement, and safe-area fit.

## Required Procedure

1. Use a unique run directory under `client/tmp/`.
2. Run targeted tests and `npm run build`.
3. Run the actual local flow with `scripts/run_playwright_local.sh`.
4. Save screenshots or frame sequences with class, scene, direction, and state
   in the filename.
5. Open every artifact and inspect it. A successful screenshot command proves
   only that a file was written.
6. Record exact failures and rerun after changes.
7. Keep rejected candidates out of runtime directories.

## Objective Animation Checks

Automate what can be measured:

- expected sheet dimensions and frame count;
- non-empty frames;
- alpha at cell edges;
- top, bottom, center, and occupied-area drift;
- duplicate or near-duplicate frames;
- runtime texture key, frame index, scale, origin, and display bounds;
- leader cycling through every living party member;
- idle frame after movement uses the same sheet and geometry.

These checks reject obvious failures. They do not prove that motion looks good.
Always inspect the loop and in-game travel.
