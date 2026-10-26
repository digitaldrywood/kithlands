# Cinder staff melee

PR #339, branch `codex/battle-grounding-walk-lag`, parent `925416f`.
This accepts the Cinder staff physical action and preserves the larger playability
backlog. It does not approve every weapon, class or integrated campaign.

## Change and source review

Cinder inherited physical attacks from caster poses with body lift/tilt and blade
contact. An explicit `physical_attack` now selects a six-cell1152×192 RGBA body
atlas: exact original guard, coil, raised weapon hand, downward contact,
follow-through, exact guard recovery. New body poses retain167px occupied height,
occupied bottom182 and container anchor(96,184); there is no body lift/rotation.
Durations80/95/120/100/120/120ms; authoritative damage is revealed at cue3 before
follow-through. Separate staff grips are authored per pose; no weapon is baked in.

Sources/guides/exact generation prompts/output names:
`art-source/characters/cinder/battle/staff-strike/metadata.json` and
`art-source/characters/cinder/guides/staff-melee-{coil,windup,contact,follow}.svg`.
Original body identity is accepted `staff-cast/frame-00.png`; frames00/05 are
unchanged copies. Four individual poses were generated with built-in image_gen;
model identifier was not returned. No whole generated sheet or synthetic pose.
Deterministic alpha crop and nearest-neighbor normalization/packing only.

Rejected candidates switched hands. The final downward blow keeps the anatomical
left weapon arm on screen-right. Rejected raw images/guides/prompt history and
accepted raw/normalized previews remain in
`client/tmp/cinder-melee-candidate-1793077000/`. Source `frames-review.png` inspected
before runtime installation. No cast, Defend, hit, item, victory, KO or walk pixels
changed. Parsed catalog comparison confirms only explicit Cinder physical state.

Optional shared `contact_family` is validated by Go as empty/slash/blunt. Legacy
states retain slash. Cinder staff uses bounded neutral blunt ring/core/radial marks
and existing hit audio rather than sword slash audio. Critical blunt styling is
larger/gold; no new critical body pose is claimed. Reduced motion is stationary
fade with no radial travel or scale animation. Go combat math, rewards, saves and
mana rules are unchanged.

First native review exposed a staff striking air: corrected angles to-115/-130°
and closer normal-motion blunt approach, bounded by combatant widths. The default
blade path is unchanged. Reduced-motion path remains identical to the existing
short local approach. Normal-motion staff now reaches the Slime's near edge.

## Native verification

Existing owner API8689/Vite3609 remain running. Direct isolated Playwright avoids
the wrapper terminating occupied owner listeners. From `client/`, prefix every
command with:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache"
```

Commands:

```sh
npx playwright test --config=e2e/playwright.config.js e2e/cinder-melee.spec.js --output=tmp/cinder-melee-native-1793081000
npx playwright test --config=e2e/playwright.config.js e2e/warrior-critical.spec.js --output=tmp/cinder-melee-critical-1793079700
```

All7 native cases pass: three Cinder desktop1440/phone390touch/reduced800;
four Warrior normal/critical/defeat labels at desktop, phone, reduced and Fast.
Cinder uses a disposable Lv8 single-member fixture, seed6, real Slime encounter,
native Attack and target selection. Real Go physical damage3 is displayed exactly
once at pose3 with familyblunt; no forced hit/win. Native Spark finishes the battle,
then loot/receipt Continue returns to World. Harness initially omitted the common
native-combat game reference; corrected without changing assertions or mechanics.

Traces show frames0–5 normal and1/3/5 reduced; all body feet offsets/angles0,
shadow distance<0.5px, visible staff, exact media/reduced flag agreement and
original idle texture recovery. Reduced contact scale remains1. The staff source
and actual held weapon stay on the same glove through the downward sweep.

All78 current PNGs inspected (24 final staff,54 Warrior regressions), including
full native screens, pose/collision crops, contact text, recovery and World:

- `client/tmp/cinder-melee-1793042882687/`
- `client/tmp/warrior-critical-1793042464858/` (includes Fast subdirectory)
- `client/tmp/cinder-melee-review-1793081200/index.json`, native01–13 review pages.

Earlier air-gap captures retained in `cinder-melee-1793042663596/`; those are not
accepted as final. Current native logs:
`cinder-melee-native-1793081000.log`, `cinder-melee-critical-1793079700.log`.

## Gates and remaining scope

866 tests/99files, client build/full format, full Go `make test`, data validation,
all12 battle-state atlas audits and all12 unchanged walk contracts pass:

```sh
cd client && npm test
cd client && npm run build
cd client && npx prettier --check --ignore-path .gitignore .
make test
make validate-data
python3 skills/kithlands-visual-production/scripts/audit_battle_character_sheets.py --require-complete
python3 skills/kithlands-visual-production/scripts/audit_walk_sheets.py client/public/sprites/walk --classes warrior brawler rogue mender cinder wayfarer knight champion shadow sage pyromancer wanderer --columns 6 --rows 8 --mode enforce
git diff --check
```

Full Go gate initially found an old manifest test requiring every state to use the
signature atlas, rotated90° KO and Cinder equipment hidden even in guard. Updated
to compare each explicit authored atlas (recipe fallback retains signature), exact
Warrior/Cinder grounded KO and item guard/retrieve visibility. Invalid contact
families have a regression test. No balance or pacing change; no new simulator
required. New native cases/artifacts are included in hosted combat CI.

Logs: `cinder-melee-{unit,build,format}-1793081400.log`,
`cinder-melee-go-1793080700.log`, `cinder-melee-final-data-1793081600.log`,
`cinder-melee-{contract,walk}-1793080300.log` under `client/tmp/`.
Parent925416f hosted run40382379128 passes all visual suites; this new head needs
its own remote gates. Self-hosted general CI remains owner-selected and queued.
Broader integrated battle acceptance, other equipment, environment composition,
all-class final acceptance and unassisted first15minute pacing remain open.
