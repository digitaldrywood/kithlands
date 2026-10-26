# Stable, compact shop catalog — 2026-10-26

PR #339, branch `codex/battle-grounding-walk-lag`; follows ff4c08c. User-reported slice: spell selection moved the stock panel, rows wasted space and spell-level labels suggested an eligibility bypass.

## Changes

Selection previously rebuilt the entire stock panel while preserving only the outer body scroll position. The catalog now retains its existing rows and decoded icons when just the preview or chosen learner changes. Its page remains stable across selection, learner choice and refresh. Catalog rows rebuild for category/page/capacity, pending transactions or changed authoritative offer IDs. Focus uses preventScroll; desktop selection keeps focus on its row, while phone details keep their Back-to-stock flow. Resize observation is disconnected on close or scene shutdown.

Rows are 52 CSS pixels tall with names, price and tier/shortcut metadata together, compared with the former large multi-line spell cards. Stock pages fit the available panel height and expose Previous/Next controls and an item range. Stock has no vertical scrolling at the verified viewport sizes; every offer remains reachable. Selection and capacity changes retain the selected item. Category horizontal position is preserved separately. Controls retain minimum 46px height and visible shortcuts; Arrow keys, Tab, Enter, Space and Alt activation are exercised.

The existing spell-level field denotes magic tier, so stock and details now say Tier. A separate explanation distinguishes character-level/class eligibility; learner states still come exclusively from Go. No learning, content, pricing or progression rule changed, and no backend restart is needed for this renderer change.

## Eligibility investigation

`LearnSpell` calls `validateSpellLearningLocked` before deducting gold or teaching a spell. The same authoritative status supplies the UI learner metadata. Character thresholds come from shared spell data: tier two unlocks at character level 3, tier three at level 5. The level-six companions in the user's screenshot can therefore legitimately learn tier-two magic; the old Level label obscured that distinction. A bypass has not reproduced.

The existing under-level test now asserts rejection preserves gold and known spell count. A new table-driven Go case checks rejection immediately below, and successful learning exactly at, both tier-two and tier-three boundaries. Successful learning spends exactly the price and adds one spell.

Each new native case also sends an adversarial learn request directly past the disabled button: level-one Willow cannot learn Cure Poison (tier two), Go returns level-3-required, and the full party and gold compare exactly before/after. Normal Frost learning on Sparks succeeds, deducts 100 gold once and becomes already known. The older chosen-learner Heal flow also passes.

## Actual-game verification

All browser runs use the actual main local game, frontend 3609/API 8689, under isolated test accounts. The owner's session and server remain running. New spell cases walk normally through World, Settlement and Town to the merchant. Their eligibility fixture explicitly grants levels/gold to the isolated account: three level-eleven members open tier-three stock, while Willow remains level one. This is learning/UI proof, not normal progression or first-visit pacing proof.

Five new cases cover 1440×900, the reported 858×842, default 800×600, 610×844 and phone 390×844. Assertions verify repeated selection has identical first-row position and page contents, stock does not overflow vertically, all rows stay within stock bounds, pagination reaches every authored offered spell without duplicates, under-level UI/server gates and successful eligible learning. Native keyboard and real touch selection/paging are included.

The first new run failed because a single high-level leader left average-party merchant stock at tier one. The corrected isolated fixture changes only test setup. Five corrected cases pass. The final broad regression passes 21 cases in 2.8 minutes across responsive shop, new spell catalog, chosen-learner learning, canonical swords/gems and axe/staff inventory/loadout/shop art. Updated older tests navigate real stock page buttons instead of assuming every offer is in the DOM simultaneously.

All 120 broad-regression PNGs were inspected via twenty contact sheets and exact source mapping `client/tmp/shop-compact-review-1793033500.json`. An immediate post-rebuild capture showed a brief icon redraw. The final row-retention adjustment addresses that; a separate final 13-case responsive-shop/spell-catalog rerun passes in 1.8 minutes. All 45 final PNGs are inspected via eight contact sheets and the exact mapping `client/tmp/shop-retained-review-1793034200.json`. Final captures are in `client/tmp/shop-responsive-1793024149731/` and `client/tmp/shop-spell-catalog-1793024218839/`; the phone Back-to-stock capture now retains all decoded icons. Representative captures are `858-compact-stable-stock.png`, `390-compact-stable-stock.png` and `390-under-level-disabled.png`.

## Commands and evidence

From client:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/shop-responsive.spec.js e2e/shop-spell-catalog.spec.js e2e/shop-spell-learn.spec.js e2e/canonical-item-art.spec.js e2e/weapon-item-art.spec.js
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/shop-responsive.spec.js e2e/shop-spell-catalog.spec.js
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

Broad native log: `client/tmp/shop-compact-final-native-1793033000.log`. Final retention native log: `client/tmp/shop-compact-retained-native-1793033800.log`. 856 client tests in 99 files, production build and formatting pass. Final client gate logs: `client/tmp/shop-compact-retained-{unit,build,format}-1793033900.log`.

From repository root/server:

```sh
make test
cd server && go test ./api -run 'Test(LearnSpellRejectsPartyMemberBelowRequiredLevel|GetShopItemsIncludesSpellLearnerReasons|ShopSpellLearningCharacterLevelBoundaries)$' -count=1
```

Both Go commands pass. Logs: `client/tmp/shop-compact-go-1793033100.log` and `client/tmp/shop-spell-level-go-1793032700.log`. Shared content and gameplay rules are unchanged; no new balance-simulation result is claimed.

The new spell catalog case and its artifacts are included in the existing hosted gameplay suite. General CI remains on the owner's self-hosted runners. Parent visual CI still needs the previously identified portrait interior return-to-World zoom assertion corrected and rerun; this shop slice does not close that unrelated gate or the wider playability goal.

The client has HMR disabled: save and reload the current owner game to use the new renderer.
