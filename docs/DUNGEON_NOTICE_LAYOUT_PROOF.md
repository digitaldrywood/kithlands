# Adventure notice layout — 2026-10-26

The actual Heron arrival message extended into the first action row on a 390×844 phone. The regression test measures the live Phaser text bounds and action-row top after a real server transition. Before the fix its bottom was 1210.16 against the row top of 1204 logical pixels (`client/tmp/dungeon-notice-before-20261026.log`). The notice now anchors its bottom above the map's lower edge, growing upward as text wraps. It may cover part of the map while visible; it no longer overlaps the action row in the tested arrival flow.

From `client/`, five actual-game tests passed on the isolated Vite 3615/API 8694 database, without changing the owner's session:

```sh
VITE_PORT=3615 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/heron-route-discovery.spec.js e2e/heron-playability-loop.spec.js --output=tmp/dungeon-notice-final-20261026
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

The three discovery cases check message visibility and clearance at 1440×900, 800×600 and 390×844; two existing desktop/phone cases cover the real combat, rewards, crafting and saved consequence. Log: `client/tmp/dungeon-notice-final-20261026.log`. Arrival screenshots `client/tmp/heron-route-discovery-1793073339267/{1440,800,390}-heron-pool.png` were individually opened and inspected. Client checks passed: 875 tests, build and format, with logs under `client/tmp/dungeon-notice-{unit,build,format}-20261026.log`. This client-only change has no server, balance or save migration changes. Hosted CI for the new head is still required.
