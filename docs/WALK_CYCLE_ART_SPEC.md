# Kithlands Walk Cycle Art Spec

Status: synchronized with the accepted runtime contract on 2026-08-08.

The authoritative geometry, workflow, commands, and validation gate live in
`docs/CHARACTER_ANIMATION_PRODUCTION.md`.

## Cycle Structure

Each direction row contains six 64x64 frames:

1. **Contact A:** one heel reaches while the opposite toe trails.
2. **Down A:** weight settles onto the lead foot and the body lowers slightly.
3. **Passing A:** the free foot passes under the body; this prevents skipping.
4. **High A:** the body rises during recovery before the opposite contact.
5. **Contact B:** the opposite foot makes contact.
6. **Down B:** weight settles onto the opposite foot and loops into Passing A.

The six-frame loop is the accepted Kithlands production contract. Do not append
frames from the superseded eight-column experiments or convert an old 128px
sheet.

## Direction Requirements

- South must show the front of the character.
- North must show the back of the character.
- East and west must read as true profiles.
- Clothing, weapons, hair, and asymmetric details must remain coherent.
- Diagonal rows currently reuse the nearest approved cardinal artwork until
  diagonal player movement is implemented.

## Motion Requirements

- The planted foot must remain visually stable during its support phase.
- Head and torso motion must follow a small, controlled arc without snapping.
- Apparent height, width, scale, and bottom-center feet anchor must remain
  stable when starting, walking, turning, and stopping.
- Arms, clothing, and equipment may use restrained secondary motion but cannot
  substitute for leg and hip movement.
- No frame may touch a cell edge or contain alpha fringe, disconnected debris,
  a baked shadow, or cropped body parts.
- Idle must use the same sheet, scale, and feet origin as walking.

## Approval

`/sprites.html` is a frame and loop debugger. Final approval happens in the
actual game at `/?walkAudit=1&noEncounters=1`: focus the canvas, cycle all
twelve classes with Space, and inspect each while walking and stopped.

Automated geometry and Playwright checks are required, but motion is accepted
only after the current rendered loop has also been visually inspected.
