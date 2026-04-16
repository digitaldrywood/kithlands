# Playwright Local Verification

Playwright now has one working local e2e path for Kithlands:

- `party-menu-equip-happy-path.spec.js`: start a deterministic 4-member party,
  buy a real weapon via the live API, open the party menu, assert the menu
  layout stays inside the 760x540 panel, drill into character detail from a
  specific row, equip the upgraded weapon through the actual UI flow, and
  confirm the derived attack/weapon change persists after closing and
  reopening.
- `walk-all-classes.spec.js`: quick-start a game, enter a town interior, and
  verify all 12 walk-sheet classes render the correct directional sequences in
  both `World` and `Town`.

The screenshot suite in `visual.spec.js` still exists for issue-scoped visual
regression checks. It is no longer the only path for walking validation, but it
remains useful when a change needs inspected pixel output instead of only
runtime assertions.

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
make test-walk-classes
make walk-previews
```

`make test-visual` runs every Playwright spec under `client/e2e`, including the
working party-menu equip flow.

`make test-walk-classes` is the exhaustive walk-sheet proof path. It runs the
`walk-all-classes.spec.js` audit once per class in a fresh browser process so
all 12 classes are checked in both `World` and `Town` without cross-test state.

`make walk-previews` exports enlarged sheets and animated GIFs for every class
under `client/tmp/walk-previews/`. Open `client/tmp/walk-previews/index.html`
to review the actual motion class-by-class before accepting any generated walk
assets.

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
