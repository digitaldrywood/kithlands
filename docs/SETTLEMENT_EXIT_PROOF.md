# Reliable settlement gate exit — 2026-10-26

PR #339, branch `codex/battle-grounding-walk-lag`; follows ce316ff. User reported being unable to leave town from the pictured south-gate approach.

## Reproduced cause

The single-cell authored exit is at (12,17). At (11,15), matching the visible left approach, down is blocked by collision and the former facing/adjacent input targeting finds no exit. Enter does nothing. Native proof at 858×842 records no modal locks and animating=false, so this reproduction is not a pending request or menu lock. A separate exact-center gate test after opening/closing Menu succeeds; the suspected Menu-focus problem did not reproduce.

Controlled failing native log: `client/tmp/settlement-exit-before-gate-1793035600.log`. Original captures `client/tmp/settlement-exit-1793024956825/858-before-enter.png` and `858-after-enter.png`; audit `858-gate-audit.json`. The before capture was opened and inspected against the user screenshot.

## Change

Facing/adjacent door selection keeps its priority. Input can additionally select an authored exit within three Manhattan tile steps of its rectangle, so both visible gate approaches work without finding the exact center cell. Shared map geometry and the server transition rules are unchanged. The Go server still validates the authored transition.

A contextual Leave town button appears near the exit, with an Enter badge and native keyboard/pointer/touch activation. It hides away from the gate or during modal menus; input locks disable activation while moving/transitioning. It shares the existing fixed interior-control boundary and is removed on scene shutdown. The old duplicate canvas exit prompt is replaced by this control; ordinary door prompts remain.

The chosen interaction is captured before the asynchronous request. A connection failure releases the input lock and reports Could not leave town. Please try again. The retry test aborts before server commit; committed-reply loss and a permanently stalled connection are not claimed by this slice.

Portrait framing reserves a screen-space lane for the 46px DOM action plus 12px clearances. The 375×667 check caught overlap when logical camera pixels were used for this fixed-size control. Conversion to screen pixels now leaves the button below the room and above the D-pad. No server restart or save migration is needed.

## Native acceptance

The normal isolated-account route walks World → Settlement → shop interior → merchant → Leave Shop → exit interior → streets. It opens/closes the party menu, then walks to the left or right illustrated gate approach. No teleport, debug grant or forced transition is used.

Four exit viewport pairs: 1440×900, reported 858×842, default 800×600 and phone 390×844. Eight scenarios cover Enter/Space, visible pointer/touch action, an actual failed connection and retry, re-entering town and leaving again. Successful response party, gold, items and quests exactly equal the pre-exit values. The action hides away from the gate and under menus. Final phone checks verify button size and clearance from the D-pad.

Six desktop/default/reported-size cases pass in `client/tmp/settlement-exit-native-1793036200.log`. Its two phone cases stopped at a duplicate Back-to-game test locator before reaching exit; the locator was scoped to the menu dismiss control. The corrected phone rerun passes in `client/tmp/settlement-exit-phone-native-1793036900.log`. After the short-phone layout repair, both phone exit scenarios pass again in `client/tmp/settlement-exit-final-portrait-1793037500.log`.

Twelve interior/street/menu regression cases pass across retained runs: two menu shortcut cases, five interior flows and five street/inn round trips. Nine pass in `client/tmp/settlement-exit-interior-regressions-1793036600.log`; its three portrait street cases still expected the replaced canvas prompt. Updated assertions check the actual DOM action's font, 46px height, room separation and D-pad separation. The intermediate portrait run exposed the real 375px overlap; all three repaired portrait cases pass in the final portrait log above (five total cases, 59.0 seconds including phone exits).

The previously failing portrait-interior assertion now checks the established World zoom of 2 on portrait and 1 on desktop. Its five normal flows pass; this corrects the known stale assertion from parent hosted CI without weakening the gate.

## Inspected proof

All 98 accepted native PNGs were opened through seventeen contact sheets, indexed to exact originals in `client/tmp/settlement-exit-review-1793037900.json`:

- `client/tmp/settlement-exit-1793025220429/` — six exit cases, eighteen PNGs.
- `client/tmp/settlement-exit-1793025684036/` — final phone exits, six PNGs.
- `client/tmp/portrait-interior-1793025294364/` — five interior flows, thirty-five PNGs.
- `client/tmp/interior-menu-shortcuts-1793025287537/` — four PNGs.
- `client/tmp/portrait-settlement-1793025383535/` — accepted 1440 and 800 prefixes only, twelve PNGs; its failed 390 arrival is not final acceptance.
- `client/tmp/portrait-settlement-1793025648771/` — final 375/390/540 street flows, twenty-three PNGs.

Representative captures: `858-keyboard-gate-action.png`, `390-button-retry-returned-world.png` and final `375-arrival.png`. The latter was also inspected at full size: the action clears the room and D-pad. Failure notices are readable and temporary; old interior controls disappear on World return.

The two retained owner tabs were inspected read-only and already showed World. Neither was moved, saved, reloaded or reset. The running local server/database remain intact. The agent-created owner game tab was retained for continued play. Reload after saving to receive the updated renderer; HMR is disabled.

## Exact commands and gates

From client, native commands use this environment prefix:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/settlement-exit.spec.js
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/portrait-interior.spec.js e2e/portrait-settlement.spec.js e2e/interior-menu-shortcuts.spec.js
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/portrait-settlement.spec.js e2e/settlement-exit.spec.js --grep '390 settlement|375 settlement|540 settlement|town exit 390'
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

857 tests in 99 files, production build and formatting pass. Final logs: `client/tmp/settlement-exit-final-{unit,build,format}-1793037600.log`. Unit coverage includes real-map gate approaches, distant exit rejection, ordinary door priority and screen-space control clearance. No backend/shared data or balance rules changed; no new simulation or database integration result is claimed.

The new exit cases and proof directory are registered in the existing hosted interiors suite. Current-head hosted CI still needs its own result; general CI remains self-hosted per the owner. Broader environment composition, other navigation recovery cases and the playability goal remain open.
