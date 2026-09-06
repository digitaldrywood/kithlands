# Shared menu style — September 5, 2026

User assignment: apply the approved party/title direction to every menu family.
Branch: `codex/all-menu-style`, based on origin/main with the approved
`codex/playtest-preview` changes included. No issue number was assigned.

## Interface system

Native dialogs share `client/src/styles/menu-theme.css`; Phaser panels and
buttons share `client/src/ui/theme.js` and `panel.js`. Slate surfaces, rounded
controls, restrained borders, proportional type, and pale gold focus accents
replace the separate blue/beveled skins. Existing title and party layouts remain
the reference. Content and server-owned rules were not changed.

| Menu family | Implementation / acceptance |
| --- | --- |
| Title, Continue, saves | Existing cover layout; title-cover flow passes at 1440, 720, 390 |
| Party and exit confirmation | Existing modern sidebar; keyboard, return, save failure and exit tested |
| Character, equipment, saved builds | Shared native skin, rounded slots/controls; equipment and gem workflows exercised |
| Items and targets | Rounded canvas rows/panels; shared palette and readable hints |
| Field magic, spells and targets | Shared canvas skin; spell context and target flow passed |
| Formation | Shared canvas skin; order/row controls passed desktop and mobile |
| Both quest log formats | Native scrolling dialogs, including all revealed legacy entries |
| World map | Native scrolling map and location list; hidden quest target filtering retained |
| Options, promotion | Shared native dialog skin; options interaction verified; promotion presentation fixture captured |
| Shops and equipment comparison | Shared panel/button skin; actual server-authorized purchase and close flow passed at 1440 and 720 |
| Gems, transmutation, socket/recovery | Native skin; recipe, socket, replacement, error and recovery checks passed |
| Codex and bestiary | Shared native skin; desktop/mobile proof |
| Battle commands, selection, status and messages | Rounded panels and message surface; removed tiled ornamental frame; desktop/mobile HUD checks passed |
| Victory and loot decisions | Shared native/canvas skin; Equip Now, Keep and retry flows passed |
| Game creation | Rounded form panels and action controls; successful creation and search-error recovery passed |
| NPC/rest, town header, end screen, developer panel | Shared panel system and typography; rest flow passed; town header no longer uses ornamental tiles |

## Validation

- `cd client && npm test`: 78 files, 624 tests passed.
- `cd client && npm run build`: passed (existing large-bundle advisory remains).
- `git diff --check`: passed.
- `./scripts/run_playwright_local.sh e2e/all-menu-style.spec.js e2e/shop-buy-flow.spec.js`:
  final 4/4 passed. Gallery includes 1440 and 390; purchases include 1440 and 720.
- Also exercised `modern-party-menu`, `party-menu-exit`, `title-cover`,
  `formation-menu-responsive`, `field-magic-context`, `battle-hud-workstream`,
  `post-battle-loot`, `house-rest`, `wizard-start`, and `gem-workshop` specs.
- Unique inspected proof directories include:
  `client/tmp/all-menu-style-1788638492351/`,
  `client/tmp/modern-shop-1788638534116/`,
  `client/tmp/post-battle-loot-1788637448089/`,
  `client/tmp/gem-discovery-1788636933320/`.

The older promotion-options progression fixture cannot reach promotion because
it skips server-required quest arrivals. It was left unchanged. Promotion styling
is verified with an explicit presentation fixture, not a claim that that older
end-to-end progression test passes. Shop tests now enter the actual server-held
shop instead of mounting an unauthorized scene. Production game rules are intact.

## Exploration HUD and persistent exit — 2026-09-05

Branch: `codex/exploration-hud` (user playtest feedback; no issue assigned).
The World HUD now uses native rounded slate surfaces for objectives, minimap,
party health/magic, resources, notifications, interaction and trail buttons.
Menu, Help and Mute remain available on narrow screens. Exit game stays in the
party-menu header while navigation scrolls. Existing save/cancel/exit behavior
is preserved. Scene shutdown removes the HUD and modal locks hide it behind
menus. Touch movement and its hit areas sit above the footer.

Validation:
- `cd client && npm test -- --run`: 624 tests passed.
- `cd client && npm run build`: passed; existing bundle-size advisory remains.
- `./scripts/run_playwright_local.sh e2e/exploration-hud.spec.js e2e/party-menu-exit.spec.js e2e/modern-party-menu.spec.js`: 8 passed on rerun (first cold startup timed out before Title).
- `./scripts/run_playwright_local.sh e2e/exploration-touch.spec.js`: passed, including touch menu/cancel and dungeon entry.
- Inspected `client/tmp/exploration-hud-1788639234509/{world,menu}-{1440,720,390}.png` and contact sheet `review.jpg`.
- Inspected `client/tmp/exploration-touch-1788639380784/touch-world.png` after correcting touch spacing.

These changes affect the World exploration HUD and party-menu exit placement.
They do not change terrain artwork or game mechanics.
