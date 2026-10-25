# Shop stock label acceptance

2026-10-25 · `codex/battle-grounding-walk-lag` · draft PR #339.

The 774px two-column shop squeezed icon, name, price and shortcut into one
flex row. Hearthguard, Dawnkeeper and Cinderbranch broke inside words.
Stock rows now use a grid: the name spans the space above price and shortcut;
the icon spans both rows. Rows without authored art use the full name width.
Text size, comparison panel and transaction behavior are unchanged.

A DOM Range regression checks each stock-name word for multiple rendered lines.
It fails against the previous CSS at 774px and passes with this layout. The
responsive catalog fixture uses seed 4 so entering its store cannot be replaced
by a campaign objective fight or alter its expected starting gold.

## Exact validation

Run from the worktree root after sourcing `scripts/worktree-env.sh` and
`.envrc.local`, then changing to `client`:

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/world-shop-entry.spec.js e2e/shop-responsive.spec.js --output=tmp/shop-word-after-1792980200
npm test
npm run build
npx prettier --check --ignore-path .gitignore .
```

- Baseline regression: `client/tmp/shop-word-before-1792980000.log` fails with
  Hearthguard, Dawnkeeper and Cinderbranch split across lines.
- Final native run: `client/tmp/shop-word-after-1792980200.log`: seven passed
  in 2.4 minutes. Direct world shops cover 1440, 774 and 390px; settlement shops
  cover 1440×900, 800×600, 610×844 and 390×844. Real navigation, stock loading,
  purchase, comparison/equipping, keyboard and touch input, and shop exit remain
  exercised. No game-state grants or teleports.
- Client unit gate: 799 tests passed across 94 files, log
  `client/tmp/shop-label-client-test-1792980200.log`.
- Build and full formatting passed: `client/tmp/shop-label-build-1792980200.log`
  and `client/tmp/shop-label-format-1792980200.log`.
- All 27 captures inspected in
  `client/tmp/shop-label-contact-1792980500.jpg`; tablet stock also inspected
  at full resolution:
  `client/tmp/world-shop-entry-1792968490987/774-stock.png`.
- Other captures: `client/tmp/world-shop-entry-1792968490987/` and
  `client/tmp/shop-responsive-1792968453580/`.

This is layout acceptance, not completion of the broader campaign or icon work.
Some legacy items still have no authored icons. No Go, shared content, combat,
progression, saves or movement changed; no balance simulation was needed.
