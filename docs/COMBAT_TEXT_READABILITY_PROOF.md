# Combat text readability and label lanes

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
multi-hit result labels, fastest-speed interaction, Miss, and every possible
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
