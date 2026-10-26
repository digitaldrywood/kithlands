# Defeat recovery waits for the requested save

PR #339, branch `codex/battle-grounding-walk-lag`.

Hosted visual run `40302989350` on `2f9b095` finishes with eight green suites,
but combat and the required summary fail. Combat job `121505136295` reports
31 passing cases and two failures: desktop/default defeat recovery. These are
30-second test timeouts waiting for `details.save-history > summary`, not a job
budget timeout. The complete log is retained as
`client/tmp/lightning-ci-combat-1793096300.log`.

## Evidence and diagnosis

Both retained CI error contexts show the requested manual save correctly
rendered as “Most recent adventure”. There is exactly one save, so no history
disclosure exists. Artifact `visual-proof-combat` is downloaded under
`client/tmp/lightning-ci-combat-artifacts-1793096400/`; the two error contexts
are under its retained `client/test-results/defeat-receipt-*/` directories.

`TitleScene.showLoadScreen` renders “Your adventures” before awaiting the real
`listSaves()` request. The test waited for that heading, then immediately called
`target.isVisible()`. A not-yet-loaded target was mistaken for a save hidden in
history. Once that branch was chosen, loading the single save could not create
the history control it was incorrectly waiting for.

The unchanged local desktop/default cases pass in
`defeat-save-race-before-1793096400.log` (24.5s), illustrating why a fast local
API did not reliably expose the ordering. Adding 750ms delivery latency to the
actual save-list response reproduces both failures at the same history selector
in `defeat-save-controlled-before-1793096500.log`. The response body, Go state
and save records are not fabricated or altered.

## Correction

The test now waits until its exact `data-save-id` exists once in the rendered
list, then checks visibility and opens history only if needed. The controlled
response latency remains in the regression. The original test timeout, exact
save identity, actual Go defeat, keyboard/touch input, save restoration, stale
battle-object cleanup and subsequent native Title exit assertions are retained.
No application code, gameplay rules, save behavior or workflow budget changes.

## Final validation

```sh
source scripts/worktree-env.sh
source .envrc.local
cd client
VITE_PORT=3611 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
  HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
  XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
  npx playwright test --config=e2e/playwright.config.js \
  e2e/defeat-receipt.spec.js e2e/save-adventures.spec.js \
  --output tmp/defeat-save-race-final-1793096600 \
  >tmp/defeat-save-race-final-1793096600.log 2>&1
```

All eight native cases pass (1.3m): delayed defeat/save recovery at 1440x900,
800x600, 390x844 and 375x667, plus latest-save/history flows at 1440x900,
610x837, 390x844 and 800x600. Existing API/audit Vite services are reused; these
isolated accounts do not touch the owner's restored game on 3609.

All 36 final PNGs are inspected through all three pages of
`client/tmp/defeat-save-race-review-1793096900.json`. Sources:
`client/tmp/defeat-responsive-1793010231452/` (24 PNGs) and
`client/tmp/save-adventures-1793010281569/` (12 PNGs). They show native defeat,
the explicit saved checkpoint, recovered World, subsequent Title and optional
history with separate adventures. The long-party defeat images remain labeled
presentation fixtures; they do not claim a real four-member defeat or pacing.

`npm test` passes 841 tests in 98 files, `npm run build` passes, and
`npx prettier --check --ignore-path .gitignore .` passes in
`client/tmp/defeat-save-race-{unit,build,prettier}-1793096700.log`.
No Go/shared data changed and no new simulator run is needed. The existing CI
workflow already includes both affected specs; a fresh head run is required.
