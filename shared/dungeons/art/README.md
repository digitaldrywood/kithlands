# Old Mill environment art

These are original Kithlands environment backgrounds, created for the Old Mill
adventure on 2026-09-04. The thirteen PNGs comprise twelve locations and one
restored-waterwheel state. They contain no characters or monsters, so creature
appearance and completion are never baked into a background.

## Source and production method

`scripts/generate_old_mill_environment.py` authors twelve deterministic SVG
composition blueprints together with their Tiled map geometry. The room-specific
functions place purposeful prop clusters, set the material palette, define solid
footprints, and preserve navigation. The blueprints were rendered with the local
`rsvg-convert` tool. The first SVG finish was rejected as too flat beside Cadott;
those vector drafts are not runtime art.

The accepted PNGs were produced using Codex's built-in `image_gen.imagegen`
tool, one distinct asset per request. No CLI/API-key path, extra model setting,
paid subscription, external hosted runtime dependency, or third-party game art
was used. The tool selected its built-in image model; no model/version or seed
override was supplied. The requested output was a 3:2 landscape game background;
the resulting PNGs are 1536×1024 or 1537×1023 and are displayed at the map's
768×512 size. Those one-pixel source variations are recorded rather than hidden;
runtime geometry always comes from the Tiled map, not the source bitmap size.

The first input for each request was its original SVG blueprint, rendered to PNG.
The second input was an existing Kithlands style reference: Cadott town for the
approach, the existing shop for receiving, then the accepted approach/receiving
art for the remaining exterior/interior rooms. The active wheel-house variant
used the accepted inactive wheel-house PNG as its sole edit target.

`prompt-set.json` records the prompt spec and the individual scene briefs. The
shared request explicitly preserved the blueprint's layout, object footprints,
door positions, clear routes and action clearances; it requested detailed aged
wood, mossy stone, brass, and warm lamps without vector outlines, text, UI or
characters. Small generated placement differences were checked against the
tile grid, and the receiving casks/cart, drying stove, outdoor pools and tailrace
bar received explicit footprint corrections in the source generator.

## Runtime contract

- Every map is an orthogonal Tiled JSON map of 24×16 tiles at 32px.
- Ground images use `/api/data/dungeons/art/<asset>.png`.
- The eleven ordered map layers follow the environment-production contract.
- Collision rectangles are content; Go validates movement and actions.
- The common entry is tile `[12,12]`, at pixel center `[400,400]`.
- West/east/north/south/center/special anchors remain reachable at
  `[2,8]`, `[21,8]`, `[12,2]`, `[12,13]`, `[12,8]`, `[6,4]`.
- `../semantic-anchors.json` records player feet beside visible interaction
  props. It is review metadata; the adventure catalog owns actual actions.
- The restored variant changes water, wheel orientation, brass highlights and
  the north service threshold while preserving room geometry. Go decides
  whether the restored variant is eligible.

The generator defaults to an explicitly supplied candidate output directory. It
does not call an image service or overwrite runtime PNGs. Recreating a blueprint
does not recreate the accepted raster image; retain these PNGs as the source
assets for future targeted editing. Changes to final maps should also update
the generator's reviewed footprints.

## Evidence and limits

All thirteen accepted PNGs were opened and inspected. All twelve map layouts
passed cardinal flood-fill checks for the seven common anchors and closed
boundaries. All sixteen semantic anchors passed an independent flood fill.
The first approach/receiving pair was also inspected in the actual game by the
integrating task before the remaining scenes were expanded.

Source-image review and geometry checks do not certify every runtime movement,
mobile crop, encounter, save or transition. The adventure PR's full browser proof
and validation record are the authority for that end-to-end acceptance. The
loft's clue is communicated by the action marker and narrative; its floorboard
is not an independently readable painted text inscription.

## Forgotten Shrine environment set

The six `forgotten-threshold`, `echoing-nave`, `resonant-chapel`,
`moonwater-archive`, `branching-reliquary`, and `inner-sanctum` PNGs form the
second authored adventure. They were produced with the same built-in
image-generation path, one original 3:2 request per room, with no API-key CLI
or runtime dependency. `forgotten-shrine-prompt-set.json` records the tool,
source output, shared art direction, and room briefs.

The source candidates were inspected before being copied into this runtime
directory. Each room then received a deliberate 24x16 Tiled JSON composition
pass: visible water, pews, relic cases, guardian plinths, and altars have
explicit collision footprints; entrances, branch aisles, encounter floors,
switches, rest point, and reward altar remain reachable. The adventure's full
route test walks to every action using authoritative collision, and
`../forgotten-shrine-semantic-anchors.json` records the visible/action
alignment for review. Current uniquely named in-game screenshots, not these
source images alone, remain the final visual acceptance evidence.
