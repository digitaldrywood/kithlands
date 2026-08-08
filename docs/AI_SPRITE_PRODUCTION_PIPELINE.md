# AI Sprite Production Pipeline

Date: 2026-04-27

This replaces the reactive "generate a sheet, then patch failures" loop. The
goal is to make AI a draft artist inside a controlled production process, not
the owner of the sprite sheet.

## Research Summary

Recent game-asset and sprite-generation guidance is consistent on the main
failure mode: text-only image generation is not stable enough for production
animation sheets. It drifts in character identity, frame geometry, pose
continuity, background removal, and small details. The better workflow is:

1. Create a canonical character reference.
2. Create pose/animation guides.
3. Generate from references, not text alone.
4. Validate frame geometry and motion before expanding the asset set.
5. Do manual or constrained edit passes on the small number of failed frames.

Sources:

- OpenAI image generation docs:
  https://platform.openai.com/docs/guides/images/image-generation
- OpenAI image generation tool docs:
  https://platform.openai.com/docs/guides/tools-image-generation/
- OpenAI Academy, "Creating images with ChatGPT" (April 10, 2026):
  https://openai.com/academy/image-generation/
- OpenAI, "Introducing ChatGPT Images 2.0" (April 21, 2026):
  https://openai.com/index/introducing-chatgpt-images-2-0/
- OpenAI, "Introducing GPT-5.5" (April 23, 2026):
  https://openai.com/index/introducing-gpt-5-5/
- Vicsee, "AI Character Consistency: The Reference System That Actually Works"
  (March 31, 2026):
  https://vicsee.com/blog/ai-character-consistency
- Oren Digital, "AI Character Consistency Guide: Stable Designs with Design
  Sheets" (March 8, 2026):
  https://oren-digital.com/ai/ai-character-consistency-guide/
- Kalon, "AI Character Sheet Prompts | Views, Expressions, and the
  Consistency Problem":
  https://www.kalon.ai/templates/ai-character-sheet-prompts
- Wong and Volino, "Sprite Sheet Generation using a Diffusion Model" (2025):
  https://marcovolino.github.io/docs/papers/2025-wong-cvmp.pdf
- r/aigamedev discussion, "How to generate dozens of characters in the exact
  same style from my sprite sheet using AI?" (April 25, 2026):
  https://www.reddit.com/r/aigamedev/comments/1svc3z0/how_to_generate_dozens_of_characters_in_the_exact/

## What We Were Doing Wrong

- Asking for full sprite sheets before locking the character identity.
- Asking for animation and art direction in the same prompt.
- Relying on text prompts instead of reference images and pose guides.
- Treating chroma-key cleanup as a final step instead of a generation
  constraint.
- Accepting generated frames before measuring motion consistency.
- Expanding to multiple classes before one class passes in-game visual review.

## New Required Workflow

### 1. Character Reference First

Create a warrior reference sheet before animation:

- full-body front
- full-body back
- full-body left profile
- full-body right profile
- neutral stance
- no shadows
- clean background
- exact color/material callouts

This becomes the identity anchor. Do not generate animation rows until the
reference sheet is accepted.

### 2. Pose Guide Second

Create a simple pose guide for the side walk:

- 8 silhouettes or skeletal stick poses
- contact, down, passing, high, contact, down, passing, high
- stable head arc
- stable baseline
- foot contact positions marked

The guide can be rough. Its job is structure, not beauty.

### 3. Reference-Based Generation

The prompt must include:

- the accepted character reference as identity/style source;
- the pose guide as motion/structure source;
- instructions to keep head, hair, neck, torso, and face stable;
- instructions to vary only limbs, cloak, and subtle body bob.

Text-only row generation is allowed only for exploration, not final assets.

### 4. One Row At A Time

Generate one direction row at a time:

- right row
- mirrored left row unless asymmetry requires separate art
- down row
- up row

Do not ask for a full 8x4 sheet until all four rows pass individually.

### 5. Automated QA Before Human Approval

Every candidate row must run:

```bash
scripts/extract_walk_row_by_components.py INPUT.png OUTPUT_ROW.png
scripts/analyze_walk_row_motion.py OUTPUT_ROW.png OUTPUT_ROW.motion.json
```

Acceptance gates:

- 8 extracted frames exactly.
- no clipped hair, weapon, cloak, boots, or feet.
- no color-key fringe in final row.
- max hair/head horizontal jump below 5px unless visually justified.
- max hair/head vertical jump below 5px.
- baseline drift below 3px.
- frames 2 and 6 are real passing poses.
- live JS loop and travel preview read as walking, not skipping.

### 6. Manual Correction Is Expected

If one or two frames fail, do not regenerate the whole row by default. Prefer:

- edit only failed frames with an image-edit workflow;
- nudge frame alignment manually;
- reduce fringe locally;
- replace the single bad frame;
- then rerun the motion audit.

### 7. Runtime Install Last

Only after candidate approval:

```bash
scripts/assemble_walk_sheet_from_rows.sh \
  down.png up.png left.png right.png \
  client/public/sprites/walk/warrior_walk.png
```

Then verify:

- `/sprites.html` runtime sheet loops;
- in-game walking on world map;
- in-game walking in town/interior;
- Playwright screenshot proof.

## Tooling Gap

The built-in image-generation path is enough for exploration, but it is weak for
production because it does not give us durable API-level reference/mask control
inside the repo. The shell currently has no `OPENAI_API_KEY`, so API-driven
image edit automation is unavailable here.

For final production, we should either:

- enable an API workflow with explicit reference images, masks, transparency,
  and saved outputs; or
- use a dedicated sprite/animation workflow such as Aseprite plus reference
  generation, ComfyUI with IP-Adapter/ControlNet-style constraints, or a
  sprite-specific generator that supports locked proportions and frame export.

## Immediate Next Step

Stop generating more animation rows from text alone. Generate or curate the
warrior reference sheet and pose guide first, then use them as references for
the next side-row attempt.
