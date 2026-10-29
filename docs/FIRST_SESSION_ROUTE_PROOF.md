# Native first-session route

Branch `codex/battle-grounding-walk-lag`, draft PR #339. The regression uses a
fresh account through the actual Quick start screen, normal level-one party
and 100 gold. It keeps ordinary encounters enabled, reads state to locate
walkable paths and currently available choices, then sends real arrow keys,
battle commands, target clicks and menu actions. No debug grants, teleports,
direct combat submissions or scripted game-state mutations are used.

The route tracks Old Mill in the shared journal, gathers herbs and ore, walks
through town to the store, buys Frost for Cinder, returns to the mill trail,
fights the optional Heron herd, claims its one-time smithing supplies, brews a
potion, forges the Balanced Trail Sword, refines ore to shards and transmutes
an Ember Gem. It equips/socket-confirms the sword, rests at the cleared bank,
and fights the mill bats using the upgraded party. It saves, exits through
Save and exit, opens Continue, checks one newest adventure with collapsed
history, expands/collapses older snapshots and reloads the newest save.

Reload equality covers gold, party HP/MP/XP/levels/spellbooks, materials, loose
gems, the equipped sword's identity/stats/socket, absolute resource `ready_at`
deadlines, adventure/room and completed actions. Workshop quote fingerprints
are temporary confirmation values; the comparison retains all quoted effects
but excludes their tokens. At least two harvested resources must have positive
saved deadlines, XP must increase, Frost must be learned, and the equipped
sword must have 14 Power and an Ember Gem socket.

The observed two-fight route ends with 28 gold and 24 XP per party member,
all still level one. Level two requires 70 XP. This proves legitimate starter
shopping, crafting, gems and XP progression, not natural leveling. Automated
input knows the route and chooses immediately, so elapsed time is not an
unassisted human first-visit estimate. The walkthrough's fifteen-minute time
budgets remain suggestions.

Phone runs use a 390×844 viewport with keyboard travel and pointer menus.
They verify layout and mixed input; they do not establish a touch-only route.
No new animation or terrain art is accepted by this test. Meadow terrain
patches still need visual composition work; broader Warrior/Cinder motion,
enemy roles, retreat/defeat, reward replay and natural campaign progression
remain tracked separately.

## Validation and retained evidence

Final desktop run passes in 103.594 seconds; phone-width run passes in
104.393 seconds. Both use the final assertions and normal animation speed.
Exact native commands (after sourcing worktree environment from its root):

```sh
cd client
PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/first-session-route.spec.js --output=tmp/first-session-accept-desktop-1792964000
FIRST_SESSION_WIDTH=390 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/first-session-route.spec.js --output=tmp/first-session-accept-phone-1792964000
npm test
npm run build
npx prettier --check --ignore-path .gitignore .
```

All 789 unit tests in 93 files, client build and full formatting pass. No Go,
shared data, persistence schema or runtime presentation code changed in this
chunk, so previous backend/simulator gates remain the applicable evidence.

Inspected all 48 final screenshots through three contact sheets per viewport:

- `client/tmp/first-session-1440-1792959559270/review/sheet-1.jpg` through `sheet-3.jpg`;
- `client/tmp/first-session-390-1792959561177/review/sheet-1.jpg` through `sheet-3.jpg`.

Each source directory also retains `milestones.json`, `requests.json` and
`errors.json` plus 24 original PNGs, including `17-crafted-blade-socketed.png`,
`21-latest-adventure-and-collapsed-history.png`,
`22-older-snapshots-available.png` and `23-normal-save-reloaded.png`.
Playwright videos are in the matching `first-session-accept-*` output paths.
Videos are retained for later motion review; these checks do not confer new
animation acceptance.
The visual workflow runs `e2e/first-session-route.spec.js` and retains its
unique `client/tmp/first-session-*/` captures, milestone/request/error logs,
and Playwright video evidence. The native combat helper waits for a current
actor prompt and uses contextual command/target controls for every member.

General CI stays on `[self-hosted, linux, personal]` by Cory's explicit
instruction; he will restore a runner. The existing hosted visual workflow
remains separate. No runner migration is part of this change.
