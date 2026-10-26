# Cinder item retrieval and offering

PR #339, branch `codex/battle-grounding-walk-lag`, parent `c62c09d`.
This accepts Cinder item use. Cinder victory/melee and the full integrated
combat/environment/menu/gem/icon/human-pacing backlog remain open.

## Change and source production

Cinder inherited translated caster item poses0/1/2, lifting the body6px. Baseline
inspected in
`client/tmp/cinder-defend-all-states-1793068900/all-class-battle-states-al-8c6b6-s-for-all-twelve-identities-chromium/all-class-cinder-item_use-desktop-1793038393611.png`.

An explicit Cinder `item_use` selects
`client/public/sprites/battle/cinder/staff-item-body.png`:576×192 RGBA with
three192px cells, unchanged original cast guard, robe-supply retrieval, open-palm
offering. Playback0/1/2/1/0 lasts80/150/260/110/80ms with cue2, no body offsets
or angles. The separate equipped staff remains visible on guard and hides during
retrieval/offering. Existing generic item playback emits the result once at the
cue and restores idle; no new runtime JS/Go logic or game-rule changes.

Built-in `image_gen` generated two individual guided poses from the accepted
identity; the offering also references retrieval for continuity. Model identifier
was not returned. Exact prompts, guides/output names and normalization are in
`art-source/characters/cinder/battle/staff-item/metadata.json`.
Sources: `frame-{00,01,02}.png` in that directory; guides:
`art-source/characters/cinder/guides/staff-item-{retrieve,present}.svg`.
Raw copies and normalized source preview:
`client/tmp/cinder-item-candidate-1793072000/`.

Generated alpha retained; occupied alpha>8 bounds uniformly nearest-neighbor
scaled to167px high, centered at common occupied bottom y182, container
anchor(96,184). Source and native sequence inspected: hat/head mass, two cyan eyes,
layered robe, fixed hem/boots, reaching hand and palm-up offering remain readable.
This is a generic supply gesture with the existing holy item-result effect;
no new held Potion prop is claimed.

## Native validation

Direct Playwright reused owner services; the wrapper would terminate occupied
listeners. From `client/`:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/cinder-item-use.spec.js --output=tmp/cinder-item-native-1793072400
```

All3pass in23seconds:1440desktop keyboard,390phone touch,800reduced motion.
A disposable single-Cinder account uses a Go HP=10 fixture and real Goblin Lv1
encounter. No extra Potion grant: native Items/target inputs consume exactly one
starting Potion. Go retains gold and resolves the enemy attack normally. This is
controlled animation acceptance, not a first-fifteen-minute pacing claim.

All three traces show one item-result effect and one HP-bar update on offering
frame2, capped at25 HP. The later Goblin hit brings final server HP to6. Staff
visibility exactly matches guard/gesture frames; original idle/staff restores.
Sampled container/feet/shadow/angle drift is zero, and game/browser reduced-motion
flags agree. Keyboard/touch targeting and next-turn commands remain usable.

All12 current PNGs and three motion/Go-result traces inspected:
`client/tmp/cinder-item-use-1793039613499/`.
Review index, two full native pages and actual-renderer gesture closeup:
`client/tmp/cinder-item-review-1793072800/`.
Source raw output/normalized preview and the baseline were separately inspected.

## Other gates and limits

861tests/99files, production build and full client format pass:

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

All pass. Parsed shared comparison removes only new Cinder item_use and exactly
matches the parent; other states/profiles/content are unchanged. No walking or
accepted cast/hit/KO/Defend pixels changed. No balance/progression/pacing rule
changed, so no new simulator required. The all-class catalog/runtime unit gate
remains, without rerunning unchanged all-class screenshot coverage for this slice.

The first unit run had860passes/onefailure: Cinder previously required hidden
staff on every inherited item frame. Corrected authored contracts now explicitly
require guard-visible/gesture-hidden for both Warrior and Cinder; other legacy
item states still require fully hidden attachments. The exact asset-order
expectation includes the new atlas before KO. No meaningful assertion removed.
Final861pass. Logs:
`client/tmp/cinder-item-{unit,build,format,go,data,contract,walk}-1793072400.log`,
`cinder-item-{unit,format}-final-1793072600.log`,
`cinder-item-native-1793072400.log`.

Hosted combat CI includes the new3cases and uploads their evidence. Parent
Cinder Defend and Objective integration heads remain in remote validation at
writing;4482a14 already passed all11visual suites and protected summary.
Owner-selected self-hosted general CI remains queued. Owner services, sessions,
browser and saves were preserved. No server restart/reset or new persistent state.
