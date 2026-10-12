# Crafting progression proof

Request: replace the herb/sword recipe with coherent crafting ingredients and
connect stronger gear to shops, rare gathering, and quest rewards.
Branch: `codex/battle-grounding-walk-lag`; draft PR #339.

## Acceptance slice

- Basic iron uses ore and hardwood, never herbs. Herbs still brew potions.
- Steel needs purchased charcoal, flux, and leather wrap; party level 4.
- Rare mythril needs a scarce seam, purchased supplies, and the Old Mill core;
  party level 8; two sockets. Equip restrictions persist on the crafted item.
- Ingredient cards explain acquisition sources. Empty materials do not inflate
  the pouch. Small screens scroll the body while retaining the craft action.
- Normal shops expose supplies and support pointer and keyboard purchases.
- Old Mill returns its crafting core once. Completed legacy saves receive it
  once on load. Spent cores stay spent after another save/load.
- Existing herb/ore node coordinates and depletion identities remain stable.
- Movement/dungeon state responses retain gathering and crafting data through
  the common state builder used by full snapshots.

## Server and client gates

Commands from the worktree root unless noted:

```sh
make test
make validate-data
make balance-sim
cd server && go vet ./...
cd server && go build ./...
cd server && go test -race ./api ./internal/gamedata
cd server && golangci-lint run --new-from-rev HEAD ./...
cd client && npm test -- --run
cd client && npm run build
cd client && npx prettier --check --ignore-path .gitignore .
```

Client unit gate: 761 tests in 85 files. The production build has the existing
large-chunk warning. No new dependencies or generated production artwork.

Targeted Go tests in `server/api`:

- `TestFieldCraftingAtomicOutputAndCombatGuard`
- `TestCraftingProgressionAndRareGathering`
- `TestSupplementalResourcesPreserveExistingNodes`
- `TestSmithingSuppliesPurchaseAndSavedStockUpgrade`
- `TestDungeonFullRouteSaveShortcutAndRepeatSafety`
- `TestCompletedSaveGetsCraftingCoreOnce`
- `TestDungeonMaterialRewardFailureIsAtomic`
- `TestGatheringPersistsThroughDungeonResponse`

`make test-e2e` uses a disposable PostgreSQL database on the worktree database
server, with credentials inherited from ignored local configuration. The test
setup creates and drops only that disposable database. Runtime saves are not
reset. Database integration passed after the reward/save changes.

Race tests passed for API and game data. Full `golangci-lint run ./...` still
reports two existing G703 path warnings in the unchanged dungeon-art handler
and dashboard file handler. The new-changes lint gate reports zero issues.

## Browser procedure

```sh
./scripts/run_playwright_local.sh e2e/gathering-crafting.spec.js
./scripts/run_playwright_local.sh e2e/gathering-crafting.spec.js e2e/old-mill-adventure.spec.js --grep 'gather, craft|complete authored'
./scripts/run_playwright_local.sh e2e/old-mill-adventure.spec.js e2e/shop-buy-flow.spec.js --grep 'complete authored|shop catalog'
```

Basic gathering/crafting/equip/socket/save/load/battle passed at 1440×900,
610×837, 390×844, and 800×600. Receipts and keyboard movement checks passed at
both mobile widths. A fresh 390×844 run passed after state-response consolidation
and the final mobile scrolling hint, using a separate worktree-local browser
profile against the wrapper's running services.

The advanced tests complete the authored Old Mill route with ordinary movement,
combat actions, damage, rewards, and retreat/re-entry checks. They then gather
iron, wood, and mythril; walk back to the town; purchase supplies; craft both
advanced swords; equip mythril; and save/load the spent core and two sockets.
The only progression shortcut sets the Warrior to level 8 through the server
debug fixture, allowing both recipes and the mythril equip gate to be exercised.
Boundary checks at levels 4 and 8 are covered in Go tests. This does not prove natural levelling time or the
long-term economy. The shop tests purchase supplies through visible keyboard
shortcuts at 1440px and 720px.

## Failures found and corrected

- The desktop save/load browser test timed out on its next route transition.
  Waiting for actual World readiness resolved it in subsequent runs.
- The old workbench assertion prohibited any vertical scrolling. It now checks
  containment and persistent footer controls while permitting the expanded
  source-aware recipe body to scroll.
- `stateUnlocked()` omitted gathering fields. Dungeon return and movement
  responses could erase the crafting UI's data. Full/incremental responses now
  share one state projection; a regression test covers dungeon return.
- Affordable non-equipment shop rows referenced the equipment-only `selectRow`
  handler. The Supplies tab exposed the crash. Those rows now activate their
  purchase handler; pointer and keyboard shop flows cover it.
- Reward rollback reconstructed the inventory through JSON. The transaction now
  works on a clone and restores the original inventory on failure.

## Inspected screenshots

Advanced desktop and mobile flows passed. All four recipe/source layout tests
passed. The final menu recovery and delayed-purchase gate passed all three tests:

```sh
./scripts/run_playwright_local.sh e2e/crafting-sources-layout.spec.js
./scripts/run_playwright_local.sh e2e/old-mill-adventure.spec.js e2e/shop-buy-flow.spec.js --grep 'party menu map guard.*390x844|shop catalog'
```

Screenshots were opened and visually inspected, including:

| Proof | Screenshot under `client/tmp/` |
|---|---|
| Desktop iron recipe | `gathering-1791771125849/1440-Forge-Iron-Sword-ready.png` |
| Mobile iron recipe | `gathering-1791772129750/390-Forge-Iron-Sword-ready.png` |
| Desktop rare recipe | `old-mill-1791772458995/1440-Forge-Runic-Mythril-Sword-ready.png` |
| Mobile rare recipe | `old-mill-1791773297953/390-Forge-Runic-Mythril-Sword-ready.png` |
| Equipped rare sword | `old-mill-1791773297953/390-runic-sword-equipped.png` |
| Restored game | `old-mill-1791773297953/390-advanced-save-restored.png` |
| Keyboard supplies purchase | `modern-shop-1791773972335/720-supplies-keyboard-purchase.png` |
| All sources at four sizes | `crafting-sources-1791773269791/{1440,610,390,800}-quest-and-store-sources.png` |
| Selected recipe at four sizes | `crafting-sources-1791773269791/{1440,610,390,800}-selected-rare-recipe.png` |

The delayed-purchase test holds the buy response for 500ms, presses the same
shortcut twice, and verifies exactly one request, one material, and one gold
charge. Pending purchases now block repeat input until refreshed stock arrives.
The final menu test also uses the specific party dismiss control, avoiding an
ambiguous match between its header and footer Back buttons.
