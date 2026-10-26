# Warrior item-use gesture and result cue

PR #339, branch `codex/battle-grounding-walk-lag`, based on `0259d75`.
This slice accepts Warrior item use; it does not close the full Warrior/Cinder
reference, other-class choreography, environment composition or human pacing.

## Problem and resulting behavior

The old item action reused attack frames: both empty hands lifted above the head,
the body moved up 4px, and the target's healing/revival effect waited until the
whole animation returned to guard. The native baseline is retained in
`client/tmp/warrior-item-baseline-1793059000/`.

Warrior now reaches down toward the belt and presents an open glove at lower chest
height, with boots planted. The sword is hidden during the gesture and returns
with the original guard. New poses are in a separate 576×192 RGBA atlas of three
192px cells, not a replacement attack or walk sheet. Shared playback is
0/80ms → 1/150ms → 2/260ms → 1/110ms → 0/80ms. Cue frame 2 presents the item effect
before recovery. No body translation/rotation is authored.

`playItemPresentation` presents the result once at an authored cue, or after
completion for legacy/absent animation. It does not change the Go outcome or
consumption. Only Warrior opts into a new item cue in this shared-data change;
all other shared states compare semantically identical to the parent. The helper
has cue-before-recovery, duplicate-cue and legacy/fallback unit regressions.

## Source and art acceptance

Built-in `image_gen` produced two individually guided frames from the existing
approved identity. The returned tool does not identify its model version. Exact
prompts, reference paths, generated filenames, normalization and source contract:
`art-source/characters/warrior/battle/sword-item/metadata.json`.

Guides: `art-source/characters/warrior/guides/sword-item-{reach,present}.svg`.
Raw source copies and candidate atlas:
`client/tmp/warrior-item-candidate-1793059200/`.
Source frames: `art-source/characters/warrior/battle/sword-item/frame-00.png`
through `frame-02.png`. Runtime:
`client/public/sprites/battle/warrior/sword-item-body.png`.

The original guard cell is unchanged. Generated alpha is retained; occupied
bounds at alpha >8 are cropped and uniformly nearest-neighbor scaled to 164px
high, centered in a 192px cell with occupied bottom y180. This is deterministic
packing, not a full-sheet conversion. Source poses and normalized preview were
inspected before installation. Native frame sequences retain helmet/cape identity,
planted boots, empty gloves and readable forward presentation. This generic item
gesture does not depict an individual bottle or feather in the hand.

## Local gates

From `client/`:

```sh
npm test
npm run build
npx prettier --check src/scenes/battle.js src/scenes/battle_action_playback.js src/scenes/battle_action_playback.test.js src/data/battleCharacters.test.js e2e/warrior-item-use.spec.js
```

860 tests in 99 files pass; build passes with the existing chunk-size advisory.
The first unit run found the new atlas missing from the explicit deduplication
expectation. Added its exact key; retained existing keys and state lookup checks.
The final full suite passes. Initial and final logs are retained.

From repo root:

```sh
make test
make validate-data
python3 skills/kithlands-visual-production/scripts/audit_battle_character_sheets.py --require-complete
python3 skills/kithlands-visual-production/scripts/audit_walk_sheets.py client/public/sprites/walk --classes warrior brawler rogue mender cinder wayfarer knight champion shadow sage pyromancer wanderer --columns 6 --rows 8 --mode enforce
git diff --check
```

All pass. No Go rules, balance, progression, content availability or walk assets
changed; a simulator was not needed for this presentation-only slice. The whole
shared document was briefly reformatted during editing, then restored with only
the Warrior item block replaced. A parsed comparison proves all other shared
values identical to the parent.

Browser environment is `VITE_PORT=3609`,
`PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright"`,
`XDG_CONFIG_HOME="$PWD/tmp/xdg-config"`, `XDG_CACHE_HOME="$PWD/tmp/xdg-cache"`,
scoped to each subprocess from `client/`. Commands:

```sh
npx playwright test --config=e2e/playwright.config.js e2e/warrior-battle-gold.spec.js --grep 'plays every authored' --output=tmp/warrior-item-baseline-1793059000
npx playwright test --config=e2e/playwright.config.js e2e/warrior-item-use.spec.js e2e/warrior-ko-revive.spec.js e2e/warrior-battle-gold.spec.js --output=tmp/warrior-item-native-1793059800
npx playwright test --config=e2e/playwright.config.js e2e/all-class-battle-states.spec.js --output=tmp/warrior-item-all-states-1793060300
```

Final native batch: 11/11 pass; all-class state case: 1/1 pass. Twelve distinct
cases pass, plus the one baseline audit before changes. Direct Playwright safely
reuses the owner services; the wrapper would kill listeners and restart them.
No owner server restart, browser/save interaction or persistence reset occurred.

The three potion cases use a disposable one-Warrior Go fixture, HP10, one granted
potion and an actual Goblin battle. Native Items → Potion → Hero inputs submit a
real combat round; phone uses touch. They verify one item consumed, unchanged
gold, Go item/healing action and return to the approved idle atlas. This is an
isolated motion fixture, not an unassisted first-fifteen-minute route.

At 1440×900 normal, 390×844 phone normal and 800×900 reduced motion, the target
impact occurs exactly once on Warrior item frame 2. Post-render traces have
85/81/18 sampled frames respectively. All sampled container deltas, body rotation,
feet offset and shadow separation are zero; browser and game reduced-motion
flags agree. Existing frame sequences show effect/HP feedback during the gesture,
then original guard restoration. Two native Mender Phoenix Down cases continue
to consume exactly one item and restore the fallen Warrior to 1HP. Six existing
Warrior state/equipment/spell/Defend cases pass without weakening their assertions.

## Inspected evidence

- `client/tmp/warrior-item-use-1793034218210/`: twelve native frame/recovery PNGs,
  three `*-trace.json` files containing Go results, events and sampled motion.
- `client/tmp/warrior-item-native-1793059800/`: 21 Warrior gold captures.
- `client/tmp/warrior-ko-revive-1793034239852/`: four revival captures/results.
- `client/tmp/warrior-item-all-states-1793060300/`: 109 all-class captures.
- `client/tmp/warrior-item-baseline-1793059000/`: eight baseline captures.
- `client/tmp/warrior-item-review-1793060400/index.json`: all 154 source PNGs and
  review pages. Original all-class actor crops cut portrait margins; three
  `portrait-corrected-*` pages preserve the full non-black gameplay viewport and
  were inspected afterward. The all-class review is regression evidence, not
  acceptance of the remaining classes' legacy tilted KO or reused action art.

All listed PNGs, source poses and numeric traces were inspected. No clipping or
separated shadows appeared in the changed action. Existing sparse world art,
Warrior victory/class ability and Cinder's remaining body motions stay open.

Exact local gate logs: `client/tmp/warrior-item-{unit,build}-final-1793060200.log`,
`warrior-item-{go,data}-1793059900.log`,
`warrior-item-contract-final-1793060200.log`, `warrior-item-walk-1793060200.log`,
`warrior-item-native-1793059800.log`, `warrior-item-all-states-1793060300.log`.

Parent `0259d75` visual run 40363809859 is still live; combat-effects, menus,
spell-effects and crafting currently pass. General CI remains queued on the
owner-selected self-hosted setup. This new chunk requires its own remote gate.
