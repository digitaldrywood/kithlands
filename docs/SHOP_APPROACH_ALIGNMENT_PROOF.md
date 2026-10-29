# Shop doorway and central aisle alignment

PR #339, branch `codex/battle-grounding-walk-lag`.

The UI-only opening audit in `WORLD_MAP_INSPECTION_PROOF.md` found that reaching the General Store required walking toward its roof and that the apparently clear interior aisle blocked a direct approach. Inspection of the authored maps confirmed two mismatches: the store interaction was64px above the painted steps, and an H/hearth collision tile occupied the undrawn center of the interior floor.

Three shared-data lines correct them. The Cadott store door moves fromy256 toy320; its upper solid footprint extends toy288, stopping the player before the roof. The interior's center hearth cell becomes floor. The store ID, return anchor, map ID, room ID, inventories, prices, party progression and save identities stay unchanged. This is a map-data correction; no character atlas, anchor, movement timing or interaction algorithm changed.

## Actual-game verification

A fresh source-built API8693 and Vite3614 load the updated data. Owner3609/API8689 and prior audit sessions were preserved. Startup registries on those older APIs retain the earlier maps; use3614 for this data update. Existing owner saves were not reset or inspected individually.

`shop-approach-alignment.spec.js` starts a normal account/party, walks through the actual town entrance and approaches the shop at1440×900,800×600 and390×844. Holding Up stops at row9 with feet at320 and the roof above blocked. Enter opens the actual shop room. The player walks straight up the formerly blocked aisle to the shopkeeper, spends the normal100 gold to learn Frost, and returns to the same town anchor with the learned spell retained. Read-only geometry checks accompany native input. Phone DOM controls use taps; walking and dialogue confirmations use keyboard, so this is mixed-input coverage.

Five existing portrait settlement cases and eight exit/retry cases also pass, including375px,540px,858px, network-error recovery, menu locks, inn entry/return, repeated town entry and return to World. These13 passes are retained in `client/tmp/shop-approach-final-20261026.log`; that combined run's three new shop cases reached return successfully but failed while serializing an NPC's circular sprite reference into proof JSON. The final three-case shop rerun records only NPC name/role/coordinates and passes. An earlier run's spell assertion expected string IDs rather than server spell objects; it was corrected without changing the purchase.

The existing normal opening route passes at1440px on this build: herbs/ore, real Frost purchase, Heron battle, earned smithing cache, Potion and Balanced Trail Sword crafting, gem transmutation/socketing, equipment, rest, mill-bat combat, latest-save/history and reload. It uses native actions with normal money/levels and encounters enabled, but a route helper knows the destinations. Its97.8-second scripted runtime is not a human fifteen-minute estimate. Original24 captures/audits are in `client/tmp/first-session-1440-1793060577721/`; log `client/tmp/shop-alignment-opening-20261026.log`.

Final corrected shop/map keyboard run: six cases pass in40.1seconds in `client/tmp/shop-approach-verified-20261026.log`. Shop originals: `client/tmp/shop-approach-1793060849966/` (21PNG); map originals: `client/tmp/world-map-inspection-1793060877374/` (12PNG). Together with the24 opening images, all57 were opened and inspected on ten contact pages mapped by `client/tmp/shop-approach-core-review-20261026/index.json`. The59 portrait/exit originals were inspected on all ten pages mapped by `client/tmp/shop-approach-regression-review-20261026/index.json`; sources `client/tmp/portrait-settlement-1793060543556/` and `client/tmp/settlement-exit-1793060601237/`. Unique videos remain under the corresponding Playwright output directories. These captures accept the corrected store approach, not every illustrated doorway in the game.

## CI regression carried with this slice

Parentf235ff2 hosted gameplay job121927295693 in run40424659272 fails the three new map close checks; its other29 gameplay cases pass, including the normal opening route. The job log is retained in `client/tmp/map-head-gameplay-job-20261026.log`. It presses Enter while a native select is focused, then expects one Escape to close the application dialog. A native dropdown can consume that Escape. The test now uses ArrowDown then Tab, asserts focus left the select, and still requires Escape to remove the dialog and leave the entire game state unchanged. The corrected three native cases pass in the six-case run above. Hosted Linux acceptance remains required; this is not a claim that CI has already passed. No runtime close behavior or meaningful state/containment assertion was weakened.

## Commands and local gates

From `client/`, with the isolated services already running:

```sh
VITE_PORT=3614 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/shop-approach-alignment.spec.js e2e/world-map-place-inspection.spec.js --output=tmp/shop-approach-verified-20261026
VITE_PORT=3614 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/shop-approach-alignment.spec.js e2e/portrait-settlement.spec.js e2e/settlement-exit.spec.js --output=tmp/shop-approach-final-20261026
VITE_PORT=3614 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" FIRST_SESSION_WIDTH=1440 npx playwright test --config=e2e/playwright.config.js e2e/first-session-route.spec.js --output=tmp/shop-alignment-opening-20261026
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

From the repository root:

```sh
make test
make validate-data
PGHOST=localhost PGPORT=54706 PGUSER=corylanou make test-e2e DB_NAME=kithlands_shop_alignment_20261026_1921 DATABASE_URL='postgresql://localhost:54706/kithlands_shop_alignment_20261026_1921?sslmode=disable'
```

871 client tests/100 files, production build, full formatting, Go tests, semantic data validation and isolated DB integration pass. Logs `client/tmp/shop-approach-{unit,build,format,integration}-20261026.log` and `client/tmp/shop-alignment-{go,data}-20261026.log`. The integration target created/migrated/removed only its named temporary database. Workflow YAML and diff checks pass. No combat/progression/pacing rule changed, so a new balance simulation is not claimed. The new shop spec/artifact directory joins the existing hosted interiors suite; no original case was removed.

Phone opening rerun also passes in92.4seconds with zero page errors: `client/tmp/shop-alignment-opening-phone-20261026.log`, originals `client/tmp/first-session-390-1793061144601/`. Its24 PNGs were opened and inspected on all four pages mapped by `client/tmp/shop-opening-phone-review-20261026/index.json`. It is the same scripted normal route with a phone viewport and mixed input, not a fully touch-only or unassisted playtest. Together this slice has140 inspected final PNGs. Reproduce with the opening command above and `FIRST_SESSION_WIDTH=390`.

The broader goal remains active: finish the uninterrupted UI-only route and remaining environment/reference acceptance, and obtain current-head hosted/general CI. Other doors/interiors still need their own alignment acceptance before any wider data change.
