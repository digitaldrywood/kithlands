# Kithlands Walk Cycle Art Spec

Date: 2026-04-26

This is the acceptance bar for playable character walk sheets. A sheet that
only alternates between wide-foot extremes is rejected even if it loads,
indexes, and animates in Phaser.

## Sources

- Adobe, "How to Make an Animation Walk Cycle Step by Step":
  https://www.adobe.com/creativecloud/animation/discover/animation-walk-cycle.html
- LinkedIn Learning, "Drawing the four basic poses of a walk cycle":
  https://www.linkedin.com/learning/2d-animation-walk-cycles-basics/drawing-the-four-basic-poses-of-a-walk-cycle
- Animator Island, "Walk Cycle Animation Blueprint":
  https://www.animatorisland.com/creating-a-walk-cycle-animation-blueprint/

## Runtime Sheet Geometry

- Format: transparent PNG.
- Size: 1024x512.
- Grid: 8 columns x 4 rows.
- Cell: 128x128.
- Row order: down, up, left, right.
- Frame order per row:
  1. Contact A
  2. Down A
  3. Passing A
  4. High A
  5. Contact B
  6. Down B
  7. Passing B
  8. High B

## Required Pose Meaning

### Frame 0: Contact A

The lead heel reaches forward and the trailing toe is still behind. This is an
extreme pose, not a substitute for the whole step.

### Frame 1: Down A

Weight settles onto the lead foot. The hips, shoulders, and head sit slightly
lower than contact. This prevents the cycle from floating.

### Frame 2: Passing A

The rear foot passes under the body and the support leg is near vertical. This
is the missing pose that makes the current side sprites read as skipping.

### Frame 3: High A

The body rises as the free foot recovers forward. This is the lifted pose before
the opposite contact.

### Frames 4-7

Repeat the same four poses with the opposite leg leading. These may not be
simple duplicates with arms or cape swapped; the feet, knees, hips, shoulders,
and silhouette must show the opposite half-step.

## Side-View Acceptance

Left and right rows must pass these checks before use in-game:

- Frame 2 and frame 6 must clearly show a passing pose, with one foot under or
  near the body instead of both feet at maximum spread.
- The planted foot may not visibly slide backward during the travel preview.
- The head and torso should follow a controlled low/high rhythm: contact,
  lower, passing, higher.
- Arms and cloak motion must oppose the leg motion; they cannot be the only
  moving details.
- The sprite must remain on a stable baseline with no clipped hair, weapon,
  cape, feet, or shadow.
- The left and right rows must be true profile or near-profile views, not a
  front-facing pose shifted sideways.

## Debugger Acceptance

Use `/sprites.html` for visual approval:

1. Open the class card.
2. Check the labeled cells for every direction.
3. Click frame 2 and frame 6 in the left and right rows.
4. Confirm the selected-cell acceptance text matches the actual crop.
5. Watch the left/right loop previews and travel previews.
6. Reject the sheet if the side motion still reads as hopping, skating,
   shuffling, or skipping.

## Current Status

The existing warrior sheet is not final. It is useful as a runtime wiring test,
but the side rows need new generated artwork with real passing and high poses.
