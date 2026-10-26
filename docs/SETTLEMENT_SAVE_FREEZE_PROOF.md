# Settlement save freeze — 2026-10-26

PR #339, branch `codex/battle-grounding-walk-lag`; follows 6c43fec. The owner reported that saving in town left Game saved! visible and gameplay stopped.

## Reproduced cause and fix

The shared party menu waits for the save response, shows Game saved!, closes the menu, then schedules `scene.hideMessage()` after 1500ms. World, Town and Dungeon implement that scene interface. Settlement had only showMessage, so the timer threw `scene.hideMessage is not a function`, stopping Phaser updates after the save had already succeeded.

The controlled native reproduction at the reported 858×842 size records a successful save response (`status: saved`), the exact page exception, a message that never dismisses and failure to reach resumed movement. Log: `client/tmp/settlement-save-before-corrected-1793038600.log`. Captures/audit: `client/tmp/settlement-save-1793026175071/{858-saved-notice.png,858-after-notice.png,858-audit.json}`. The initial harness incorrectly watched /saves rather than /save; the corrected before run above is the reproduction evidence.

Settlement now implements hideMessage: cancel the current notice tween, destroy the notice and clear its reference. Calling it with no notice is safe. showMessage uses the same cleanup when replacing a notice. The existing shared Save callback can dismiss both successful and failed save messages without crashing the game. This is a renderer lifecycle fix; save serialization, game mechanics and Go handlers are unchanged.

The original native reproduction passes after the fix: `client/tmp/settlement-save-first-fixed-1793038800.log`. Notice dismissal and actual keyboard movement complete with no page errors. A focused full save/reload/re-enter/save/move/leave case at 858×842 also passes in `client/tmp/settlement-save-resume-focused-1793039800.log`.

## Final actual-game coverage

Tests use the actual local game, frontend 3609/API 8689, under separate isolated accounts. Native input walks from World into Settlement and onto the same street pictured in the report. No owner account, save or current tab is manipulated.

The final eight save scenarios cover 1440×900, reported 858×842, default 800×600 and phone 390×844. At each size:

- Save through the normal party menu, wait through the real notice timer, and move with real keyboard input.
- Save again using the menu's S shortcut; confirm movement still works afterwards.
- In the failure case, abort the first save request before commit, dismiss the failure notice, move and retry successfully.
- Refresh normally, use Continue and select the latest visible adventure, then compare loaded party, gold, items and quests exactly with the saved data.
- Enter town again normally, save once more, wait for the notice, walk to the gate and leave through Leave town.

Phone menu/save/Continue/entry/exit actions use actual taps. This is mixed keyboard movement and touch UI coverage, not a claim of a wholly touch-only campaign. Settlement saves intentionally restore onto World at the saved checkpoint; exact street position persistence is not claimed.

All final cases require zero page exceptions. They observe that game frames advance beyond the first save, ensuring notice dismissal did not merely hide the frozen renderer. The two town-exit connection/retry cases at 858 and 390 run again because notice lifecycle is shared with that error path.

The expanded harness initially selected a blocked house tile as a movement target and used a gameplay-state readiness helper for Title. These test-only assumptions were corrected; interrupted/failed logs are retained rather than presented as passes. The final command below is the acceptance run.

Final acceptance log: `client/tmp/settlement-save-verified-native-1793040000.log`: all ten cases pass in 2.5 minutes. Eight successful save audits contain zero page errors and exact loaded-state comparisons. The two exit regressions also pass.

All sixty final screenshots were opened and inspected through ten contact sheets, with exact original mappings in `client/tmp/settlement-save-review-1793040300.json`. Final save captures/audits are in `client/tmp/settlement-save-1793026828720/` (52 PNGs); exit regression captures are in `client/tmp/settlement-exit-1793026805606/` (8 PNGs). Representative originals: `858-repeated-save-saved-notice.png`, `858-repeated-save-movement-resumed.png`, `390-failed-save-retry-continue-latest.png` and `390-failed-save-retry-restored-save-and-movement.png`. Confirmation/failure notices clear, the next movement visibly changes position, latest-adventure selection is contained/readable and normal play resumes after loading. The controlled before screenshot was also inspected and matches the reported stuck notice.

## Commands and gates

From client:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/settlement-save.spec.js e2e/settlement-exit.spec.js --grep 'settlement save|town exit (858|390).*button-retry'
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

857 client tests in 99 files, production build and final formatting pass. Logs: `client/tmp/settlement-save-{unit,build}-1793039300.log` and `client/tmp/settlement-save-final-format-1793040000.log`. No backend/shared content changed, so no new balance simulation or DB integration result is claimed.

The new save scenarios and their proof folder are registered in the existing hosted interiors suite. Current-head hosted CI still requires its own result, and general CI remains self-hosted as requested. The larger playability goal remains open.

## Local session handling

The server health endpoint remained healthy. It was not restarted. Existing owner saves and tabs were not reloaded, reset or deleted. The local client has HMR disabled: a frozen tab needs a refresh and normal Continue/latest adventure to receive the fixed renderer. The reproduced crash occurs after the save acknowledgement; no claim about an uninspected individual owner save is made.

## Current-head regression recheck

Rechecked at `3530d2f` after the repeated save-lockup report. The frontend served by port3609 contains Settlement's `hideMessage()` implementation; its Vite configuration still disables HMR. This establishes that a new page receives the fix, not that an existing open page has loaded it. The in-app browser connection was unavailable, and the separate developer browser exposed only a blank page, so the owner's frozen tab and individual save were not inspected or refreshed.

The isolated current-content build on Vite3612/API8691 passed all eight existing save and exit scenarios at858×842 and390×844: repeated saves, failed-save retry, notice dismissal, resumed movement, Continue/latest-save restoration, keyboard exit, and failed-transition retry. No runtime code change was needed. The original missing-method crash remains the verified historical cause; this run did not reproduce a new regression or establish the exact error in the owner's open tab.

Command from `client/`:

```sh
VITE_PORT=3612 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/settlement-save.spec.js e2e/settlement-exit.spec.js --grep '(settlement save|town exit) (858|390)' --output=tmp/save-exit-recheck-20261026
```

Result:8/8 pass in1.8minutes; log `client/tmp/save-exit-recheck-20261026.log`. All38 final PNGs were opened and inspected on seven contact sheets, with exact source mappings in `client/tmp/save-exit-final-review-20261026/index.json`. Originals are in `client/tmp/settlement-save-1793052212917/` and `client/tmp/settlement-exit-1793052168981/`. Notices disappear, movement changes position, latest-save cards remain contained, and the gate offers Leave town before returning to World. The phone checks combine keyboard movement with touch menu/exit actions. No new build, unit suite, simulator, or backend check is claimed for this documentation-only recheck. Owner services and saves remain intact.
