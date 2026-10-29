# Consistent optional objectives in town and interiors

PR #339, branch `codex/battle-grounding-walk-lag`, follows76f4a4a.

## Behavior

Town and Settlement now reuse the field/adventure Objective disclosure and the
same quest-journal model. The permanent campaign-only interior banner is gone.
The disclosure starts closed, shows the selected local story or campaign,
opens the existing journal, and refreshes after changing tracking or receiving
server quest progress. Campaign custody (parcel, clue, escorted traveler) is
part of the common model. Quest interaction eligibility still uses authoritative
campaign actions and the nearby keeper; tracking a local story does not gate
those mechanics.

The shared interior HUD hides during dialogue and modal menus and is removed
on scene shutdown. Its objective sits below fixed headers/trail controls.
Once reserved, the header lane remains stable when movement temporarily hides
the trail button. Browser bounds are cached at resize; unchanged objective text
and position are not rewritten every frame.

Escape closes an expanded interior objective and focuses the game canvas,
allowing arrows/WASD to resume movement. The shared disclosure permits the
scene's M menu shortcut while containing other character/movement input.
Native input checks caught both a swallowed M and retained movement focus in
early candidates; those candidates were corrected before acceptance.

World arrival messages that exactly echo the current campaign action are
presented using the tracked local-story detail when another story is selected.
Other messages, including rewards/errors/flavor, are unchanged. Unit coverage
checks both remapping and preservation. This is presentation only: no Go rules,
content, save format, rewards, gathering timers or animation assets changed.

## Revalidated town shortcut

The UI-only audit's apparently missing town shortcut was not reproduced at a
settled position. The initial800native diagnostic passed before this change:
`client/tmp/trail-return-before-20261026.log`. The button is intentionally hidden
while a tile animation is running. No speculative lifecycle patch was made.

Expanded final checks purchase Frost, return from the store, walk to12,15,
assert the active visible Old Mill button and matching server location, then
actually click/tap it and enter Dungeon. All three viewport cases pass. This
replaces the earlier provisional shortcut-regression diagnosis with evidence.

## Actual-game evidence

Five portrait-interior cases pass at1440×900,800×600,390×844,375×667 and540×720.
They retain normal movement, camera/panning, keeper interaction, real quest
collection, updated action/custody, dialogue, party menu, help and world return
checks. They additionally open/close the optional objective and assert canvas
focus. The room-clearance check now measures the fixed room header; the
removed canvas objective is not used as a layout anchor.

Log: `client/tmp/objective-native-accepted-20261026.log` contains these five
passes, then two shop passes and one phone fixture failure. The phone failure
was an exact `Quest journal Q` locator: mobile hides the keyboard badge. A
prefix locator matches the visible action at both sizes. An earlier fixture
also assumed Fetch while the actual seed produced Bandit Clearing; it now
reads the campaign name instead. These failures are retained, not called game
regressions.

Final shop run: all three cases pass in39.7seconds. Log:
`client/tmp/objective-shop-final-20261026.log`. It verifies the painted steps
and solid roof, in-room local-story tracking, opening the shared journal,
switching to campaign, collapsed disclosure/canvas focus, straight counter
approach, real100gold Frost purchase, exact retained party and town anchor,
and keyboard/pointer/touch entry to the trail after shop return.

The full normal phone opening also passed in95.6seconds while this slice was
under development: `client/tmp/objective-opening-phone-20261026.log`, proof
`client/tmp/first-session-390-1793065075206/`. It connects gathering, shop/spell,
optional combat, earned supplies, potion/sword/shards/gem crafting,
equipment/socketing, bank rest, mill bats and normal save/history/load. It
uses seeded route knowledge and native inputs, not grants or direct combat
submissions. Its duration is a regression result, not human timing. Final
focus behavior is covered by the subsequent store/interior checks above.

All97 accepted PNGs were opened and inspected:

-40interior images: `client/tmp/portrait-interior-1793065255241/`, seven contact
 pages with exact source mappings at `client/tmp/objective-interior-review-20261026/index.json`.
-33final shop images: `client/tmp/shop-approach-1793065534381/`, six pages at
 `client/tmp/objective-shop-final-review-20261026/index.json`.
-24phone opening images: four pages at
 `client/tmp/objective-opening-review-20261026/index.json`.

Labels are contained, the closed disclosure leaves the room visible, expanded
quest/custody text is readable, headers stay unobscured, modal screens hide the
field control, and the settled gate offers both Old Mill and Leave town.
Native shop videos are retained under `client/tmp/objective-shop-final-20261026/`.
No new all-class walk or frame/contact art approval is claimed.

## Commands and gates

From client, using the existing isolated services (Vite3614/API8693):

```sh
VITE_PORT=3614 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/shop-approach-alignment.spec.js e2e/portrait-interior.spec.js --max-failures=1 --output=tmp/objective-native-accepted-20261026
VITE_PORT=3614 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/shop-approach-alignment.spec.js --max-failures=1 --output=tmp/objective-shop-final-20261026
VITE_PORT=3614 FIRST_SESSION_WIDTH=390 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/first-session-route.spec.js --output=tmp/objective-opening-phone-20261026
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

873client tests in100files, build and full formatting pass; logs
`client/tmp/objective-accepted-{unit,build,format}-20261026.log`.
`git diff --check` passes. No mechanics/content/DB change warrants a new Go,
data or balance result. The two extended native specs already run in hosted
interiors and their evidence folders are retained by the workflow.

Owner3609 service, tab and saves were not restarted, reset or reloaded.
New-head CI remains required; parent76f4a4a has eleven visual jobs passed and
adventure-recovery still running at the last inspection. General CI remains
self-hosted per owner instruction. Full environment/reference-combat approval,
merchant pacing and first-session reward/pacing acceptance remain open.
