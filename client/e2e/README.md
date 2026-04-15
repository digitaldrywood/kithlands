# Playwright Local Verification

Playwright now has one working local e2e path for Kithlands:

- `party-menu-equip.spec.js`: quick-start a game, grant real equipment via the
  normal buy/equip APIs, open the party menu, drill into character detail, and
  equip an upgraded weapon through the actual UI flow.

The older screenshot suite in `visual.spec.js` is still scaffolded and skipped.
It remains available for future baseline capture, but it is not the main
verification path yet.

## Prerequisites

```sh
cd client
npm install
npx playwright install chromium
```

## Running locally

```sh
KITHLANDS_DEBUG=1 make play
make test-visual
```

`make test-visual` runs every Playwright spec under `client/e2e`, including the
working party-menu equip flow.

## Sprite debugger

The sprite debugger is served by the same Vite dev server as the game:

```sh
source scripts/worktree-env.sh
echo "http://localhost:${VITE_PORT}/sprites.html"
```

If you use `make play`, it now prints the sprite debugger URL alongside the
game URL. If `TAILSCALE_HOSTNAME=prometheus` is set, the network form is:

```sh
http://prometheus:${VITE_PORT}/sprites.html
```

The old `http://prometheus:5173/sprites.html` expectation is stale. This repo
has used an explicit Vite port instead of Vite's default for a long time, and
since the per-worktree infra change each worktree gets its own derived
`VITE_PORT` from `scripts/worktree-env.sh`.

Each browser run should use a worktree-local profile so concurrent tmux/worktree
sessions do not collide. This worktree defaults to
`client/tmp/playwright-chromium-profile`. Override with
`PLAYWRIGHT_USER_DATA_DIR=/abs/path/to/profile` if you need a different one.

## How the harness works

- The app exposes a small DEV-only browser test bridge from
  `client/src/dev_test_bridge.js`.
- Playwright uses that bridge to quick-start a fresh game and drive the same
  authenticated client session the game already uses.
- The spec still drives the real menu/detail/equip UI path instead of calling
  the equip endpoint directly.

## Current limits

- Local-only: CI still does not install Playwright browsers or start the
  worktree-specific stack.
- The visual snapshot tests in `visual.spec.js` still need baseline capture and
  are intentionally skipped.
