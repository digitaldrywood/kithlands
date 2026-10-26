# Gathering props and readable phone exploration

PR #339, branch `codex/battle-grounding-walk-lag`; follows `2d59546`.

The normal gathering route used small primitive triangles, leaf shapes and a
log rectangle. Foreground leaves could hide a pickup, and the bright generated
forest underlay clashed with the meadow. Portrait exploration also displayed
too much land at once, making both characters and pickups unnecessarily small.

## Change and boundaries

- Four original RGBA props depict flowering meadow herbs, mossy fallen
  hardwood, orange-veined Ember iron and silver-blue Mythril. Shared
  presentation data maps material IDs to canonical asset keys/paths. Boot
  loads the four small runtime files. Full-resolution sources, exact prompts
  and offline normalization are retained in `docs/art/gathering/`.
- Resource feet use a stable bottom-center anchor and world-Y depth. Nearby
  foreground foliage fades around a harvestable site. Small depleted rubble,
  bark and cut-stem marks remain distinct from the full available prop.
- Forest/tree ground now uses the meadow's restrained olive palette. Canonical
  collision, habitats, locations, yields and deadlines are unchanged.
- Portrait World starts at 2x zoom. A separate fixed UI camera keeps canvas
  controls at their original logical size; DOM menus/minimap are unchanged.
  World taps still pass through the main camera's inverse transform. Pinch
  zoom remains available. Desktop framing and character atlases are unchanged.

This accepts the resource-prop/readability slice, not a complete authored
landscape. Repeated canopy stamps, geometric roads, sparse composition and
stronger landmark/path hierarchy remain open. The viewport gallery moves the
camera/player as an explicit inspection fixture; it is not travel evidence.
The rare seam is visually inspected at level one, not harvested with grants.

## Commands and evidence

All paths below are retained locally under ignored `client/tmp/`.

- `make test` and `make validate-data`: pass. Final logs
  `gathering-art-final-{go,data}-1793029000.log`.
- `cd client && npm test -- --run`: 853 tests in 99 files pass;
  `npm run build` passes. Logs `gathering-art-{unit,build}-1793028300.log`.
  `npx prettier --check --ignore-path .gitignore .` passes; final log
  `gathering-art-final-format-1793029000.log`.
- `bash -n docs/art/gathering/normalize.sh` and
  `bash docs/art/gathering/normalize.sh client/tmp/gathering-normalized-1793027000`:
  pass. Every regenerated RGBA pixel matches runtime; PNG metadata differs.
  All four props have 64x48 cells, transparent margins and binary alpha.
- The twelve-class `audit_walk_sheets.py` command with `--columns 6 --rows 8
  --mode enforce` passes, as does `sha256sum --check docs/walk-assets.sha256`.
  Logs `gathering-art-{atlases,walk-hashes}-1793029000.log`.

Native commands use the already-running isolated servers, rather than the
wrapper that would stop owner ports:

```sh
cd client
VITE_PORT=3611 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
npx playwright test --config=e2e/playwright.config.js \
  e2e/resource-route-respawn.spec.js
```

The desktop case passes in 3.8 minutes: normal input, one actual travel battle
and authoritative victory acknowledgement, four successful harvests, exact
saved resource identities/deadlines and real three-minute closed-page herb
renewal. Ten captures in `resource-route-1793020255050/` are inspected. The
interruption stopped its following phone case during the offline wait, so the
batch is not reported as wholly passing (`gathering-art-native-1793026800.log`).

After restoring the same services/database, the same command with
`-g '390 resource route'` passes in 3.9 minutes. All ten captures in
`resource-route-1793020846607/` are inspected. Both audits have no page errors,
one battle return and four HTTP 200 gather replies. Phone input is mixed native
keyboard movement and touch menu/gather input, not touch-only traversal.
Log: `gathering-art-phone-resume-1793028100.log`.

The final gallery inspects all four props, standing on/beside nodes, forest and
sand edges at 1440x900, 800x600 and 390x844. It verifies asset dimensions,
anchors, matching node count, phone world/UI zoom and unchanged canonical
tiles/resources. The actual phone touch test also taps back to the original
tile through the zoomed world camera, checks the D-pad painted edge and enters
Old Mill through the normal control. All thirty gallery captures and its one
touch capture are inspected:
`meadow-ground-1793021204323/`, `exploration-touch-1793021200532/`.
Review indexes: `gathering-art-final-gallery-review-1793029200.json` and
`gathering-art-resource-review-1793028800.json`.

The combined final regression batch passes all 24 cases in 11.1 minutes,
recorded in `gathering-art-final-native-1793028900.log`. It includes the normal
phone opening route, all-class World/Town movement, Space cycling at
default/phone sizes, and world terrain culling at four widths/zoom changes.
The first attempt
was rejected before running because video was configured inside a describe
group; corrected to top-level (`gathering-art-final-native-1793028600.log`).

The normal phone opening route takes 94.690 seconds and finishes with 28 gold,
24 XP per companion, still level one. All 24 captures in
`first-session-390-1793021682950/` are inspected, including legitimate Frost
purchase, Heron victory/rewards, potion/blade/gem crafting, equipment/socketing,
mill combat and newest-save/history/reload. This is a known-route automated
replay, not a human first-visit timing estimate.

All 38 retained walking/terrain PNG files (including attachment copies) are
inspected under `gathering-art-walk-proof-1793029500/`, with ten contact pages
indexed by `gathering-art-walk-review-1793029500.json`. The two full class-cycle
videos are retained there. Ninety-six time-sampled video frames were inspected
in eight `motion-review-*.jpg` pages, with enlarged top-of-world actor crops;
crop-edge clipping in those QA crops is not present in the full screenshots.
No new generic sprite fallback, atlas cropping or scale change appears during
the class switches. Sampling uses the existing slowed audit cycle and does not
prove human-perceived normal-speed motion under every machine load.

```sh
VITE_PORT=3611 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
XDG_CACHE_HOME="$PWD/tmp/xdg-cache" FIRST_SESSION_WIDTH=390 \
npx playwright test --config=e2e/playwright.config.js \
  e2e/meadow-ground.spec.js e2e/exploration-touch.spec.js \
  e2e/world-walk-audit-party.spec.js e2e/world-space-cycle.spec.js \
  e2e/walk-all-classes.spec.js e2e/world-terrain-visibility.spec.js \
  e2e/first-session-route.spec.js
```

No combat/progression content or authoritative Go logic changed. Full race,
lint, balance and integration proof for the unchanged backend is retained in
`VICTORY_EXPLORATION_HANDOFF_PROOF.md`; those lengthy gates were not repeated
for this presentation-only chunk.

## Local player recovery after interruption

The interruption terminated both API/Vite pairs and their test process;
PostgreSQL remained running on 54706 with `kithlands_609`. No database was
recreated, reset or replaced. Main API/Vite now use 8689/3609, audit uses
8690/3611, with HMR disabled. Health checks pass.

The old browser tab was already an offline error page. A separate tab opened
the local game and selected normal Continue → most recent autosave, October
26 08:16:47 CDT. It restores four level-six companions, 525 gold, 15 potions and
zero Ether. Hero is 220/220 HP, 5/5 MP; Sparks 155/155, 33/35; Shade 160/160,
5/5; Willow 163/168, 33/35; all have 43/170 XP. Normal Save confirms success
at 08:24:48 CDT. Party, inventory, quest state, RNG, spawn and locality match
the loaded autosave exactly. The sole world-state difference is the normal
loader's `combat` → `world` phase normalization. This verifies recovery of the
saved checkpoint, not unsaved actions before the interruption.

Raw snapshots/comparison remain in `gathering-art-owner-{before,after,comparison}-*`.
The inspected ready screenshot is `gathering-art-owner-ready-1793028700.png`.
The recovered tab is retained for play; the original tab/history are untouched.

## CI and remaining goal

Parent `2d59546` hosted run `40326355882` passes all eleven visual suites and
the protected summary. This new chunk needs its own gate after push. General
CI remains on the owner-selected self-hosted labels. The active goal still
includes environment composition, remaining Warrior/Cinder choreography,
integrated equipment/gem artwork and unassisted first-visit pacing.
The rare level-eight seam still presents an unqualified Gather label at level
one before Go rejects the attempt; expose that requirement in the interaction
prompt in a following UX slice. This art pass does not change eligibility.
