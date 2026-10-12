# Unified quest journal and Old Mill integration

User-directed work, draft PR #339; branch `codex/battle-grounding-walk-lag`.
Server summary commit: `069fbd1`.

## Result

World, Town and Dungeon now open one journal containing the campaign, local
stories, saved discoveries, completion status, rewards and local favors. World
and Dungeon share one collapsible objective tracker. Story tracking and world
map destinations use the same disposable scene registry selection. Progress,
objectives and notes come from Go; selection is not persistent game state.

Old Mill retains its authored room exploration and puzzles. It uses the normal
party, battles, inventory, saves and rewards. Its notes and next step remain in
the journal after retreat, save/load and completion. Entering a local story
focuses its current objective; completing it returns tracking to the campaign.
Removed the separate canvas trail journal and the duplicate legacy campaign
log UI. The existing Quest Log title and close behavior remain compatible.

## Validation

```sh
cd client && npm test
cd client && npm run build
cd client && npx prettier --check --ignore-path .gitignore .
make test
make validate-data
make balance-sim
cd server && go vet ./...
cd server && go build ./...
cd server && go test -race ./api -run 'TestDungeonEntranceRoomExitAndSave|TestDungeonProgressPersistsIndependentlyAcrossCatalog'
```

757 client tests in 83 files passed; build and formatting passed. Full Go
tests, vet, build and targeted race checks passed. Shared data validation
passed; default balance simulation completed levels 1–20, 200 battles per
level. No combat, progression or quest pacing rules changed. The production
build retains its existing large-chunk warning.

Actual Chromium ran through the worktree-local Playwright wrapper because the
in-app browser backend was unavailable. These were the browser commands:

```sh
./scripts/run_playwright_local.sh e2e/old-mill-adventure.spec.js e2e/quest-objectives-touch.spec.js e2e/shop-buy-flow.spec.js e2e/shop-spell-learn.spec.js --grep 'entry, exploration|complete authored|staged|shop catalog|learns a purchased' --output=tmp/unified-journal-final-results
./scripts/run_playwright_local.sh e2e/old-mill-adventure.spec.js e2e/shop-buy-flow.spec.js --grep 'entry, exploration|shop catalog' --output=tmp/unified-journal-polished-results
./scripts/run_playwright_local.sh e2e/shop-spell-learn.spec.js --output=tmp/unified-town-journal-verified-results
```

The full-route run passed desktop and portrait entry/save/return, all twelve
Old Mill locations with real server battles, puzzle completion, payoff and
safe re-entry without duplicate rewards. Gear purchases passed at 1440 and
720 widths. Its spell test initially failed because the fixture used a legacy
shop scene and button labels. Updated it to use authoritative settlement/shop
transitions, current labels and stock IDs. The final spell/town run passed:
wrong class and low level rejected; eligible Mira learned Heal; gold was
deducted; no spell inventory item was added; the town party menu opened and
closed the shared journal. Spell eligibility coverage explicitly grants gold
and levels through the test helper; this does not prove a fresh player can
afford every spell within fifteen minutes.

The separate quest-objectives-touch tests were not selected by the full-run
grep. The shared journal displayed the actual staged campaign action list in
the Old Mill and Town flows; this turn does not claim a full campaign handoff
playthrough. Four gem workshop checks also passed at 375, 390, 800 and 1440
widths in the initial browser run, covering normal starter transmutation and
socketing.

After screenshot review, corrected Dungeon tracker typography, contrast,
44px touch targets, menu visibility and panel placement. The final polished
run passed all four selected Old Mill/gear checks. Screenshots were opened
and visually inspected, including the following unique local artifacts:

- `client/tmp/old-mill-1791759065113/1440-shared-tracker.png`
- `client/tmp/old-mill-1791759065113/390-shared-tracker.png`
- `client/tmp/old-mill-1791759065113/390-saved-journal-notes.png`
- `client/tmp/old-mill-1791759065113/1440-returned-shared-journal.png`
- `client/tmp/old-mill-1791758579523/390-completed-shared-journal.png`
- `client/e2e/tmp/issue-204-shop-spell-after-1791759269166.png`
- `client/e2e/tmp/town-shared-journal-1791759498444.png`

Logs are under `client/tmp/journal-{unit-final,build-final,format-final,
go-final,go-race,data,balance,browser-final,polished-browser,
town-verified}.log`. Generated proof and browser state remain local.

## Play guide and next scope

[First fifteen minutes](FIRST_FIFTEEN_MINUTES.md) describes a normal Quick
start route through tracking, gem customization, battles/XP, town shopping,
conditional spell buying and saving. It is a suggested budget, not a timed
unassisted playthrough or guaranteed level-up. Full weapon/armor manufacture
and gathering professions are not implemented; the document recommends
proving a small resource → craft → battle loop before building a large economy.
