# Heron Pool recovery and repeat visits

2026-10-26 · `codex/battle-grounding-walk-lag` · draft PR #339. No separate assigned issue.

## Change

A completed landmark could repeat its unmet-prerequisite warning. After clearing the Heron bank and claiming the millwright cache, selecting that cache could still say the bramblehog was guarding it. The Dungeon renderer now prioritizes completed-state feedback (`Already explored.`). Incomplete actions retain the server-provided prerequisite warning. This changes presentation only; Go still owns access, combat, rewards and saves.

`dungeon.test.js` reproduces the bug before the fix: the new case receives the guarding warning instead of completed feedback, while the other seven cases pass. The corrected full client suite passes 845 tests in 98 files. No shared content, balance, character atlas or server rule changed.

## Native route

`heron-recovery.spec.js` starts a separate normal Quick start account at level one with its ordinary four-member party, money and equipment. Random encounters remain enabled. Only presentation preferences select Fast battle speed and instant typewriter text; existing minimum reading holds remain in effect. Seed 24 fixes the generated world. State reads select available actions; all exploration, combat, save/exit, title selection and reload mutations use real controls. There are no debug grants, forced victories, HP changes, direct action submissions or direct save/load calls.

Desktop uses native Flee, including failed attempts. Phone uses native touch Defend until the real enemy rounds defeat the party. Both then save/exit, reload the browser, Continue the newest adventure, revisit the still-guarded bank, win through normal command/target controls, claim exactly eight ore/two hardwood/one pommel, save/exit/reload again, retreat/reenter, select the completed cache, and rest. The later phone winning fight uses mixed keyboard/pointer combat helpers; this is not a touch-only full-session claim.

Assertions cover no XP or gold reward from recovery, locked supplies/rest before victory, full HP/MP on defeat recovery at the entry room, economy equality after reload, exact one-time material amounts, cleared description/encounter persistence, completed-cache feedback without a second interaction request, and repeatable free rest without new materials/gold. Browser error arrays and mutation requests are retained.

Both final cases pass in `heron-recovery-final-1793020700.log`: desktop 37.4 seconds; phone 9.8 minutes; combined 10.4 minutes. The phone submits 65 all-Defend rounds before actual defeat, then wins in two ordinary rounds. Desktop wins in two rounds after three native Flee attempts. Both finish at 120 gold and 18 XP/member, with one pommel; recovery itself grants neither XP nor gold.

All twenty final PNGs are inspected in `client/tmp/heron-recovery-1793015716012/`. Each width (`1440`, `390`) has stages `01-guarded-bank`, `02-before-native-flee` / `02-before-natural-defeat`, `03-recovered-benefits-still-locked`, `04-locked-bank-after-full-reload`, `05-uncleared-bank-revisited`, `06-earned-supplies-once`, `07-claimed-bank-after-full-reload`, `08-completed-cache-selected-again`, `09-cleared-bank-rest-after-revisit`, and `final`. The corrected completed-cache message is visible at both sizes. Five inspected contact pages and all source paths are indexed in `client/tmp/heron-recovery-review-1793021100.json`. Each width also retains its state/request/error audit JSON and complete native video in the unique Playwright output directory.

## Rejected test attempts

- `heron-recovery-native-1793019700.log`: test discovery rejects per-describe video configuration. Video is now declared at file scope; no game mutation occurred in that attempt.
- `heron-recovery-native-1793019800.log`: desktop passes. Phone was interrupted after its test tapped stale commands during an actor handoff. Inspection of the retained recording shows unchanged HP and the request audit contains no combat-round submission. This was not a completed defeat test. The corrected readiness check requires the current living member's exact prompt before input. Ordinary waits now have a 15-second failure limit; no retry or injected action bypasses the missed input.
- `heron-completed-before-1793020200.log`: controlled unit failure for the completed-cache warning.

## Validation

Commands run from the worktree, with native browser data isolated under `client/tmp/`:

```sh
source scripts/worktree-env.sh
source .envrc.local
cd client
VITE_PORT=3611 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
npx playwright test --config=e2e/playwright.config.js e2e/heron-recovery.spec.js \
  --output tmp/heron-recovery-final-1793020700
```

The existing audit Vite/API on 3611/8690 are reused. The in-app browser connection was attempted and unavailable. The owner's game on 3609/8689, saved PostgreSQL database, loaded party and save history are untouched.

- `cd client && npm test -- --run`: 845 tests/98 files pass (`heron-recovery-final-unit-1793020300.log`).
- `cd client && npm run build`: passes, existing bundle-size warning (`heron-recovery-final-build-1793020300.log`).
- `cd client && npx prettier --check --ignore-path .gitignore .`: passes (`heron-recovery-final-format-1793020300.log`).
- `cd server && go test ./api -run 'Test(Heron|DungeonDefeatAndFleeKeepEncounterUncleared|DungeonFullRouteSaveShortcutAndRepeatSafety)' -v`: five focused cases pass, including full-route/replay, defeat/flee, crafting/save/rest, natural starter balance and locked benefits after defeat (`heron-recovery-go-1793020000.log`). These include existing forced-state fixtures for isolated persistence; they are separate from the native real-combat flow.

Full Go/race/lint/data and 4000-battle gates already pass on parent `6cf0248`; this slice does not alter Go/shared mechanics. Its hosted visual run `40316581987` passes all ten suites and the required summary. The new recovery suite has its own 40-minute installation/native-play budget (the ten existing suite budgets stay at 30 minutes), retains all 67 previous specs plus the new one, and remains covered by the all-matrix required summary. General CI stays on the owner-selected self-hosted labels; a fresh remote gate is still required after this chunk is pushed.

The workflow parses with Ruby Psych. A before/after spec inventory confirms 67 retained specs, one addition and zero omissions or duplicates.

## Opening-route regression

The unchanged `e2e/first-session-route.spec.js` also passes against 3611/8690 after the fix: `heron-opening-regression-1793021600.log`, 91.084 seconds. Run with the same isolated environment above and `--output tmp/heron-opening-regression-1793021600`. Its 24 final PNGs in `client/tmp/first-session-1440-1793016401773/` are all inspected on four contact pages indexed by `client/tmp/heron-opening-review-1793021700.json`. This rechecks legitimate herbs/ore, purchased Frost, native Heron/mill fights, potion/sword/shard crafting, gem transmutation/socketing, equipment and save/history/reload equality. The finish remains 28 gold and 24 XP/member at level one. It is a known-route regression time, not a human playtest estimate. Combined final evidence totals 44 inspected screenshots.

## Limits

This is recovery/continuity acceptance, not human enjoyment or first-visit timing. The deliberate all-Defend loss is an edge-case test. It does not establish natural campaign reward pacing, territorial habitat composition, all menu/gem integration or remaining Warrior/Cinder choreography. The long pre-victory phone description is crowded against the map edge; this is not final scene-composition approval. Those items remain in `PLAYABILITY_TRACKER.md` and the active goal.
