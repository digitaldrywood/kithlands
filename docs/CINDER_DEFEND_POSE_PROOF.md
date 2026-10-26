# Cinder planted Defend pose

PR #339, branch `codex/battle-grounding-walk-lag`, parent `4482a14`.
This accepts Cinder Defend. Cinder item/victory/melee, integrated elemental/melee
acceptance, environments, menus/gems/icons and human first-visit pacing remain
open. Warrior/Cinder have no class abilities in current shared content.

## Audit and original art

Cinder previously inherited caster Defend: casting frames0/1/5 with body shifts
(3,3)/(5,5). Baseline inspected:
`client/tmp/cinder-ko-native-1793064800/all-class-battle-states-al-8c6b6-s-for-all-twelve-identities-chromium/all-class-cinder-defend-desktop-1793036655007.png`.

An explicit shared Defend state now uses a 576×192 RGBA atlas of three192px
cells: unchanged cast guard, settling stance, low brace with open guarding palm.
The staff remains separate at authored grips; shadow and body container stay
fixed. Frames0/1/2/2/1/0 last80/100/120/220/100/100ms with cue2. Reduced motion
uses existing playback frames1/2/0 and45ms steps; no new animation engine logic.

Built-in `image_gen` generated one guided brace pose, then one settling pose
using the original identity and brace for continuity. Model identifier was not
returned. Exact prompts, guide references, output filenames and normalization:
`art-source/characters/cinder/battle/staff-defend/metadata.json`.
Guides: `art-source/characters/cinder/guides/staff-defend-{brace,settle}.svg`.
Sources: `art-source/characters/cinder/battle/staff-defend/frame-{00,01,02}.png`.
Runtime: `client/public/sprites/battle/cinder/staff-defend-body.png`.
Raw output/normalized candidate review: `client/tmp/cinder-defend-candidate-1793067600/`.

Source alpha preserved, occupied alpha>8 bounds uniformly nearest-neighbor scaled
to162px settling and154px brace heights. Both retain occupied bottom y182 and
container anchor(96,184). The robe spreads as knees bend; head/hat identity,
black face/two cyan eyes, purple/gold layers and clasp are retained. Source
frames, real renderer sequence, return to idle and staff grip were inspected.

Parsed shared comparison proves only Cinder Defend changed. No runtime JS/Go
logic, cast/hit/KO/walk pixels or combat/progression/pacing rules changed.

## Native normal-route acceptance

Direct Playwright reused owner services, keeping sessions and saves intact;
the wrapper terminates occupied listeners, so it was not used. From `client/`:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/cinder-defend-route.spec.js --output=tmp/cinder-defend-wired-1793068500
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/all-class-battle-states.spec.js --output=tmp/cinder-defend-all-states-1793068900
```

Three native routes pass:1440desktop keyboard,390phone touch and800reduced motion.
Each starts a real fresh starter party, enters Old Mill's Heron Trail encounter,
submits four native Defend commands, verifies four Go Defend results and Cinder
body/attachment frames, then fights normally, acknowledges victory and returns
to the usable trail. No debug levels/items/rewards/teleport/force-victory.
Actual browser/game reduced-motion flags match. Sampled bodyX/angle/feet/shadow
deltas are zero; staff remains visible with the equipped War Staff texture;
original cast guard returns after playback. All-class state lookup, equipped
layers, reset/held KO and portrait assertions pass. Legacy generic poses are
regression coverage, not visual approval of other classes.

All124 current PNGs inspected:15 native pose/idle/trail images in
`client/tmp/cinder-defend-route-1793038298788/` and109 all-class images in
`client/tmp/cinder-defend-all-states-1793068900/`.
Review map: `client/tmp/cinder-defend-review-1793069100/index.json`;
three native pages, ten state pages, `staff-grip-closeup.png` and
`portrait-corrected.jpg`. First portrait review crops cut off some heads; the
corrected full-width upper-battle review includes all12 complete KO silhouettes.
Three native JSON traces retain Go results and postrender observations; three
route videos remain in the Playwright output. Acceptance uses inspected frame
sequences and traces, not merely a video file's existence.

Review exposed an existing Old Mill Objective-toggle overlap with Party at800px
after battle. It is recorded in the tracker for the next integration fix; this
pose slice does not claim that layout fixed.

## Local gates, retained failures and limits

861 tests/99 files, production build, full client formatting pass:

```sh
cd client && npm test
cd client && npm run build
cd client && npx prettier --check --ignore-path .gitignore .
```

From repository root:

```sh
make test
make validate-data
python3 skills/kithlands-visual-production/scripts/audit_battle_character_sheets.py --require-complete
python3 skills/kithlands-visual-production/scripts/audit_walk_sheets.py client/public/sprites/walk --classes warrior brawler rogue mender cinder wayfarer knight champion shadow sage pyromancer wanderer --columns 6 --rows 8 --mode enforce
git diff --check
```

All pass. No mechanic/balance/pacing change, so no new simulator needed. No walk
asset changed. Full-client unit log initially had860passes/onefailure because
the exact deduplicated asset-order expectation placed Defend after KO; production
vocabulary expands Defend before hit/KO. Corrected exact order retains all keys
and state assertions, final861pass.

An initial browser run started after a manifest-edit assertion failed and used
old poses/partly updated wiring. It failed all three checks and is retained in
`client/tmp/cinder-defend-native-1793068200.log`; it is not acceptance evidence.
Clean final rerun above passes. Logs:
`client/tmp/cinder-defend-{unit,build}-1793068500.log`,
`cinder-defend-unit-final-1793068800.log`,
`cinder-defend-{go,data,contract,walk}-1793068600.log`,
`cinder-defend-format-1793069000.log`, `cinder-defend-wired-1793068500.log`,
`cinder-defend-all-states-1793068900.log`.

Hosted combat CI includes the new three-route spec and uploads its evidence.
Parent4482a14 visual CI40374496973 remains live at writing. General CI remains
on owner-selected self-hosted labels; latest repository runner inventory was
empty. New head requires remote acceptance. No owner browser, server restart,
DB reset, save reset or browser persistence was used.
