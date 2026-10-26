# Crowded group-result proof

Branch `codex/battle-grounding-walk-lag`, draft PR #339, 2026-10-25.

## Problem and change

A five-enemy Blaze produced five damage labels and five wide DEFEATED banners.
Labels collided with neighboring results and names, particularly in the short
375×667 phone viewport. Simultaneous group results now display one stationary
number per target, without bounce/rise/stagger, while preserving the existing
1200ms normal and 1500ms critical reading holds. Defeats appear once in the
lower action message, counted from the authoritative result. Cinder returns to
guard and the group cursor clears before that summary.

Portrait formations above three enemies use more battlefield depth; accepted
two-enemy placement remains identical. Crowded enemy group captions sit below
the formation, at a minimum 12 CSS pixels. The existing number/name/message
font minima remain enforced. No combat rules, rewards, Go/shared content,
character sheets, weapon attachments or shadows changed.

## Native game acceptance

`client/e2e/battle-crowded-results.spec.js` uses the server debug encounter
endpoint to create the authored maximum random formation (three Slimes and two
Wolves), then restarts only its renderer. It closes the showcase equipment
panel and selects Defend/Blaze through real keyboard or touch controls. All
five Blaze actions and defeat counts come from the Go combat round. This is
an explicit high-level showcase fixture, not proof of natural campaign pacing.

| Viewport | Input/options | Authoritative outcome |
| --- | --- | --- |
| 1440×900 | keyboard, default | five defeated |
| 390×844 | touch, default | five defeated |
| 375×667 | touch, Fast/instant messages | five defeated |
| 800×600 | keyboard, reduced motion | five defeated |
| 390×844 | touch, stronger enemies | four defeated, one Wolf survives |

Final run: **5 passed, 1.2m**. Postrender checks cover all result/result and
result/visible-name intersections during high-opacity holds, exactly five
result labels, stationary coordinates, CSS font minima, field bounds, caption
clearance and summary cursor/caster state. Final originals (15 PNGs plus server
responses and traces): `client/tmp/battle-crowded-1792980131788/`. Every PNG was
inspected in `client/tmp/crowded-accepted-review-1793009500-{0,1}.jpg`, with
`375-fast-results.png` and `390-partial-summary.png` also opened full size.

## Commands and results

Run from the worktree root, using existing local settings without printing them:

```sh
source scripts/worktree-env.sh
source .envrc.local
cd client
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/battle-crowded-results.spec.js --output=tmp/crowded-accepted-native-1793009200
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

Logs under `client/tmp/`: `crowded-accepted-native-1793009200.log`,
`crowded-accepted-client-1793009200.log`,
`crowded-accepted-build-1793009200.log`,
`crowded-accepted-format-1793009200.log`. **96 files / 821 tests pass**, build
and formatting pass. Build retains the existing chunk-size advisory.

Earlier regression command in the same browser environment:

```sh
npx playwright test --config=e2e/playwright.config.js e2e/warrior-critical.spec.js e2e/battle-vfx-gold-slices.spec.js e2e/combat-text-readability.spec.js --output=tmp/crowded-regression-1793006600
```

**13 passed, 3.2m**, log `client/tmp/crowded-regression-1793006600.log`.
Its 82 captures were inspected in
`client/tmp/crowded-regression-review-1793008500-{0..6}.jpg`. Originals:
`client/tmp/warrior-critical-1792979220966/`,
`client/tmp/combat-text-1792979198189/` and the regression output directory.
These checks ran after stable group numbers/summary were added and before the
crowded-only framing/caption and summary-cleanup ordering changes. The final
five-case run covers those subsequent changes; layout unit tests establish
unchanged two-enemy reference coordinates. Held Miss/heal labels in this
regression remain presentation fixtures, not actual server misses.

No mechanics/content changed; Go/data validators and balance sims were not
rerun for this presentation-only slice. Hosted visual CI now includes and
retains the crowded run. Predecessor `f445d67` hosted run `40254454000` passed all
five visual groups. This commit requires its own remote gate. General CI
remains on the owner-selected self-hosted setup.

## Rejected runs and limits

Baseline `battle-crowded-1792978646647/390-results.png` reproduced overlapping
labels. Early fixture attempts needed a renderer restart after replacing the
same Battle and needed to close the equipment overlay; no outcomes were faked.
The first matrix failed 375px clearance and prompted portrait row spacing.
A later screenshot review found ALL ENEMIES over the middle Slime name; the
final caption placement and collision audit correct that. An intermediate
caption run was interrupted to fix measuring its height before assigning text;
only the final run above is acceptance evidence.

Accepted: this five-target Blaze formation, default/Fast/reduced motion and
full/partial defeat summaries. Not yet accepted: dense single-target criticals,
all large monsters/long-name combinations, multi-hit, actual server-resolved
Miss, every spell/status family or every class. Four-large-enemy spacing has
unit coverage only. The broader gameplay goal remains open.

## Local player continuity

The main client/API remain available at http://localhost:3609/. The newest
Oct 25, 8:36:41 PM CDT autosave was restored through Continue, preserving the
newer player session rather than the older proof state. World screenshot
`client/tmp/crowded-player-world-1793009700.png` was inspected. The separate
Vite 3610 test process was stopped; the main services were left running.
