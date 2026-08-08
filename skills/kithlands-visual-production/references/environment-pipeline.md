# Environment And Map Pipeline

## World Structure

Use three distinct scales:

1. Overland: symbolic settlement entrances, castles, shrines, caves, towers,
   bridges, and isolated points of interest. Do not show a full town as repeated
   tiny houses.
2. Settlement exterior: an authored town, castle, or shrine map with roads,
   landmarks, multiple distinct buildings, NPCs, props, and readable entrances.
3. Interior: an authored room or connected floor plan for one building, with a
   clear function, focal point, traffic path, interaction zones, and exit.

## Tiled Map Contract

Export Tiled JSON. Use external tilesets and these ordered layer groups:

```text
ground
terrain-detail
roads-and-water
structures
props-below-player
collision
interactions
npc-spawns
player-spawns
foreground
lighting-and-atmosphere
```

Use object templates for doors, shops, inns, homes, shrines, quest NPCs, map
transitions, and points of interest. Store gameplay identifiers and destination
keys as typed custom properties instead of inferring behavior from tile IDs.

## Authored Composition Gate

Automation may create terrain transitions and scatter low-priority detail, but
every shipped map needs a deliberate composition pass. Require:

- one dominant landmark and at least two secondary landmarks;
- readable path hierarchy and entrances;
- coherent macro terrain shapes before small texture noise;
- distinct building silhouettes, rooflines, materials, and footprints;
- occlusion and foreground layers that support depth without hiding the player;
- prop clusters that explain function rather than uniformly fill space;
- no accidental dead ends or collision/visual disagreement;
- a mobile-readable camera crop and safe UI areas.

## Building Atlas Rules

Create buildings and large props as transparent atlas objects with documented
door anchors, collision footprints, shadow bounds, and z-order. Generate
variants from one accepted style sheet, then normalize palette, perspective,
scale, outline, and lighting locally.

Reject:

- colored rectangles or runtime-drawn fallback facades;
- a roof or wall tile stretched to make a whole building;
- labels painted over overland locations;
- identical building stamps repeated without district logic;
- scenery derived from collision tiles;
- interiors assembled from arbitrary furniture blocks without room purpose.

## First Gold Slice

Build and approve one complete path before scaling:

```text
overland settlement icon
  -> distinct town exterior
  -> shop entrance
  -> authored shop interior
  -> shop UI
  -> return to town
  -> return to overland
```

Capture proof at every transition and at desktop plus mobile viewports.
