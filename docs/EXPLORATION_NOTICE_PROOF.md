# Exploration notices and shop test input

## Exploration layout

The Q04 phone recovery capture showed a long notice behind the entrance button.
Notices used a fixed `bottom: 76px`, while the entrance, trail and menu controls
could occupy several rows. The notice now participates in that same bottom
stack, aligned to the left above the controls. Hiding it leaves the controls at
their existing positions. Fade timing and game rules are unchanged. A renderer-derived margin also
keeps notices above the painted touch controls.

Before: `client/tmp/notice-before-overlap-1792977300.log` fails the three viewport
geometry assertions with the old layout. The earlier actual recovery overlap is
visible in `client/tmp/campaign-first-level-1792964010621/390-04-quest-defeat-recovered.png`.

After: `client/tmp/notice-merchant-complete-1792978000.log`, seven passes in 1.6
minutes. Three notice cases cover 1440×900, 800×600 and 390×844 with:

- an actual save through the party menu;
- a deliberately simulated HTTP 503 save response to exercise a long error;
- actual walking and herb gathering through normal server actions;
- notice containment, spacing above all visible controls, expiry and stable
  entrance-button position after expiry;
- keyboard confirmation on desktop and touch menu/save/gather controls on phone.

The simulated error is a UI fixture, not evidence of a real server outage. RNG
seed 6 selects a repeatable normal route; resources and combat rules are unchanged.
No item/XP grants, teleports, disabled encounters or browser save state are used
by these notice cases.

All 15 notice captures in `client/tmp/exploration-notice-1792965902981/` and 15
merchant captures with run suffix `1792965942331` in
`client/tmp/merchant-stock-authority/proof/` were inspected in a contact sheet.
Long desktop/default/phone notices and the phone shop were also inspected at
full size. Key notice images are `390-long-error.png`, `800-long-error.png`,
`390-gathered.png`, and `390-gathering-expired.png`.

## Touch controls

The additional active-touch capture exposed a canvas overlap missed by the DOM
button-only assertion: `client/tmp/exploration-notice-1792967053099/390-gathered.png`.
The D-pad's circular reserve was smaller than its square arrow buttons in both
portrait and landscape. Two new viewport invariants fail before the bounds fix
(`client/tmp/dpad-bounds-before-1792979200.log`) and pass after it.

The shared reserved area now includes the complete painted D-pad. The notice
uses its logical top, transformed into canvas CSS coordinates, to add only the
spacing needed above those controls. Measurement ignores the notice's fade
transform, preserving its upward fade instead of cancelling it. This also keeps
taps on the painted arrow edges out of the map tap-to-walk region.

Final presentation/input run: `client/tmp/notice-touch-final-1792979500.log`,
four passes in 43.3 seconds. All 15 final notice images in
`client/tmp/exploration-notice-1792967671431/` plus
`client/tmp/exploration-touch-1792967710331/touch-world.png` were inspected;
phone gathering and long-error images were also inspected at full size. The
notice test checks actual painted controls independently of the reserved-area
calculation. The touch smoke taps an arrow's outer edge, requires exactly one
upward tile with no map auto-walk, then exercises Menu/Keep playing/Old Mill.
That existing touch smoke uses its no-encounters fixture to isolate input;
it does not establish natural campaign pacing. The notice cases keep ordinary
encounters enabled.

## Shop test timing

Hosted run 40234592043 failed in the phone merchant fixture's **second** World
entrance tap (`triggerSceneAction` at its former line 133). The helper retried
after 200 ms even though the real door transition includes an awaited server
request and a 300 ms fade. That tap could wait on a disappearing DOM button.

Removing the blind retry exposed a different fixture assumption: canvas scenes
reserve their first actual touch for revealing mobile controls. A local retained
trace confirms the Settlement did not enter Town after the initial activation
touch. The helper now checks for the visible A control, reveals it if needed,
waits for Phaser's input registration frames, and confirms the door once.
Callers retain their existing destination-scene assertions.

The merchant fixture selects normal RNG seed 4 so an unrelated randomly chosen
campaign fight cannot replace a shop entrance. First-failure tracing is retained.
No forced tap, increased timeout, skipped assertion or relaxed stock guard was
introduced. All three catalog viewport cases and the catalog-error recovery
case pass, including real purchases, offer identity, rejection of fabricated
stats, save/load and stock equality. Their travel setup still uses existing
test-bridge fixtures; they are not evidence of unassisted first-session pacing.

## Crowded world-shop approach

Run 40237050416 passes the campaign, walking and interior jobs, but its gameplay
job failed when the world-shop fixture repeatedly spoke to the Blacksmith.
The retained screenshot is
`client/tmp/ci5c-gameplay-1792978200/home/runner/work/kithlands/kithlands/client/test-results/world-shop-entry-direct-wo-8fd5d-nd-returns-correctly-at-774-chromium/world-shop-failed-1792965850307.png`.

The authored `shop_household_shop_01` explains the failure: the old planner
stopped at (13,7), two tiles from the proprietor at (13,5), but one tile from
the other NPC at (14,7). The game's nearest-NPC selection was correct. A fixed
normal RNG seed of 24 reproduces that room. The regression keeps an explicit
runtime assertion that the planned tile actually selects the proprietor.
With the old planner it fails in
`client/tmp/shop-proprietor-crowded-before-1792978500.log`.

The corrected planner requires the proprietor to be the closest NPC and avoids
chest/hidden-item interaction priority. It then walks normally, checks the
actual selected NPC, opens the shop, purchases and returns through the normal
flow. The authored room identity is asserted so content changes cannot silently
remove this regression case. This changes the test route, not NPC interaction
rules or shop authority.

After: `client/tmp/shop-proprietor-after-1792978600.log`, three passes in 1.8
minutes at 1440×900, 774×900 and 390×844. All nine captures in
`client/tmp/world-shop-entry-1792966698539/` were inspected, along with the
before-fix failure image. The 774px stock screen still wraps long names inside
a word; that separate readability issue remains in the tracker.

## Commands

```sh
source scripts/worktree-env.sh
source .envrc.local
cd client
PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
npx playwright test --config=e2e/playwright.config.js \
  e2e/exploration-notice-layout.spec.js e2e/merchant-stock-authority.spec.js \
  --output=tmp/notice-merchant-complete-1792978000
# Same environment; crowded-room before/after fixture:
npx playwright test --config=e2e/playwright.config.js \
  e2e/world-shop-entry.spec.js --output=tmp/shop-proprietor-after-1792978600
npx playwright test --config=e2e/playwright.config.js \
  e2e/exploration-notice-layout.spec.js e2e/exploration-touch.spec.js \
  --output=tmp/notice-touch-final-1792979500
npm test
npm run build
npx prettier --check --ignore-path .gitignore .
```

Client gate: 799 tests across 94 files, production build and full formatting
pass. The build retains its existing large-chunk advisory. No Go/shared changes
were made in this slice. CI runs the new notice check and retains its captures.
The full playability goal and remote CI acceptance remain open.
