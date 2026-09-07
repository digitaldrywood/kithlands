# Rich interior library

Target: 100 distinct, pregenerated floor plans across houses, inns, shops, and temples, sharing polished environment and furniture art. The collection is not complete. The repository currently still has twelve templates.

## Implemented reference room

`house_elder_study_1f` now has an original painted background, aligned blocked furniture footprints, an open south entrance, reachable NPC anchors, and the existing `elder_study_strongbox` treasure identity. The secondary NPC uses an existing finished sprite and the chest reuses the finished inn chest art. Existing save loading reapplies current template data; this change keeps the template, floor and chest IDs.

The scene supports furniture supplied by `presentation.props`, using room-relative pixel bounds and a feet row for drawing order. Texture keys are shared by asset path across visits. The server validates furniture assets and bounds. Wood and stone shell art is prepared for subsequent layouts.

The second reference room, `house_widow_keep_1f`, uses the wood shell and four transparent reusable furniture assets. Entry and exit were inspected at 1440, 720, and 390 pixel viewports.

Saves now store selected template IDs. Unpinned legacy saves use generation-zero templates to preserve the original seed selection. Missing pinned IDs produce an explicit load error instead of silently changing the room. New library content must set `library_generation: 1`.

## Remaining production work

- Extend the transparent furniture set for merchant and temple layouts. The original opaque drafts remain rejected; bed, bookcase, dining table, and desk now have verified transparent replacements.
- Author 25 intentional layouts for each of the four building families. Different file names or palette swaps alone do not count as distinct layouts.
- Validate connected entrances, all NPC approaches, chest approaches, stairs, and secret passages for every floor.
- Keep existing template, floor and treasure IDs when upgrading remaining legacy rooms.
- Inspect a gallery of all 100 rooms and real entry, interaction, treasure, stairs and exit flows at desktop and mobile sizes before reporting the collection complete.

Asset provenance is recorded in `docs/art/interior-library-2026-09-07.json`. Furniture generation requested individual isolated transparent objects in the same overhead perspective as the reference house; the original opaque checkerboards were removed through built-in image generation edits before the four selected props were used.
