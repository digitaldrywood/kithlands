# Kithlands Complete Overhaul Plan

Date: 2026-04-26

This plan turns the current direction into executable work. It is intentionally
larger than the first visual pass; the goal is to move Kithlands from playable
prototype to a coherent FF-inspired RPG.

## North Star

- Overland maps show symbolic towns, castles, temples, caves, and one-off POIs.
- Entering a settlement opens an exterior town/castle/temple scene with
  multiple buildings.
- Entering a building opens a polished interior.
- Battle, menus, shops, quests, and exploration use one consistent JRPG panel
  language.
- Game rules remain server-authoritative and content remains data-driven.

## Phase 1: Visual Foundation

- Finish exterior settlement scene families: town, castle/civic, temple/shrine.
- Replace primitive overworld icons with curated/generated sprite atlas assets.
- Build the asset curation pipeline for generated pixel-art buildings.
- Continue replacing noisy terrain and placeholder interior tiles.
- Add visual proof for every visible change.

## Phase 2: UI And Menu Redesign

- Replace terminal-style bracket text with polished commands and panels.
- Redesign world HUD, objective tracker, shop UI, party menu, item menu,
  formation menu, and field magic menu as one system.
- Keep dense operational layouts, but make them feel authored and readable.
- Verify desktop and mobile viewport fit.

## Phase 3: Quest Clarity

- Rewrite quest presentation around objective verbs and clear next steps.
- Add quest detail screen with current step, target hint, reward, and progress.
- Improve top-left tracker so it says what to do, not just template names.
- Improve generated quest names and target text in `shared/`.
- Add QA proof for at least five generated quest types.

## Phase 4: Content Expansion

- Expand bestiary beyond the current demo set.
- Add tiered encounter families, enemy roles, elemental identities, and drops.
- Add more quest templates and surprise content.
- Add data validation and balance simulation proof for each content expansion.

## Phase 5: Battle Polish

- Finish bottom HUD redesign.
- Improve spell/target selection UX for single/all targeting.
- Improve combat log clarity and auto-battle controls.
- Add more monster sprites and battle presentation variety.

## Current Active Slice

1. Exterior settlement flow and layouts.
2. Interior/shop visual overhaul.
3. World objective tracker redesign.
4. Shop overlay style cleanup.
5. Issue #267, #270, and #271 proof screenshots.

## Current Proof

- `client/tmp/visual-audit-20260426/18-world-objective-card.png`
- `client/tmp/visual-audit-20260426/20-quest-log-redesign.png`
- `client/tmp/visual-audit-20260426/28-quest-log-reduced.png`
- `client/tmp/visual-audit-20260426/22-settlement-art-pass.png`
- `client/tmp/visual-audit-20260426/23-settlement-shop-interior.png`
- `client/tmp/visual-audit-20260426/26-shop-catalog-redesign.png`
- `client/tmp/visual-audit-20260426/32-shop-catalog-opaque-modal.png`

## Next Work Queue

1. Remove the overmap post-combat victory toast. XP/gold rewards belong on the
   battle summary screen, not as an overland popup after combat closes.
2. Regenerate class walk sheets with special focus on left/right profile
   stride poses; the movement code is now smooth, but weak side-view art reads
   as skipping.
3. Make settlement exteriors denser: trees, fencing, signs, market props, lamps,
   water, elevation, and per-town silhouettes.
4. Replace generated exterior buildings with a curated atlas once the asset
   pipeline exists.
5. Continue removing remaining monospace/debug comparison rows from the shop
   catalog and make the equipment compare panel breathe.
6. Redesign promotion, item, magic, and field menus to match the newer
   party/quest/shop language.
7. Reduce quest log future-objective noise; show the next few objectives and a
   progress summary instead of a long list.
8. Add bestiary expansion and quest-template expansion after the visual shell
   stops fighting the player.
