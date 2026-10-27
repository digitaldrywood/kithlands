# Multi-hit critical readability — 2026-10-26

The server-seeded level-12 developer showcase resolves the Warrior's third attack against the same Gargoyle as a 106-damage critical followed by a 63-damage normal hit and defeat. The existing native critical test now measures both real result labels after rendering, verifies the actual server hit flags/values and rejects overlapping simultaneous damage labels on that target. It keeps the existing strike/contact, shadow, recovery, readability and defeat-spacing assertions. This is an instrumented disposable showcase, not a normal first-session fight or evidence for every crit, miss or monster combination.

All four native cases pass at 1440×900, 390×844, reduced-motion 800×600, and fast 390×844 (`client/tmp/critical-hold-final-20261026.log`). In the respective traces, the critical stays above 90% opacity for 1673, 1666, 1623 and 1659ms; the following normal result stays above 90% for 1359, 1367, 1350 and 1358ms. No two damage-result labels were simultaneously visible for that target in these cases. These are observed postrender intervals, not a claim about all animation configurations.

The 66 final screenshots in `client/tmp/warrior-critical-1793074468200/` were inspected on eleven contact sheets under `client/tmp/critical-hold-review-20261026/`, indexed by `index.txt`; the fast-phone critical and follow-up were also opened individually at full size from `client/tmp/warrior-critical-1793074381085/fast-390/`. They show separate critical, next-hit and defeat labels. Source poses and game mechanics were unchanged. The earlier fast-only proof passes in `client/tmp/critical-hold-first-20261026.log`.

```sh
cd client
VITE_PORT=3615 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/warrior-critical.spec.js --output=tmp/critical-hold-final-20261026
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

875 client tests, build and formatting pass (`client/tmp/critical-hold-{unit,build,format}-20261026.log`). The existing hosted combat-effects suite already runs this spec. No backend, shared data, combat rules or saves changed, so no new simulation or DB integration is claimed. Owner services and saves were untouched; new-head CI remains required.
