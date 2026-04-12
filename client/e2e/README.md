# Visual regression (issue #145)

Playwright-based screenshot diff suite for the four bug classes that
shipped this session.

## Status: scaffolded, baselines not yet captured

All four tests are marked `test.skip` until baselines are captured. This
is deliberate — the flow requires an interactive first run to review
and commit the expected screenshots, and CI does not yet install
Playwright browsers.

## Prerequisites (one-time per machine)

```sh
cd client
npm install                 # installs @playwright/test from package.json
npx playwright install chromium
```

`npx playwright install` downloads the Chromium browser binary
(~300 MB) into `~/.cache/ms-playwright`. This only runs once per
machine.

## Running locally

```sh
# From repo root, in a worktree with direnv active:
KITHLANDS_DEBUG=1 make play      # server + client on worktree ports
make test-visual                 # runs playwright against the running game
```

## Capturing baselines for the first time

1. Unskip the four tests in `visual.spec.js` (remove the `.skip`).
2. Fill in the `TODO(baseline-capture)` blocks with the actual debug
   API calls and canvas interactions — each test has a comment
   describing the intended flow.
3. Run `make test-visual` — Playwright will auto-create the baseline
   screenshots under `e2e/__screenshots__/`.
4. Review every `__screenshots__/*.png` manually. Any baseline that
   doesn't match the expected rendered state should be deleted and
   re-captured with the scene fixed, not committed.
5. Commit the `.png` files.

## Refreshing baselines after an intentional UI change

```sh
make test-visual-update
```

(Wires through `npx playwright test --update-snapshots`.)

## Why this is not in CI yet

- Playwright browser install is ~300 MB per CI runner.
- The worktree-isolated port scheme (`PORT`/`VITE_PORT`) is direnv-based
  and does not yet have a CI shim.
- Baselines are platform-dependent — a Linux CI runner will produce
  different pixel output than a local macOS/Linux dev machine, so the
  committed baselines would need to match whichever the gate runs on.

CI integration is tracked as a follow-up once the first set of
baselines is captured and the suite is stable on one platform.
