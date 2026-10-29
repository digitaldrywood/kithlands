# Bandit guard and readable tactical targeting

2026-10-25, `codex/battle-grounding-walk-lag`, draft PR #339.

## Playable change

Bandits now alternate a guard turn and an attack turn through a shared-data
battle pattern. Goblins continue attacking, while the already accepted
Bramblehog prepares before two focused rushes. Mixed encounters therefore
present different decisions: strike the exposed Goblin, spend Spark through
the Bandit's physical guard, or prepare defense for its open attack turn.
The target detail explains the guard. Its action and preview come from the same
Go planner; no client RNG or damage rule was added.

Guard reuses existing Defend: it protects before initiative, reduces physical
hits after armor/crit with the existing minimum damage floor, leaves magic
unchanged and expires after the round. The planner does not consume target RNG
for self-directed guard. Normal/legacy action previews, preemption, sleep,
stone, confusion and invalid/dead actor/target handling retain server ownership.
No rewards, stats, crafting ingredients, encounter rate, save schema or assets
changed. The first-session guide now explains the choice and corrects its stale
claim that Lost Traveler still lacked an escort implementation.

Actual phone proof exposed TARGET covering the Bandit's name. The target cursor
now places its arrow and label above the measured name lane, including scaled
phone names. The original reticle geometry remains when no name is supplied;
actor indicators are unchanged. Native name clearance is 18 game pixels.

## Native battle gates

Existing root environment and local overrides were sourced without printing
secrets. A separate API at 8690 and Vite at 3610 kept test accounts away from the
player session. Playwright uses worktree-local browser/HOME/XDG paths, as in the
repository wrapper. From `client`:

```sh
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/bandit-guard.spec.js e2e/battle-context-choices.spec.js --output=tmp/bandit-cursor-native-1793020300
```

**8 passed, 4.3m**. Bandit cases use a normal fresh level-one party/starting MP
and a debug-created level-one Bandit/Goblin formation. They choose three real
rounds through keyboard or touch: Warrior physical attacks, Cinder Spark,
Mender Cure and Defend. This is an explicit encounter fixture, not natural
quest arrival. Desktop 1440×900, phone 390×844 and 800×600 reduced motion verify
plans, actual guard/open/guard actions, damage-prevention accounting, spell
counterplay, readable result/name/message bounds and target-name clearance.
The five contextual menu regressions retain keyboard/back/touch behavior.

The same seeded Go round yields a real Warrior miss in round three. Tests
verify the missed server action, contact frame 3, no melee-contact slash,
unchanged displayed enemy HP (5→5), CSS readability and full-opacity holds of
1233ms / 1233ms / 1243ms at desktop/phone/reduced motion. This supersedes the
older synthetic-only Miss acceptance limit for the Warrior reference.

Final original screenshots/traces: `client/tmp/bandit-guard-1792984094145/`
(24 PNGs) and `client/tmp/battle-context-1792984219635/` (25 PNGs). All were
inspected in `client/tmp/bandit-final-review-1793021700-{0..6}.jpg`.

A final phone-only observation adds an explicit cyan GUARD number capture:
`npx playwright test --config=e2e/playwright.config.js e2e/bandit-guard.spec.js --grep 390 --output=tmp/bandit-guarded-hit-1793022300` in the same environment.
**1 passed, 42.1s**. All nine captures in
`client/tmp/bandit-guard-1792984915677/` inspected via
`client/tmp/bandit-guarded-review-1793022500.jpg`; `390-guardedHit.png` was also
opened full size. The current test requires that guarded-hit capture.

Earlier six-case role regression passes (4.3m), log
`client/tmp/bandit-native-final-1793018200.log`: three Bandit cases plus the
three native Heron/Bramblehog flows. Its 24 Bramblehog captures/motion samples
in `client/tmp/enemy-tactics-1792983554706/` were inspected in
`client/tmp/bandit-review-1793019700-{3..5}.jpg`. That regression preceded the
cursor-only correction; the final eight cases cover the latter. Older Bandit
captures exposed the name collision and are superseded for cursor acceptance.
No body, walk or weapon atlas changed.

Initial fixture diagnostics used the wrong active-scene argument and assumed
the showcase's Mender slot order. They were corrected to use World and the
fresh party member's class; no mechanic/outcome was faked or weakened.

## Natural campaign, persistence and balance

The standard campaign suite ran against the changed Go/content, with normal
encounters and no grants or direct round submission:

```sh
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/campaign-first-level.spec.js --output=tmp/bandit-campaign-1793019400
```

**3 passed, 10.5m**, log `client/tmp/bandit-campaign-1793019400.log`. Desktop
82.343s, phone 500.705s (intentional Defend-only defeat/recovery/retry included),
default 48.541s. These are automated timings, not human first-visit estimates.
All 37 screenshots in `client/tmp/campaign-first-level-1792983829728/` inspected
in `client/tmp/bandit-campaign-review-1793022300-{0..4}.jpg`. All members reach
level three. Desktop/phone finish with 165 gold and 37 XP into level three;
the delivery case finishes with 135 gold and 17 XP. Existing quest reports,
reward checks and save/load assertions remain intact. The run began before the
cursor-only follow-up; combat rules are identical.

Both before/after `make balance-sim` runs use the normal two-member Warrior/
Cinder fixture, seed 42, 200 battles per level across levels 1–20 (4000 battles
per run). Average rounds rise about 0.1–0.2 at some levels; sampled wipe rates
are unchanged. Logs: `client/tmp/bandit-balance-before-1793015700.log` and
`bandit-balance-after-1793016800.log`. This is a smoke comparison, not a full
four-member economy or human pacing evaluation.

## Server/client validation

```sh
make test
make validate-data
make balance-sim
cd server
go vet ./...
go build ./...
go test -race ./...
golangci-lint run ./...
go test -race ./api ./internal/combat -run 'TestBandit|TestEnemyIntent|TestEnemyPlan|TestEnemyPreparation'
cd ../client
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

All pass. Full Go API tests take 114.062s; race API tests 551.529s. The later
focused race run covers the final added guard-preemption/status table. Unit
coverage checks faster physical attacks, guard expiry/repetition, spell
counterplay, normal/legacy intent parity and inactive guard under preemption,
sleep, stone and confusion; existing planner tests cover dead actors/retargeting.
Go logs: `client/tmp/bandit-{go-test,data,balance-after,vet,build,race,lint}-1793016800.log`;
focused final tests: `bandit-targeted-1793018800.log` and
`bandit-targeted-race-1793019400.log`. Lint reports zero issues.
Client: **825 tests / 96 files**, build and formatting pass in
`client/tmp/bandit-client{,-build,-format}-1793020200.log`. Final full formatting
passes in `bandit-final-format-1793022300.log`. Existing bundle-size advisory
remains. The earlier formatting failure was fixed before acceptance.

## Local player continuity and remaining scope

Before restarting the main API/client, the existing player used Save and exit.
The newest manual checkpoint, 10:11:22 PM CDT, was loaded after restart and
resources were checked through the actual menu: 495 gold, 14 potions, 0 Ether;
all four level five with 132/153 XP; Hero 195/195 HP and 4/4 MP, Sparks 121/121
and 22/30, Shade 142/142 and 4/4, Willow 127/132 and 26/30. The same world
position is preserved. Inspected proof: `client/tmp/bandit-player-world-1793021000.png`.

The main API 8689/client 3609 remain available. Vite now uses the ignored local
`client/tmp/combat-proof-vite.config.mjs` (base config plus `server.hmr=false`)
for live play, so source edits do not automatically reset the player's scene.
The client was explicitly reloaded to verify this update. This changes only
the local launch configuration; normal repository/CI HMR behavior is retained.
The isolated test services are stopped after verification, and PG/saves remain.

See `VISUAL_CI_BUDGET_PROOF.md` for the prior hosted gameplay timeout and the
spec-preserving workflow split. This update still needs its own remote gates.
General CI remains self-hosted by owner preference. This accepts Bandit guard,
the existing Bramblehog rush reference, Warrior server-Miss feedback and this
target-name correction; it does not finish remaining spell/body choreography,
all-class battle expansion, terrain/habitat polish or human first-visit pacing.
