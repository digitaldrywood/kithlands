# Heron Pool: optional combat to a useful crafted choice

2026-10-25 · `codex/battle-grounding-walk-lag` · draft PR #339. No separate assigned issue.

## Implemented flow

Normal Quick start → Old Mill trail → optional Heron Pool detour → inspect the visible reed-bank herd → decline or fight → recover guarded smithing supplies → choose a power or accuracy sword → equip → rest at the cleared bank → save/load → test the weapon against the entrance bats → enter the mill.

The optional encounter uses level-2 Reed-bank Bramblehogs: one for a two/three-person party, two for four. The server uses the same roster-selection helper for preview and encounter creation. The preview names the actual enemies and level and shows field-guide advice, not a promised next attack. It can be cancelled with Back/Escape. Tab/Shift+Tab, arrows, Enter, visible Alt shortcuts and phone taps are supported.

The guarded box grants 8 ore, 2 hardwood and one balanced bronze pommel. Iron Sword remains 12 Power / 5 Hit Chance; Balanced Trail Sword trades one Power for ten additional Hit Chance, has one socket, and consumes the unique pommel. Three ore remain for gem shards after crafting either blade. The pommel's source is shown in the recipe. This is a once-only supply cache, not a resource node pretending to regrow. Existing territorial gathering and saved respawn timers remain available on world routes.

The new weapon deliberately uses the approved iron-blade icon, visual attachment and animation set. The reed-bank variant uses the existing Bramblehog art with stronger content-defined HP, rewards and field notes. No character atlas was regenerated or changed. Zero-price craft-only weapons/armor are excluded from new ordinary shop stock; the new blade cannot bypass its component through a free vendor listing.

Winning clears the threat marker and unlocks the supply box and free rest action. Saved flags select a post-victory room description. The ordinary journal records the discovery, supply reward and resting place. The main mill objective and doorway fight remain independent; players may skip the detour.

## Mechanical verification

- `make test` passes, including the full API suite.
- `make validate-data` passes: 29 monsters and the existing 26 random formations. The authored reed-bank variant has zero random encounter weight.
- `make balance-sim` passes with the unchanged ordinary-encounter baseline (200 battles/level, levels 1–20, seed 42).
- `cd server && go vet ./... && go build ./...` pass.
- `cd server && go test ./api -run 'Test(DungeonPreviewMatchesResolvedRoster|Heron)' -v` and the same focused selection with `-race` pass.
- `cd client && npm test -- --run` passes: 778 tests / 91 files.
- `cd client && npm run build` and `npx prettier --check --ignore-path .gitignore .` pass. Existing large-bundle warning remains.

The new API tests check two/four-member preview rosters against actual encounter creation; guarded claim rejection; exact supplies and recipe costs; consumed-component rejection; one crafted instance; save/load and replay protection; resting; retained cleared state after retreat; no free shop bypass; and defeat leaving supplies/rest locked. Persistence tests explicitly use a forced-victory fixture to isolate state mutation. Balance and browser combat use actual server resolution separately.

Starter balance runs use fresh level-1 normal parties, ordinary starting supplies, no grants, and 20 seeds per party size. Both sizes win 20/20. Two-person parties take 33 total rounds (1.65 average); four-person parties take 47 (2.35 average). The initial ordinary single hog died too quickly, so the final authored variant has 48 base HP. This establishes a short, survivable detour; it is not evidence from human enjoyment testing.

## Actual-game proof

The in-app browser connection was unavailable. Isolated Chromium ran against the actual local Phaser client and Go API, reusing the running servers and the existing save database. The wrapper's isolated browser environment was preserved without having it terminate the user's servers:

```sh
source scripts/worktree-env.sh
source .envrc.local
cd client
PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
HOME="$PWD/tmp/home" \
XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
npx playwright test --config=e2e/playwright.config.js e2e/heron-playability-loop.spec.js
```

Both 1440×900 desktop and 390×844 touch cases pass, with normal motion. They start from `/` with random encounters enabled, use ordinary Quick start, and grant no levels, items or HP. Pointer/touch controls navigate the authored route through server-validated movement. The desktop preview is exercised with Tab, Shift+Tab, arrows, Enter and Escape; phone preview controls use touch.

One complete authoritative round is rendered through the normal battle submission/playback path, with post-render melee contact frames captured. Remaining rounds use the ordinary action endpoint through the development bridge to verify outcomes quickly. This is not a full human-paced recording of every round. The crafted blade is equipped before the subsequent bat fight. Save/load retains the equipped inventory, spent component, claimed cache and cleared threat; the test then continues into the receiving room. Browser error arrays are empty.

Final inspected proof directory: `client/tmp/heron-loop-1792940485716/`.

For each `1440` / `390` prefix, inspected screenshots include `optional-bank-before`, `encounter-preview`, `real-battle`, `after-rendered-round`, `supplies-and-cleared-bank`, `precision-recipe`, `rare-component-source`, `precision-blade-equipped`, `after-equipment-close`, `saved-cleared-bank`, and `crafted-blade-tested-mill-entry`. Inspected motion frames are `real-contact-0.png` through `real-contact-2.png`. `1440-inspection.jpg` and `390-inspection.jpg` contain every image for review; `*-flow.json` records final state, round count and errors.

The first helper incorrectly waited for walk-scene objects in Battle; its readiness check now waits for the battle command presentation. A later desktop run lost an immediate HUD click following equipment closure; diagnostics showed no lingering menu lock, and waiting for scene/input render frames before canvas clicks stabilized the final runs. No gameplay assertion, save check or target-state requirement was removed. The final keyboard/touch rerun passes both cases.

## Remaining goal work

This slice makes the optional encounter → supplies → sidegrade → saved consequence concrete. It does not prove an unassisted fifteen-minute route, guarantee a level-up/spell purchase, overhaul random encounter roles, implement exact enemy intent, or deliver new critical-hit body choreography. Meadow art, broader combat choreography and the rest of the tracker remain active.

Remote visual run `40202414864` passed walking/gameplay/interiors. Later run `40203229574` passed walking/interiors but failed the intermittent 800px second-Cure test. General CI is still queued for missing self-hosted runners. The new route is included in the hosted gameplay workflow; fresh CI must be inspected after this chunk is pushed.

`make test-e2e` was also attempted with an explicitly separate database, `kithlands_heron_e2e_1792940632`. The gate fails because `server/internal/testutil/integrationdb.go` reports `no migration files found` across the DB/auth/save/API integration cases. The disposable database was removed by teardown; the live game health check still passes. This is an unresolved integration-harness failure, not a passing gate or evidence of a live-save reset.
