# Portrait interior framing and input proof

Scope: the normal World → house → quest interaction → dialogue → party menu /
Help → house exit flow. This is presentation and input work on
`codex/battle-grounding-walk-lag`, PR #339. No Go rules, shared content, saves,
walk atlases or combat balance changed.

## Change

Phone interiors use a room camera separate from fixed UI. The room fills the
available width and follows the leader vertically when it cannot fit; actors
keep their size. Header/objective growth reserves room above the play area.
Contextual action text has a reserved strip below the room, outside actors and
touch controls. Dialogue and objective fonts target at least 16 actual CSS
pixels at the tested phone sizes.

Room tap-to-walk now reads Town's actual tile grid (`tiles`), and excludes
fixed UI/control space from room pathfinding. Previously the input handler
required World's `tileData`, so a Town floor tap returned before pathfinding.
A single DOM Menu button replaces the old interior Menu/Help/Mute cluster.
Help and Sound are in the shared party menu with visible H/V shortcuts.
Native Enter/Space on the focused Menu button opens it once without also
interacting with the nearby NPC. Menu controls clean up on returning to World.

## Validation

From the worktree root, with local environment sourced, then `cd client`:

```sh
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
npx playwright test --config=e2e/playwright.config.js \
  e2e/portrait-interior.spec.js e2e/interior-menu-shortcuts.spec.js \
  e2e/exploration-touch.spec.js
```

The final run is recorded in
`client/tmp/interior-final-native-1792995100.log`: all 8 cases passed in
2.9 minutes.
The portrait suite uses native walking/fights in a fresh normal seed-4 game;
it does not teleport, grant items, disable encounters or bypass quest actions.
Viewports: 1440×900, 800×600, 390×844, 375×667 and 540×720.
It checks real floor taps through the zoomed camera, 540px room panning,
quest pickup, readable dialogue, objective clearance after quest progress,
action-prompt separation from room and controls, keyboard Enter on Menu beside
an NPC, Help, Sound toggles, closing overlays and returning to World without
leftover controls. Separate desktop/phone cases exercise keyboard H/V, and
the World touch case checks its existing controls/trail action.

Client commands:

```sh
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

All 811 tests in 96 files passed. Build and full-client formatting passed.
Logs: `client/tmp/interior-final-{client,build,format}-1792995100.log`.
The build retains its existing bundle-size advisory.

All 14 cases of `walk-all-classes.spec.js`, `world-space-cycle.spec.js` and
`world-walk-audit-party.spec.js` passed after the room camera/input changes:
`client/tmp/interior-pan-walk-1792991700.log`. Later changes only adjusted
portrait UI/fonts/menu/prompt spacing; no gait, sprite sheet or movement
mechanic changed. These checks are regression evidence, not a fresh approval
of every animation asset.

## Failures corrected during verification

- Real phone floor taps exposed the old Town grid guard.
- A 375px capture measured a fixed logical font at 15.936 CSS pixels; the font
  helper now derives logical size from the actual canvas scale.
- Quest text growing after pickup could overlap the room; camera reservation
  grows with the objective and does not collapse when a modal hides it.
- Enlarged rooms exposed the old top Help/Mute controls covering NPC space;
  the single Menu entry keeps those actions in one accessible place.
- Screenshot review of the otherwise passing 8-case run exposed action text
  across the leader's torso. The final caption strip removes that occlusion,
  with an explicit actual-game bounds assertion. Dialogue screenshots also
  exposed the stale pickup cue during speech; contextual cues now hide while
  input is locked, and the actual-game regression checks that visibility.
- An intermediate callback invocation error and a shortcut fixture whitespace
  comparison were corrected before the final rerun. Interrupted/failed runs
  are diagnostic evidence, not final acceptance.

This does not establish human first-visit pacing, the remaining battle/art
backlog or all help content. The Codex reference lists still need a separate
shared-content audit. General CI remains self-hosted per the owner's decision;
remote acceptance of this commit is reported separately.

## Inspected captures and local session

All 35 final interior PNGs were inspected via the three contact sheets, with
390px and 540px dialogue also inspected at full resolution:

- `client/tmp/portrait-interior-1792974877639/`
- `client/tmp/interior-final-contact-1792995600-{0,1,2}.jpg`
- `client/tmp/interior-menu-shortcuts-1792974873800/` (4 captures)
- `client/tmp/exploration-touch-1792974869928/touch-world.png`
- `client/tmp/interior-controls-contact-1792995200.jpg`

The shortcut captures verify menu entry/exit and focus, not a full audit of
Codex content/loading. The normal route's Help captures show the loaded entry.
The prior passing caption run (`interior-caption-native-1792994400.log`) is
retained but predates modal cue hiding; final acceptance uses the run above.

The player's latest October 25, 6:43:25 PM CDT autosave was resumed through
the actual 3609 Continue screen. Party state matches the pre-edit capture:
475 gold, 14 potions, 0 Ether, all four level five, 87/153 XP each, and the
same HP/MP. The tab was left on World. Inspected local-session captures:
`client/tmp/interior-player-party-1792994800.png` and
`client/tmp/interior-player-world-1792995400.png`. Main game HTTP returned 200.
Temporary test Vite 3610 is stopped after verification; 3609/API8689 and the
existing local database remain available. No saves were deleted or reset.
