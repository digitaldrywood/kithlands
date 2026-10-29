# Merchant pagination CI regression proof

PR #339 · branch `codex/battle-grounding-walk-lag` · 2026-10-26.

The hosted gameplay job on ce316ff failed because the merchant authority test
expected a rolled offer and Wooden Club to be visible on the first stock page.
The compact shop deliberately paginates its catalog. The unchanged 800×600 test
reproduced the missing-offer failure locally.

The test now uses the existing `findStockRow` helper to navigate visible stock
page buttons before clicking the requested row (a tap for the phone offer).
Existing bridge setup and some category/purchase controls remain in this test;
this is not an unassisted playthrough. All exact-instance purchase, price,
affix/socket, stale-token rejection, no-state-mutation, save/reload catalog and
failed-catalog recovery assertions remain intact. No runtime code changed.

## Validation

From `client/`:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/merchant-stock-authority.spec.js
npx prettier --check --ignore-path .gitignore .
```

Four cases pass (55.5 seconds): 800×600, 1440×900, 390×844 and catalog failure /
stale-offer recovery. No retries, skipped cases or relaxed assertions.
`git diff --check` passes. This test-only change does not modify Go, shared data
or gameplay balance.

Logs:
- `client/tmp/merchant-pages-before-1793041300.log`
- `client/tmp/merchant-pages-native-1793041500.log`
- `client/tmp/merchant-pages-format-1793041700.log`

All 15 final PNG captures under
`client/tmp/merchant-stock-authority/proof/*1793027433065.png` were inspected
using contact sheets `client/tmp/merchant-pages-review-1793041800-{0,1,2}.jpg`.
The exact filename index is `client/tmp/merchant-pages-review-1793041800.json`.
They cover catalog, rolled-item preview, purchase, save/reload and recovery.

This resolves a locally reproduced test navigation regression. New-head hosted
CI remains a separate gate. General CI retains the owner's self-hosted labels.
The owner's running game, saves and server were not restarted or changed.

## Comparison test follow-up

Hosted run `40347639481` on `5bcfd3e` finished with ten visual suites green.
Gameplay passed 59 cases and failed `shop-compare.spec.js` selecting Wooden
Staff, again assuming it was on the first page. The unchanged spec reproduced
locally in `client/tmp/shop-compare-pages-before-1793048500.log`.

The comparison spec now uses `findStockRow` and visible DOM clicks for Wooden
Staff and Silk Robe. Every class restriction, member-selection, stat delta,
exact gold, buy-and-equip and equipment-picker assertion remains unchanged.
Existing debug setup, level fixture, category and purchase bridge controls
remain; this is not a normal opening route.

The corrected case passes (4.8 seconds):

```sh
cd client
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/shop-compare.spec.js --output=tmp/shop-compare-pages-final-1793048700
npx prettier --check --ignore-path .gitignore .
```

Logs: `client/tmp/shop-compare-pages-final-1793048700.log` and
`client/tmp/shop-compare-pages-format-1793048800.log`. All four unique captures
`client/e2e/tmp/issue-202-*1793030017185.png` inspected through
`client/tmp/shop-compare-pages-review-1793048800.jpg`. Diff checks pass.
No runtime/shop behavior or meaningful assertion changed. New-head CI remains
open. Concurrent Warrior hit-presentation work is a separate change.
