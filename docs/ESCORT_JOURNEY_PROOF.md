# Lost traveler escort acceptance

2026-10-25 · `codex/battle-grounding-walk-lag` · draft PR #339.

## Behavior

Q05 previously paid for reaching its destination. It now uses six authored
steps: visit the keeper, learn the search location, find the traveler, offer an
escort, travel home, and confirm the reunion. Go owns companion custody and
all transitions. Arrival, unrelated victories and repeated requests cannot
pay the quest. Companion and sprite identity are saved with the quest; they
are never ordinary inventory items. Existing rewards and quest order remain.

The traveler is a civilian who takes cover in battles. Retreat keeps them with
the party. An overworld defeat restores the party, sends the traveler back to
the search site and requires rejoining before another return attempt. There is
no quest payout on defeat. Dungeon recovery remains separate: the civilian
waits outside. The existing search site and downstream objective destinations
are retained so resource identities, habitat terrain and saved respawn custody
are preserved. Completed legacy escorts stay completed; unfinished legacy
saves get a new plan without moving their search site or changing the reward.

World and Town show the approved Wayfarer walk atlas as a following civilian.
A breadcrumb follows the path actually traversed by the leader instead of
cutting across corners. Distance drives the gait; foot anchors, scale and
shadow follow the same presentation contract as the party leader. The world
name sits above the actor, while Town omits it to avoid covering Talk prompts.
The journal and objective area show who accompanies the party and the return
location. No assets were regenerated, and no combat or movement rules moved
to the client.

## Actual-game proof

`client/e2e/escort-journey.spec.js` selects Q05 from an existing seed-4 campaign
with the pre-existing development quest-index control. This is an explicit
Act 2 fixture, not natural campaign progression. It does not grant XP, money,
materials, health, custody or enemies, teleport the party, disable encounters,
or submit combat actions through an API. Every journey is walked with native
keys; all real travel fights use native battle controls.

- Desktop 1440×900: native quest interactions, visible following, mid-escort
  save/exit/load, real retreat while keeping the traveler, further travel
  victories, separate reunion and one reward. The desktop case passed in
  3.7 minutes in `client/tmp/escort-native-final-1792985100.log`.
- Phone 390×844: native touch A and dialogue-box taps, keyboard movement and
  battle commands; a real defeat by repeatedly defending, recovery without
  payout, recovery save/exit/load, return to the search site, rejoin, another
  saved escort journey and a successful reunion. The targeted final phone run
  passed in 9.4 minutes: `client/tmp/escort-phone-final-1792987400.log`.
- The combined final run was intentionally interrupted after its desktop case
  passed: the phone fixture incorrectly assumed touch controls survived scene
  changes. The retained video showed that its tap revealed A without submitting
  an action. The helper now reveals controls per scene before confirming, and
  the corrected phone run above passes. Production touch activation is unchanged.
- Both earlier basic escort cases also passed before the label/spacing polish:
  `client/tmp/escort-native-1792983000.log`, 8.5 minutes. These are preliminary,
  not substitutes for the final retreat and recovery cases.

All 18 final desktop and 25 final phone captures inspected:

- `client/tmp/escort-journey-1792969899472/`
- `client/tmp/escort-journey-1792970536617/`
- `client/tmp/escort-desktop-contact-1792986300.jpg`
- `client/tmp/escort-phone-contact-1792988700.jpg`

Full-resolution phone following and recovery inspected, including
`390-10-following-in-world.png` and `390-13-escort-defeat-recovered.png` in the
final phone directory. World motion after retreat inspected in twelve frames
at 4fps: `client/tmp/escort-motion-1792986500/contact.jpg`. Source videos are
under `client/tmp/escort-native-final-1792985100/` (desktop) and
`client/tmp/escort-phone-final-1792987400/` (phone).

The three required movement suites pass together: 14 tests in 7.0 minutes,
`client/tmp/escort-walk-1792983000.log`. They cover all twelve classes, four
cardinal directions, World/Town and real Space cycling. The actual
`/sprites.html` Wayfarer cells were inspected, then all twelve classes were
cycled with Space, walked right/left and stopped in the actual
`/?walkAudit=1&noEncounters=1` game. The separate audit has no encounters by
construction and is not escort/balance evidence. Its 24 views are inspected in
`client/tmp/escort-all-class-contact-1792986100.jpg`; atlas proof is
`client/tmp/escort-wayfarer-viewer-1792985700.png`. No existing walk atlas changed.

## Server and simulator checks

Focused server cases reject remote/future/replayed requests and missing
companion/clue custody, preserve the traveler during mid-escort and pending
reunion save/load, pay once, recover real defeat resolution, keep custody on
retreat, leave dungeon recovery separate, and preserve completed/unfinished
legacy saves. All existing gathering placement fingerprints pass. Final focused
logs: `client/tmp/escort-migration-final-1792988500.log` and
`client/tmp/escort-migration-race-1792988500.log`.

The 600-campaign gate exposed two simulator failures: cautious seeds 8 and 47
retried Q04's kill step with a generic interaction after retreat. A regression
reproduces the exact rejection before the fix. The simulator now uses the
ordinary encounter-entry action for a kill step. A separate regression caught
Q05's three journeys receiving 15 encounter rolls from a fixed budget of ten;
the unchanged total budget is now split among the authored travel legs.
Production encounter chances and combat stats are unchanged.

- Before: `client/tmp/escort-sim-before-1792984200.log`.
- After focused simulator suite: `client/tmp/escort-sim-after-1792984400.log`.
- Final 100 runs × three strategies × two route policies: all assertions pass,
  `client/tmp/escort-sim-final-1792984400.log` and matching JSON.

## Exact commands and local gates

From the worktree root, source `scripts/worktree-env.sh` and `.envrc.local`.
Native browser proof used the separate Vite 3610/API 8690 pair against unique
local test accounts. From `client`, use:

```sh
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/escort-journey.spec.js --output=tmp/escort-native-final-1792985100
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/escort-journey.spec.js --grep '390 escort' --output=tmp/escort-phone-final-1792987400
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/walk-all-classes.spec.js e2e/world-space-cycle.spec.js e2e/world-walk-audit-party.spec.js --output=tmp/escort-walk-1792983000
npm test
npm run build
npx prettier --check --ignore-path .gitignore .
npm audit --audit-level=moderate
```

Client: 802 tests across 95 files, production build, full client formatting and
zero audit vulnerabilities pass. Logs: `escort-polish-client-1792984900.log`,
`escort-polish-build-1792984900.log`, `escort-full-format-1792985500.log` and
`escort-audit-1792985500.log` under `client/tmp/`.

```sh
make test
make validate-data
make balance-sim
make simulate
cd server
go vet ./...
go build ./...
golangci-lint run ./...
go test -race -timeout=20m ./...
go test ./api -run TestEscort -count=1
go test -race ./api -run TestEscort -count=1
go test ./cmd/simulate -run 'TestCautiousQuestRetreatReachesTerminal|TestEscortThreeJourneysKeepTravelBudget' -count=1
```

Full Go ordinary tests, vet, build, lint, data validation, the 4,000-battle
smoke and final 600-campaign simulation pass. Full race gate passes with the
API package taking 534.8 seconds. Its first invocation hit the default ten-minute
package limit while the live-OSM test was running; no data race was reported.
The successful rerun changes only the timeout. Logs under `client/tmp/`:
`escort-go-complete-1792985100.log`, `escort-vet-complete-1792985100.log`,
`escort-go-build-1792983300.log`, `escort-lint-complete-1792985100.log`,
`escort-data-1792982000.log`, `escort-balance-1792982000.log`, and
`escort-race-complete-1792985500.log`. The added legacy migration test also
passes separately under the race detector.

Isolated DB integration passed and removed only its temporary database:

```sh
PGHOST=127.0.0.1 PGPORT=54706 make test-e2e DB_NAME=kithlands_609_escort_it_1792985100 DATABASE_URL='postgres://localhost:54706/kithlands_609_escort_it_1792985100?sslmode=disable'
```

Log: `client/tmp/escort-integration-1792985100.log`. Live saves were retained.
The main API was rebuilt/restarted on 8689; Vite remains on 3609. The latest
manual player save (Oct 25, 5:56:25 PM CDT) was restored through save history;
its level-five party, 475 gold and 14 potions were verified, and the game was
left in World. Proof: `client/tmp/escort-restored-player-1792987800.png`.

## Remaining acceptance

The hosted suite on ee65581 passed all four visual groups. This change adds an
escort matrix group with retained artifacts; its new hosted gate remains pending
until this chunk is pushed. General CI stays self-hosted by Cory's explicit
decision and still needs an eligible runner. No merge or deployment occurred.

This does not establish natural Act 2 availability, unassisted first-visit
pacing or completion of the full playability goal. Phone interior composition
and small canvas text still need polish. Further enemy roles, broader
Warrior/Cinder action choreography, meadow/resource habitat presentation and
the integrated first-fifteen-minute acceptance remain in the tracker.
