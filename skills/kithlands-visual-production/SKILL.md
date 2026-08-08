---
name: kithlands-visual-production
description: Produce, integrate, and verify Kithlands character animation, map, environment, battle, and menu visuals. Use for sprite generation or repair, walk and attack animation, Tiled maps, buildings and interiors, visual art direction, image-model selection, Phaser rendering, or any task whose acceptance depends on screenshots or motion.
---

# Kithlands Visual Production

Treat generated images as source material inside a controlled game-art pipeline.
Do not let a prompt, a passing unit test, or a captured screenshot stand in for
visual acceptance.

## Start Here

1. Read `AGENTS.md`, the relevant design section, and the current runtime code.
2. Read only the references needed for the task:
   - characters: `references/character-pipeline.md`
   - maps, towns, buildings, or interiors: `references/environment-pipeline.md`
   - UI, screenshots, animation, or final approval: `references/validation.md`
   - model or tool selection: `references/tooling.md`
3. Inspect the existing asset and its in-game rendering before changing it.
4. Name the exact acceptance slice. Work on one character/action/direction or
   one complete playable scene flow at a time.
5. Keep candidates outside runtime asset directories until they pass.

## Non-Negotiable Rules

- Keep Phaser as the browser-first runtime. Do not propose an engine rewrite to
  solve an asset, map-authoring, or validation failure.
- Do not add a subscription or hosted-service dependency. Prefer free local
  tools. Use an already-authorized image API only as an optional drafting tool.
- Never generate a whole production sprite sheet from text alone.
- Never convert an undocumented sheet by guessing its row or frame order.
- Never support multiple production sheet geometries indefinitely. Migrations
  may read old formats, but approved runtime assets converge on one contract.
- Never close or describe visible work as fixed without inspecting current,
  uniquely named proof from the actual game.
- Do not use Final Fantasy art as a shipped asset or ask a model to copy a
  protected character. Use references for composition, readability, pacing,
  and quality; create original Kithlands art.

## Production Contract

Use these targets for new playable character assets:

- transparent PNG
- 64x64 cell
- 8 direction rows in this order: south, south-east, east, north-east, north,
  north-west, west, south-west
- 8 walk frames in this order: contact A, down A, passing A, high A, contact B,
  down B, passing B, high B
- fixed feet anchor and stable head/torso mass across every frame
- no baked ground shadow; render a separate runtime shadow
- distinct source, candidate, approved, and runtime locations

The current repo is in migration and contains both six-frame and eight-frame
sheets. Do not generate more mixed-format assets. Run the contract audit before
and after character work:

```bash
python3 skills/kithlands-visual-production/scripts/audit_walk_sheets.py \
  client/public/sprites/walk --mode report
```

Use `--mode enforce` only when every runtime class has migrated to the canonical
format. A report that identifies existing failures is evidence of remaining
work, not a reason to weaken the contract.

## Character Workflow

1. Lock one accepted identity sheet with front, back, and true profiles.
2. Lock the palette, silhouette, outfit, equipment, camera, and scale.
3. Create reusable pose guides or a rig before generating animation.
4. Produce one direction and one action at a time from identity and pose
   references.
5. Retouch individual failed frames in Pixelorama or Krita. Do not regenerate
   an accepted row to fix one frame.
6. Run geometry and motion audits, then inspect the loop and travel preview.
7. Install the candidate in the game only after source-level approval.
8. Verify world, settlement, interior, and battle usage as applicable.

For walk-cycle details and rejection criteria, read
`references/character-pipeline.md`.

## Environment Workflow

1. Author maps in Tiled JSON with explicit visual, collision, interaction, and
   foreground layers.
2. Build a reusable object atlas and Tiled templates for buildings, props,
   entrances, and points of interest.
3. Use terrain/Wang sets and Automapping for transitions and decoration, then
   make a deliberate authored composition pass.
4. Keep the overland symbolic: settlements and one-off points of interest are
   entrances, not miniature building clusters.
5. Make each entered settlement a distinct exterior map, then enter authored
   interiors from it.
6. Reject colored rectangles, procedural fallback buildings, repeated house
   stamps, and collision tiles used as premium scenery.

For layer names, required map content, and scene gates, read
`references/environment-pipeline.md`.

## UI Workflow

Build one restrained JRPG interface system and reuse it across battle, shop,
quest, party, inventory, and field menus. Use proportional readable fonts for
body copy, display fonts only for short headings, icons for familiar actions,
and stable grid dimensions. Do not use terminal-style brackets or debug text as
the primary visual language.

Verify at desktop and mobile browser viewports. Package for desktop later with
a thin web wrapper only after browser behavior is stable; keep input actions
abstract enough to add touch and controller mappings.

## Proof Gate

Before reporting visible work complete:

1. Run targeted unit tests and a production client build.
2. Run the exact playable flow through the local Playwright wrapper.
3. Capture unique screenshots for every required scene and viewport.
4. Capture an animation trace, GIF, or frame sequence for motion work.
5. Open and inspect every proof artifact.
6. Compare against the acceptance matrix in `references/validation.md`.
7. Report failures plainly. Use "wired" or "mechanically verified" when that
   is all the evidence proves; reserve "visually accepted" for inspected proof.

## Scale Only After Approval

Do not expand to all classes, towns, interiors, or menus until one gold-standard
slice is accepted in the actual game. Reuse its source files, rig/pose guides,
palette, anchors, Tiled templates, and tests. Batch generation without an
accepted template multiplies defects.
