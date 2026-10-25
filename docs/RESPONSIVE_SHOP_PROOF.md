# Responsive shop acceptance

2026-10-25 · `codex/battle-grounding-walk-lag` · draft PR #339.

## Problem and implementation

The fixed 800×600 canvas shop shrank body copy and purchase controls to a few
CSS pixels on phones. Moving it vertically did not solve readability. The shop
now uses the existing viewport-dialog boundary and menu theme at browser size.
Desktop has independently scrolling stock and comparison columns. At 620px and
below, stock opens into a full-width preview with Back to stock and fixed
purchase/exit actions. Body text is 16px; actionable controls are at least 46px
high. Existing canonical item art is rendered from the catalog's icon keys.

Every category selects a preview before a transaction. Equipment shows current
and proposed stats for the selected party member. Spells show eligibility from
the server, and authored descriptions from `shared/spells.json`; purchasing
requires a separate Learn confirmation. Rolled equipment displays rarity and
level requirements. The comparison uses one set of current/proposed stats,
instead of redundant zero-value cards that pushed useful deltas below the fold.
Lower evade penalties are now colored as improvements; the focused regression
fails against the previous helper (`client/tmp/shop-penalty-before-1792958900.log`). Supplies likewise require an explicit Buy action.

A single pending-transaction guard covers ordinary purchases, Buy for a member,
and spell learning. It reserves input before any request, keeps controls disabled
through catalog refresh, preserves a committed purchase if the separate equip
request fails, and autosaves the resulting server state. Catalog errors clear
stale offers and provide Retry Stock. Reusable purchases retain the same item
selection while taking its new stock token from the refreshed catalog; a bought
spell or a supply no longer jumps to the first unrelated offer. Receipts remain in a readable live-status
footer. Closing disposes the dialog, restores Phaser input and clears the shop
lock; scene shutdown also disposes it.

The existing dialog provides focus trapping and visible Alt shortcuts. The shop
adds sibling arrow navigation and explicit Enter/Space activation; otherwise
Phaser's global key capture could suppress the browser's default Space click.
Escape returns phone detail to stock and then closes. Touch uses real browser
buttons, with no canvas-scale coordinate conversion.

## Verification scope

The test bridge now reads actual DOM text and control bounds when this shop is
open, retaining its canvas behavior elsewhere. It does not manufacture canvas
objects or labels. Existing stock/purchase tests retain exact server-owned offer,
item, spellbook, gold and persistence assertions. The comparison fixture now
enters the real settlement shop and checks deltas against its actual equipped
starter gear; the old direct scene fixture was outside a server-owned shop.
Its inventory follow-up uses the current Character screen.

New native-input cases start a normal fresh party, walk through the settlement
and merchant dialogue, inspect stock/armor, spend 25 of the real starting 100
gold to equip Leather Armor, attempt repeated input during a delayed response,
then close and walk back around the shop furniture. No grants, teleports,
forced encounters or direct purchase submissions are used in these cases.
They cover desktop 1440×900, default 800×600, 610×844 and phone 390×844,
including Tab/Shift+Tab, arrows, Enter/Space, shortcuts and touchscreen input.

## Limits

Legacy catalog entries such as Leather Armor still have no authored icon. The
shop does not invent an unrelated picture for them. Canonical sword/gem image
checks remain separate. This UI change does not establish natural leveling time,
complete the fifteen-minute route, or accept every other menu. General CI still
requires the configured self-hosted runner; its infrastructure choice is pending.
The previous opening-flow commit `ae261a1` passes all hosted visual suites and
the protected summary in run `40224987112`.

## Validation commands and retained proof

- `cd client && npm test`: 789 tests in 93 files pass.
- `cd client && npm run build`: pass, with the existing bundle-size warning.
- `cd client && npx prettier --check --ignore-path .gitignore .`: pass.
- Final output logs: `client/tmp/shop-polish-{unit,build,format}-1792959300.log`.
- Native shop gate (worktree environment sourced before entering `client/`):
  `npx playwright test --config=e2e/playwright.config.js e2e/shop-responsive.spec.js e2e/shop-buy-flow.spec.js e2e/shop-compare.spec.js e2e/shop-spell-learn.spec.js e2e/merchant-stock-authority.spec.js e2e/canonical-item-art.spec.js e2e/opening-integration.spec.js --output=tmp/shop-final-1792959500`:
  **all 18 pass, 2.6 minutes**. The supply checks buy Forge flux with real gold
  and retain its selected preview after refresh; both normal spell-purchase
  cases retain the Frost preview and server-owned learned status.
- Authored route integration:
  `npx playwright test --config=e2e/playwright.config.js e2e/old-mill-adventure.spec.js --grep 'complete authored Old Mill route' --output=tmp/shop-mill-integration-1792958700`:
  both desktop and phone pass, 5.4 minutes total. Its advanced recipes use an
  explicit level fixture, so this does not establish natural leveling or a
  first-time fifteen-minute duration. It ran before the final presentation and
  selection-retention polish; the final shop gate checks those changes.
- Inspected all 60 retained route captures through seven review sheets in
  `client/tmp/old-mill-1792956649654/review/`, including supply purchases,
  crafting, equipment, journal completion, shortcut/reward replay and save/load.
- The initial 18-case gate passed; all 75 retained captures were inspected through
  nine sheets in `client/tmp/shop-review-1792959000/`, with phone and desktop
  previews also inspected at full size. These captures exposed the redundant
  cards and incorrect penalty color, which prompted the final polish.

Inspected all 91 final screenshots through eight sheets and their manifest in
`client/tmp/shop-final-review-1792959800/`. Also inspected the final
`390-compare.png`, `390-equipped.png` and `1440-compare.png` in
`client/tmp/shop-responsive-1792957197179/` at full size. Native geometry checks
require every comparison delta above the phone preview boundary before buying.
Other final captures are in `client/tmp/opening-integration-1792957158437/`,
`client/tmp/canonical-art-1792957083120/`,
`client/tmp/modern-shop-1792957185594/`, `client/e2e/tmp/`, and
`client/tmp/merchant-stock-authority/proof/`. The workflow includes all seven
native specs and retains these unique screenshots.

No Go mechanics, prices, content files, persistence or walk atlases changed in
this slice. Shared spell descriptions are read for display only. Live services
and existing saves were retained.
