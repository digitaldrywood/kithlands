# Dungeon objective layout and keyboard ownership

PR #339, branch `codex/battle-grounding-walk-lag`, parent `7cb917f`.

## Reproduction and change

Cinder's fresh-route return screenshots exposed the existing dungeon Objective
control overlapping Party at800px. The new native test reproduced the old
tracker bottom y570 against action-area start y467. Inspected before image:
`client/tmp/dungeon-objective-layout-1793038717137/800-collapsed.png`.
Failure log: `client/tmp/dungeon-objective-before-1793069600.log`.

Dungeon now anchors its shared tracker12 CSS pixels below the map's upper edge,
using current layout/canvas bounds instead of an obsolete bottom offset. Details
open downward with8px separation. Existing action/navigation rows are unchanged.
At800px the collapsed tracker now spans y112–158, clear of the y467footer;
at390px it spans y118.3–164.3, clear of the y579.6footer. Tests also check expanded
details remain inside the canvas and above the footer.

Keyboard testing exposed a real integration bug: Enter on the focused tracker
also executed the dungeon's nearby landmark action, sometimes leaving the scene.
The shared HTML tracker now owns keydown propagation. Escape collapses an open
tracker and returns focus to its toggle. Enter/Space keyup propagation is also
stopped because Phaser captures Space keyup and otherwise cancels a native
button's activation. Native Tab/Shift+Tab/Enter/Space defaults remain intact.
No global keyboard engine or game mechanics changed.

An existing exploration menu test expected the full Exit button text to be
exactly `Exit game`, ignoring its existing visible Alt+1 badge. It now checks
the exact label span, exact badge and aria-keyshortcuts separately; viewport,
menu hiding, exit cancellation and actual return-to-Title checks remain.

## Final native evidence

Direct Playwright reused owner services, avoiding the wrapper that terminates
occupied listeners. From `client/`:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/dungeon-objective-layout.spec.js e2e/exploration-hud.spec.js e2e/exploration-touch.spec.js --output=tmp/dungeon-objective-final-1793070500
```

All8pass in2.1minutes:

- Four fresh normal Old Mill routes at1440×900,858×842,800×600,390×844. Native
  tracker opening, Tab/Shift+Tab/Enter/Space/Escape on desktop, phone taps,
  shared Quest Log opening/closing, tracker hidden under the journal, removed
  during combat, restored once after real native battle victory/trail return.
  Collapsed/expanded geometry remains above actions, with44px+ controls and no
  page exceptions. No debug grants, forced victories or teleporting.
- Three World/party-menu regressions at1440/610/390: one Menu, no duplicate
  Objective/Party/route HUD controls, hidden HUD under menu, reachable Exit,
  Keep playing cancellation and actual Exit without saving to Title.
- Existing phone touch exploration verifies controls and usable trail action.

All23 final PNGs opened/inspected:

- `client/tmp/dungeon-objective-layout-1793038950160/`:16 collapsed/expanded/
  journal/after-battle images,16 geometry JSONs.
- `client/tmp/exploration-hud-1793039065136/`:6 World/menu images.
- `client/tmp/exploration-touch-1793039072906/`:1 touch World image.
- `client/tmp/dungeon-objective-review-1793071200/index.json`: exact mapping
  and4 reviewed contact pages. The original before image was separately inspected.

A separate corrected field regression also passes3/3:
`client/tmp/dungeon-objective-field-regression-1793070800.log`.
Retained intermediate failures:
`dungeon-objective-fixed-1793069800.log` (layout fixed, Enter leaks),
`dungeon-objective-keyboard-1793070200.log` (Enter fixed, Space keyup still captured;
three stale Exit-text assertions). Final run above includes both keyboard-event
fixes and the exact label/badge assertions; all8 pass.

## Other gates and scope

861 tests/99 files, production build and full client format pass:

```sh
cd client && npm test
cd client && npm run build
cd client && npx prettier --check --ignore-path .gitignore .
git diff --check
```

Logs: `client/tmp/dungeon-objective-{unit,build,format}-final-1793071000.log`.
Backend/shared content unchanged; no new simulation or persistence migration.
Existing rewards/save/respawn authority remains in Go. Owner API, server,
browser, sessions and saves remain intact. No server restart/reset performed.
The menus CI suite now runs the new4cases plus the3field-menu regressions and
uploads their proof; existing touch regression remains in gameplay CI.

Parent4482a14 hosted run40374496973 has now passed all11visual suites and the
required summary, confirming the earlier victory-readiness correction remotely.
New Defend/UI heads still require their remote gates; owner-selected self-hosted
general CI remains queued. Broader choreography, environments, integrated menu/
gem/icon and first-visit human pacing acceptance remain open in the tracker.
