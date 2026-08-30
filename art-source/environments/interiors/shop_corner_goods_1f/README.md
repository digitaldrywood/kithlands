# Corner Goods Shop Interior Source

This directory preserves the source painting and authored layout guide for the
first Kithlands shop-interior gold slice. Cadott General Store deterministically
selects the `shop_corner_goods_1f` shared template, so this room completes the
visual handoff from the Cadott exterior without coupling gameplay to the image.

## Generation

- Date: 2026-08-29
- Tool: Codex built-in ImageGen
- Layout guide: `layout-guide.svg` (`layout-guide.png` raster reference)
- Source painting: `source.png`
- Runtime derivative:
  `client/public/interiors/shop/shop-corner-goods-background.png`
- Transform: resample the accepted 1448x1086 source to the template's exact
  512x384 (16x12 tiles at 32 rendered pixels per tile) runtime footprint

## Production Brief

Transform the abstract 512x384 layout guide into one original, game-ready
Kithlands fantasy general-store interior background. Preserve the guide's exact
4:3 composition and object zones: a dark perimeter wall; warm honey-colored
wood or stone floor; a broad wooden merchant counter spanning the north-middle;
stocked shelves, crates, sacks, jars, folded cloth and adventuring supplies
behind the counter; two small round browsing tables in the lower half; side
shelving; a teal woven welcome rug near the south-center; and an unmistakable
open doorway at the exact south-center. Keep a wide, uncluttered, straight
walkable aisle from the south doorway to the center of the counter.

Use a high three-quarter top-down 2D JRPG environment view with rich original
Kithlands fantasy painting, crisp pixel-informed edges, handcrafted material
texture, readable silhouettes, cozy amber lantern light, and subtle cool teal
accents. Do not include characters, NPCs, text, lettering, numbers, signs,
logos, watermarks, UI, borders, grids, or black bars.

## Source Review

Accepted after inspection at native size and again at the 512x384 runtime
size. The south doorway, center aisle, counter, browse tables, and prop-free
interaction space remain readable. The image is presentation only: walkability,
entrance, NPC positions, and interactions remain authored in
`shared/interiors/shop_corner_goods_1f.json` and validated by the Go loader.
