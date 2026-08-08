# AI Sprite Production Pipeline

Status: updated to the accepted native walk workflow on 2026-08-08.

The authoritative runtime contract and validation commands live in
`docs/CHARACTER_ANIMATION_PRODUCTION.md`. This document explains how AI image
generation fits into that controlled workflow.

## Principle

AI-generated images are candidates, not runtime assets. Image models are good
at drafting identity and pose variants, but they do not guarantee cell
geometry, direction order, stable scale, clean alpha, or animation continuity.
Code and human review must enforce those properties.

## Required Order

1. Approve a full-body identity reference for the class.
2. Lock palette, silhouette, outfit, equipment, proportions, and camera.
3. Generate one cardinal direction row at a time from that reference.
4. Extract exactly six components into 64x64 cells.
5. Inspect the contact sheet and animated loop before assembling an atlas.
6. Repair failed individual frames or rows without replacing accepted work.
7. Assemble the native 384x512 atlas from the approved cardinal rows.
8. Run static, unit, build, Playwright, debugger, and in-game visual gates.

Never ask an image model to produce a complete production atlas from text
alone. Never infer frame boundaries from a free-form image and install the
result directly.

## Supported Generator

Use the repository script, which provides the six-pose prompt, identity
reference, extraction, pixel snapping, and validation handoff:

```sh
python3 scripts/generate_character64_row_openai.py \
  --class-id warrior \
  --direction east \
  --reference path/to/approved-reference.png
```

The image API is an optional drafting dependency. Credentials belong in the
local environment or `.envrc.local`, never in committed files. Generated and
rejected assets remain under `client/tmp/` until approved.

## Source-Level Gates

Each row must contain exactly these poses: Contact A, Down A, Passing A,
High A, Contact B, Down B. Reject a row that merely alternates two wide stride
extremes, changes direction between frames, changes character identity, moves
the head abruptly, clips any body part, or includes a ground/shadow artifact.

Background removal must clear hidden RGB in transparent pixels. Otherwise
chroma-key color can appear as a fringe after scaling.

## Runtime Gate

Do not declare a generated asset fixed because it passed extraction or appears
correct in a still image. Run the commands in
`docs/CHARACTER_ANIMATION_PRODUCTION.md`, inspect `/sprites.html`, then cycle
and walk all twelve classes in `/?walkAudit=1&noEncounters=1`.

The twelve walk sheets passed that complete gate and were visually accepted in
the actual game on 2026-08-08. Attack sheets remain separate follow-up work.
