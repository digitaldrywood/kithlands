# Cinder surviving-hit body reaction

PR #339, branch `codex/battle-grounding-walk-lag`, based on pushed `75ffce6`.
This accepts surviving Cinder hits, not KO, Defend, item, victory, physical attack
or the full reference identity. Broader environment/menu/pacing work stays open.

## Audit and change

Current shared Warrior and Cinder class records both have `abilities: []`.
Cinder already has a six-pose cast with inspected Frost/lightning references.
No unused Warrior ability pose or replacement cast was added. Actual ability
choreography for classes with abilities remains in the larger goal.

Cinder previously inherited the caster hit recipe: idle first, then translated
and tilted casting frames. The baseline native capture remains in
`client/tmp/warrior-item-all-states-1793060300/` as
`all-class-cinder-hit_reaction-desktop-1793034290598.png`.

An explicit Cinder `hit_reaction` now selects
`client/public/sprites/battle/cinder/staff-hit-body.png`, a 576×192 RGBA atlas
of three 192px cells. Guard is copied unchanged from cast frame 0; new flinch and
recovery cells retain the same 167px occupied height and bottom y182. Playback
starts on flinch frame 1 (95ms), recovery frame 2 (120ms), guard frame 0 (90ms).
Cue frame 1 retains the flinch under reduced motion. No body offsets/rotation.
Staff remains a separate item-selected layer: flinch/recovery grip (21,18), guard
(27,13), angle 8°, back layer as in the existing staff profile.

A parsed comparison proves all other shared values identical to the parent.
No runtime JS/Go logic, cast/walk pixels, balance or progression rules changed.
The cast source metadata's stale `visual_approval_pending` flag is reconciled to
the already documented aggregate/runtime acceptance and current native Frost
regressions; this is a metadata audit correction, not regenerated art.

## Source production

Built-in `image_gen` generated one guided pose per call from the accepted Cinder
identity. Model identifier was not returned. Recovery also references the prior
flinch for continuity. Exact prompts, source/generated filenames, guides and
normalization are retained in
`art-source/characters/cinder/battle/staff-hit/metadata.json`.
Sources: `art-source/characters/cinder/battle/staff-hit/frame-00.png` through
`frame-02.png`; guides: `art-source/characters/cinder/guides/staff-hit-{flinch,recover}.svg`.
Raw copies and normalized candidate preview:
`client/tmp/cinder-hit-candidate-1793063200/`.

Generated alpha is preserved, occupied alpha>8 bounds uniformly nearest-neighbor
scaled to 167px, then centered in a 192px cell with occupied bottom y182. Source
poses and normalized cells were inspected before runtime use. Native close-up
retains the bent hat, two cyan eyes, layered purple robes, grounded hem and staff
grip; the near hand flinches toward the brim then lowers during recovery.

## Validation commands and results

From `client/`:

```sh
npm test
npm run build
npx prettier --check --ignore-path .gitignore .
```

860 tests / 99 files, build and formatting pass. Existing build chunk-size advisory
remains. Asset deduplication expectation includes the exact new atlas key and
retains the prior keys/state lookup checks.

From repo root:

```sh
make test
make validate-data
python3 skills/kithlands-visual-production/scripts/audit_battle_character_sheets.py --require-complete
python3 skills/kithlands-visual-production/scripts/audit_walk_sheets.py client/public/sprites/walk --classes warrior brawler rogue mender cinder wayfarer knight champion shadow sage pyromancer wanderer --columns 6 --rows 8 --mode enforce
git diff --check
```

All pass. No gameplay/balance change, so no new simulator required. No walking
asset changed; the accepted native walk geometry remains intact.

Browser environment, scoped to the subprocess from `client/`:
`VITE_PORT=3609`, `PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright"`,
`XDG_CONFIG_HOME="$PWD/tmp/xdg-config"`, `XDG_CACHE_HOME="$PWD/tmp/xdg-cache"`.

```sh
npx playwright test --config=e2e/playwright.config.js e2e/cinder-hit-reaction.spec.js e2e/cinder-frost.spec.js --output=tmp/cinder-hit-native-1793063500
```

All seven cases pass. Three new real-hit cases at 1440×900 normal, 390×844 phone
touch normal and 800×600 reduced motion create a disposable one-Cinder starter
party and a Go-controlled level-one Goblin encounter. Native Defend resolves a
real hit, reduces HP25→24, plays flinch/recovery and restores the original guard.
No fabricated hit log or debug victory is injected. This isolates reaction art;
it does not verify unassisted opening pacing or natural lethal-hit behavior.

Contact-to-reaction callback gap is 1.7ms desktop, 1.2ms phone and 1.6ms reduced.
The body immediately begins on frame 1. Sampled body angle, feet offset and shadow
distance are zero. Normal container shake remains 3px; reduced motion is 0px,
with browser/game flags both checked. Incoming-hit effects and HP feedback remain
in the existing synchronized path. Staff/robe identity and return to guard are
inspected, not inferred only from these measurements.

Four unchanged native Frost cases at desktop/390px/375px/reduced motion verify
real spell release, contact, damage/HP feedback and recovery. The accepted cast
body/staff and spell mechanics are preserved.

## Inspected evidence and limits

All 101 current PNGs inspected:

- `client/tmp/cinder-hit-reaction-1793035852714/`: twelve reaction/guard PNGs,
  three Go-result/motion `*-trace.json` files.
- `client/tmp/cinder-frost-1793035777308/`: 89 cast/release/travel/contact/damage/
  recovery PNGs and motion evidence.
- `client/tmp/cinder-hit-review-1793063900/index.json`: seventeen contact pages
  mapping every source PNG, plus `staff-grip-closeup.png` for all three hit cells.
- Original guard/recovery sources and new normalized source preview also inspected.

All reported current evidence belongs to this run. Baseline all-class capture
is explicitly earlier and unchanged. This does not accept Cinder's remaining
reused defensive/KO/item/victory/melee bodies, or other classes' choreography.
No new rewards/persistence changes required save/replay testing for this art slice;
existing integrated save/recovery proof remains in the tracker.

Logs: `client/tmp/cinder-hit-{unit,build,format,go,data,walk}-1793063600.log`,
`cinder-hit-contract-1793063500.log`, `cinder-hit-native-1793063500.log`.

Owner API/services/sessions/saves were preserved. Direct Playwright reuses them;
the wrapper would terminate occupied listeners. No server restart, owner browser
interaction, DB reset or browser persistence was performed.

Current GitHub repository runner inventory returns `[]`; general CI remains
queued on the owner-selected self-hosted labels. Parent item-use visual run
40365978612 and victory run 40367882047 are live; `0259d75` already passed all
eleven visual suites plus protected summary. This new head needs remote CI.
