# Warrior Walk Sheet Generation Prompt

Use this prompt for the next generated warrior walk sheet. Do not accept the
result until it passes `docs/WALK_CYCLE_ART_SPEC.md` and `/sprites.html`.

## Prompt

Create one production-quality 2D fantasy RPG warrior walk-cycle sprite sheet.

Style:
- Rich, vibrant, modern pixel-remaster-inspired fantasy RPG character.
- Detailed armor, readable silhouette, heroic blue-and-steel warrior design.
- Clean transparent background.
- Game-ready sprite sheet, not concept art.
- Consistent character proportions, lighting, palette, outline, weapon, and
  costume across every frame.

Sheet layout:
- Exactly 8 columns x 4 rows.
- Equal-size cells.
- One character centered in every cell.
- No margins outside the grid.
- No labels, text, guide lines, grid lines, numbers, watermarks, or UI.
- Rows in this exact order:
  1. facing down
  2. facing up
  3. facing left profile
  4. facing right profile

Each row must contain this exact 8-frame walk-cycle pose sequence:
1. Contact A: lead heel forward, rear toe trailing.
2. Down A: weight settles lower onto the lead foot.
3. Passing A: rear foot passes under the body, support leg near vertical.
4. High A: body rises as the free foot recovers forward.
5. Contact B: opposite foot contact, mirrored half-step.
6. Down B: opposite-foot weight settles lower.
7. Passing B: opposite rear foot passes under the body.
8. High B: opposite recovery pose.

Critical side-view requirements:
- Left and right rows must show true profile walking.
- Frames 3 and 7 must be visible passing poses, not foot-spread extremes.
- Frames 2 and 6 must be lower weight-transfer poses.
- Frames 4 and 8 must be higher recovery poses.
- The planted foot should appear stable, not sliding.
- Arms and cloak swing opposite the legs, but body and feet must carry the walk.
- Do not make a two-pose shuffle, hopping animation, skating animation, or
  skipping animation.

Output target:
- A clean 8x4 source sheet suitable for extraction into a 1024x512 runtime PNG
  with 128x128 transparent cells.

## Rejection Rules

Reject the generated sheet if:
- any row has fewer or more than 8 frames;
- any side row lacks a clear frame 3 or frame 7 passing pose;
- contact/down/passing/high are visually indistinguishable;
- the left/right rows are front-facing poses shifted sideways;
- weapons, hair, cape, feet, or shadows are clipped;
- the background is not cleanly removable;
- the character changes identity between frames.
