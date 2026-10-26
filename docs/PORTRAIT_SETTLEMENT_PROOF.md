# Portrait settlement camera and scene continuity

PR #339, branch `codex/battle-grounding-walk-lag`, following `ba130a7`.

## Change and scope

The prior phone capture fit the entire 800x576 authored town inside a narrow
portrait canvas, shrinking actors and leaving most of the screen empty.
Settlement now reuses the interior's separate field/UI camera installation with
a settlement-specific 1.65 zoom and bounded player following. Streets pan when
the map exceeds the available field. Desktop framing remains zoom 1.

A single accessible Menu (M) reuses the existing party, journal, inventory and
settings interface. Its region is labelled Settlement controls, and it disposes
on scene shutdown. Movement and interaction honor shared modal locks. Captions
use 16 CSS-pixel text below the phone field; the nearby Old Mill trail button
has at least a 44 CSS-pixel hit target and 16px label. UI stays outside the map
camera. The map's Tiled collision/interaction data, sprites and server transitions
are unchanged.

Do not replay the saved quest-status string as an arrival message. Genuine
transition errors appear at the upper-left field edge, hold 2.4 seconds and fade
for 0.5 seconds. A rejected fetch now unlocks movement and allows retry rather
than leaving the scene permanently animating. The fading callback owns its
specific notice, so an old callback cannot destroy a newer notice.

## Validation

Commands from the worktree, using the worktree-local browser/HOME/XDG folders
and isolated Vite 3610 with API 8689:

- `cd client && npm test`: 831 tests / 97 files pass.
- `cd client && npm run build`: pass, existing bundle-size warning remains.
- `cd client && npx prettier --check --ignore-path .gitignore .`: pass.
- Native `npx playwright test --config=e2e/playwright.config.js e2e/portrait-settlement.spec.js`:
  final five cases pass in 55.1 seconds at 1440x900, 800x600, 390x844,
  375x667 and 540x720.
- Earlier combined `portrait-settlement.spec.js overworld-landmarks.spec.js`:
  eight pass in 1.1 minutes, including the stable landmark save/load round trip.
- `portrait-interior.spec.js --grep '390|800'`: both pass, 30.6/34.2 seconds,
  including touch movement, dialogue, field codex, party menu and room exit.

The new route starts a normal level-one game, walks to the settlement entrance,
uses the named doorway, opens the party menu through M or touch, attempts native
movement under the modal and verifies the player stays put. Phone cases tap a
real projected street tile, then all cases walk to the path below the inn door,
enter the server-owned inn, exit back to the settlement and walk to the world
exit. Checks require the correct camera scale and removal of each prior scene's
DOM navigation. No grants, game-state edits, teleports or direct round submission
are used by this new route.

The 390px case explicitly simulates one failed inn-entry network request. It
checks input unlock, captures the corner error, waits for expiry, then enters the
actual inn successfully. This is a network-failure fixture, not a claim that the
server spontaneously failed. Initial phone checks failed because Rectangle
getters were omitted during JSON serialization; explicit bounds fix that test
without relaxing geometry acceptance. The final inn approach stops on the path
instead of placing the actor inside the doorway.

At 390px: actor display height 51.48 CSS pixels, prompt 16.0875px, trail target
44.3625px high with 16.0875px text. The field spans logical y=120..1129.8 and its
caption ends at 1185.686, before the D-pad top at 1282.

No Go/shared mechanics, DB schema, rewards, encounter pacing or animation atlas
changes. No new Go, balance or integration run is warranted for this client-only
slice. The preceding meadow slice's ordinary Go/data gates remain historical.
This does not establish all-class animation or unassisted first-visit pacing.

## Inspected proof

Relative to this worktree:

- Final route: `client/tmp/portrait-settlement-1792986981242/`: all 35 screenshots
  inspected, with five per-viewport JSON geometry/error audits.
- Phone network/error expiry: `390-network-error-notice.png`,
  `390-notice-expired.png` in that same directory.
- All five final review sheets:
  `client/tmp/settlement-final-review-1793031800-{1440,800,390,375,540}.jpg`.
- Interior regressions: `client/tmp/portrait-interior-1792986706553/`: all 13
  screenshots inspected in `client/tmp/settlement-interior-review-1793031800.jpg`.
- Logs: `client/tmp/settlement-final-1793031400.log`,
  `settlement-native-1793029500.log`,
  `settlement-interior-regression-1793029700.log`, and
  `settlement-{unit,build,format}-final-1793031600.log`.

The new suite and its artifacts are added to the hosted interiors job. Current
head needs its own remote gate. Prior run 40264231869 completed all non-combat
suites but failed three combat message-timing assertions; that separate regression
is reproduced and remains under repair. General CI stays self-hosted per owner.

## Remaining acceptance

This fixes portrait settlement framing and verifies the inn reference route,
menu lock and scene disposal. Other settlement doors, map foreground occlusion,
rotation/resizing during a visit, broader menu font/keyboard acceptance and
unassisted exploration still need their own proof. Wide portrait layouts keep a
shorter panning field above controls; they do not shrink actors to fit the map.
No new map art or collision correction is claimed.
