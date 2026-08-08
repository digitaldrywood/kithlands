# Walk Cycle Candidate Review

> Historical candidate review from the rejected legacy workflow. Do not use
> its geometry or recommendations for current production. The accepted native
> contract is `docs/CHARACTER_ANIMATION_PRODUCTION.md`.

Date: 2026-04-26

## Warrior Candidate 2026-04-26

Source:

`/Users/corylanou/.codex/generated_images/019dca58-4d8e-77f0-a607-ca0def941bfa/ig_0a4d53e51950c2810169eebe30fb0481918828d6e47ffec079.png`

Copied proof:

`client/tmp/walk-audit/rejected-candidates/warrior-20260426-failed-7col.png`

Verdict: rejected.

Reasons:

- The source image is 1774x887, not an even 8x4 sheet.
- Visual inspection shows 7 columns, not 8 columns.
- Because the geometry fails, it cannot be extracted into the required
  1024x512 runtime sheet without inventing missing frames.
- Do not install this candidate into `client/public/sprites/walk/`.

Notes:

- The rendering style is closer to the requested richer RPG look.
- The next generation attempt should preserve this richness but constrain the
  output as four separate 8-frame rows or use a real animation authoring tool
  such as Aseprite to build the sheet frame-by-frame.

## Warrior Side Row Candidate 2026-04-27

Source:

`/Users/corylanou/.codex/generated_images/019dca58-4d8e-77f0-a607-ca0def941bfa/ig_0a4d53e51950c2810169ef65100c648191bc52306e122d23bf.png`

Copied source:

`client/tmp/walk-audit/row-candidates/warrior-left-prompt-facing-right-20260427.png`

Extracted rows:

- `client/tmp/walk-audit/rows/warrior_right_row_candidate_20260427.png`
- `client/tmp/walk-audit/rows/warrior_left_row_candidate_20260427.png`

Motion proof:

`client/tmp/walk-audit/animation-proof-row/warrior_side_candidate_side_compare.gif`

Verdict: partial candidate, not accepted for runtime.

What improved:

- The source contains eight distinct side-walk poses.
- The row has visible passing and high poses instead of only two foot extremes.
- The richer sprite style is closer to the requested modern RPG target.

Why it is not accepted:

- The prompt asked for left-facing art, but the source faces right.
- The chroma key contaminated hair, outline, boots, and shadow edges.
- The generated source includes magenta ground shadows, which are unsuitable
  for a transparent walk sheet.
- The character is too large for clean 128x128 runtime cells; the GIF proof
  shows cropped head and cape during playback.

Next prompt changes:

- Ask for a smaller full-body sprite with at least 25% padding above the head,
  below the feet, and around weapon/cape tips.
- Forbid cast shadows and ground shadows.
- Prefer flat white or transparent-looking background only if chroma key leaks
  into blue/purple hair and outlines again.
- Keep row-only generation; do not return to full 8x4 generation yet.

## Warrior Side Row Candidate 2026-04-27 Green Key

Source:

`/Users/corylanou/.codex/generated_images/019dca58-4d8e-77f0-a607-ca0def941bfa/ig_0a4d53e51950c2810169ef75228d6c8191a58f4f0e4f3b33a7.png`

Copied source:

`client/tmp/walk-audit/row-candidates/warrior-right-greenkey-20260427.png`

Extracted rows:

- `client/tmp/walk-audit/rows/warrior_right_row_greenkey_20260427.png`
- `client/tmp/walk-audit/rows/warrior_left_row_greenkey_20260427.png`

Motion metrics:

- `client/tmp/walk-audit/rows/warrior_right_row_greenkey_20260427.motion.json`
- `client/tmp/walk-audit/rows/warrior_left_row_greenkey_20260427.motion.json`

Verdict: improved candidate, not accepted.

What improved:

- Cleaner source than the magenta-key candidate.
- Better detail level and side-profile read.
- Runtime candidate rows can be animated directly in `/sprites.html`.

Why it is not accepted:

- Green-key contamination is visible around the hair and cloak outline.
- The high-knee poses still risk reading as a skip rather than a grounded walk.
- Motion audit flags horizontal hair-center jumps up to 8.04px, matching the
  visible head jerkiness between frames.

Next prompt changes:

- Explicitly constrain head/hair movement to a smooth arc.
- Keep face angle, hair silhouette, neck, and torso connection stable.
- The feet and cloak may carry most of the motion; the head should only bob
  subtly and should not slide forward/back between adjacent frames.
