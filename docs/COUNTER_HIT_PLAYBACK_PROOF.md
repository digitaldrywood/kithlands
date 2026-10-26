# Server-owned counter hits and readable strike captions

PR #339, branch `codex/battle-grounding-walk-lag`.

Counters previously took a separate playback branch that turned all of Go's
resolved hits into one effect and one total-damage label. They now share the
existing physical-hit pipeline: one contact, critical/miss flag, HP change and
recovery per authoritative hit, followed by the server total. The action title
identifies Counter. No ability availability, counter trigger, damage, XP,
progression or enemy rules change; all remain in Go.

## Fixture and evidence boundaries

The live fixture uses Brawler because Counter is its existing class ability.
This verifies common playback behavior, not approval of Brawler artwork or a
new ability for Warrior/Cinder. It does not expand the approved class-art scope.
It is an advanced disposable combat fixture, not a natural first-fifteen-minute
playthrough or balance/pacing acceptance.

A fresh account creates one Brawler. Existing debug forced victories exercise
Go's actual XP/level-up path until the party is at least level 32 (this seeded
fixture reaches level 45). A level-35 Iron Golem then lands a real attack for
438 damage; native Counter input produces five actual Go counter hits:
929, 576, 626, 900, 874; total 3905. Real browser Counter selection,
Go responses and read-only post-render instrumentation are used. No fabricated
combat response is injected. Native cases use `rng_seed: 24` and retain the
server round JSON, damage labels, HP-bar result, caption history and motion trace.

The original level setter intentionally changes only displayed level for shop
gating. The initial fixture wrongly used it for combat and died with level-one
stats (`counter-native-1793085300.log`, four failed cases). Further weaker-enemy
fixtures sometimes dealt zero damage and correctly emitted no counter; these
failed runs are retained (`counter-before-1793085900.log`,
`counter-seeded-1793086000.log`, `counter-seeded-landed-1793086100.log`). They are
fixture failures, not evidence of a game counter bug. A fixed combat seed and
proper Go stat growth remove that ambiguity without changing game mechanics.

## Controlled regression

`counter-seeded-before-1793086300.log` runs the same seeded successful-counter
fixture against pushed `4561e50` and fails: the old client produces one 3905
label where the server supplied five separate hits. Source restoration uses a
shell EXIT trap; no player save or live API is reset. The candidate's same
fixture passes (`counter-seeded-heavy-1793086200.log`).

A separate synthetic unit case checks three hits with a critical, a miss and a
normal hit, preserving flags and applying only landed damage to the HP bar.
That case validates playback branching; it does not claim those mixed flags
occurred in the native five-hit counter.

The first four-viewport candidate passed mechanically, including five exact
hit records, readable contact spacing and HP totals. Its 49 unique screenshots
were inspected through all nine pages of
`client/tmp/counter-review-1793086600.json`. Visual review found later strike
captions starting at contact and briefly clearing the message window. The final
candidate starts each later caption during anticipation, like strike one; its
result reading hold still begins at contact. The initial candidate is retained
under `client/tmp/counter-hits-1793002807270/` and is not final visual acceptance.

## Native validation command

Existing local API 8689 / Vite 3610 / PostgreSQL services are reused. The owner
can keep playing on port 3609. Browser binaries, HOME and profiles stay under
this worktree's ignored `client/tmp/`.

```sh
source scripts/worktree-env.sh
source .envrc.local
cd client
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
  HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
  XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
  npx playwright test --config=e2e/playwright.config.js \
  e2e/battle-counter-hits.spec.js e2e/battle-multi-hit.spec.js \
  e2e/warrior-critical.spec.js e2e/cinder-frost.spec.js \
  --output tmp/counter-caption-final-1793087000 \
  > tmp/counter-caption-final-1793087000.log 2>&1
```

The counter matrix covers desktop 1440x900, portrait 390x844, short portrait
375x667 and reduced-motion default 800x600. It records actual per-hit numbers,
reading intervals, attached-shadow positions, body pose frames, rendered
captions, final HP and result/loot transition. Existing Warrior two-hit,
critical variation and Cinder Frost cases provide separate regression coverage.

No Go/shared data changed; no new simulator run is required. Relevant client
gates are `npm test`, `npm run build`, full Prettier check and these native cases.
Fresh head CI remains required, with general CI kept self-hosted.

## Remaining acceptance

Dense native counter crit/miss combinations beyond this seeded normal-hit
reference remain distinct from the synthetic unit case. Small floating action
cards, weapon-specific/unarmed impacts, other ability/body choreography and
additional spell families remain open. The native loot capture also confirms a
Mythril Axe letter fallback; it joins Arcane Staff/Hand Axe in the remaining
canonical artwork audit. No claim of complete battle-art or first-visit pacing
acceptance is made here.

## Caption correction and inspected counter captures

The initial full regression command passed all 16 cases (9.2m) in
`client/tmp/counter-regressions-1793086400.log`. That mechanical pass did not
close the screenshot-discovered caption problem. A before-fix unit assertion in
`counter-caption-before-unit-1793086800.log` proves later captions followed the
lunge. It now passes and explicitly requires caption-before-anticipation order.

All 49 corrected counter captures were inspected through all nine pages of
`client/tmp/counter-caption-review-1793087400.json`, plus the full-resolution
375px `375-hit-3.png`. Source:
`client/tmp/counter-hits-1793003420087/`. The four traces record five exact Go
numbers, a nonempty rendered caption at every contact, zero foot-shadow delta,
fully rendered `strike 1/5` through `strike 5/5` messages and roughly 1.97–1.98s
between contacts. The reduced reference retains the existing shorter pose
sequence. Each trace includes Go's pre-battle party/enemies and 300+ read-only
post-render motion samples. Names and damage/defeat labels remain separate.
Brawler artwork, its legacy weapon-agnostic slash, and small floating title
cards remain outside acceptance; no new class-art approval is implied.

Client gates pass: 839 tests / 98 files, build and full Prettier check in
`counter-caption-{full-unit,build,prettier}-1793087000.log`. No Go/shared content
or game mechanics changed.

## CI runtime correction

The previous head's hosted visual run `40289508187` completes seven suites, but
combat and the required summary are not green. Job `121460981186` records the
annotation “The job has exceeded the maximum execution time of 30m0s”. Its log
shows all 53 native combat cases passed in 19.0m immediately before cancellation;
client/browser installation had already consumed about ten minutes. Full log:
`client/tmp/head456-combat-final-1793087500.log`. This remains a cancelled run,
not passing CI.

Combat controls/results and combat presentation now have separate matrix jobs,
each retaining the original 30-minute budget. The workflow keeps all previous
61 specs exactly once and adds only `battle-counter-hits.spec.js` (62 total
across nine suites). The required matrix-result summary remains unchanged. YAML
parses and `client/tmp/counter-workflow-coverage-1793087200.json` records no
removed, duplicated or missing files. The visual job's Go cache now points to
`server/go.sum`, matching existing general CI and removing its root go.mod cache
warning. General CI's self-hosted labels and owner runner decision are unchanged.
Fresh head CI, including both combat jobs, is still required.

## Final gates and compatibility

Final counter/Warrior multi-hit/Warrior critical/Cinder Frost matrix:
**16 passed (8.7m)** in `client/tmp/counter-caption-final-1793087000.log`.
A follow-up native Counter + Backstab compatibility run passes **2 cases (37.3s)**
in `counter-backstab-final-1793087600.log`. The legacy Backstab verb/title and
server damage remain intact after sharing the physical pipeline. All 15 captures
in `client/tmp/counter-hits-1793004153578/` are inspected through all three pages
of `counter-compat-review-1793088000.json`.

Missed physical hits no longer play landed enemy/party impact audio before the
existing miss cue. The mixed critical/miss unit now also requires only two
landed-hit sounds for its three-hit reference. Final client gates pass (839 tests,
build, full formatting) in `counter-audio-final-{unit,build,prettier}-1793087800.log`.
After that audio guard, native Backstab passes again (7.3s) in
`counter-audio-backstab-1793087800.log`; both final full-resolution images in
`client/tmp/counter-hits-1793004300014/` are inspected. In total, 66 corrected
counter/compatibility captures are inspected, separate from the retained first
candidate. The audio assertion verifies cue selection, not a subjective sound
quality review.

Additional native command arguments for compatibility were
`e2e/battle-counter-hits.spec.js --grep 'Backstab|1440 counter'` and, after the
miss-audio guard, `e2e/battle-counter-hits.spec.js --grep 'Backstab'`, with the same
isolated environment as above. Final unit commands were `npm test`,
`npm run build`, and `npx prettier --check --ignore-path .gitignore .`.
