# Warrior, meadow and battle presentation proof

Work: user-directed Warrior-first visual slice, draft PR #339. Branch:
`codex/battle-grounding-walk-lag`. Implementation commits: `6862222` (walk),
`506d941` (meadow), `3be257d` (melee), `4f275b0` (spell arrival), `6b7af78`
(utility ability choreography). The earlier commits in this PR cover actor
grounding, following shadows, retained server miss logs and walking latency.

## Result

Warrior has four regenerated cardinal walk rows with common registration,
readable passing steps and a two-tile gait. The native six-column/eight-row
contract remains intact. The meadow adds restrained ground variation, plants,
depth-ordered foliage and a separate following shadow; battle uses a new full
clearing background. Melee approach, contact, follow-through and recovery are
separate. Cinder emits from the staff tip and presents damage when the spell
arrives. Existing utility abilities select a stance or reach from shared
presentation metadata. Go remains authoritative; combat math is unchanged.

The art rollout is scoped to Warrior. All-class checks below are regression
checks for the shared renderer, not approval of new art for other classes.
Agent visual review is recorded separately from user aesthetic acceptance.

## Validation

Validation ran in the attached worktree, using its isolated browser state
and local database. The built-in in-app browser backend was unavailable, so
actual Chromium game flows used the repository's Playwright wrapper. Commands
below reproduce the gates; Python audits used the bundled runtime with Pillow.

```sh
cd client && npm test
cd client && npm run build
cd client && npx prettier --check --ignore-path .gitignore .
make test
make validate-data
make balance-sim
```

750 client tests passed in 82 files. Production build and full client Prettier
check passed. Full Go tests and semantic data validation passed. The balance
simulator completed levels 1–20 at its default 200 battles/level.

```sh
python3 skills/kithlands-visual-production/scripts/audit_walk_sheets.py \
  client/public/sprites/walk \
  --classes warrior brawler rogue mender cinder wayfarer knight champion \
    shadow sage pyromancer wanderer --columns 6 --rows 8 --mode enforce
python3 skills/kithlands-visual-production/scripts/audit_battle_character_sheets.py \
  --require-complete
./scripts/run_playwright_local.sh e2e/walk-all-classes.spec.js \
  e2e/world-space-cycle.spec.js e2e/world-walk-audit-party.spec.js
./scripts/run_playwright_local.sh e2e/battle-grounding.spec.js \
  e2e/warrior-meadow-polish.spec.js
./scripts/run_playwright_local.sh e2e/all-class-battle-states.spec.js \
  e2e/walk-rendered-cadence.spec.js e2e/battle-grounding.spec.js \
  --grep 'renders and plays|rendered gait|reduced:' \
  --output=tmp/warrior-polish/last-results
./scripts/run_playwright_local.sh e2e/battle-grounding.spec.js \
  --grep 'reduced:' --output=tmp/warrior-polish/reduced-results
./scripts/run_playwright_local.sh e2e/battle-grounding.spec.js \
  e2e/warrior-meadow-polish.spec.js --grep 'slow:|fast:|Space cycles' \
  --output=tmp/warrior-polish/speed-results
```

All twelve native walk sheets and all twelve/eight-state battle contracts pass.
Actual World/Town walking covers all classes; Mender's initial run was interrupted
by development HMR and passed on rerun. The final 11-check gate included Warrior,
Mender, Space cycling, party walk audit, desktop/portrait meadow-to-battle and all
five battle modes. Final utility coverage adds real authoritative Steal alongside
Warrior attack and Cinder Spark. Its reduced-motion assertion was corrected to
check the existing 14-pixel reach cap rather than requiring a full lunge or zero
movement. Six rendered-cadence cases pass: three speeds at 20 and 60 FPS.

## Inspected actual-game evidence

Unique original screenshots, videos and sampled traces remain under
`client/tmp/` in this worktree:

- `warrior-meadow-1791743100910/`: four directions, six live walking samples and
  stopping at desktop and portrait sizes; `desktop-meadow.png`,
  `portrait-meadow.png`, `desktop-battle-entry.png`, `portrait-battle-entry.png`;
  every class moving/stopped after real Space cycling.
- `battle-grounding-1791743062470/`: desktop/portrait actual server battle
  screenshots and traces; Warrior contact frame, Cinder release frame,
  arrival impact visibility, Steal reach and moving shadow equality.
- `warrior-polish/ability-results/`: actual desktop/portrait battle videos and
  keyboard walking videos. Reviewed the full battle sequence, including Steal,
  Cinder staff release/arrival, Warrior contact/recovery and enemy reactions.
- `warrior-polish/last-results/`: 96 desktop identity/state screenshots and
  twelve portrait KO screenshots; reviewed the desktop contact sheet.
- `warrior-polish/all-class-field-review.png`, `meadow-battle-review.png`,
  `all-battle-state-review.jpg`, `battle-sequence-0.jpg`,
  `battle-sequence-1.jpg`: inspection contact sheets assembled from actual game
  output, not generated mockups.
- `warrior-meadow-1791743608867/sprites-walk-grid.png`: actual `/sprites.html`
  walk inspector after the final Space-cycle review. The Warrior section was
  inspected at full resolution in `warrior-polish/warrior-inspector-cells.png`.
- `warrior-polish/*-browser.log`, `client-ability.log`, `build-ability.log`,
  `prettier-ability.log`, `server-ability.log`, `data-ability-final.log`,
  `balance-final.log`, `static.log`, `battle-static-final.log`: command evidence.

The source art was inspected before installation. Built-in `image_gen` produced
four Warrior strips, the meadow clearing and six props; prompt specifications,
normalized sources and metadata are under `art-source/characters/warrior/walk/`
and `art-source/environment/meadow/`. No programmatically drawn replacement
character frames or additional class art were introduced.
