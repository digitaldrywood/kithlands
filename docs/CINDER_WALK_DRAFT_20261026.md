# Cinder side-walk draft — 2026-10-26

PR #339, branch `codex/battle-grounding-walk-lag`, follows `b97ad41`. This is a rejected art experiment, not a runtime change or approved walk.

The real-game postrender east frames from `WALK_RECHECK_20261026.md` show little visible foot separation beneath the robe. The approved row was cropped and enlarged with nearest-neighbor as `client/tmp/cinder-walk-draft-20261026/east-reference.png`, and its first frame as `east-identity.png`. The built-in image generation tool was used, without a CLI or paid runtime dependency; its model identifier was not provided.

First prompt:

> Create a draft six-pose right-facing walk row for this exact pixel-art wizard, using the provided row as an identity and scale reference. Preserve the dark purple pointed hat, glowing yellow eyes in shadow, purple robe with gold trim and cyan-tipped staff in the same hand. Side profile, 2D top-down RPG pixel art. Show six distinct coherent walk poses: contact A, weight down A, passing A, high A, opposite contact B, weight down B; readable alternating feet briefly visible below the robe, gently moving cloth, steady head and staff, grounded consistent foot line. Six separated equal-size sprites in one horizontal row, consistent proportions, no overlap, no extra figures, no text, no ground or shadows. This is a source draft for manual review, not a finished atlas.

The result `client/tmp/cinder-walk-draft-20261026/rejected-row.png` largely repeats the existing subdued gait. It is rejected and not installed.

Second prompt, using `east-identity.png`:

> Edit this character reference into ONE right-facing walking passing pose for a 2D top-down RPG, pixel art. Preserve exactly the wizard's identity: dark-purple crooked hat, shadowed face with two yellow eyes, same purple-and-gold robe, one cyan-orb wooden staff in the same position and hand. Make the movement unmistakable: the trailing boot lifts clearly behind the other, and the forward boot plants under the body; the robe hem parts subtly around the legs. Keep the torso, head, staff, camera angle, sprite scale and grounded foot line stable. Single complete sprite only, transparent background, no ground, no shadow, no text or loose pixels. Hard pixel edges. This is a draft frame, not a new character.

`passing-raw.png` has a clearer lifted boot. A deterministic nearest-neighbor fit to the existing opaque bounds produces `passing-fit.png`; `passing-comparison.png` compares it to the accepted 64×64 frame. The generated head and hat, proportions, and pixel detail change visibly. This is rejected for identity drift; fitting does not make it a valid runtime frame.

Third prompt, using `east-identity.png` and `passing-raw.png`:

> Image 1 is the approved Cinder game sprite and controls character identity, pixel density, shape, proportions, camera angle, colors, hat silhouette, staff shape, and exact visual scale. Image 2 is a pose-only draft. Produce a single right-facing sprite that looks indistinguishable from Image 1 above the robe hem, but takes the passing-step pose from Image 2: a small clearly lifted rear boot visible below the robe and planted front boot. Keep the same hat and body width, head height, cyan staff/orb, arm position and robe trim as Image 1; do not redesign the character or enlarge pixels. Preserve fine pixel-art detail. Transparent background, no floor, no text, no shadow. One sprite, no border.

`passing-identity-raw.png` remains visually close to the second draft instead of the approved frame, so it is also rejected. The original atlas and hash remain untouched. Future work needs separately registered pose guides and a frame-by-frame identity review before any candidate is assembled, then the full all-class visual gate. No in-game change or new gameplay claim is made here. Hosted visual run `40439007285` for `45656d6` completed successfully; current-head and general self-hosted CI remain open. Owner server/session/saves were untouched.

## Pose-guide follow-up

A non-runtime guide (`client/tmp/cinder-walk-draft-20261026/passing-pose-guide.png`) marks a planted foot and a lifted trailing foot over the approved east sprite. It is a pose instruction, not a hand-drawn production frame. The approved identity and guide were passed to built-in image generation with this prompt:

> Image 1 is the exact approved Cinder side-facing wizard sprite. Image 2 is a pose guide overlaid on the same sprite: cyan marks the planted leg and red marks the raised trailing leg. Make ONE right-facing walk passing-frame sprite following the two leg positions, showing small dark boots under a parted robe hem. Remove all guide lines and dots. Above the knees preserve Image 1 exactly: same crooked hat, tiny yellow eyes, purple hood and robe, gold edging, hand, cyan staff orb, size, alignment and pixel detail. Maintain the same 64x64 pixel-art look and ground contact; no extra objects, shadow, floor, lettering or outlines. Transparent background. This is a pose study to be evaluated against the approved character.

`guided-passing-raw.png` shows separated feet but still alters the upper character. The draft was fitted with nearest-neighbor to the existing opaque frame bounds (`guided-fit.png`) and lower portions composed with the approved upper sprite at several cut lines (`passing-composite-{50,52,54}.png`). `composite-review.png` was inspected alongside `guided-comparison.png`: the gold hem and robe contours break at the join, and no complete gait was produced. These composites are rejected studies, not installed frames. The accepted runtime atlas and hashes are untouched. This evidence points to a need for a registered, editable pose rig or carefully retouched individual frames rather than another unregistered full-sprite generation. The complete visual walk gate remains open.
