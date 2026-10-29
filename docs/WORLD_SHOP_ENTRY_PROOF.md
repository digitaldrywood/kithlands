# Direct world-shop entry regression

The reported General Store showed “Stock unavailable: enter a shop before
buying.” This was a location mismatch, not empty stock or insufficient gold.
The settlement-shop route established `LocationInterior`, but the legacy
world entrance started Town directly while the server retained `LocationWorld`.
The responsive shop correctly displayed the server's rejected catalog request.

## Repair

World entrances now await `enter-world-interior` before rendering Town. The
server requires an already recorded arrival at that node, validates any supplied
physical position and looks up the generated map's interior metadata. Natural
nodes, remote entrances and the authored settlement's replacement entrance are
not accepted through this protocol. Shop stock/purchase validation is unchanged.
A direct interior records its world return kind; leaving it returns to that
world node, while existing settlement interiors still return to the settlement.
Errors keep the player outside and release input instead of showing a false
interior.

Quest actions also recognize the validated visit inside a direct world
interior. The interior ID, map ID, world node and world return kind must agree;
quest/node reachability, recorded visit, objective cursor, custody and replay
checks remain. Settlement interiors do not gain permission to impersonate a
world quest node.

## Before/after coverage

- `TestDirectWorldShopEntryPurchaseAndReturn` failed before the repair because
  the transition was unavailable. It now buys stock at its server price,
  returns to the same world node, rejects stock requests outside and reenters.
- `TestDirectWorldInteriorRejectsRemoteAndNonBuildingEntries` checks invalid
  nodes/physical positions and rejects natural features as interiors.
- `TestDirectWorldInteriorKeepsQuestVisit` failed before the quest repair with
  “visit the objective location first.” It now accepts the legitimate action,
  rejects replay and rejects mismatched or settlement interior contexts.
- Two client regressions failed before the repair because no transition was
  sent. They now verify server-confirmed entry and an unlocked, visible error
  instead of scene entry after a rejection.
- Native browser reproduction at 774px captured the user's exact catalog
  rejection in `client/tmp/world-shop-entry-1792960216052/774-stock.png`.
  The first attempt had a test-selector error (`Enter` instead of `Shop`),
  which was corrected before reproducing the catalog failure.

Normal merchant navigation can encounter a quest interaction before the shop
conversation. Its native helper now waits for the actual dialogue or released
interaction lock and confirms the displayed steps; it does not skip quests,
mutate game state or submit purchases directly.

## Player continuity

Before replacing the local API binary, the user's active adventure was saved
through Save game and Save and exit. Continue showed the newest level-five
party; it was resumed after the update. Existing PostgreSQL data was retained.
Final regression work uses temporary local ports 3610/8690 against synthetic
accounts so it can run without interrupting that live adventure.

## Validation

Final native gate: **7 passed in 3.9 minutes**. This includes actual world-shop
purchases/returns at 1440×900, 774×900 and 390×844, both existing settlement
round-trips, the native Attack regression and the complete fresh starter route.
The narrow route uses keyboard/pointer, not a touch-only traversal.

Commands run from the worktree, sourcing its environment before entering
`client/` (native gate overrides `VITE_PORT=3610` for the temporary server):

```sh
make test
make balance-sim
cd server
go test ./api -run 'TestDirectWorld|TestQuestObjectives|TestCadottWorldShopRoundTrip' -count=1
go test -race ./api -run 'TestDirectWorld|TestQuestObjectives|TestCadottWorldShopRoundTrip' -count=1
go vet ./...
golangci-lint run ./...
go build -o ../client/tmp/kithlands-world-shop-1792966400 ./cmd/kithlands
cd ../client
npm test
npm run build
npx prettier --check --ignore-path .gitignore .
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/world-shop-entry.spec.js e2e/opening-integration.spec.js e2e/first-session-route.spec.js --output=tmp/world-shop-accept-1792966800
```

All Go tests, targeted race tests, vet/lint/build and the 4,000-battle simulation
pass. All **791 client tests in 93 files**, build and formatting pass. No content
or DB schema changed. The native-route video and screenshots remain in the
unique output above. Inspecting raw diagnostic traces showed completed stock,
purchase and return actions, but the always-on trace runs hit artifact teardown
timeouts; those runs were not accepted as passing proof. The final gate uses
the standard trace-on-retry policy, retains video and keeps every purchase,
location and return assertion.

Inspected all nine final shop PNGs in
`client/tmp/world-shop-entry-1792960994348/`, through `review/sheet-1.jpg` and
`review/sheet-2.jpg`. These include stock, purchase receipt/decreased gold and
return-world captures at each viewport. The final fresh-route's 24 PNGs were
also inspected through four sheets in
`client/tmp/first-session-1440-1792960894255/review/`. Its complete save/reload
assertions still pass. These checks do not grant new walk or battle-animation
acceptance. Intermediate-width item names still wrap tightly, and broader
terrain/notification polish remains in the goal backlog.

The final server binary is running on API port 8689 behind the existing
localhost:3609 client. The user's latest level-five adventure was saved and
resumed again after the final update. The workflow includes the new native
shop spec and retains its unique captures. General CI remains self-hosted by
owner instruction; the new commit still needs its remote gate.
