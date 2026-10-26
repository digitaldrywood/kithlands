> Evidence history: the original hold-time proof is preserved below. The appended
> follow-up records current CSS sizing, label lanes and remaining acceptance.

# Combat text readability

2026-10-25 · branch `codex/battle-grounding-walk-lag` · draft PR #339 · no separate assigned issue.

## Change

The earlier damage text rose 44–60 pixels while fading immediately over roughly one second. Miss text was 14px and disappeared in 680ms. Critical text pulsed alpha while being read.

Numbers now use a proportional bold font, stronger 4px dark outline, larger sizes and brighter fire/ice/dark colors. Travel is limited to 16–24 pixels; full opacity holds for 1200ms before the final fade, or 1500ms for a critical. A critical explicitly says `CRITICAL`, and is lifted higher to clear the target's name. Critical text no longer flashes. Reduced-motion numbers stay still and skip the bounce. Text lifetime is not multiplied by the battle animation speed preference.

The action prompt now has a minimum reading interval between resolved log entries and after the final entry. Its interval accounts for the selected typewriter speed, so fast body animations cannot immediately replace a partially revealed line. This presentation wait does not alter turn order, damage, status or server resolution.

Critical hits already differ through gold damage text, larger bounce, extra impact sparks, critical sound and optional shake. They still use the same authored character attack poses. This change does not add a separate critical body animation, elemental character atlas, or new combat rule.

## Validation

- `cd client && npm test -- --run` — 778 tests, 91 files pass.
- `cd client && npm run build` — passes; existing large-chunk warning remains.
- `cd client && npx prettier --check --ignore-path .gitignore .`
- `cd client && npx vitest run src/ui/floating_text.test.js` — four tests: stroke/bounce, critical full-opacity hold and release, stationary reduced motion, elemental color/timing.
- `combat_read_time.test.js` checks the minimum interval, post-typewriter reading period, empty input and bounded long-line delay.

Actual Chromium proof reused the running API/Vite to avoid restarting the user's play session. The worktree environment and `.envrc.local` were sourced, with worktree-local HOME/XDG_CONFIG_HOME/XDG_CACHE_HOME/PLAYWRIGHT_BROWSERS_PATH as used by `scripts/run_playwright_local.sh`:

- `cd client && npx playwright test --config=e2e/playwright.config.js e2e/combat-text-readability.spec.js e2e/interior-templates-proof.spec.js e2e/combat-contact-polish.spec.js` — seven pass.
- `cd client && npx playwright test --config=e2e/playwright.config.js e2e/field-magic-repeat.spec.js e2e/battle-vfx-gold-slices.spec.js` — ten pass (six spell paths and repeat Cure at four widths).
- Final lifted critical-label rerun: `cd client && npx playwright test --config=e2e/playwright.config.js e2e/combat-text-readability.spec.js`.

The readability proof runs at 1440×900, 390×844 and reduced-motion 800×600, with Fast battle speed and instant messages. It injects known critical/damage/heal/miss values into the real scene's text pool for deterministic visual/timing proof without changing HP. It checks critical opacity after 1100ms and eventual release, and then submits a real authoritative attack round and verifies at least 1450ms between action messages.

Inspected first-run screenshots: `client/tmp/combat-text-1792938294351/1440-critical-held.png`, `390-critical-held.png`, `800-critical-held.png`, and the damage/heal/miss captures in the same folder. JSON timing traces and final rerun captures use unique run directories under `client/tmp/combat-text-*`. The in-app browser connector was attempted but unavailable; actual game proof used isolated Chromium.

## CI follow-up

The previously blocked walking suite now passes all 24 remote checks after the checksum/runner fixes. Two newly exposed test synchronization defects were corrected:

- Interior secret-passage proof now waits for each Town movement to complete. It still requires the exact `(3,4)` destination; it does not bypass the movement lock.
- Field-magic proof now observes menu readiness and the actual cursor label before keyboard confirmation. Previously an MP update could arrive before the rebuilt menu processed hover/cursor state. Repeated Cure passes all four viewport sizes, retaining keyboard coverage at 800px.

These are test synchronization changes, plus read-only cursor/busy fields on the development bridge. Final remote CI conclusions must be checked separately. The next exploration-event feature remains planned in `GAME_FEEL_NEXT_SLICE.md`; overall progress is recorded in `PLAYABILITY_TRACKER.md`.

Final inspected rerun: `client/tmp/combat-text-1792938443098/` (critical label raised above the target name). Actual Fast-speed action-line intervals were 1504ms at 1440px, 1502ms at 390px and 1504ms under reduced motion at 800px. All three readability flows pass, as do the final 778 client tests, build and formatting check. The local API remained healthy throughout.


---

## Follow-up: CSS sizing and label lanes

2026-10-25 · `codex/battle-grounding-walk-lag` · draft PR #339.

The phone Frost capture in `CINDER_FROST_PROOF.md` exposed damage numbers
crossing the enemy name. Fixed logical font sizes also rendered normal damage
at about 13.7 CSS pixels and enemy names at about 5.4 CSS pixels at 390px.
The lower message's 32 logical pixels became 15.6 CSS pixels.

## Change

Combat numbers now use the actual canvas fit to enforce at least 16 CSS pixels;
criticals use at least 18. Enemy names use at least 12, with wrapping inside
the enemy lane. The lower action/turn message uses at least 16. Existing larger
desktop sizes remain. Contrast, elemental colors, critical emphasis and the
existing full-opacity reading holds are retained.

Numbers reserve measured text bounds above the enemy-name lane. A kill creates
a separate status lane first, then places damage above it using the measured
status bounds. This accounts for multiline criticals, guards and initial bounce
size instead of a fixed 52px guess. A constrained high target may use a one-line
critical and omit its bounce, preserving the font size. Labels also stay inside
horizontal field bounds. Defeat labels do not consume or decrement damage
stagger slots.

Party labels now calculate the top from the full height of a feet-anchored
character; the previous calculation treated its feet as a centered sprite.
Healing shares that anchor/bounds contract. `hitFx` uses one result-rendering
entry point rather than six duplicated spawn branches. Go still owns all
results, damage, defeat, healing and targeting. No Go/shared data, asset,
choreography, battle-speed or progression rule changed.

## Final actual-game proof

`cinder-frost.spec.js`: native keyboard/pointer desktop, touch 390×844,
keyboard/pointer 375×667, and reduced-motion 800×600. `warrior-critical.spec.js`:
real authoritative normal/normal/critical rounds at desktop, touch-size phone
and reduced-motion default. The showcase is an explicit fixture, not normal
progression proof. Existing input paths and server outcomes remain intact.

A read-only post-render audit checks every high-opacity result sample for font
size and field containment; visible target names for font size and clearance;
and simultaneous damage/defeat pairs for separation. It also measures lower
message text. This run observed physical, magical, party-hit, critical and
defeated result types. It does not claim actual-game Miss coverage.

Phone measured minima:

| Case | Result CSS px | Critical CSS px | Message CSS px | Name/result gap, logical px |
| --- | ---: | ---: | ---: | ---: |
| Frost 390 | 16.0875 | — | 16.0875 | 13 |
| Frost 375 | 16.26 | — | 16.26 | 15 |
| Warrior critical 390 | 16.0875 | 18.0375 | 16.0875 | 13 |

The critical/defeat pair retains at least 13 logical pixels of separation on
phone, 10 on desktop/default. Names measure at least 12 CSS pixels. The existing
Frost release/contact/hold/recovery and Warrior contact/shadow/home assertions
also pass; reading holds remain independent of battle speed.

All 126 final Frost/critical PNGs inspected (60 motion frames, 30 Frost stage
captures and 36 Warrior captures):

- `client/tmp/cinder-frost-1792977204302/`
- `client/tmp/warrior-critical-1792977261683/`
- `client/tmp/combat-text-motion-review-1793002500-{0..4}.jpg`
- `client/tmp/combat-text-frost-review-1793002500-{0..2}.jpg`
- `client/tmp/combat-text-critical-review-1793002500-{0..2}.jpg`

Phone damage and critical/status captures were also inspected at full size.
The before-Frost proof remains available for comparison. Final actual-game
Defend/Repeat, Fireball, Blaze, Cure, Heala, Mute and reduced-motion Fireball
checks passed as well; all 51 associated PNGs inspected:

- `client/tmp/combat-text-accepted-vfx-1793002200/`
- `client/tmp/battle-defend-1792977319616/`
- `client/tmp/combat-text-vfx-review-1793002800-{0..4}.jpg`

## Commands and outcomes

After sourcing the worktree environment at the root, then `cd client`, run
with `VITE_PORT=3610`, worktree-local `PLAYWRIGHT_BROWSERS_PATH`, and the same
isolated HOME/XDG directories documented in `CINDER_FROST_PROOF.md`:

```sh
npx playwright test --config=e2e/playwright.config.js \
  e2e/cinder-frost.spec.js e2e/warrior-critical.spec.js \
  --output=tmp/combat-text-final-native-1793001700
npx playwright test --config=e2e/playwright.config.js \
  e2e/battle-vfx-gold-slices.spec.js e2e/battle-defend.spec.js \
  --output=tmp/combat-text-accepted-vfx-1793002200
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

Seven native cast/critical cases passed in 2.6 minutes; nine Defend/VFX cases
passed in 2.0 minutes. Logs are the corresponding `client/tmp/*.log` paths.
All 817 client tests / 96 files, production build and formatting pass:
`client/tmp/combat-text-accepted-{client,build,format}-1793001700.log`.
The existing bundle-size advisory remains. Backend/data/simulator gates were
not repeated for this presentation-only change; the preceding Frost chunk's
Go/data/balance results remain recorded separately.

Earlier failures are retained as diagnostics: the first high-target unit case
exposed wasted status-lane space; the first desktop native audit caught a 4px
logical gap. A second native run passed before the final lower-message sizing
and stagger-accounting polish; final acceptance uses the two runs above.
The minimum top-bound unit assertion permits only floating-point tolerance.
No meaningful test was removed or relaxed.

## Remaining scope

This accepts the tested Warrior/Cinder reference battles and inspected healing
and Defend regressions at the default speed. Dense formations, simultaneous
multi-hit result labels, dense fastest-speed interaction, actual server Miss, and every possible
status/critical/KO combination still need their broader acceptance pass.
Small floating action-title cards and victory-detail text were not redesigned.
Other battle-art/choreography, enemy-role, exploration and human first-visit
pacing requirements remain on the active tracker. No merge or deployment.

The player's newer October 25 8:05:39 PM CDT autosave was resumed through the
actual Continue screen, preserving newer progress rather than rolling back to
the earlier Frost-turn capture. It has 495 gold, 14 potions, all four level
five and 132/153 XP each. The tab is left on World. Inspected captures:
`client/tmp/combat-text-player-party-1793003100.png` and
`client/tmp/combat-text-player-world-1793003100.png`. Main Vite3609/API8689 and
the existing database remain available. Temporary proof Vite3610 is stopped
after verification. No save reset, deletion, backend restart or account change.

The preceding Frost commit `8c842b0` passed all five hosted visual groups in
run `40251826213`. The new text commit needs its own remote gate. General CI
remains on the owner-selected self-hosted runner configuration.

## Fast-speed proof follow-up and history preservation

The original proof document above is preserved verbatim, including its older
hold-time captures and test results. The new sizing/lane evidence is appended
rather than replacing that history.

The existing `combat-text-readability.spec.js` now sends its explicitly
synthetic critical/damage/heal/Miss fixtures through the current result/bounds
path and audits actual CSS sizing. No server HP changes. Three cases pass at
1440×900, 390×844 and reduced-motion 800×600, retaining critical opacity after
1100ms, eventual release and the real authoritative attack-round message
interval. With battle speed 1 (0.33 duration multiplier, fastest) and instant
message rendering, action-line intervals measured 1504.4 / 1501.6 / 1503.3ms.

Warrior's existing native three-round critical proof also has a distinct
390px Fast case. It uses the actual Go outcomes and authored contact/shadow/
recovery checks, with 18.0375 CSS-pixel critical text and 13 logical pixels
between damage and defeat. This is actual Fast critical coverage; the Miss
fixture still does not establish a real server-resolved miss.

All four cases passed in 50.5 seconds using the same local browser environment:
`npx playwright test --config=e2e/playwright.config.js e2e/combat-text-readability.spec.js e2e/warrior-critical.spec.js --grep Fast --output=tmp/combat-text-fast-1793003700`.
Log: `client/tmp/combat-text-fast-1793003700.log`. All 21 additional captures
inspected in `client/tmp/combat-text-fast-review-1793004200-{0,1}.jpg`; originals
are `client/tmp/combat-text-1792977979284/`,
`client/tmp/warrior-critical-1792978003006/fast-390/` and the test output above.
Full-client formatting passed after these test-only changes:
`client/tmp/combat-text-fast-format-1793004100.log`.
Hosted visual CI now also runs and retains the held-text checks. No production
code changed after the prior 817-test/build/native acceptance run.

## Five-target spell follow-up

See [CROWDED_BATTLE_RESULTS_PROOF.md](CROWDED_BATTLE_RESULTS_PROOF.md) for the
subsequent native five-target Blaze acceptance, stable numbers, server-derived
defeat summary and crowded phone framing/caption fixes. The original proof
history above remains unchanged. This follow-up does not accept dense criticals,
all monster-size/name combinations, multi-hit or a real server-resolved Miss.

## Individual physical hits

[MULTI_HIT_PRESENTATION_PROOF.md](MULTI_HIT_PRESENTATION_PROOF.md) records the
subsequent per-hit contact/readability correction. The previous 169-point
aggregate crit reference is superseded by the actual 106-critical + 63-normal
sequence. The historical evidence above remains intact; current acceptance
uses individual server hit values and actual number/defeat spacing.
