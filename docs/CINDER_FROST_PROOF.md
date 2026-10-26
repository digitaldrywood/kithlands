# Cinder Frost release, contact and recovery

2026-10-25 · `codex/battle-grounding-walk-lag` · draft PR #339.

Frost now selects the `ice` presentation family through `shared/spells.json`.
It has an original faceted release at the authored staff emission point, a
short accelerating ice lance, and a bounded shatter around the target. The
center remains open so the enemy silhouette stays readable. Reduced motion
keeps stationary release/contact cues and removes travel, trails and flying
chips. `battle_ice_fx.js` is the original vector source; no generated atlas,
third-party asset or paid dependency was introduced. This accepts Frost only;
Blizzard and other ice spells have not been expanded to this presentation.

Cinder retains the approved six-pose body, separate staff, authored frame-3
release and following shadow. No class art or spell mechanics changed. The
server still owns damage, target choice, resources and spell availability.
The existing generic cast aura also had a layering defect: it drew over the
healer's face. It now sits at the caster's feet behind the character layer.
The existing fire, healing and status paths were rechecked after that fix.

## Native battle proof

`client/e2e/cinder-frost.spec.js` opens the existing Systems Showcase, then uses
native commands: Warrior Defend → Cinder Spell/Frost/target → remaining party
Defend. Desktop uses keyboard/menu clicks; phone uses touch commands and menu
taps. The test does not submit a debug combat round or replace server results.
The showcase is an explicit high-level fixture, not fresh-player progression.
Its Go-resolved Frost hit deals 7 damage against the resistant Iron Golem.

Three cases: 1440×900 normal motion, 390×844 touch/normal motion, and 800×600
reduced motion. Post-render traces verify:

- release begins on Cinder's authored frame 3, within 1px of the staff source;
- shadow follows within 0.5px and the final state returns to `idle_guard`;
- the cast aura stays at the caster's feet behind the body;
- release → travel → impact stages remain present with reduced motion;
- normal travel covers 604.25 / 624.94 logical pixels; reduced travel is 0;
- damage text first appears at contact, with high-opacity samples lasting
  1358 / 1332 / 1352 ms respectively. Existing text timing was preserved.

The first baseline test used the wrong response field (`spell_id` rather than
`action_id`); corrected before inspecting the passing baseline. The retained
baseline is `client/tmp/cinder-frost-1792975305023/1440-generic.png`.
The first candidate passed all three native cases. Screenshot review then
found the old aura occlusion; the final run follows that renderer correction.

Final proof: `client/tmp/cinder-frost-1792975797320/`, all 43 motion frames and
22 stage/damage/recovery PNGs inspected. Three contact sheets:
`client/tmp/frost-motion-review-{1440,390,800}-1792998100.jpg`.
Stage review: `client/tmp/frost-stages-review-1792998300-{0,1}.jpg`.
Full-size phone and reduced-motion impact images were also inspected.
An actual-game frame sequence is available as
`client/tmp/frost-motion-1440-1792998100.gif` (80ms frame intervals; source
sample timestamps retained beside the frames). It crops the battlefield for
motion review; full canvas and actual-viewport recovery captures remain.

## Normal fresh route

The existing normal phone route passed again with encounters enabled and no
grants, teleports, or direct combat submissions. It gathers herbs/minerals,
buys Frost with starting money, defeats the optional Heron threat, earns
smithing supplies, makes a potion/blade/gem, equips/sockets, fights the mill
bats, and saves/exits/loads. The recorded requests include Cinder choosing
`frost` in the bat battle. All 24 captures inspected:
`client/tmp/first-session-390-1792975714815/` and
`client/tmp/frost-route-review-1792998300-{0,1}.jpg`.
The automated run took 96.8 seconds; this is not human first-visit timing.
The party remains level one on this route, as previously documented.

## Commands and results

From the worktree root: `make test`, `make validate-data`, `make balance-sim`
all passed. The balance smoke ran Warrior/Cinder at levels 1–20, 200 battles
per level, seed 42; no combat balance changed. Logs:
`client/tmp/frost-go-tests-1792996900.log`, `frost-data-1792996900.log`,
`frost-balance-1792997600.log`.

From `client`: `npm test -- --run` (812 tests / 96 files), `npm run build`, and
`npx prettier --check --ignore-path .gitignore .` passed. Build retains its
existing bundle-size advisory. Logs: `tmp/frost-final-{client,build,format}-1792997600.log`.

With the worktree environment sourced at the root, then `cd client`, use:

```sh
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
npx playwright test --config=e2e/playwright.config.js \
  e2e/cinder-frost.spec.js e2e/battle-vfx-gold-slices.spec.js
```

All 9 cases passed in 1.5 minutes:
`tmp/frost-grounded-native-1792997400.log`. The six existing gold cases verify
Fireball, Blaze, Cure, Heala, Mute and reduced-motion Fireball. Their 22 captures
are retained in `tmp/frost-gold-regression-1792997900/` and inspected in
`tmp/frost-gold-review-1792998300-{0,1}.jpg`.
After adding only motion capture to the harness, the final three Frost cases
passed again: `tmp/frost-motion-native-1792997900.log` (41.5 seconds), with
`--output=tmp/frost-motion-native-1792997900`.

The normal-route command uses the same browser environment, plus
`FIRST_SESSION_WIDTH=390`, and runs `e2e/first-session-route.spec.js`
`--output=tmp/frost-normal-route-1792997600`. Its log reports one passing case.

This does not accept all spell families, Cinder's other body actions, all
Warrior abilities, the remaining enemy-role work or human first-visit pacing.
Phone floating damage text still uses the existing font sizing; its CSS size
and crowded critical/status cases need the broader readability pass. The final
phone damage capture also shows the number touching the enemy-name lane; that
existing label-layout issue is tracked rather than accepted by this spell slice. The
active goal and remaining tracker items remain open. No merge or deployment.

The main API was gracefully refreshed to load the shared presentation metadata.
The existing October 25 6:43:25 PM autosave was resumed through Continue, with
475 gold, 14 potions, all four members level five and unchanged HP/MP/XP.
Inspected player-state proof: `client/tmp/frost-player-party-1792998900.png`
and `client/tmp/frost-player-world-1792998900.png`. The tab is left on World.
Temporary test API8690/Vite3610 are stopped after proof; 3609/API8689 and the
existing database remain available. No saves were reset or deleted.
