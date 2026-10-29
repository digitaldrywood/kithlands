# First enemy tactical pattern and honest intent

2026-10-25 · `codex/battle-grounding-walk-lag` · PR #339.

Bramblehogs and the optional Heron Pool herd now spend a turn preparing, then
make two attacks under the existing Focus buff before repeating. The preparation
turn deals no damage. The player can use that opening to attack the fire weakness,
heal, or prepare Defend for the rush. This is the first charging-enemy role;
healers and other role patterns remain future work.

## Server contract

- Shared monster content authors each repeating action/label and updated field
  notes. Loading rejects unsupported actions and empty/oversized labels.
- One Go planner supplies normal scheduled rounds, legacy item/spell enemy turns
  and the standalone balance simulator. The campaign simulator already uses the
  real API. Monsters without patterns keep their ordinary basic attack.
- The state projection uses the same pure pattern step, without consuming RNG.
  Intent describes a plan, not a fixed target, guaranteed hit or damage prediction.
  Default weighted targeting by party order remains unchanged. Actual resolution
  still handles death, status interruption, waking on damage, confusion and an
  invalidated target. Preemptive rounds advertise no action. Sleep, stone and
  confusion replace the ordinary forecast with their current constraint.
- Patterns advance with rounds, including legacy item turns and skipped rounds;
  an interrupted preparation does not secretly grant Focus. Its subsequent attack
  still uses the actual buffs, never the forecast, to calculate damage.
- An ambush now discards party item requests before applying their effects, both
  for legacy items and per-member submissions. Previously the later action-list
  truncation could leave already-applied healing/consumption behind.
- Active combat is not a new saved subsystem; the existing encounter/save rules
  remain. No database migration or save reset.

## Presentation

Readable grouped enemy plans live in the lower turn-message area; keyboard and
pointer targeting show the selected enemy's full forecast. The ordinary action
prompt and contextual lower menu remain. Existing structured Focus playback
receives a small original cue for enemy sprites without player animation states.
Reduced motion retains the cue without moving an enemy. No character atlas changed.

The first pass put intent under enemy names. Phone capture showed it was too small;
that layout was rejected in favor of the command-area summary. A native test also
incorrectly demanded prevented damage on a miss. Its correction preserves real
miss/minimum-damage behavior; deterministic Go coverage separately verifies both
stronger attacks and Defend's exact prevention accounting.

## Validation and actual-game evidence

Passed gates:

- `make test`, `make validate-data`, `make balance-sim` (4,000 battles).
- `cd server && go vet ./...`, `go build -o ../client/tmp/kithlands-enemy-patterns-1792949700 ./cmd/kithlands`, and
  `golangci-lint run ./...` (zero issues).
- `cd server && go test -race ./...`: pass, API 491.220 seconds with the
  unchanged timeout. Output: `client/tmp/enemy-pattern-full-race-1792949900.txt`.
- Additional wake-before-initiative/confusion regression and all tactical/ambush
  tests: `go test -race ./api ./internal/combat -run 'TestEnemy|TestBramblehog|TestAmbushCannot' -count=1`.
- `cd client && npm test`: 785 tests in 92 files. `npm run build` and
  `npx prettier --check --ignore-path .gitignore .` pass. Existing bundle warning.
- `cd server && go run ./cmd/simulate -runs=10 -strategies=aggressive,cautious,healer_heavy -routes=main,optional -shared=../shared -out=../client/tmp/enemy-pattern-campaign-1792950300.json`:
  all assertions pass across 60 campaign runs. This is a regression gate, not a
  human play-time or fun assessment.

Actual game commands use the root worktree environment and isolated browser state
against live Vite 3609/API 8689, preserving the existing database:

- `npx playwright test --config=e2e/playwright.config.js e2e/enemy-tactics.spec.js e2e/heron-playability-loop.spec.js e2e/battle-context-choices.spec.js e2e/battle-turn-prompt.spec.js --output=tmp/tactical-final-1792950500`: 11 pass.
- After adding the selected forecast to target-picker details:
  `npx playwright test --config=e2e/playwright.config.js e2e/enemy-tactics.spec.js --output=tmp/tactical-targets-final-1792950700`: 3 pass.

The tactical proof starts a normal quick-start party, takes the Old Mill trail to
Heron Pool, enters its optional encounter, opens/cancels targeting, then submits
three rounds via real D shortcuts or phone Defend taps. Every enemy's forecast is
checked against its resolved action. No combatant/stat/MP/gold grants are used.
The plan transitions prepare → rush → rush → prepare; damage and misses remain
server results. Message-text bounds remain inside the lower window.

Inspected all 24 final tactical PNGs and all three review sheets under
`client/tmp/enemy-tactics-1792949996674/`, including `390-target-plan.png`,
`*-prepare-intent.png`, `*-preparation-cue-{0,1,2}.png`, and
`*-round-{1,2,3}-next-plan.png`. JSON receipts retain each complete resolved round.
Inspected all 25 context-menu captures/four review sheets in
`client/tmp/battle-context-1792949701818/`, and all 28 Heron captures/two review
sheets in `client/tmp/heron-loop-1792949911453/`. The latter retains actual
battle/contact, craft/equip, saved cleared-bank outcome and mill entry.

Remote visual run `40216083856` is green on preceding head `1811ed7`. This tactical
commit needs its own remote gate; general CI still lacks its configured runner.
This slice does not establish completion of every enemy role, environment art,
or the timed normal first-fifteen-minute route. Enemy name labels in the scaled
battlefield remain small; the readable forecast is intentionally in the HUD.
