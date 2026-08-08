# Character And Animation Pipeline

## Canonical Runtime Contract

- cell size: 64x64 pixels
- sheet size: 384x512 pixels
- columns: 6 animation poses
- rows: 8 directions
- direction rows: south, south-east, east, north-east, north, north-west, west,
  south-west
- frame poses: contact A, down A, passing A, high A, contact B, down B
- file type: RGBA PNG with transparent background
- origin: bottom center at the feet anchor
- runtime scale: identical for idle and motion frames

Idle is a frame from the same sheet and geometry as walking. Do not swap to a
portrait, legacy sprite, or separately scaled image when movement stops.

## Source Package

Store production source outside `client/public/`. Keep these artifacts for each
character:

```text
source/characters/<class-id>/
  identity/
    front.png
    back.png
    east.png
    west.png
    palette.png
  guides/
    walk-6pose.png
    attack-8pose.png
  walk/
    south/frame-00.png ... frame-05.png
    ...
  attack/
    ...
  metadata.json
```

Metadata must record cell size, direction order, frame names, feet anchor,
source references, generation/edit tool, model/version when applicable, and
approval state.

## Identity Gate

Approve identity before animation. Reject when:

- front, back, and profiles look like different people;
- equipment moves to the opposite hand unintentionally;
- costume details change between directions;
- proportions or camera elevation change;
- the silhouette is unreadable at intended runtime scale;
- the figure cannot fit all poses with at least two transparent pixels of
  safety on every edge.

## Motion Gate

Use a real walk cycle. For each half-step require contact, down, passing, and
high poses. The planted foot must remain visually stationary while the body
moves over it. Side rows must be profile views, and north rows must show the
back.

Reject when:

- only two extreme leg poses alternate;
- both feet slide;
- the head snaps horizontally or changes size;
- the body floats at one height;
- idle and walk frames use different scale or anchors;
- hair, hats, weapons, cloaks, feet, or shadows touch a cell edge;
- alpha fringe or disconnected debris appears below the feet;
- mirrored art reverses intentional asymmetric equipment.

## Generation Procedure

1. Use the approved identity image for the requested direction.
2. Use one exact pose guide or rig pose per frame.
3. Generate or render frames individually or as a controlled sequence.
4. Composite every frame into an empty canonical cell using the feet anchor.
5. Inspect at 1x and at runtime scale.
6. Repair only rejected frames with masks or paintover.
7. Assemble the sheet from named frame files; do not crop a free-form grid.
8. Run the sheet audit and preview the loop before runtime installation.

## Runtime Acceptance

The twelve production walk sheets use the canonical six-column contract.
Legacy format declarations may remain temporarily for non-production migration
or attack compatibility, but no runtime walk class may map to them. Use
`docs/CHARACTER_ANIMATION_PRODUCTION.md` for the exact scripts, tests, audit
route, and visual acceptance procedure.
