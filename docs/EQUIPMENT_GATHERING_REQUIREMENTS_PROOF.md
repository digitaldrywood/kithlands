# Gathering and equipment requirement feedback

Scope: PR #339, branch `codex/battle-grounding-walk-lag`, based on pushed
`d44e76376ff1d4086e5bacd41cc59b713202e3db`. This slice changes presentation and
input eligibility only. Go gathering, inventory, stock, prices and equip rules
remain authoritative and unchanged.

## Changes

- Nearby rare gathering prompts show the `required_level` supplied by Go, before
  input: `Gather — Deep mythril seam · Requires party Lv.8`. Basic nodes retain
  their short label. The client does not decide gathering eligibility or renewal.
- Shop comparisons distinguish `Class restricted`, `Requires Lv.N` and `Can equip`.
  The selected character gets a concrete class or level explanation; armor is
  called armor instead of something to wield. Comparison indicators and the
  existing Buy-for action use the same display check. Plain Buy remains available
  for future gear. Go still validates all transactions and equips.
- Updated the existing advanced crafting fixture's exact rare-node accessible
  name; added the new resource regression and its artifacts to the existing
  crafting CI suite. General CI runner labels are unchanged.

## Local validation

From `client/`:

```sh
npm test -- --run src/scenes/shopCompare.test.js src/scenes/world_interact.test.js src/scenes/world_gathering.test.js
npm test
npm run build
npx prettier --check src/scenes/shopCompare.js src/scenes/shopCompare.test.js src/scenes/world_shop.js src/scenes/world_interact.js e2e/shop-compare.spec.js e2e/shop-responsive.spec.js e2e/resource-requirements.spec.js e2e/helpers/crafting-progression.js
```

Targeted: 41 tests pass. Full: 858 tests / 99 files pass. Build and formatting
pass; the build retains its existing large-chunk advisory. No backend/shared
mechanic changes, so no simulator or new Go test gate was required for this slice.
The new unit boundary verifies level 7 versus required level 8, exact-level
acceptance, locked comparison indicators and a distinct class restriction.

Browser commands use this common environment, from `client/`:

```sh
export VITE_PORT=3609
export PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright"
export XDG_CONFIG_HOME="$PWD/tmp/xdg-config"
export XDG_CACHE_HOME="$PWD/tmp/xdg-cache"
npx playwright test --config=e2e/playwright.config.js e2e/resource-requirements.spec.js e2e/shop-compare.spec.js --output=tmp/equipment-eligibility-browser-1793057300
npx playwright test --config=e2e/playwright.config.js e2e/shop-responsive.spec.js --grep 'equipment explains' --output=tmp/equipment-restriction-final-1793057900
npx playwright test --config=e2e/playwright.config.js e2e/resource-requirements.spec.js --output=tmp/resource-requirements-final-1793058300
```

The recorded invocations also scoped `HOME="$PWD/tmp/home"` to the Playwright subprocess for the existing isolated browser harness; the shell home was not changed.

Direct Playwright safely reuses the owner services. The local wrapper would kill
listeners before starting replacements; it was deliberately not used on the
owner's active ports. No server restart, owner browser interaction, save reset,
DB replacement or browser-storage persistence was performed. API 8689 still
reports `{"status":"ok"}`.

The first resource/compare batch passes all four cases. The extended rare-resource
rerun passes all three cases, including successful gathering after the Go level
fixture. Eight distinct browser cases pass across the retained final runs. The four-width shop
batch passes at 1440×900, 800×600, 610×844 and 390×844. The comparison regression
retains purchase, gold, class, per-member stat and character equip-picker checks.
Shop responsive cases enter a real fresh-game merchant, use native page controls
and select incompatible Warrior / compatible Mender; 610/390 use touch taps.

Initial new shop fixtures incorrectly requested Silk Robe from a level-one
catalog. The test was corrected to the available Cloth Robe with the same class
restriction; no production inventory was changed to accommodate the fixture.

Rare-resource cases run at 1440×900, 800×900 and 390×844, walk every tile through
the real scene and authoritative step API, inspect the prompt before input, and
verify Go rejects an underlevel gather with unchanged materials and no depletion.
Only encounters are suppressed to isolate eligibility. The final extension
advances one member via the Go debug fixture, then gathers through the native
button and checks exact material quantity and a positive respawn timer. This is
an advanced eligibility fixture, not opening-route progression or human pacing
proof. The shop level boundary is unit verified; these native merchant captures
exercise class restrictions, not a naturally offered underlevel item.

## Evidence and limits

Logs are under `client/tmp/`:

- `equipment-eligibility-unit-1793057000.log`
- `equipment-eligibility-all-unit-1793057600.log`
- `equipment-eligibility-build-1793057000.log`
- `equipment-eligibility-format-1793058400.log`
- `equipment-eligibility-browser-1793057300.log`
- `equipment-restriction-final-1793057900.log`
- `resource-requirements-final-1793058300.log`

Inspected native captures from the first batch:
`client/tmp/resource-requirements-1793033387874/` (six),
`client/tmp/shop-responsive-1793033518981/` (eight), and
`client/e2e/tmp/issue-202-*-1793033437292.png` (four).
The final resource extension adds nine inspected captures in
`client/tmp/resource-requirements-1793033616167/`. Six intermediate shop captures
in `client/tmp/shop-responsive-1793033520948/` were also inspected; final four-width
acceptance uses the complete run above. In total, 33 listed native captures were
inspected. Contact pages and source index: `client/tmp/equipment-eligibility-review-1793058100/`.

The changed labels fit desktop/portrait; phone restrictions, equipped item,
comparison and both purchase choices are readable. At 800×600 the lower detailed
comparison remains scrollable; the class restriction is also shown on the member
card above it. This is not acceptance of the wider equipment art or layout backlog.
World composition remains sparse, with geometric paths and repetitive ground;
this work does not close environment-art acceptance.

Parent `85d2c56` visual run 40356523215 completed successfully across all eleven
suites and the protected summary. Parent `d44e763` visual run 40361163903 is still
in progress; its crafting, spell-effects, interiors and menus suites currently
pass. General run 40361163935 is queued on the owner-selected self-hosted setup.
This new head needs its own remote gate. Remaining reference motions, integrated
flow, environment, icons/gems and unassisted first-fifteen-minute pacing stay open.
