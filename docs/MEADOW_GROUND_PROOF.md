# Meadow ground and persistent landmarks

PR #339, branch `codex/battle-grounding-walk-lag`; follows `32458c3`.

## Accepted slice

The running meadow showed bright yellow sand against the newer muted grass,
rectangular ground transitions and visible tile seams. Shared presentation data
now supplies compatible sand, path, hill and marsh palettes. Walkable meadow
ground edges use crisp pixel coverage instead of rectangular quarters. Water,
forest and other blocking surfaces retain their existing solid boundaries.
This improves ground color/transition consistency; it does not eliminate every
seam or establish an authored, visually complete environment.

Ground texture variants now use the same bounded seed as their eight-entry
cache, so map traversal order cannot change a cached texture's appearance.
The new unit regression exercises two different first-visited tiles sharing a
cache key and compares their actual drawing commands.

A revived landmark round-trip test exposed a separate real regression: saved
world landmarks changed variant after reload because selection depended on
`interior_seed`. Marker selection now uses the persistent node ID. Its unit
regression changes the interior seed, name and coordinates; native verification
requires identical families, variant IDs, texture keys, positions and adventure
badges before/after settlement travel and save/load. Room selection is unchanged.

## Verification

Commands run from this worktree with `scripts/worktree-env.sh` and the ignored
local environment loaded where needed:

- `make test`: pass; API package 97.642 seconds.
- `make validate-data`: pass.
- `cd client && npm test`: 826 tests, 97 files pass.
- `cd client && npm run build`: pass; existing large-chunk warning remains.
- `cd client && npx prettier --check --ignore-path .gitignore .`: pass.
- `npx vitest run src/data/worldLandmarks.test.js src/scenes/meadowPresentation.test.js`: 11 pass after the final seed-fixture refinement.
- Native Playwright on isolated Vite 3610, API 8689, with worktree-local browser,
  HOME/XDG directories and `e2e/playwright.config.js`:
  `meadow-ground.spec.js overworld-landmarks.spec.js`: six pass, 19.4 seconds.
- Final landmark rerun adds actual phone touch entry: three pass, 11.2 seconds.
- `world-terrain-visibility.spec.js`: all four walking/camera-culling cases pass
  at 1440, 800, 645 and 390 widths. The initial combined invocation also contained
  the obsolete landmark test and therefore finished with one failure/five passes;
  do not report that entire initial invocation as green.

The initial landmark expectation searched removed canvas `[ ENTER ]` / `[ TAP A ]`
labels. It now checks the accessible named entrance. Its transition case walks
with native keys from normal quick start, enters/exits the actual Settlement,
then saves/reloads. The phone case walks and taps the named entrance. An interim
revision incorrectly waited for Town and failed; it was corrected without
changing the game's settlement route. The subsequent identity mismatch failed
before the stable-node marker fix and passes afterward.

No combat, reward, spawn position, terrain collision, respawn deadline or save
schema changes. No balance simulator needed for this presentation-only slice.
No new DB integration gate or full race/lint gate was run for these client/data
changes; previous combat-slice gates remain historical evidence.

## Evidence inspected

All paths below are relative to the worktree. Each run has unique captures.

- Final terrain: `client/tmp/meadow-ground-1792986101030/` — 15 captures:
  arrival, herb, mineral, wood and sand edge at 1440x900, 800x600, 390x844.
  Per-viewport audit JSON confirms canonical tiles/resource records unchanged
  while rendering. These are explicitly camera/actor-position fixtures, not
  proof of human route finding, resource collection or encounter pacing.
- Landmark native route: `client/tmp/overworld-landmarks/proof-1792986111372/` —
  nine captures, including all five classified families and save/reload.
- Final touch enhancement: `client/tmp/overworld-landmarks/proof-1792986153977/` —
  ten captures including actual 390px touch entry into Settlement.
- Terrain walking/zoom: `client/tmp/meadow-regression-1793024900/` — all eight
  screenshots inspected; frame audits retain camera culling/movement evidence.
- Review montages: `client/tmp/meadow-final-ground-review-1793027200.jpg`,
  `client/tmp/meadow-final-landmark-review-1793027200.jpg`,
  `client/tmp/meadow-touch-review-1793027500.jpg`,
  `client/tmp/meadow-regression-review-1793026300.jpg`.
- Player's actual local game: `client/tmp/meadow-player-1793025800.png` inspected
  after Save and exit, reload and Continue newest. Final client reload also inspected in `client/tmp/meadow-player-final-1793027800.png`. Save timestamp Oct 25,
  10:38:05 PM CDT; same sandy position, four level-five characters, 495 gold,
  14 potions and previous HP/MP/XP preserved. No quest/gather/battle mutations
  were performed on the player's account. Main game remains at localhost:3609.

Logs: `client/tmp/meadow-{go-test,data}-1793024900.log`,
`meadow-native-1793024600.log`, `meadow-regression-1793024900.log`,
`meadow-final-1793026800.log`, `meadow-touch-1793027200.log`,
`meadow-{unit,build,format}-final-1793027000.log`,
`meadow-focused-1793027400.log`, `meadow-format-1793027400.log`.

Both new terrain and revived landmark suites are included in the hosted walking
job, with their proof directories retained as artifacts. Current head needs its
own remote gate; general CI remains on the owner's self-hosted runner setup.

## Remaining environment acceptance

Keep the overall environment/habitat checklist open. This pass does not prove
saved respawn expiry across closing/reopening, new gathering/crafting outcomes,
unassisted first-visit navigation or all-class walk quality. Stronger route
hierarchy and deliberate landmark composition remain necessary. Forest edges
and some tile seams are still repetitive. The natural-grove capture contains a
pale cross-shaped ground patch requiring investigation. The settlement exterior
is too small/letterboxed in portrait, unlike the already improved interiors.
Those are follow-up defects, not accepted visual quality.
