# Dialog keyboard priority and rapid party input

Branch `codex/battle-grounding-walk-lag`; draft PR #339.

Hosted run40400694149 passed eleven visual suites but failed combat in two phone victory-receipt cases. Log `client/tmp/ci-combat-40400694149.log` shows Continue disabled/detached while the test attempted its second action. The same390px failure reproduces locally in `victory-space-before-1793095800.log`.

The generic focused-button Space activation added in ed91f6b ran before victory's custom finish-tally handler, so the first Space could leave the receipt. `viewportDialog` now calls its custom key handler first and falls back to generic menu navigation only when that handler has not prevented default. Escape's existing path is retained. Victory's regression now holds Space through a repeat and asserts the finished-tally hint and enabled Continue before the separate tap/keyboard exit. No old acceptance assertion or timeout was removed.

A separate four-person touch fixture exposed the two-person anti-double-click guard suppressing a second rapid Next/Previous tap. The guard now applies only to two-person parties, preserving their accepted no-wrap behavior while four-person parties advance twice. The new test uses real double-clicks at desktop/default and rapid taps on phone, verifies Hero→Shade→Hero and unchanged gameplay state. Existing two-person double-click acceptance remains intact.

The Options held-key fixture previously tried to establish a Phaser key-down after the DOM Party menu already captured input. It now holds movement in World before opening Party/Options, then releases inside Options and retains the original stationary-return checks. Both old setup failures and the successful correction are retained.

## Exact native commands

From `client/`, prefix each invocation below with:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache"
```

```sh
npx playwright test --config=e2e/playwright.config.js e2e/victory-receipt.spec.js e2e/victory-advance.spec.js e2e/cinder-victory.spec.js e2e/warrior-victory.spec.js --output=tmp/victory-space-native-1793096200
npx playwright test --config=e2e/playwright.config.js e2e/options-held-key.spec.js e2e/menu-choice-navigation.spec.js --output=tmp/victory-space-menu-1793096600
npx playwright test --config=e2e/playwright.config.js e2e/options-held-key.spec.js --output=tmp/victory-options-final-1793097100
npx playwright test --config=e2e/playwright.config.js e2e/equipment-party-navigation.spec.js e2e/equipment-loadout-screen.spec.js --output=tmp/dialog-input-party-1793097500
```

Results:13 victory cases pass,6 generic-menu cases pass,2 corrected Options cases pass,7 party/loadout cases pass: **28 distinct accepted cases**. The combined menu run's two stale Options setup failures remain visible; its six menu passes are not counted again. Native receipt checks retain KO XP, long names, multiple thresholds, reduced motion, replay/error recovery, next-battle input and touch exit. Party fixtures preserve state; navigation does not equip/spend. Victory fixture overlays explicitly stress presentation and do not claim earned campaign levels.

## Inspected visual proof

All116 final PNGs were inspected across20 contact pages, mapped in `client/tmp/dialog-input-review-1793098300/index.json`. Source directories under `client/tmp/`:

- `victory-responsive-1793050359746`:34 receipt captures.
- `victory-advance-1793050320556`:8 pending/rejected/lost-reply/recovered captures.
- `cinder-victory-1793050301446` and `warrior-victory-1793050393472`:15 each.
- `equipment-party-navigation-1793050788422`:6 rapid-forward/back captures.
- `equipment-loadout-1793050768198`:17 layout/recommendation/comparison/socket captures.
- `menu-choice-navigation-1793050486974`:15, plus6 last-screen captures under `victory-space-menu-1793096600`.

Native Options tests assert key release and stationary position over650ms; they produce no additional screenshots. Existing receipt/layout/art appearance is preserved. Full goal combat/environment/icon/pacing acceptance remains open.

## Gates

Full current working-tree client suite:870 tests/100files pass (`dialog-input-unit-1793097900.log`), including869 existing tests and one pending weapon-art contract in a separate chunk. Build/full Prettier pass (`dialog-input-build-1793097900.log`, `dialog-input-format-1793097900.log`). YAML parses and `git diff --check` passes. Party and Options regressions are registered in hosted menu CI; the existing victory spec remains in combat CI. General CI's self-hosted labels and all required visual suites remain unchanged. No game-rule, Go, art or shared-data change belongs to this input commit. API8689/Vite3609 and owner sessions are preserved. Passing new remote CI remains required.
