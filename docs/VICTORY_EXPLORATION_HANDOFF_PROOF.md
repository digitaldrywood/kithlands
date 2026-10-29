# Victory returns to authoritative exploration

2026-10-26 · `codex/battle-grounding-walk-lag` · draft PR #339. No separate assigned issue.

## Reproduction and cause

The native territorial-resource route starts an ordinary level-one Quick start game, gathers ore and hardwood, encounters a real random fight while returning to meadow herbs, wins through normal commands, then selects the visible herb prompt. Both 1440px and 390px runs fail: Go returns HTTP 400, `gathering requires the overworld outside battle`.

The UI has returned to World but its state is still `quest_complete`. The responsive victory receipt called `returnFromBattle` directly, omitting the existing Go acknowledgement. World rendering and movement accept the result state, while Gather correctly requires authoritative `world`. The resource identity was not the cause.

Retained failures: `client/tmp/resource-route-native-1793022000.log` (both viewports), diagnostic `resource-route-diagnostic-1793022300.log` (desktop), and response/state records in `client/tmp/resource-route-1793017116831/1440-audit.json`. The last receipt records the exact rejection after a real combat round. These prove why only the longer ordinary route caught this regression.

## Corrected contract

- Continue awaits Go before leaving the victory receipt.
- Go accepts the explicit `battle_continue` intent in `quest_complete`, resumes exploration without changing rewards, and returns current state unchanged when that acknowledgement is replayed in `world`. Combat, defeat and final-victory states reject it.
- This intent is separate from legacy `advance`, whose existing world behavior starts a random encounter. Retrying that legacy input after a lost committed acknowledgement would risk another fight. Legacy callers remain unchanged.
- The receipt disables Continue and blocks duplicate Enter/Escape activation while pending, announces returning status, and restores a focused Continue button with a readable retry message after rejection, lost response or the existing bounded request deadline.
- Only a matching game ID in `world` is accepted as the acknowledgement. A scene that has already shut down does not navigate on a late reply.

No game rule, reward, spell/monster value, quest requirement, resource cooldown, movement sheet or persistent schema was moved into JavaScript. This is an input/state-transition repair.

## Focused regressions

`server/api/game_battle_continue_test.go` isolates acknowledgement/replay from separately tested combat. Before the Go change, all five world/dungeon/rejected-phase cases fail; afterward they pass. Repeating the acknowledgement cannot start enemies, change location, alter party/quests or mutate inventory. `battleDungeonRecovery.test.js` adds five client cases for awaited acknowledgement, rejection/retry, bounded abort and already-resumed state.

`e2e/victory-advance.spec.js` plays the normal mill-bat battle on desktop and phone. The first Continue is rejected before reaching Go. The second is forwarded and committed by Go, then its reply is held while native Enter/Escape test duplicate suppression, until the actual fetch times out and aborts. The test-only request deadline is two seconds; the production default remains fifteen seconds. The aborted reply is then released late and cannot dismiss the receipt. A third normal Continue safely resumes the same adventure. Go receipts before/after retry have identical HP/MP/XP/levels/gold and no new enemies. Both cases pass in 19.8/19.5 seconds, with empty page-error arrays. All eight captures in `client/tmp/victory-advance-1793018885479/` are inspected; per-width request receipts are retained. Both audits record exactly one `net::ERR_ABORTED` request and three acknowledgement attempts. A final review caught the API wrapper dropping the supplied signal: `api.test.js` fails before forwarding request options to `apiCall`, then passes with a real abort-observing fetch stub. Network failure injection is confined to disposable test pages, not the player's session.

## Real resource route and offline timer

`e2e/resource-route-respawn.spec.js` walks every tile using native keys, gathers via desktop clicks or phone taps, and resolves real travel encounters with native combat controls. It grants no items, HP, levels or money and leaves encounters enabled. It visits rocky ore, woodland hardwood and meadow herbs. It saves/exits through normal controls and closes the game page. Only after the saved three-minute Unix herb deadline actually passes does it open a new page, Continue the newest adventure, and harvest again. No clock, deadline or content value is edited; no resource-status requests run while the page is closed.

The assertion compares saved party, gold, materials, all resource identities/coordinates/habitat patches and absolute deadlines. The expired herb is available; the longer ore deadline is still depleted. The second herb yield is exact and starts a new deadline while ore's saved deadline stays unchanged. Phone passes in 3.9 minutes with empty page errors; all ten captures in `client/tmp/resource-route-1793017979317/` are inspected. Desktop's first intermediate pass used the initial legacy acknowledgement before retry safety was hardened; final desktop proof on the updated main server passes in 3.8 minutes (`battle-continue-live-resource-1793024300.log`). Its ten inspected captures are in `client/tmp/resource-route-1793018336300/`, and its request audit confirms the dedicated `battle_continue` input. Final desktop/phone resource evidence totals twenty captures.

One intermediate phone run (`resource-route-fixed-1793022600.log`) timed out at an exact native travel step before reaching the offline check, under concurrent validation load. The movement assertion was not relaxed and no movement code changed. The subsequent full phone route passes with a final position/input snapshot retained. This is not all-class walking-under-load approval; the failure remains available for investigation if it recurs.

The habitat pictures still show small procedural resource props, repetitive forest stamps/green underlay and an occluded woodland pickup. Therefore resource identity/respawn mechanics are verified, while complete environment composition and artwork acceptance remain open. This evidence does not convert a technical route into human first-visit pacing approval.

## Validation

From the worktree, using `scripts/worktree-env.sh` plus ignored local overrides where necessary:

- `make test`: pass, API 70.377s (`battle-continue-go-1793023100.log`).
- `cd server && go test -race ./...`: pass, API 554.066s with the original timeout (`battle-continue-race-1793023100.log`).
- `cd server && go vet ./...`, `go build ./...`, `golangci-lint run ./...`: pass, zero lint issues (`battle-continue-{vet,build,lint}-1793023100.log`).
- `make balance-sim`: pass, unchanged ordinary Warrior/Cinder 4000-battle baseline (`battle-continue-balance-1793023100.log`).
- `make test-e2e DB_NAME=kithlands_battle_continue_e2e_1793024000 DATABASE_URL=<same local connection with that disposable database path>`: pass; teardown confirms that separate database was dropped (`battle-continue-e2e-1793024000.log`). The live database is retained.
- `cd client && npm test -- --run`: 852 tests/99 files pass; `npm run build` and full Prettier check pass (`battle-continue-abort-{client,build,format}-1793025000.log`). Existing bundle-size warning remains.
- Focused before/after Go logs: `battle-continue-before-1793022800.log`, `battle-continue-after-1793022900.log`.

Native runs reuse managed servers rather than invoking the wrapper that stops the player's ports:

```sh
source scripts/worktree-env.sh
source .envrc.local
cd client
VITE_PORT=3611 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
npx playwright test --config=e2e/playwright.config.js \
  e2e/victory-advance.spec.js e2e/resource-route-respawn.spec.js \
  -g '390|victory acknowledgement' --output tmp/battle-continue-native-1793023700
```

All three initial cases pass; the final real-timeout/retry rerun against 3609 passes both viewport cases (`battle-continue-abort-native-1793025000.log`). The preferred in-app browser connection was attempted and unavailable. Native proof uses isolated Chromium on the actual client and Go server. `client/tmp/battle-continue-review-1793024500.json` indexes all twenty-eight inspected final desktop/phone-resource and actual-abort/retry captures. The earlier immediate dropped-reply captures remain separately retained, but are not counted as final timeout proof.

## Main-server regressions

The unchanged first-session route and five victory-receipt viewport/motion cases pass against the refreshed main server on 3609/8689: `battle-continue-live-regression-1793024300.log`, six passes in 2.1 minutes. The opening route takes 94.673 seconds, finishes at 28 gold/24 XP per member (still level one), and checks real purchases, crafting, socketing, combat and save equality. Its 24 captures in `client/tmp/first-session-1440-1793018565100/` and all 34 receipt captures in `client/tmp/victory-responsive-1793018660687/` are inspected; `client/tmp/battle-continue-live-regression-review-1793025100.json` indexes their ten contact pages. Receipt tests use advanced disposable fixtures for long names/KO/multi-level tally and are not first-session progression proof. The final normal-route and eight timeout/retry captures together with the 34 receipt and twenty resource captures total 86 final native screenshots.

## Safe local refresh

Normal Save-and-exit, API replacement, client reload, Continue of the exact newest manual checkpoint, normal Save. The before/after persisted gameplay fields are exactly equal: party, inventory, quests, world state, RNG seed, spawn and locality. Canonical SHA256 is `123a38d2cd1b328cf5d8a67cdac9a2ae9f3a5fe31a58828030d8e8519d832d82`. Manual checkpoint 07:27:49.990236 CDT; restored save 07:31:02.118762 CDT. A final normal Save-and-exit/reload/Continue/Save after the API signal-forwarding fix also compares exactly with the original checkpoint, at 07:51:47.973777 CDT (`battle-continue-save-final-comparison-1793025300.json`). The four level-five members retain 495 gold, 14 potions and every shown HP/MP/XP value. Database snapshots and comparison remain ignored under `client/tmp/battle-continue-save-*.json`.

Inspected local before/after/ready screenshots: `battle-continue-owner-before-1793023200.png`, `battle-continue-owner-after-1793023500.png`, `battle-continue-owner-ready-1793023500.png`. Final inspected ready capture: `battle-continue-owner-final-ready-1793025300.png`. Including the four owner captures, final inspected evidence totals ninety PNGs. User tab remains open at the same world position. No grants, resets, history deletion or database replacement. Updated managed main API uses 8689; audit API uses 8690. Vite remains on 3609/3611.

## CI and remaining goal

Parent `762017e` run `40320535735` passes all eleven visual suites and the protected summary. New coverage retains all 68 previous specs and adds the two route/acknowledgement specs (70 total), with no duplicates. Resource offline coverage shares the existing 40-minute adventure-recovery budget; other budgets remain 30 minutes. All matrix jobs still feed the protected summary. General CI remains self-hosted; a fresh remote gate is required after pushing.

The complete goal remains active. Meadow/resource art, landmarks, human first-visit pacing, remaining Warrior/Cinder choreography, integrated menus/gems and remaining artwork need their own acceptance. See `PLAYABILITY_TRACKER.md`.
