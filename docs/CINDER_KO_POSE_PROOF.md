# Cinder grounded KO and revival

PR #339, branch `codex/battle-grounding-walk-lag`, based on pushed `4a03e84`.
This slice accepts Cinder KO and fixes two-member body occlusion. Cinder Defend,
item, victory and melee choreography, integrated menus/environments and first-visit
human pacing remain open in `PLAYABILITY_TRACKER.md`.

## Change and source acceptance

Cinder inherited a rotated casting body with a hidden staff. An explicit shared
`ko_defeated` recipe now uses recoil → knee buckle → a settled side-lying fall,
without body rotation/translation. Durations are 85/170/260ms; terminal frame 2
holds until revival. The item-selected staff drops alongside the pooled robe as
a separate attachment, and the shadow remains at the feet anchor.

The 576×192 RGBA runtime atlas has three 192px cells, container anchor (96,184),
occupied bottom y182. Frame 0 copies the accepted hit flinch unchanged. New buckle
and fall are uniformly nearest-neighbor scaled to 130px high / 176px wide,
preserving alpha. Sources and exact built-in image-generation prompts are in
`art-source/characters/cinder/battle/staff-ko/metadata.json`; body-only guides in
`art-source/characters/cinder/guides/staff-ko-{buckle,fallen}.svg`. Model identifier
was not returned. Raw candidates and previews are retained in
`client/tmp/cinder-ko-candidate-1793064500/`.

The first fallen candidate was rejected: its normalized 176×41 silhouette made
the head/hat too small. A targeted revision shortened the robe and enlarged the
head/hat mass, yielding 176×56; source and native frames were inspected. No cast
or walk pixels were regenerated.

Actual revival screenshots exposed a second problem: two back-row bodies only
54px apart occluded fallen Cinder. Two-member parties now use twice the standard
vertical gap (108px); four-member spacing and tactical rows remain unchanged.
Final desktop and phone held-fallen/revived screenshots show clear separation.
A unit regression checks two-caster spacing and safe bounds in both layouts.

## Native validation

Direct Playwright preserved the owner API, services, sessions and saves. The
local wrapper would terminate occupied listeners, so it was not used. From
`client/`, prefix each Playwright invocation with:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache"
```

Then run:

```sh
npx playwright test --config=e2e/playwright.config.js e2e/cinder-ko-reaction.spec.js e2e/cinder-ko-revive.spec.js e2e/all-class-battle-states.spec.js --output=tmp/cinder-ko-native-1793064800
npx playwright test --config=e2e/playwright.config.js e2e/cinder-ko-revive.spec.js e2e/warrior-ko-revive.spec.js --output=tmp/cinder-ko-spacing-final-1793065600
```

Six initial cases pass; four post-spacing revival cases pass (eight distinct
cases across retained runs). Desktop, 390px phone touch and 800px reduced-motion
lethal-hit traces use a Go HP=1 fixture followed by a real enemy attack. No client
combat result fabrication. Terminal frame 2 holds 1.23–1.55s, body angle/feet/shadow
deltas are zero; reduced-motion container shake is zero. Phoenix Down remains
server authoritative: exactly one item consumed, 1 HP restored, gold unchanged,
Cinder returns to original cast idle. Four final Warrior/Cinder revival cases
preserve terminal poses through redraw and restore native commands after use.
All-class audit retains exact grounded Warrior/Cinder KO assertions; ten other
legacy KO rotations are regression checks, not visual acceptance.

All 145 current PNGs inspected: 24 reaction, four initial revival, 109 all-class,
eight final Warrior/Cinder revival. Initial revival evidence was rejected for
occlusion and superseded by the final eight captures. Evidence:

- `client/tmp/cinder-ko-reaction-1793036671613/`: 24 images and motion traces.
- `client/tmp/cinder-ko-revive-1793036702860/`: four pre-spacing images.
- `client/tmp/cinder-ko-native-1793064800/`: 109 all-class images.
- `client/tmp/cinder-ko-revive-1793036978302/`: four final Cinder images.
- `client/tmp/warrior-ko-revive-1793037006726/`: four final Warrior images.
- `client/tmp/cinder-ko-review-1793065300/index.json`: source mapping, five native
  and eleven all-state review pages, two final spacing pages and collapse closeup.

## Other gates and limits

861 tests / 99 files, production build and full client format check pass:

```sh
cd client && npm test
cd client && npm run build
cd client && npx prettier --check --ignore-path .gitignore .
```

From the repository root:

```sh
make test
make validate-data
python3 skills/kithlands-visual-production/scripts/audit_battle_character_sheets.py --require-complete
python3 skills/kithlands-visual-production/scripts/audit_walk_sheets.py client/public/sprites/walk --classes warrior brawler rogue mender cinder wayfarer knight champion shadow sage pyromancer wanderer --columns 6 --rows 8 --mode enforce
git diff --check
```

All pass. Shared parsed comparison excludes only the new Cinder KO recipe and
matches the parent exactly. No combat/progression/pacing rules changed, so no new
simulator required. No walking asset changed. Logs are
`client/tmp/cinder-ko-{go,data,walk}-1793065100.log`,
`cinder-ko-contract-1793064800.log`, `cinder-ko-{unit,build,format}-final-1793065600.log`,
`cinder-ko-final-extra-format-1793066900.log` (client/shared/source files),
`cinder-ko-native-1793064800.log`, and `cinder-ko-spacing-final-1793065600.log`.
Hosted combat CI now includes both new Cinder specs and uploads their evidence.
General CI remains on owner-selected self-hosted labels; repository inventory
returned no registered runners. Current head still requires remote validation.
