# Visual Overhaul Issue Drafts

Date: 2026-04-26

Filed as GitHub issues:

- #267: Build FF-style exterior town scene
- #268: Create curated overworld location icon atlas
- #269: Build asset generation and curation pipeline
- #270: Rework battle bottom HUD to final JRPG layout
- #271: Replace placeholder interior tiles with finalized building interiors

## 1. Build FF-style Exterior Town Scene

Current behavior:

- The scene named `Town` is a single-building interior.
- Entering an overland town/castle/temple jumps directly inside one building.
- This does not match the desired FF1/FF2/FF3 structure where the overworld
  icon leads to an exterior settlement map with multiple buildings.

Target behavior:

- Overland icons are symbolic only.
- Entering a settlement opens an exterior town/castle/temple scene.
- Exterior town scene contains multiple custom buildings, paths, terrain
  borders, NPCs, and building entrances.
- Entering a building from that town scene opens the existing interior scene.
- One-off POIs may still enter directly into an interior/dungeon scene.

Acceptance criteria:

- At least three settlement layouts: small town, castle town, temple/shrine.
- Each layout has at least 4 visually distinct buildings.
- Building entrances route to interiors without breaking current shop/inn/rest
  behavior.
- No always-visible settlement name labels on the overland map.
- Playwright visual proof for overworld -> exterior town -> interior -> exit.

## 2. Create Curated Overworld Location Icon Atlas

Current behavior:

- Overworld location icons are generated with Phaser primitives.
- They now point in the correct direction, but they are not final art.

Target behavior:

- Replace primitive-drawn icons with curated pixel-art sprites.
- Support icon families for town, castle, temple, cave, tower, shrine, port,
  bridge, and isolated house.
- Each family has multiple variants so locations do not all look identical.

Acceptance criteria:

- Icons render at the intended world tile scale without blur.
- Icons have transparent backgrounds, consistent shadows, and consistent
  outline treatment.
- Different settlement seeds choose different variants deterministically.
- Visual proof screenshot shows at least five distinct icon types.

## 3. Build Asset Generation And Curation Pipeline

Current behavior:

- Visual assets are mixed: some generated sprites, some procedural fallback
  drawings, some placeholder tiles.
- There is no repeatable art QA gate for generated buildings/icons.

Target behavior:

- Add a documented pipeline for generating, snapping, cleaning, palette
  normalizing, and reviewing pixel assets.
- Pipeline supports hundreds of building variants over time while preserving a
  consistent FF-inspired style.

Acceptance criteria:

- Script or documented workflow for source image -> transparent PNG -> snapped
  sprite atlas.
- Output includes metadata for anchor point, collision footprint, door point,
  and icon family.
- Generated atlas can be loaded by Phaser without hardcoding per-asset logic.
- Review checklist includes in-game screenshot proof.

## 4. Rework Battle Bottom HUD To Final JRPG Layout

Current behavior:

- Battle background and sprites are improving, but the bottom HUD still reads
  as a prototype.
- Command, message, and party status areas do not feel like a single polished
  JRPG interface.

Target behavior:

- Integrated FF-style command/status/message layout.
- Clear active actor state, target state, and action history.
- Better mobile/touch affordances without making desktop feel oversized.

Acceptance criteria:

- No overlapping or cramped battle text at 800x600 and 1280x720.
- Party HP/MP/status are readable without fighting command choices.
- Auto-battle state is visible and cancellable.
- Playwright screenshot proof for idle turn, target select, spell select,
  auto-battle, and victory.

## 5. Replace Placeholder Interior Tiles With Finalized Building Interiors

Current behavior:

- Interiors are functional and have templates, but still read as generated
  tile rooms rather than authored spaces.

Target behavior:

- Distinct visual language for house, inn, shop, temple, town hall, and special
  locations.
- Better wall silhouettes, lighting, furniture composition, and floor/wall
  palette separation.

Acceptance criteria:

- At least six interior archetypes have polished tile/furniture sets.
- Procedural interiors preserve walkability and NPC access.
- Existing chest, shop, rest, hidden item, and NPC interactions still work.
- Visual proof for each archetype.
