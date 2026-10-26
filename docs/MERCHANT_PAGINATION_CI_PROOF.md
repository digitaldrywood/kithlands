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
