# Cadott Exterior Town Source

This directory preserves the source image and production brief for the first
Kithlands world-to-shop gold slice. The runtime derivative is cropped and
scaled to the fixed 800x576 settlement playfield without changing its
composition.

## Generation

- Date: 2026-08-09
- Tool: Codex built-in ImageGen
- Source: `cadott-town-source.png`
- Runtime derivative: `client/public/maps/cadott/cadott-town-background.png`
- Transform: center crop to 1478x1064, then resample to 800x576

## Production Brief

Create one original, high three-quarter-view 2D JRPG exterior for Cadott with
a clear south gate, looped packed-earth paths, a central green, and exactly
four major buildings. The General Store sits east with a teal roof, striped
awning, brass scales emblem, crates, sacks, barrels, and open double doors. The
inn sits west with a red roof, chimney, lantern, and hitching post. A blue-roof
house has asymmetric gables and a fenced garden. A pale-stone civic hall is the
dominant northern landmark with steps and a bell/clock cupola.

Use rich, modern Kithlands fantasy environment art with crisp pixel-informed
edges, handcrafted material texture, warm late-afternoon lighting, readable
entrances, and generous walkable paths. Include a well, benches, lampposts,
flower beds, and purposeful prop clusters. Do not include text, labels, logos,
watermarks, characters, monsters, castle walls, temples, repeated stamps, or
flat colored-block buildings.

## Source Review

Accepted for runtime integration after inspection at native size. The four
building silhouettes, every entrance, the south exit, and the path loop remain
readable in the 800x576 derivative. Collision and interactions are not inferred
from this painting; they are authored separately in the Tiled JSON map.
