# UI-only opening playthrough and merchant CI repair

PR #339, `codex/battle-grounding-walk-lag`, starting head `87e510d`.

## What was played

A fresh Quick start adventure on Vite3614/API8693 was played using visible
menus, screenshots, held movement keys and actual pointer/keyboard actions.
No seed override, direct game API, test bridge, state inspection, grants or
route-planning helper was used in this playthrough. It used an isolated local
browser profile and account; the owner3609 tab, server and saves were untouched.
The in-app browser backend was unavailable, so local Playwright supplied the
separate browser. Browser-control calls and screenshot inspection introduce
substantial pauses: this is an agent usability audit, not a human timing study.

The route completed:

1. Read the shared journal and tracked Old Mill.
2. Walked to visible meadow herbs and rocky iron outcrop; gathered three herbs
   and four ore through their normal interaction controls.
3. Entered Cadott town, walked to the store steps, entered its interior and
   reached the merchant through the central aisle. Advanced the three greeting
   lines. Bought Frost for Sparks with the starting100gold.
4. Returned to the south gate, left town and took the world Old Mill entrance.
   Found optional Heron Pool through More routes, read the level2 herd preview
   and chose Fight.
5. Fought three rounds using Warrior attacks, Cinder Spark, companion attacks
   and the visible Repeat control. Won20gold and18XP per companion.
6. Recovered the millwright supply box: eight ore, two hardwood and the unique
   bronze pommel. Brewed a potion, forged Balanced Trail Sword, refined three
   ore into shards, transmuted an Ember Gem and socketed it into that blade.
   Equipped it through Character: Attack26→34 and Hit11→25.
7. Rested at the now-safe bank. Returned to the split oak and beat the mill
   bats using the equipped sword and purchased Frost.
8. Saved normally, refreshed, used Continue/latest adventure, and returned to
   the same cleared trail. Inspected the retained equipped sword and party.

Observed finish:28gold, seven potions,24XP per companion, all still level1.
Hero35/35HP, Sparks25/25HP and8/10MP, Shade27/30HP, Willow28/28HP and10/10MP.
The browser recorded zero page exceptions. This agrees with the separate
scripted normal-game opening route; it does not imply a guaranteed level-up.

## Evidence and limits

`client/tmp/ui-route-1793061645463/` contains45PNG, `notes.json` with UI
snapshots/timestamps, and `result.json`. All45captures were inspected on eight
pages at `client/tmp/ui-route-review-20261026/index.json`. Some captures precede
asynchronous rendering/asset completion; adjacent UI observations establish
completion. The loaded equipment capture alone is not new icon acceptance.

A retained browser recording is
`video/page@f0eadb1aee95acdaa404f284305a4c98.webm` (ffprobe2015.52seconds).
The second video is the initially blank context page. Closing the browser
exceeded the tool observation timeout after route completion; the resulting
files remain readable. Thirty-nine sampled frames from the herb interaction
and final herd round were inspected on seven contact pages under
`client/tmp/ui-route-motion-review-20261026/contact/index.json`. The herb
sample is mostly stopped interaction, not an all-class movement gate. The
combat sample shows readable per-hit numbers, Spark, enemy reaction, Warrior
finishing blow and victory. Existing detailed animation traces remain the
contact-timing/reduced-motion proof.

Remaining friction found here:

- The town Old Mill shortcut is visible on initial entry but absent after shop
  return at the south junction. World entry still works; repair this lifecycle.
- Arrival guidance shows the campaign errand despite the previously selected
  local story. Reconcile arrival guidance with journal selection.
- Three merchant flavor lines must be advanced before stock. Evaluate a direct
  trade action/short greeting without discarding NPC conversation.
- The optional threat and supplies require More routes. The audit can find
  them from the text, but this remains discoverability work.

This1280×900 audit uses pointer and keyboard. Existing desktop/phone native
opening evidence remains valid; no wholly touch-only or first-time-human
fifteen-minute claim is added. Campaign level-ups are verified separately.
Terrain composition and final reference-combat acceptance remain open.

## Latest CI failure and correction

Hosted run40427507776 is terminal: eleven visual suites pass, shops fails, and
the aggregate walking gate fails because it depends on shops. The walking
visual job itself passed. All four shop failures are in merchant-stock-authority
at `move up at18,9`: its old authored route attempts the newly solid roof row8.
The other37shop cases passed. Failure log:
`client/tmp/head-87e510d-ci-failures-20261026.log`.

The merchant fixture now stops at row9, beside the painted steps. The first
local rerun then exposed a second stale fixture assumption: shop return waited
for no interaction, although the return anchor is now beside the door. It
reached its150second timeout; the repeated run was interrupted after that
confirmed failure. The final fixture waits for the transition to settle and
explicitly asserts `general-store-door`, then walks the original south exit
path. Exact rolled-offer identity, price/gold, stale-offer rejection, inventory
and stock persistence, catalog outage/retry assertions are unchanged.

Final command from client:

```sh
VITE_PORT=3614 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/merchant-stock-authority.spec.js --max-failures=1 --output=tmp/merchant-step-route-final-20261026
npx prettier --check e2e/merchant-stock-authority.spec.js
```

All four cases pass in57.3seconds across800×600,1440×900 and390×844 plus the
catalog-failure case. Log: `client/tmp/merchant-step-route-final-20261026.log`.
All15final screenshots with suffix1793063928779 were inspected on three pages
at `client/tmp/merchant-step-route-final-review-20261026/contact/index.json`.
`git diff --check` and targeted formatting pass. This chunk changes only the
fixture and documentation; it does not claim a new runtime build, unit suite,
Go/data or simulator result. New-head hosted acceptance is still required.
General CI remains self-hosted per owner instruction.
