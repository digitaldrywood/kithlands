# Opening route recovery

2026-10-25 · `codex/battle-grounding-walk-lag` · PR #339.

## What the real audit established

Used native Quick start with a fresh synthetic local account, normal difficulty,
100 starting gold, level-one party, default speeds and encounters enabled. Read
scene geometry only to plan routes, then walked every tile with real arrow-key
events. No teleports, grants, level changes, forced encounters or direct action
submissions. Merchant dialogue and battle choices used normal input.

Evidence is in `client/tmp/opening-audit-1792950552725/`: screenshots,
`milestones.json` and the recorded browser video. Approximate wall-clock markers:

- 48s: read the unified journal.
- 109s: collected three herbs and eight ore along nearby paths.
- 508s: entered the General Store through its actual town door and counter;
  every first-shop spell was already known by the starting party.
- 527s: purchased Leather Armor for Hero with real gold (100 → 75), inspecting
  its +1 absorb/−1 evade tradeoff.
- 751s: entered the optional Heron Pool encounter through its normal route.
- 875s: submitted the first native Attack/Spark/Attack/Defend round after
  correcting an unexpected picker; at 933s one enemy was defeated, Sparks had
  spent two MP, and party levels remained one.

This clock includes agent inspection/debugging delays. It is diagnostic evidence,
not proof that a normal first-time player needs these times or can finish every
requested system within fifteen minutes. The complete timed route remains open.
The first attempted browser session was stopped before it started a game because
no email had been supplied; it is not included in this record.

## Repaired causes

### Settlement trail after movement

The native trail control is a canvas control. When walking, `updateDungeonEntry`
correctly clears it while movement is locked. Settlement's completion callback
previously unlocked movement without rebuilding the interaction controls.
Refreshing the interaction targets after completion restores the usable trail at
the junction, including after the shop return. No atlas or movement timing changed.

The corrected native regression walks World → Settlement → shop interior →
Settlement → junction. It fails before the completion refresh at the actual
12,16 return position (`tmp/town-canvas-before-1792952100`) and checks the canvas
control through its real hit area, not a mistaken DOM-button assumption.

### Replayed combat commands

The audit encountered an Attack picker on a later member while choosing a mixed
round. A focused reproduction retains the native Attack event, records Hero's
attack, then re-emits that exact event when Cinder is choosing. Before the fix,
it opens another picker (`tmp/attack-replay-baseline-1792951800`).
Battle command hotkeys now use the existing native-event guard, as Defend and
field magic already did. Native repeats are ignored for these commands; a new
keypress still works. Navigation keys retain their existing behavior. The native
regression also submits an actual Attack/Spark/Attack/Defend request afterward.

### Useful first spell purchases

New-game creation previously taught all first-level spells for the class's school.
Shared class data now authors Spark for Cinder and Cure for Mender. Other spells
remain genuine purchases; the opening shop already sells them for 100 gold.
Unconfigured content retains its former selection. Loading uses the saved
spellbooks and does not reapply the new starter list.

Configuration validation rejects unknown, duplicate, wrong-school, higher-level
or over-capacity starter spells. API coverage buys Frost with the real 100 gold,
rejects a Warrior learner and duplicate learning, and round-trips existing full
Cinder/Mender spellbooks. The focused Bless combat fixture now explicitly teaches
Bless, as other learned-spell fixtures do; its buff assertions are unchanged.

### Merchant requests and dialogue overlap

A combined phone run exposed a merchant dialogue left under the shop, preventing
normal exit. `Town.interact` previously awaited objective/chest work before
reserving any input lock, allowing two confirmations to start overlapping
interactions. A focused test observes two attempts before the fix
(`client/tmp/town-overlap-before-1792953100.txt`). The interaction now reserves
its modal lock before the first await and releases it in `finally`, including
on failure. Dialogue confirmation handles a native event once, and closing is
idempotent. Tests cover one NPC/shop interaction, retry after error, replayed
confirmation and queued taps after close.

## Verification

- `make test`, `make validate-data`, `make balance-sim`: pass; the default
  balance smoke retains 4,000 battles across levels 1–20.
- `cd server && go vet ./...`, `golangci-lint run ./...` (zero issues), and
  `go build -o ../client/tmp/kithlands-opening-1792952200 ./cmd/kithlands`: pass.
- `cd server && go test -race ./...`: pass, API 536.401 seconds, unchanged
  600-second timeout and seed coverage. Output:
  `client/tmp/opening-race-final-1792952300.txt`.
- `cd server && go test ./api ./internal/gamedata -run 'TestFreshPartyCanBuy|TestExistingFullSpell|TestStartingSpell|TestUnconfiguredStarter|TestSpellBlessApplies' -count=1`: pass.
- `cd server && go run ./cmd/simulate -runs=10 -strategies=aggressive,cautious,healer_heavy -routes=main,optional -shared=../shared -out=../client/tmp/opening-campaign-1792952500.json`: all assertions pass across 60 runs. This is not a human pacing measure.
- `cd client && npm test`: 788 tests in 93 files pass. Production build and full
  Prettier check pass; existing bundle warning remains.
- With root worktree environment and isolated browser state:
  `npx playwright test --config=e2e/playwright.config.js e2e/opening-integration.spec.js e2e/field-magic-repeat.spec.js --output=tmp/opening-guard-final-native-1792953200`:
  **all seven pass**, including the previously failing combined phone case.

- Additional combat input coverage:
  `npx playwright test --config=e2e/playwright.config.js e2e/battle-stop-auto.spec.js e2e/battle-defend.spec.js --grep '1440|stop|auto' --output=tmp/opening-battle-controls-1792953300`:
  **five pass**, covering Defend/Repeat at 1440 and Stop Auto at 1440, 800,
  645 and 390. Inspected the Defend review sheet and all four Auto review
  sheets in `client/tmp/battle-defend-1792955332473/` and
  `client/tmp/opening-battle-controls-1792953300/`.

The opening tests use native Quick start, email entry, world/town walking,
merchant dialogue, purchase and scene transitions. They spend exactly the real
100 gold on Frost, confirm it is learned, walk back to the junction and enter
Old Mill. The battle test rejects replayed Attack input and then submits an
actual four-member Attack/Spark/Attack/Defend round. No gameplay grants,
teleports or direct action submissions are used in this flow; only the deliberate
native-event replay is injected for the regression.

Inspected all 12 native screenshots and four review sheets in
`client/tmp/opening-integration-1792954955385/`, including
`390-eligible-frost.png`, `390-frost-learned.png`, both `*-returned-trail.png`,
and `normal-four-command-round.png`. Inspected all eight field-Cure before/after
captures and their review sheet in
`client/tmp/opening-guard-final-native-1792953200/`. All eighteen original audit
stills were also inspected; the raw video is retained for diagnosis.

**Visual limit:** phone shop text and hit targets are still far too small. A
successful precise test tap establishes purchase/transition behavior, not touch
usability or visual acceptance. Responsive shop layout is the next required
UI work; the full first-fifteen-minute route, natural leveling and economy
acceptance remain open. The updated walkthrough labels its time budgets as
suggestions rather than promising purchases or levels that were not demonstrated.

Prior tactical head `fadb0be` is green in hosted visual
run `40217905803`; these changes need their own remote confirmation. General CI
still requires the configured self-hosted runner. No merge, deployment, paid
service, database reset or save migration.
