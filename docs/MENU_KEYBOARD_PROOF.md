# Menu keyboard controls — 2026-10-11

User browser feedback, tracked in draft PR #339.
Branch: `codex/battle-grounding-walk-lag`.

## Change

Battle abilities, spells, items and targets display numbered shortcuts and an
Esc Back hint inside the bottom command strip. Tab/Shift+Tab stay in that panel;
Enter/Space activate the focused enabled control. Arrow navigation and existing
battle command letters remain available. Pointer hover and keyboard focus share
one selected row.

Shared DOM menus display Alt shortcuts without colliding with existing party
letters or text entry. Native buttons keep Enter/Space activation, dialogs contain
Tab focus, and nested equipment/build dialogs retain their own Back behavior.
Dynamic recipes, purchases and loadouts refresh hints. Native inputs and selects
remain editable; physical key codes support Mac Option-modified characters.
Long inventories beyond the 35 shortcut slots remain reachable with Tab.

Shared Phaser buttons support Tab/Shift+Tab, Enter/Space and visible shortcut
hints. Existing bracketed command letters retain their original binding. Shop
catalog rows participate in focus navigation, and destroyed controls clear the
keyboard cursor before the catalog rebuilds. Item/magic lists use visible row
numbers and Tab; formation supports Tab/Space while keeping arrow controls.
Wizard class/location pickers use native keyboard-capable selects.

Go still owns all actions and game state. This changes input/presentation only;
no shared data, mechanics, balance or pacing changed.

## Validation

- `cd client && npm test`: 759 tests in 84 files pass.
- `cd client && npm run build`: passes, existing large-bundle warning remains.
- `cd client && npx prettier --check --ignore-path .gitignore .`: passes.
- `git diff --check`: passes.
- Actual browser command:

```sh
./scripts/run_playwright_local.sh e2e/menu-keyboard.spec.js e2e/shop-buy-flow.spec.js e2e/battle-context-choices.spec.js e2e/formation-menu-responsive.spec.js e2e/item-menu-context.spec.js e2e/field-magic-context.spec.js e2e/wizard-back.spec.js e2e/wizard-start.spec.js
```

Covers desktop 1440×900, reported 610×837, phone 390×844 and default 800×600;
focus containment, numbered target selection, cancellation, Tab/Enter canvas
commands, shortcut selection, Mac Option key codes, equipment/gems/crafting,
keyboard purchases and shop exit, native wizard selectors, legacy menu context
and existing wizard cancellation/start flows.

The field-magic regression's Back-width expectation was corrected to match the
pre-existing separate Back/Done layout (348px, also present at baseline 4018116).
The new shop keyboard test found a destroyed-focus reference after purchase;
clearing focus on destruction fixes the actual purchase → exit flow.

Unique screenshots live under worktree-local `client/tmp/`. Screenshots are
inspected visually, including badge placement, focused controls and narrow layouts.

## Final browser results and inspected proof

The broad 27-case run passed 26 cases; its new class-picker arrow test exposed a
native-select/Phaser interaction. Deterministic ArrowUp/ArrowDown/Home/End
selection fixes that interaction. The follow-up command below passes all three
cases, including the reported viewport and the wizard pickers:

```sh
./scripts/run_playwright_local.sh e2e/menu-keyboard.spec.js --grep 'wizard native|610x837'
```

A final wizard-only check also covers Escape cancelling party creation:

```sh
./scripts/run_playwright_local.sh e2e/menu-keyboard.spec.js --grep 'wizard native'
```

Inspected proof:

- `client/tmp/menu-keyboard-1791768592917/`: all four viewport sizes; crafting,
  equipment, gems, battle targets and spells. Badge/status overlap and tight
  character tab labels were corrected and inspected at 390px and 800px.
- `client/tmp/menu-keyboard-1791768795736/610-battle-command-keys.png`:
  existing A/I/M/F hints on the command buttons.
- `client/tmp/menu-keyboard-1791768795736/800-wizard-location-keys.png`:
  focused Old Mill native selection and visible Back/Next shortcuts.
- `client/tmp/menu-keyboard-1791768795736/800-wizard-party-keys.png`:
  keyboard-selected Brawler and focus advanced to the next name field.
- `client/tmp/modern-shop-1791768630992/`: desktop and 720px catalog/purchase
  proof. Both actual purchases and leaving the shop use displayed Alt shortcuts.

The final wizard-only rerun passes (1 case), including ArrowDown class selection,
Tab to the next field, Escape back to locality setup and Escape to title.

Final inspected wizard proof (updated guidance and Escape flow):
`client/tmp/menu-keyboard-1791768957953/800-wizard-party-keys.png`.
