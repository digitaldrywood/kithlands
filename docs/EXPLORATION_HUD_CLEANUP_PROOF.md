# Exploration HUD cleanup proof

Review: PR #339, branch `codex/battle-grounding-walk-lag`. No separate issue assigned. Previous pushed commit: `bdd0f7a`.

The field previously had Objective and Party disclosures plus Menu, a permanent route button, and notices with no expiry. World now has one Menu entry point. Party health/inventory, the shared quest journal and world map remain available there; nearby harvest and trail-entry actions remain contextual. Dungeon retains its objective tracker.

Successful harvesting shows a compact material receipt such as `+4 Ember iron ore` at the lower-left edge. Notices hold for 2.6 seconds, fade and rise for 0.8 seconds, then leave the screen. New notices replace old ones and restart expiry; scene disposal cancels timers. Reduced motion removes the rise. These are presentation changes; Go still controls yield, depletion, inventory, crafting and routes.

## Validation

```sh
cd client && npm test
cd client && npm run build
cd client && npx prettier --check --ignore-path .gitignore .
./scripts/run_playwright_local.sh e2e/exploration-hud.spec.js e2e/exploration-touch.spec.js e2e/gathering-crafting.spec.js e2e/old-mill-adventure.spec.js --grep 'controls and exit|touch exploration|receipt fades|1440|entry, exploration' --output=tmp/hud-cleanup-accepted-results
./scripts/run_playwright_local.sh e2e/old-mill-adventure.spec.js --grep 'map guard.*1440' --output=tmp/hud-menu-complete-results
```

759 unit tests in 84 files pass. Production build and formatting pass; existing large-chunk warning remains. Ten browser checks pass in the broad run; the final menu-guard check is rerun separately after updating its obsolete canvas-button locator to the current DOM control. The separate rerun passes, for eleven passing checks in total. Together they cover desktop/610px/phone menu and exit, touch trail entry, repeated herb/ore receipts and expiry, journal/map access, gathering/crafting/equipment/save/load/battle, and Old Mill entry/return/completion.

Inspected screenshots include:

- `client/tmp/gathering-1791763374555/610-mineral-edge-receipt.png`
- `client/tmp/gathering-1791763374555/610-clear-field.png`
- `client/tmp/gathering-1791763374555/390-mineral-edge-receipt.png`
- `client/tmp/old-mill-1791763449203/1440-return-payoff.png`

Unique screenshots and browser result artifacts are local under `client/tmp/`. Unit/build/format/browser logs are `hud-unit-final.log`, `hud-build-final.log`, `hud-format-check.log`, and `hud-browser-accepted.log`, `hud-menu-complete.log` in that directory. Initial browser harness failures used the internal Quest Log label instead of the visible Quest journal label; a concurrent hot reload interrupted another test. Both were resolved before the stable run. The older menu-guard spec also needed the DOM party-menu lock and post-retreat map button rather than canvas locators.

The in-app browser backend was unavailable in this session, so verification used the repository's isolated actual-Chromium Playwright wrapper against the running Go/Vite game.

No backend, shared content, balance or database changes in this chunk; their earlier validation is recorded in GATHERING_CRAFTING_PROOF.md.
