# Cinder victory hat-tip and bow

PR #339, branch `codex/battle-grounding-walk-lag`, parent `25404ca`.
This accepts Cinder victory poses and the real win/receipt/Continue flow, not the
full integrated reference. Cinder melee and broader goal acceptance remain open.

## Audit and art

Cinder inherited caster victory: casting poses plus body lift/tilt. Inspected
baseline:
`client/tmp/cinder-defend-all-states-1793068900/all-class-battle-states-al-8c6b6-s-for-all-twelve-identities-chromium/all-class-cinder-victory-desktop-1793038393611.png`.

An explicit `victory` selects `/sprites/battle/cinder/staff-victory-body.png`,
576×192 RGBA with three192px cells: unchanged cast guard, hat-tip, small bow.
The free glove touches the hat brim; the other hand stays by the separate
item-selected staff. Playback0/1/2/1/0 lasts80/140/380/140/100ms, cue2, no body
translation or rotation. Staff grips(27/28,13),8° back layer; visible throughout.

Built-in `image_gen` generated two individual guided poses from original identity;
the bow also references the hat-tip for continuity. Model identifier not returned.
Exact prompts/guides/output names:
`art-source/characters/cinder/battle/staff-victory/metadata.json`.
Sources: `frame-{00,01,02}.png` in that directory. Guides:
`art-source/characters/cinder/guides/staff-victory-{tip,bow}.svg`.
Raw candidates and source previews:
`client/tmp/cinder-victory-candidate-1793073200/`.

Alpha retained, occupied alpha>8 bounds uniformly nearest-neighbor scaled to167px
height, centered with occupied bottom y182 and container anchor(96,184). The
initial156px bow normalization visibly shrank the figure; rejected before runtime,
corrected to common167px body scale. Initial `frames-review.png` and accepted
`frames-review-consistent-mass.png` retained. The drawn posture supplies the bow;
source/native sequence keeps hat/head/body mass and boots stable.

Parsed comparison proves only new Cinder victory shared values changed. No JS/Go
runtime logic, cast/Defend/hit/KO/item/walk pixels, rewards or balance changed.

## Native flow and inspected evidence

Direct Playwright preserved existing owner services; wrapper would terminate
occupied listeners. From `client/`:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/cinder-victory.spec.js --output=tmp/cinder-victory-native-1793073700
```

All3pass in19.1seconds:1440desktop keyboard,390phone touch,800reduced motion.
Disposable Lv8 fixture isolates celebration, not first-visit pacing. Native
Spell→Spark→Slime targeting yields a real Go win, no forced victory. Assertions
verify actual Spark damage/MP spending, increased gold/XP, pose frames1/2,
no receipt during pose, visible staff, exact reduced-motion flags, zero sampled
body/container/feet/shadow drift, native loot/receipt handoff and Continue to
usable World. Acknowledgement preserves gold/XP without awarding again.

All15 current PNGs and three Go/motion traces inspected:
`client/tmp/cinder-victory-1793040250209/`.
Review map, three native pages and renderer closeup:
`client/tmp/cinder-victory-review-1793073900/`.
Raw sources, normalized source sequence and baseline also inspected. Staff stays
along the far glove; the salute/bow is grounded and returns to original guard
before the receipt. No other class pose is accepted by this evidence.

Review also verifies an existing HUD gap: all three Go results consume MP10→8
and preserve8 on Continue, while the celebration card still shows old10/10.
Current code redraws party status on the next combat round, not before victory.
This is tracked for authoritative-resource HUD reconciliation before expansion;
this art slice does not claim it fixed.

## Gates and limits

861tests/99files, build and full client format pass:

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

All pass. No mechanics/progression/pacing change, so no new simulator required;
walk content remains unchanged. Exact catalog asset deduplication expectations
include the new victory key before KO; all-class unit contracts remain intact.
Logs: `client/tmp/cinder-victory-{unit,build,format,go,data,contract,walk}-1793073700.log`,
`cinder-victory-native-1793073700.log`.
Hosted combat CI includes the new3cases and uploads their evidence. Parent
4482a14 already passed all11visual suites/protected summary; newer heads still
require their remote gates. Owner-selected self-hosted general CI stays queued.
Owner services, sessions, browser and saves preserved; no restart or reset.

Follow-up: `BATTLE_MANA_HUD_PROOF.md` fixes the observed final mana-card mismatch
with authoritative round-end reconciliation and adds exact native MP assertions.
