# Heron route discoverability — 2026-10-26

The opening playthrough found the optional Heron Pool hidden behind More routes. The trail now lists its optional detour beside the main bat encounter on the first page, with the river-bend hint on the second page. The shorter label avoids colliding with the shortcut badge on phone. Only action order and label change: IDs, positions, requirements, encounters, rewards and server-owned mechanics are unchanged, preserving existing save references.

## Actual-game verification

The isolated Vite 3615 / API 8694 game used separate test accounts and database. Three native discovery cases at 1440×900, 800×600 and 390×844 verify the first-page choices, second-page river hint, and the real server transition into Heron Pool using clicks or touch. Two existing actual-game cases cover the optional fight, earned supplies, crafting and saved consequence at desktop and phone. Three existing tactical cases verify the server-driven prepare and guarded rush behavior across desktop, default and phone, including reduced motion. All eight passed:

```sh
cd client
VITE_PORT=3615 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/heron-route-discovery.spec.js e2e/heron-playability-loop.spec.js e2e/enemy-tactics.spec.js --max-failures=1 --output=tmp/heron-discovery-final-20261026
```

Log: `client/tmp/heron-discovery-final-20261026.log`. All 61 final captures were inspected on eleven contact sheets, mapped in `client/tmp/heron-discovery-review-20261026/index.txt`; originals are in `client/tmp/heron-route-discovery-1793072761766/`, `client/tmp/heron-loop-1793072708237/` and `client/tmp/enemy-tactics-1793072574383/`. The first phone discovery attempt lacked a touch-enabled test context; the corrected run passed. An intermediate capture exposed a long label overlapping its badge, so the final content uses the shorter label. These tests do not establish a human-paced fifteen-minute playthrough.

## Other validation

`make test`, `make validate-data` and `make balance-sim` pass after the content change; logs are `client/tmp/heron-discovery-final-{go,data,balance}-20261026.log`. `cd client && npm test -- --run` passed 875 tests before the final label-only content edit; `npm run build` and formatting passed afterwards. The discovery spec is included in the existing hosted gameplay suite. Hosted current-head CI must still pass; general CI remains self-hosted.

The owner's server and saves were not restarted or changed. The running API loads its catalog at startup, so the updated route label/order requires a later safe server restart. Full movement, environment, combat and opening-session acceptance remain open.
