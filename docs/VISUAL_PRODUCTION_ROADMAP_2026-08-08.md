# Kithlands Visual Production Roadmap

Date: 2026-08-08

## Decisions

- Keep Phaser and the browser as the primary runtime.
- Keep the current Phaser 3.90 runtime during the visual recovery. Phaser 4 is
  available, but an engine upgrade does not solve the current asset, map, or
  proof failures and would add another moving part.
- Target rich, modern 2D JRPG art rather than an 8-bit imitation. Preserve the
  exploration, encounter, party, spell, and turn-based rhythms of early console
  RPGs without copying their shipped art.
- Add no subscription service. Use Tiled, Pixelorama, Krita, Blender, ComfyUI,
  ImageMagick, FFmpeg, and the existing test stack. Existing authorized image
  models are optional drafting tools, never build or runtime dependencies.
- Prove one complete gold slice before scaling assets across the game.

The repo-owned production process is
[`skills/kithlands-visual-production/SKILL.md`](../skills/kithlands-visual-production/SKILL.md).

## Current Baseline

Walk animation is now the first accepted visual production slice:

- all twelve runtime classes use native 384x512 RGBA sheets;
- every sheet uses 64x64 cells, six walk frames, and eight direction rows;
- runtime class mappings use the single `gameCharacter64` format;
- the static audit enforces exact geometry, nonempty frames, and clean edges;
- Playwright verifies all classes in World and Town, real Space leader cycling,
  stable scale/origin, correct texture selection, and frame progression;
- `/?walkAudit=1&noEncounters=1` provides a temporary all-class party for
  actual-game visual review without changing a real save;
- all twelve classes were visually accepted in that route on 2026-08-08.

The full operational contract is
[`docs/CHARACTER_ANIMATION_PRODUCTION.md`](CHARACTER_ANIMATION_PRODUCTION.md).
Run the enforced baseline audit with:

```bash
python3 skills/kithlands-visual-production/scripts/audit_walk_sheets.py \
  client/public/sprites/walk \
  --classes warrior brawler rogue mender cinder wayfarer knight champion \
    shadow sage pyromancer wanderer \
  --columns 6 --rows 8 --mode enforce
```

Attack sheets, maps, buildings, interiors, battle presentation, and menus have
not inherited this acceptance and remain active visual recovery work.

## Phase 0: Make Walk Proof Trustworthy (Complete)

1. Replace the three runtime walk formats with one explicit 64px, 8-direction,
   6-pose contract.
2. Make one manifest the source of truth for sheet geometry, row order, frame
   names, origins, scale, and class asset paths.
3. Update the Phaser loader, sprite debugger, world/town/interior movement, and
   Playwright tests to consume that contract.
4. Add test hooks for leader cycling, current class, texture key, frame index,
   origin, display size, and bounds.
5. Make the no-encounter debug path deterministic.
6. Add alpha-bound, empty-frame, clipping, baseline, top, center, and size-drift
   checks to the asset gate.

Exit gate: a deliberately malformed fixture fails every relevant automated
check, and the test suite no longer hardcodes legacy 8x4 indexing.

## Phase 1: Character Movement Complete; Attack Pending

Battle-state authoring and verification follow
[`BATTLE_CHARACTER_ANIMATION_PRODUCTION.md`](BATTLE_CHARACTER_ANIMATION_PRODUCTION.md).

1. Preserve the accepted all-class walk sheets and their proof gate.
2. Create reusable attack pose guides or a deterministic rig.
3. Produce attack animation one direction at a time without modifying the
   accepted walk contract.
4. Produce idle, attack, hit, defend, cast/use-item, victory, and KO states from
   the same identity and anchor system.
5. Repair individual frames in Pixelorama/Krita; do not regenerate accepted
   rows.
6. Verify every attack state in the sprite debugger and actual battle flow.

Exit gate: no clipping, fallback flash, size change, floating debris, backward
direction, head jerk, foot skating, or missing passing pose in inspected motion
proof at desktop and mobile browser sizes.

## Phase 2: Gold World-To-Shop Slice

1. Add a Tiled JSON loader path while keeping the Go server authoritative for
   world structure and transitions.
2. Build an original terrain set with macro-shape readability and controlled
   detail density.
3. Build a symbolic overland settlement icon and distinct one-off POIs.
4. Author one complete town exterior with varied building silhouettes and
   clear entrances.
5. Author one shop interior with a readable counter, merchant, shelves, props,
   lighting, walk path, and exit.
6. Complete the transition overland -> town -> shop -> town -> overland.

Exit gate: no procedural fallback buildings, colored block scenery, repeated
mini-house clusters, interaction ambiguity, collision disagreement, or depth
occlusion in the inspected playable flow.

## Phase 3: Battle And Menu Visual System

1. Define one panel, border, spacing, typography, icon, focus, disabled, and
   status language.
2. Rebuild the battle command, party status, target, message, and auto-battle
   regions as one stable layout.
3. Apply the system to shop, party, equipment, inventory, magic, quest, and
   bestiary screens.
4. Remove terminal brackets, debug labels, and remaining monospace body copy.
5. Verify text containment and interaction at desktop and mobile viewports.

Exit gate: all core menus use the same tokens and controls, with no overlap,
clipping, misaligned text, inaccessible disabled state, or hidden content.

## Phase 4: Scale The Approved Pipelines

1. Expand the accepted character source package and rig to all base and
   promoted classes.
2. Add distinct settlement families, building atlases, interiors, landmarks,
   and biome variations through Tiled templates.
3. Add battle backgrounds, enemies, spell effects, and UI assets that share the
   same palette, lighting, outline, and scale rules.
4. Run batch audits, then inspect every class and scene; passing geometry is not
   visual acceptance.

## Phase 5: Product Depth

After the visual shell is stable, expand quest clarity, bestiary content,
encounters, spell progression, and quality-of-life behavior. Keep combat and
progression server-authoritative and content-driven from `shared/`.

## Packaging Later

Browser behavior remains the acceptance target. After it is stable:

- evaluate Electron for a macOS/Steam wrapper using the same client build;
- evaluate Capacitor for iOS/Android using the same web-first input model;
- add controller and touch mappings through action abstractions;
- do not fork gameplay or content by platform.
