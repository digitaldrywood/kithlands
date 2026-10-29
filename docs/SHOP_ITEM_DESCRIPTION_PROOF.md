# Shop item explanations — 2026-10-26

Scope: PR #339, branch `codex/battle-grounding-walk-lag`. The owner reported that ordinary shop items had a name and price but no explanation.

## Cause and result

Shop stock omits consumable description fields. The renderer previously provided a shared-catalog fallback only for spells. It now resolves explanations by item type and canonical shared ID, preserving any explicit stock description. All ten consumables explain their effect, practical use and limitations. Shared usability flags provide a separate battle/exploration line. Smithing supplies expose their authored purpose and Crafting entry point. Strange Coin retains its authored mysterious origin; unknown records receive no invented effects or usage instructions.

Description text was checked against `game_world_item.go`, combat item resolution and `restPartyPercent`. Tent restores half maximum HP/MP to eligible living companions, clears their statuses and cannot be used in battle. Phoenix Down revives with 1 HP; healing potions cannot revive. Only the ten description strings changed in items.json: all numerical values, prices, flags, equipment and other definitions compare exactly with the parent. Rules remain authoritative in Go.

## Actual-game proof

Normal native route: fresh isolated account → World → settlement → Town merchant. No forced shop entry or inventory grants. The tests ran against the actual local game at http://localhost:3609 and API 8689; the owner's active account and server were untouched.

The controlled before run fails on the missing Hi-Potion description: `client/tmp/shop-description-before-1793030000.log`. The final run passes eight cases at 1440×900, 800×600, 610×844 and 390×844. Each viewport inspects all ten consumables, all three purchased smithing supplies, mystery preservation and unchanged gold during inspection. Companion cases retain purchase guarding, equipment comparison/equip, stock return, clean exit and subsequent native movement. Narrow screens use actual pointer taps.

Final log: `client/tmp/shop-description-final-native-1793030500.log` (8 passed, 1.2 minutes).

All thirty final PNGs in `client/tmp/shop-responsive-1793023009344/` were opened and inspected using the five indexed contact sheets `client/tmp/shop-final-review-1793031200-{0..4}.jpg`; mapping: `client/tmp/shop-final-review-1793031200.json`. Hi-Potion, Tent and Forge flux descriptions fit their detail panels at all four sizes; footer actions stay reachable. Representative original captures:

- `390-hi-potion-details.png`
- `800-tent-details.png`
- `1440-supply-details.png`

## Commands and gates

From client:

```sh
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/shop-responsive.spec.js
```

856 tests in 99 files pass; build and final formatting pass. Logs: `client/tmp/shop-description-final-{unit,build}-1793030500.log` and `client/tmp/shop-description-format-1793031000.log`. An intermediate formatting failure was corrected with Prettier; the subsequent check passes.

From repository root:

```sh
make test
make validate-data
```

Both pass: `client/tmp/shop-description-{go,data}-1793030200.log`. No combat or pacing mechanics changed; this slice does not claim a new balance simulation or full database integration run.

## Remaining gates

The parent d2117a6 hosted visual run 40333013567 reports an interiors failure: its return-to-World assertion still expects zoom 1 at portrait widths, while the accepted closer portrait World camera uses zoom 2. This needs its own correction and native rerun; it is not evidence of a shop-description failure or a green current branch. General CI remains self-hosted pending an available runner, as the owner requested. The broader playability goal remains open.

The local client has HMR disabled. Save and reload the current owner session to receive the updated renderer; these tests did not restart the authoritative server.
