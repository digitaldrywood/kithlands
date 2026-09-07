# Rich interior library

Target: 100 distinct, pregenerated floor plans across houses, inns, shops, and temples, sharing polished environment and furniture art. The collection is not complete. The repository currently still has twelve templates.

## Implemented reference room

`house_elder_study_1f` now has an original painted background, aligned blocked furniture footprints, an open south entrance, reachable NPC anchors, and the existing `elder_study_strongbox` treasure identity. The secondary NPC uses an existing finished sprite and the chest reuses the finished inn chest art. Existing save loading reapplies current template data; this change keeps the template, floor and chest IDs.

The scene supports furniture supplied by `presentation.props`, using room-relative pixel bounds and a feet row for drawing order. Texture keys are shared by asset path across visits. The server validates furniture assets and bounds. Wood and stone shell art is prepared for subsequent layouts.

## Remaining production work

- Finish transparent reusable furniture assets. Current generated furniture drafts have baked checkerboards and are rejected for runtime use.
- Compose and inspect one modular furnished room using the reusable pieces.
- Author 25 intentional layouts for each of the four building families. Different file names or palette swaps alone do not count as distinct layouts.
- Validate connected entrances, all NPC approaches, chest approaches, stairs, and secret passages for every floor.
- Preserve existing template, floor and treasure identities on save upgrades; pin selected room identities before growing the random-selection pool.
- Inspect a gallery of all 100 rooms and real entry, interaction, treasure, stairs and exit flows at desktop and mobile sizes before reporting the collection complete.

Asset provenance is recorded in `docs/art/interior-library-2026-09-07.json`. Furniture generation requested individual isolated transparent objects in the same overhead perspective as the reference house; the resulting opaque checkerboards must be cleaned or regenerated before use.
