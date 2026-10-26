# Cinder lightning and attached casting release

PR #339, branch `codex/battle-grounding-walk-lag`.

Shock and Thunder previously lacked presentation metadata and used the generic
yellow projectile/impact. Both now identify the lightning family in
`shared/spells.json`, at tiers one and two respectively. Their existing power,
cost, targeting, availability, damage and cinematic settings are unchanged.
Go remains authoritative for every target and result (design §6.1).

The original vector effect has a held wand charge, one branching discharge and
residual arcs framing the target. It reveals stable geometry along its length
rather than flickering randomized lines. Reduced motion substitutes a small,
still target charge for the cross-field bolt. The impact resolves the effect's
promise so HP and damage text arrive at contact, before the residual fade.
All transient graphics are destroyed at completion.

## Rejected iterations and attachment correction

`lightning-before-1793091300.log` records the existing generic path. The native
Shock round produces Go damage but no presentation metadata. Its retained trace
and screenshots are in `client/tmp/cinder-lightning-1793006607464/`; the generic
and damage images were inspected before integration.

The first new implementation incorrectly tweened `_lightningProgress`. The
installed Phaser `tweens/builders/GetProps.js` explicitly skips underscore
properties, so the six native cases in `lightning-native-1793091900.log` fail:
release goes straight to impact. The mocked arrival unit did not catch this;
native post-render stage assertions did. The runtime property is now
`lightningProgress` and the trace records its progression.

The corrected tween passes all six cases in
`lightning-tween-final-1793092100.log` (1.8m). That was not visual acceptance:
inspection of its desktop mid-travel and impact images found the bolt starting
at a cached release point after the staff had moved. The candidate remains
under `client/tmp/cinder-lightning-1793006898657/` and is rejected as final proof.

Casting now holds the authored cue pose throughout charge and begins follow
through at projectile departure or restorative-field opening. Lightning charge
and bolt origins follow the actual animated staff emission point. The existing
cached release point remains the default for detached projectiles; the new live
origin option is explicitly tested against a different cached point. Fire,
Frost and healing require regression because their release timing uses the same
helper.

## Shipped staff emission-point regression

The next matrix, `lightning-attached-final-1793092500.log`, passes all 16
lightning/Frost/gold-spell cases (4.8m). Its computed live-origin distance is
zero, but screenshot inspection still finds the beam beside the staff. This
exposes the limit of comparing runtime geometry with the same metadata: it
cannot prove that the metadata describes the artwork.

The shipped `war-staff.png` is 26x176 pixels. Shared data still specified
`emission_point: [96, 18]`, outside that image. The image was inspected directly;
the point is now `[13, 14]`, inside its gem. No artwork is regenerated or resized.
The new catalog test reads the real PNG header and requires every authored
weapon emission point to fit its image. It fails against the old metadata
(`lightning-emitter-before-1793093100.log`: expected 96 to be less than 26).
This correction also benefits other staff casters, so the final run repeats
Fire/Frost/healing references rather than relying on the earlier mechanical
pass. The earlier matrix and captures remain rejected as final attachment proof.

## Native fixture and evidence boundaries

`cinder-lightning.spec.js` uses the existing server-owned advanced showcase,
whose Cinder already knows Shock and Thunder. It selects real Spell/Defend
commands, Shock's enemy target and Thunder's existing group mode. Actual Go
actions are retained, with one Shock target or two Thunder targets. No mocked
combat response is injected. This proves advanced spell playback, not a
legitimate level-one opening, new spell access or human first-visit pacing.

The native matrix includes Shock at desktop 1440x900, phone 390x844, short phone
375x667 and reduced-motion default 800x600; Thunder at desktop 1440x900 and
reduced-motion phone 390x844. Both phone sizes use touch. Read-only post-render
instrumentation records release/travel/contact ordering, actual damage labels,
wand attachment distance, foot/shadow alignment, group contact and cleanup.

```sh
source scripts/worktree-env.sh
source .envrc.local
cd client
VITE_PORT=3611 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
  HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
  XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
  npx playwright test --config=e2e/playwright.config.js \
  e2e/cinder-lightning.spec.js e2e/cinder-frost.spec.js \
  e2e/battle-vfx-gold-slices.spec.js \
  --output tmp/lightning-emitter-final-1793093300 \
  >tmp/lightning-emitter-final-1793093300.log 2>&1
```

The audit uses a separate API on 8690 built from current source and loading the
new shared metadata, plus Vite on 3611. The owner's API 8689, game on 3609 and
save database remain running. This separate audit does not silently replace the
owner's in-memory game. Content on the older live API requires a safe subsequent
server refresh; fresh client code alone cannot supply absent Go metadata.

## Gates and remaining acceptance

`make test` and `make validate-data` pass in
`client/tmp/lightning-emitter-{make-test,validate-data}-1793093300.log`.
`npm test` passes 841 tests in 98 files, `npm run build` and full
`npx prettier --check --ignore-path .gitignore .` pass in
`lightning-silhouette-{unit,build,prettier}-1793093700.log`.
No damage, encounter or progression pacing changes require new balance bands.

The visual workflow retains all 63 previous specs and adds the lightning matrix
with capture upload (64 specs total); coverage is recorded in
`client/tmp/lightning-workflow-1793092700.json`. New-head CI remains necessary.
The full playability goal, remaining spell/status/body identities, canonical
icons, terrain inspection and unassisted first-fifteen-minute acceptance remain
open.

## Inspected regression captures and current CI

The emitter-corrected full native command above passes all 16 cases (4.8m).
All 22 gold-spell PNGs are inspected through both pages of
`client/tmp/lightning-emitter-gold-review-1793093500.json`; all 90 Frost PNGs
in `client/tmp/cinder-frost-1793007631333/` are inspected through all eight pages
of `client/tmp/lightning-emitter-frost-review-1793093800.json`. Actual release
poses, departure from the staff, localized contacts, results and recovery remain
clear on desktop, phone and reduced motion. The showcase diagnostic panel is
development-only and is not ordinary game HUD acceptance.

A final adjustment sharpens only lightning's bends and branches so it reads as
a discharge rather than a nearly straight beam. Existing Fire/Frost/healing code,
shared metadata and timing are unchanged after their emitter-corrected matrix.
The current lightning-only command uses the same environment above with
`e2e/cinder-lightning.spec.js --output tmp/lightning-silhouette-final-1793093700`,
logging to `lightning-silhouette-final-1793093700.log`.

Pushed banner head `82c1d0d` passes all nine visual suites and the required summary
in hosted run `40298587413`. This verifies that head, not the newer lightning
change. General CI remains self-hosted per the owner's decision.

## Final HP/contact gate

The final native follow-up adds an explicit rendered HP-bar assertion. The first
instrumentation read a nonexistent entry-level `currentHP`; it now records
`entry.hpBar.currentHP`, the same rendered bar used by the existing bridge. This
is an audit correction, not a change to the game's HP logic. Every target must
start above zero, first decrease at or after the initial impact frame, and end
at its initial HP minus exactly Go's damage.

All six current cases pass (1.8m) in `lightning-hp-final-1793094200.log`, using
`e2e/cinder-lightning.spec.js --output tmp/lightning-hp-final-1793094200` with the
same environment above. Shock's reference is 352 → 319 (33 damage); Thunder is
352 → 300 and 136 → 69 (52 and 67 damage). Normal-motion travel samples have zero
measured distance from the live staff tip; the separate PNG bounds regression
and inspected artwork verify that the authored point is inside the actual gem.
Reduced motion has no cross-field travel. Both group impacts share a contact
frame and all effect graphics are gone on recovery.

All 66 final PNGs in `client/tmp/cinder-lightning-1793008142813/` are inspected
through all six pages of `client/tmp/lightning-hp-review-1793094400.json`.
The earlier sharpened-silhouette run also passes six cases (1.8m), with all 66
images inspected through `lightning-silhouette-review-1793094000.json`.
Final accepted references comprise the current 66 lightning captures plus the
22 gold-spell and 90 Frost regression captures described above. Nothing in these
advanced fixtures establishes unassisted early-game balance or pacing.
