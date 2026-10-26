# Menu choice navigation proof

Branch: `codex/battle-grounding-walk-lag`; draft PR #339. No new issue was opened.

## Reproduced failures and correction

Crafting recipes did not own arrow navigation. Right in the owned-gear drawer escaped to Character's character-cycle handler, switched Hero to Sparks and closed the drawer. Both collections now opt into scoped browsing. Arrows follow the rendered grid, vertical list or phone horizontal strip; Home/End and Tab/Shift+Tab remain available. Browsing only focuses; Enter/Space selects a preview and a separate confirmation spends materials or equips gear.

Native tests then exposed Phaser capturing Space keyup even while scene input is paused. The shared menu handler now owns focused button activation on keydown, prevents native duplicate activation and ignores key repeat. Native input/select/textarea and save-history summary behavior remain intact. Saved-history coverage now checks Space collapse/reopen as well as Enter.

Two intermediate acceptance failures were corrected without weakening assertions: phone flex strips inherited a stale grid-column count, and desktop Gem flex-column lists must retain bounded Up/Down navigation. The final implementation distinguishes bounded collections from actual grid layout.

## Native acceptance

Use the existing services on Vite3609/API8689 without restarting the owner's session. All commands below run from `client/` with this environment prefix:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache"
```

Append that environment to each Playwright invocation (the line above documents the prefix, not an independently exported environment).

```sh
npx playwright test --config=e2e/playwright.config.js e2e/menu-choice-navigation.spec.js e2e/gem-workshop.spec.js --output=tmp/menu-choice-final-1793089000
npx playwright test --config=e2e/playwright.config.js e2e/gem-workshop.spec.js e2e/canonical-item-art.spec.js e2e/weapon-item-art.spec.js e2e/equipment-loadout-screen.spec.js e2e/equipment-builds.spec.js e2e/effective-equipment.spec.js e2e/crafting-sources-layout.spec.js e2e/shop-spell-catalog.spec.js e2e/wizard-back.spec.js e2e/wizard-start.spec.js e2e/save-adventures.spec.js --output=tmp/menu-acceptance-final-1793087600
DATABASE_URL='postgresql://localhost:54706/kithlands_609?sslmode=disable' npx playwright test --config=e2e/playwright.config.js e2e/equipment-builds.spec.js --output=tmp/menu-builds-final-1793088200
```

Final navigation/Gem run: **29/29**. Broader acceptance: **59/62**, with three saved-build cases stopping at their explicit missing-DATABASE_URL fixture assertion before gameplay. All three pass with the existing disposable-fixture database configured. That is **68 distinct accepted cases**, counting the repeated 23 Gem cases only once. The final responsive-layout correction was followed by rerunning every affected opt-in collection (all 29 navigation/Gem cases).

The six new cases cover 1440x900, 800x600 and 390x844 with phone touch setup. Crafting uses ordinary Quick Start, walking to actual herbs and gathering them. Browsing/previewing preserves the full gameplay snapshot and sends no mutation. Held Space on Craft sends exactly one request and changes five Potions to six, gold100 unchanged. Gear cases deliberately grant Steel/Mythril and level25 through the Go debug fixture; these are not natural opening-availability claims. Arrow navigation retains Hero/drawer, preview changes no gameplay state, and held Space confirms exactly one real Go equip request. All six browser-error arrays are empty.

Before evidence: `client/tmp/menu-choice-before-1793086100.log` reproduces both arrow failures. `menu-choice-native-1793086400.log` retains the subsequent six Space failures. Intermediate phone-layout and Gem-bounds failures remain in `menu-choice-final-native-1793088000.log` and `menu-choice-final-1793088500.log` respectively. Final passing logs are `menu-choice-final-1793089000.log`, `menu-acceptance-final-1793087600.log` and `menu-builds-final-1793088200.log` under `client/tmp/`.

## Inspected visual evidence

`client/tmp/menu-choice-review-1793089500/index.json` maps all256 source PNGs to43 contact pages, all inspected. This includes248 final PNGs and8 retained diagnostic images. Full desktop/phone navigation images were also inspected individually. Final sources:

- `canonical-art-1793046863731` (33)
- `crafting-sources-1793046889748` (8)
- `effective-equipment-1793046898586` (9)
- `equipment-loadout-1793046946805` (17)
- `equipment-builds-1793047057686` (27)
- `gem-discovery-1793047419573` (49)
- `shop-spell-catalog-1793047107046` (15)
- `weapon-item-art-1793047145601` (40)
- `save-adventures-1793047076547` (12)
- `wizard-back-1793047175973` (14)
- `menu-choice-navigation-1793047525600` (15, plus six audit JSONs)
- Three wizard-start captures under `menu-acceptance-final-1793087600`, six final navigation last-screen captures under `menu-choice-final-1793089000`.

All directories above are under `client/tmp/`. Each navigation audit records before/after snapshots, the real Go response and exactly one mutation. Selected versus focused recipes remain visually distinct, character identity remains stable, sword/gem icons are consistent in the named canonical scope, costs/net changes and disabled controls are visible. Phone panels scroll within their intended bounds.

## Local gates and scope limits

`cd client && npm test`:869 tests/100 files pass (`menu-choice-unit-1793089300.log`). `npm run build` and full `npx prettier --check --ignore-path .gitignore .` pass (`menu-choice-build-1793089300.log`, `menu-choice-format-1793089300.log`). Workflow parsed with `ruby -e 'require "yaml"; YAML.parse_file(".github/workflows/walk-regression.yml"); puts "workflow syntax OK"'`; `git diff --check` passes. No Go, shared content, combat rules, assets or walk animation changed, so no new simulator/data gate is required for this input-only chunk.

This does not close every menu or icon. Thirty-three weapon records still rely on runtime fallbacks; several shop rows remain text-only. A mouse-hover equipment tooltip can linger over the paperdoll during keyboard browsing; track focus/hover priority as a separate cleanup. Advanced Gem/equipment fixtures do not establish natural acquisition pacing. Full integrated combat, authored macro terrain, all-menu acceptance and unassisted first15minute pacing remain open.

Parent4e96332 hosted visual run40388617174 passes all eleven suites and protected summary. Pushed da931cf run40393142531 completed ten suites but gameplay exhausted its30minute job budget after browser install took14m54s. Its log shows57/64 native cases passed and no test failure before cancellation; the remainder is unverified remotely. A separate CI workload split will preserve every spec and the required all-suite gate. General CI40393142565 remains queued without a registered self-hosted runner; retain the owner's chosen runner labels.
