# Rich interior library

The library now contains 25 templates per family and 122 floors. Five furniture profiles per family provide distinct sleeping,
reading, dining, trading, worship, and archive arrangements. Secret alcoves and
stairs have protected approaches. The original twelve template IDs, floor IDs,
and treasure IDs remain intact; canonical Cadott doors explicitly name their
curated templates.

`shared/interior_library_design.json` contains the source profiles and legacy
blueprints. Run `python3 scripts/build_interior_library.py` to reproduce the
checked-in runtime JSON and manifest. Run
`python3 scripts/export_interior_tiled.py client/tmp/interior-tiled-review` to
export all 122 floors with external furniture tilesets and ordered visual,
collision, interaction, NPC, and player layers. Tiled exports are for editing
and inspection; the existing server-authoritative interior JSON remains the
runtime format. Exported image layers record runtime display dimensions as
custom properties because the renderer scales source backgrounds to each room.

The server rejects disconnected walkable areas, unreachable NPCs or treasure,
and obstructed stair destinations. Tests assert exactly 100 distinct floor
plans, 25 per family, legacy treasure identities, and save selections surviving
future registry expansion. Texture keys share background, furniture, and chest
assets across all templates.

Current proof: `client/tmp/interior-library-1788837141076/` contains all 122
rendered floors and 13 inspected gallery pages. The gallery passed all four
family checks; visual inspection caught and corrected hidden NPCs and the
remaining shop placeholders. The elder/temple server-selected treasure visits
and doorway tests at 1440/720/390 passed in run 1788837003288. Full integration,
733 client tests, build, semantic data validation, and Go lint passed. Final
combined-base regression checks and merge are still pending.

Asset provenance: `docs/art/interior-library-2026-09-07.json`. Selected furniture
has verified RGBA transparency. New worlds mix their RNG seed into selection;
saves pin template IDs, while unpinned legacy saves select generation-zero
templates. Missing pinned templates fail explicitly rather than reshuffling.
