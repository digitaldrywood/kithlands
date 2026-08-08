# Warrior Walk Row Prompts

Use these prompts only after the proactive pipeline in
`docs/AI_SPRITE_PRODUCTION_PIPELINE.md` has produced an accepted warrior
reference sheet and pose guide. These prompts are not enough by themselves for
final production art.

Each accepted row is extracted with `scripts/extract_walk_row.sh`, then the
four runtime rows are assembled with `scripts/assemble_walk_sheet_from_rows.sh`.

All rows use the same eight poses:

1. Contact A
2. Down A
3. Passing A
4. High A
5. Contact B
6. Down B
7. Passing B
8. High B

## Shared Style Block

Use the accepted warrior character reference as the identity and style source.
Preserve the same face, hair silhouette, armor shapes, cloak shape, sword,
palette, material rendering, proportions, and outline style from that reference.

Use the accepted 8-pose walk-cycle guide as the pose source. Follow its head
arc, foot contacts, passing poses, and baseline.

Rich, vibrant, modern pixel-remaster-inspired high-fantasy JRPG warrior sprite.
Blue-and-steel armor, readable heroic silhouette, consistent sword, cloak,
hair, outline, lighting, palette, and proportions across all eight frames.
Clean transparent or flat chroma background. Game-ready sprite animation row,
not concept art. No text, labels, numbers, guide lines, grid lines, watermarks,
or UI.

Scale and extraction rules:

- The whole body, hair, weapon, cloak, boots, and any shadow must fit inside
  every frame with at least 25% padding around the character.
- The final sprite should be small enough to resize cleanly into a 128x128
  runtime cell.
- Do not draw cast shadows, oval ground shadows, contact shadows, glow, smoke,
  or background effects.
- If using chroma key, the background must be perfectly flat and must not leak
  into hair, outlines, armor trim, boots, or cloak edges.

Motion stability rules:

- The head and hair must follow a smooth controlled arc. Do not shift the head
  abruptly forward or backward between adjacent frames.
- Keep the neck, face, hair mass, and torso connected consistently. The head
  may bob subtly with the walk, but it must not snap, whip, or slide relative
  to the chest.
- Do not change the head size, hair silhouette, face angle, or eye placement
  from frame to frame.
- Frame-to-frame head/hair movement should stay smaller than the foot and cloak
  motion. The feet define the walk; the head should not be the loudest moving
  part.

## Facing Down Row

Create exactly one horizontal sprite-animation row with 8 equal frames of the
same warrior walking toward the camera. The row must show:

1. Contact A: one foot reaches forward.
2. Down A: body settles lower onto that foot.
3. Passing A: rear foot passes under the torso.
4. High A: body rises as the free foot recovers.
5. Contact B: opposite foot reaches forward.
6. Down B: body settles lower onto the opposite foot.
7. Passing B: opposite rear foot passes under the torso.
8. High B: body rises before looping.

## Facing Up Row

Create exactly one horizontal sprite-animation row with 8 equal frames of the
same warrior walking away from the camera. Show the back of the head, cloak,
armor, sword, and alternating footwork. Use the same contact/down/passing/high
sequence as above. The body must visibly shift weight; do not make a cloak-only
animation.

## Facing Left Row

Create exactly one horizontal sprite-animation row with 8 equal frames of the
same warrior walking left in true side profile. This is the critical row. Frames
3 and 7 must be clear passing poses with one foot under the body and the support
leg near vertical. Frames 2 and 6 must be lower weight-transfer poses. Frames 4
and 8 must be higher recovery poses. Do not make a two-pose shuffle, skip, hop,
or skating motion.

## Facing Right Row

Create exactly one horizontal sprite-animation row with 8 equal frames of the
same warrior walking right in true side profile. Mirror the left-facing motion
quality without changing the character design. Frames 3 and 7 must be clear
passing poses with one foot under the body and the support leg near vertical.
Frames 2 and 6 must be lower weight-transfer poses. Frames 4 and 8 must be
higher recovery poses. Do not make a two-pose shuffle, skip, hop, or skating
motion.

## Acceptance Commands

After a row candidate is saved:

```bash
scripts/validate_walk_candidate.sh INPUT.png 8 1
scripts/extract_walk_row.sh INPUT.png client/tmp/walk-audit/rows/warrior_left_row.png
```

After all four rows pass visual review:

```bash
scripts/assemble_walk_sheet_from_rows.sh \
  client/tmp/walk-audit/rows/warrior_down_row.png \
  client/tmp/walk-audit/rows/warrior_up_row.png \
  client/tmp/walk-audit/rows/warrior_left_row.png \
  client/tmp/walk-audit/rows/warrior_right_row.png \
  client/tmp/walk-audit/generated-art/warrior_walk_row_assembled.png
```

Then copy the assembled sheet to `client/public/sprites/walk/warrior_walk.png`
only after `/sprites.html` and exported GIFs pass visual review.
