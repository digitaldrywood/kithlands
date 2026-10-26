# Equipment tooltip input and visibility proof

Branch `codex/battle-grounding-walk-lag`; draft PR #339. This is a client presentation/input repair, with no new issue or game-rule change.

## Problem and final behavior

A mouse parked over Body/Weapon kept its tooltip and elevated slot layer active while the player browsed owned gear with keys. The Character screen now gives keyboard focus priority until deliberate pointer movement/press restores hover. Moving focus off an item dismisses its details. Root-local event handlers disappear with the overlay; the existing window resize/key cleanup remains intact.

Visual review uncovered two additional defects: candidate tooltips were clipped by the scrolling gear list, and disabled-row opacity made their details translucent. Candidate tooltips now use fixed positioning clamped beside the row within the viewport, updated once per animation frame after focus/pointer/scroll/resize input. Only the disabled row's icon/summary is dimmed. Keyboard mode also suppresses the parked slot's elevated hover layer, preventing it from painting over the active tooltip. Phone layouts retain drawer details and hide floating tooltips.

## Reproduction and acceptance

Before implementation, the desktop native regression failed specifically because Body's tooltip remained visible after Home focused the first candidate (`client/tmp/equipment-tooltip-before-1793091000.log`). Intermediate screenshots proved that a style-visible candidate tooltip was actually clipped; subsequent review exposed transparency and the hovered Weapon layer covering part of it at800px. Those were fixed, not accepted on the strength of the earlier passing style assertion. The first800px fixture tried to hover Body underneath the actual drawer; the final fixture uses exposed Weapon at that size, without force or synthetic hover.

Final native command, from `client/`:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/equipment-tooltip-input.spec.js e2e/menu-choice-navigation.spec.js e2e/equipment-loadout-screen.spec.js --output=tmp/equipment-tooltip-final-1793093700
```

**13/13 pass** in50seconds. New cases at1440x900,800x600 and390x844 open Character from ordinary Quick Start using native menu input (touch opens Weapon on phone). They cover pointer hover, parked-pointer keyboard takeover, Tab away, mouse return and closing the overlay. Desktop also resizes to1120x700 and back while the same tooltip remains focused. Candidate visibility asserts viewport containment, full effective opacity and actual painted hit-test visibility across25 points plus the item name, catching clipping and partial obstruction. The temporary pointer-events override exists only in the test's visibility probe and is immediately restored. All three cases preserve the entire gameplay snapshot/position, send zero equip/unequip/craft/socket mutations and report zero browser errors.

Existing six navigation cases retain preview-only browsing and exactly-once held-Space crafting/equip confirmation. Existing four loadout cases retain recommendations, comparison, sockets, character switching and reachable phone layouts. Their advanced item fixtures do not establish natural opening acquisition.

## Inspected artifacts

All50 final PNGs were inspected via nine contact pages mapped by `client/tmp/equipment-tooltip-review-1793093900/index.json`; important keyboard tooltips were also inspected at full size. Final sources under `client/tmp/`:

- `equipment-tooltip-input-1793049174155`:12 pointer/keyboard/resize/return PNGs and three audit JSONs.
- `menu-choice-navigation-1793049182950`:15 browsing/preview/confirmation PNGs and six authoritative mutation audits.
- `equipment-loadout-1793049155933`:17 character/loadout/comparison/socket captures.
- Six final afterEach captures under `equipment-tooltip-final-1793093700`.

Final desktop/default keyboard tooltips are opaque, fully readable and clear of the parked slot layer; moving to another control hides them and moving the mouse restores only the hovered item. Phone floating tooltips remain absent. Existing remaining weapon/ring icon fallbacks and secondary text sizing are still separate backlog items.

## Gates and scope

`cd client && npm test`:869 tests/100files pass (`client/tmp/equipment-tooltip-unit-1793093200.log`). Final `npm run build` and `npx prettier --check --ignore-path .gitignore .` pass (`equipment-tooltip-build-1793093700.log`, `equipment-tooltip-format-1793093700.log`). Workflow parses with `ruby -e 'require "yaml"; YAML.parse_file(".github/workflows/walk-regression.yml"); puts "workflow syntax OK"'`; `git diff --check` passes. The new spec and proof artifacts are registered in the hosted menu suite. No Go/shared data/mechanics/art/walk changes; no new simulator or data validation is required for this UI-only repair.

Parent51e09a9 hosted run40400694149 confirms both separated gameplay and shops jobs pass, alongside menus/interiors/campaign/combat-effects/spell-effects/crafting at the last observation; walking/combat/escort/adventure-recovery were still running. This is partial remote evidence, not a green full run. General CI40400692783 remains queued for the owner's self-hosted runner. Owner API8689/Vite3609 and saved sessions were preserved; no service restart, save reset, merge or deploy.
