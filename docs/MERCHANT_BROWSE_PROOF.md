# Merchant greeting: browse directly

PR #339, branch `codex/battle-grounding-walk-lag`. The normal opening audit
found that visiting the merchant required advancing three greeting pages before
reaching stock. The existing dialogue remains available, with a visible
**Browse wares · B** action on each page. B, a focusable Tab/Enter button and
touch all open the ordinary shop through the existing interaction. Quest
interactions still take priority; non-merchant dialogue and inn/temple actions
retain their existing paths. The button and resize observer are removed when
dialogue closes or the scene shuts down; a stopped scene does not open a shop.
No game rules, prices, content or save data changed.

Actual-game checks on Vite3614/API8693 walked a fresh party into town, reached
the merchant, opened stock and bought Frost with starting gold, left the shop,
returned to the gate and entered Old Mill. Three cases pass at1440×900 (B),
800×600 (focused Enter) and390×844 (touch). A subsequent800×600 run advanced
a dialogue line, then used Tab and Enter to browse. Logs:
`client/tmp/merchant-browse-native-20261026.log` and
`client/tmp/merchant-tab-native-20261026.log`.

All36 screenshots from the three-size run were inspected on six pages at
`client/tmp/merchant-browse-review-20261026/index.json`; all13 from the final
Tab/conversation run were inspected on three pages at
`client/tmp/merchant-tab-review-20261026/index.json`. Greeting text and the
button are contained at desktop and phone sizes; the route reaches the real
shop and trail. The original screenshots are in
`client/tmp/shop-approach-1793066222913/` and
`client/tmp/shop-approach-1793066445808/`. Existing shop-case videos are
retained under the corresponding Playwright output directories.

Commands from `client/`:

```sh
VITE_PORT=3614 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/shop-approach-alignment.spec.js --max-failures=1 --output=tmp/merchant-browse-native-20261026
VITE_PORT=3614 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/shop-approach-alignment.spec.js --grep '800' --output=tmp/merchant-tab-native-20261026
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

873 client tests in100 files, build and full formatting passed. Logs use the
`client/tmp/merchant-browse-final-` and `merchant-browse-check-` prefixes.
No new simulator or DB claim applies to this presentation change. Existing
owner services and saves were kept intact. Current-head hosted CI still needs
to finish; general CI remains self-hosted as requested. Broader terrain,
reference-combat and playability-goal acceptance remain open.
