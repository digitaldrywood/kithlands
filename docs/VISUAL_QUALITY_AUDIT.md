# Kithlands Visual Quality Audit

Date: 2026-04-26

This audit compares the current playable client against closed visual issues and
the stated target: a modernized FF1-FF3 / Pixel Remaster-feeling JRPG.

Manual proof screenshots from this audit are under:

`client/tmp/visual-audit-20260426/`

## Current Verdict

The game is mechanically playable, but it does not yet meet the closed issue
requirements for final-quality visuals. Several issues were closed as complete
while the shipped screen still reads as prototype art.

## Failed Closed Issues

- #258 / #263 battle backgrounds: backgrounds are strong, but the bottom HUD
  still feels bolted on and competes with the command panel.
- #248 battle message/action layout: still not acceptable. The command panel,
  active portrait, and message window do not read as one intentional JRPG HUD.
- #246 interiors: better than overworld, but still tile-repetitive and not at
  a premium FF4-6 quality bar.
- #181 terrain: terrain has sprites and blending, but the grass/forest pattern
  is noisy and repetitive at runtime.
- #178 / #158 / #165 interiors: functional, but room composition and furniture
  density still look generated.
- #127 / #140 walk sprites: sheets are wired and animated, but style cohesion
  across walk sprites, portraits, monsters, and tiles is weak.
- #237 combat sequencing: still suspect from manual QA. A smart round preview
  targeted Goblin, a spell killed Slime, then the combat log showed Hero
  attacking Slime. This needs a focused server regression.

## Highest Priority Repairs

1. Battle bottom HUD: one integrated command/status/message layout with no
   overlapping chrome, consistent borders, and predictable readable text.
2. World structure model: overland should show settlement entrances and
   one-off points of interest, not whole towns made of tiny repeated houses.
   Entering a settlement should open a separate town map with many custom
   buildings.
3. Terrain: reduce noisy repeating grass/forest texture and add stronger
   macro-shapes around settlements.
4. Sprite art direction: choose one target pixel scale, palette discipline,
   outline style, and shadow treatment for all sprites.
5. Art pipeline: generated assets need post-processing, grid snapping, palette
   normalization, transparency cleanup, and in-game screenshot review before
   closing visual issues.

## First Repair Pass Started

- Replaced noisy loaded overland terrain textures at runtime with cleaner
  FF-style generated tile patterns for grass, forest, path, water, hills, sand,
  rock, bush, and related derived terrain.
- Replaced flat overworld building/door color blocks with drawn roofs, facades,
  windows, shadows, and framed doors.
- Switched the overland visual model toward spawn-based location icons:
  settlements render as compact FF-style symbolic town/castle/temple icons,
  while isolated nodes render as one-off POIs.
- Removed always-visible world-map location labels. The player should discover
  names by entering or interacting, not by reading labels over the map.
- Changed overland interaction so the player can enter from the visible
  destination approach instead of having to stand on an exact hidden door tile.
- Started consolidating the battle bottom HUD with a more deliberate command
  panel and less cramped message window sizing.

## New Gap From Browser QA

The current scene named `Town` is actually a single-building interior scene. It
does not yet satisfy the target discussed in chat: entering a town should first
open an exterior settlement map with multiple custom buildings, roads, NPCs,
and building entrances. Individual buildings should then lead to their interior
templates.

## Second Repair Pass

- Added a new `Settlement` scene for exterior towns/castles/temples. Overland
  settlement icons now route to this exterior scene before entering individual
  interiors.
- Added deterministic exterior layout families: small town, castle/civic
  center, and temple/shrine.
- Added a second exterior art pass with roof variants, roof-line detail,
  shop/inn signs, barrels, crates, flower patches, road speckles, and stronger
  building shadows.
- Added clickable exterior building zones for mouse/touch entry.
- Changed building interiors opened from settlements to return back to the
  settlement scene instead of always returning directly to the overland map.
- Started restyling building interiors with darker authored palettes, a framed
  room mat, cleaner footer copy, and richer overlays for counters, desks,
  shelves, crates, and tables.
- Started restyling the shop overlay away from bracket-command terminal text
  toward the same FF-style panel language used elsewhere.
- Raised the shop overlay depth so catalogs opened from interiors sit above
  room graphics instead of being occluded by the room scene.
- Added a near-opaque shop modal scrim so interior titles, prompts, and footer
  controls no longer compete with the catalog.
- Reworked the world objective card and quest log around plain objective verbs
  and a framed JRPG panel instead of raw template/debug routing.
- Reduced quest log future-objective noise by showing only the next few
  objectives and summarizing the hidden remainder.
- Started moving the battle victory screen toward the shared FF-style panel and
  button language.

## Current Remaining Visual Gaps

- The warrior walk sheet has improved north/south direction readability, but
  the left/right profile rows still read as skipping because the side-stride
  poses lack convincing alternating footfall and weight transfer.
- The overmap still displays a post-combat "Victory! XP/gold" toast after
  battle closes. Rewards should be presented on the battle summary screen only.
- Settlement exteriors are directionally correct but still too sparse and too
  procedurally uniform for final art.
- Shop interiors are materially better than the placeholder rooms, but still
  need authored counter layouts, wall dressing, NPC placement, and readable shop
  affordances.
- The shop catalog still needs another visual pass for comparison-row density
  and typography.
- The battle victory screen has only had a first frame/button pass; promotion,
  defeat, and animation timing still need final treatment.

## Engine And Asset Direction

Phaser is not the blocker. The blocker is the current asset and map model. To
reach the reference quality, Kithlands should keep Phaser but move to:

- overland maps with town markers, castles, temples, towers, caves, shrines,
  bridges, and other readable POIs;
- a dedicated town/interior scene for each entered settlement, with a custom
  building layout instead of repeated overland structure tiles;
- a generated and curated building atlas: many house/shop/inn/temple variants
  normalized to the same pixel scale, palette, transparency, shadows, and door
  anchors;
- map-authored object placement data in `shared/`, with Phaser rendering those
  objects as sprites rather than deriving premium scenery from collision tiles.

## Walk Sprite Pipeline Notes

- This section originally described the rejected 128px conversion workflow.
- Current walk production is defined by
  `docs/CHARACTER_ANIMATION_PRODUCTION.md`: native 384x512 RGBA sheets, 64x64
  cells, six animation columns, and eight direction rows.
- All twelve classes passed the static and runtime gates and were visually
  accepted in the actual all-class audit game on 2026-08-08.
- Attack animation is not covered by that acceptance and remains separate work.
