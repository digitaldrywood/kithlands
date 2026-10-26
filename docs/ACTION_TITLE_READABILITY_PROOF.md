# Readable stationary battle action banners

PR #339, branch `codex/battle-grounding-walk-lag`.

The previous actor-anchored banner used 9/15 logical-pixel text, moved upward,
and shortened its display with battle speed. On phones it was small and easy
to miss. Action confirmation now occupies the quiet upper-left of the battle
field, with at least 14/18 CSS-pixel actor/action text. It fades without moving,
holds for 1100ms before its fade, and keeps the existing attack lead timing.
Names fit one line and actions at most two, with ellipsis for unusually long
text. The full action remains in the message window.

Only one banner exists at a time. Replacement, scene shutdown and victory
dispose its graphics, timer and tweens. No game rules, damage, rewards,
initiative, spell availability or shared content change (design §6.1).

## Native verification

`battle-action-title.spec.js` creates isolated normal level-one Warrior/Cinder
parties, forces two level-one Slimes, then selects Attack and Spark through
actual keyboard/touch commands. The Go response must contain those actions and
a real victory outcome; result UI must appear without a leftover banner.
There are no XP, item or level grants. This is a controlled combat reference,
not proof of unassisted opening-route pacing.

A separate presentation-only long-name fixture checks truncation. It does not
add a spell or alter party/game state. Read-only post-render observations assert
one banner, text containment, CSS font sizes, stationary position and at least
900ms at full opacity. The four traces show approximately 999–1010ms of full
opacity; the remaining time is the gentle fade-in/out.

Actual tested configurations: 1440x900 desktop; 800x600 with reduced motion;
390x844 and 375x667 phones. Phones use touch for commands, spells and targets.
The latter three use Fast battle speed. Desktop uses its slower preference.

```sh
source scripts/worktree-env.sh
source .envrc.local
cd client
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
  HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
  XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
  npx playwright test --config=e2e/playwright.config.js \
  e2e/battle-action-title.spec.js \
  --output tmp/action-title-spell-1793090100 \
  >tmp/action-title-spell-1793090100.log 2>&1
```

All four cases pass (36.5s). Existing API 8689 and audit Vite 3610 are reused
without restarting the owner's game on 3609 or touching player saves. Browser
state stays under this worktree's ignored `client/tmp/`.

All 20 final PNGs in `client/tmp/action-title-1793006124867/` were inspected via
`desktop-review.jpg`, `default-reduced-fast-review.jpg`, `phone-fast-review.jpg`
and `short-phone-fast-review.jpg` in that directory. Each view includes actual
Attack, Spark, long-text fixture and clean victory. Banners are contained,
contrasting, readable and clear of fighters. The four `*-trace.json` files
retain actual Go actions and measured rendering data.

Initial failed fixtures are retained: `action-title-native-1793089200.log`
used a text selector that missed a shortcut prefix; `action-title-selector-1793089400.log`
tapped Smart instead of Spell on phones, resolving the round automatically;
`action-title-magic-1793089600.log` requested the nonexistent label Magic.
The established Cinder native test confirms the actual command label Spell.
These were test-input errors, not demonstrated game regressions. The final
helper asserts its target exists before tapping and selects Spark by accessible
button name.

## Local gates and CI

- `npm test`: 839 tests in 98 files pass (`action-title-unit-1793090200.log`).
- `npm run build`: passes (`action-title-build-1793090200.log`).
- Full formatting check passes: `npx prettier --check --ignore-path .gitignore .`
  (`action-title-prettier-1793090400.log`).
- Existing `e2e/cinder-frost.spec.js` passes all four native configurations
  (1.2m), using the same environment above and
  `--output tmp/action-title-frost-1793090400`. Log:
  `action-title-frost-1793090400.log`. All 90 resulting PNGs in
  `client/tmp/cinder-frost-1793006196556/` were inspected through the eight pages
  listed in `client/tmp/action-title-frost-review-1793090800.json`. Release,
  projectile travel, contact, readable Frost banner and recovery remain intact.
  The development showcase diagnostic panel behind the banner is specific to
  this advanced fixture; ordinary Lv1 references above have no diagnostic panel.
- Workflow YAML parses; `action-title-workflow-1793090600.json` verifies 63 specs,
  no removals, duplicates or missing files.
- No Go/shared data changed; no new simulator run is required for this slice.
- The visual matrix retains its existing specs and adds this native regression
  to combat-effects, with `action-title-*` artifact upload.

Hosted visual run `40294831723` passes all nine suites and the required summary
on the previous pushed head `c597292`, verifying the combat job split. That
does not establish CI acceptance of the newer banner change. General CI keeps
the owner's self-hosted runner configuration.

Remaining battle work includes additional body choreography, spell families,
dense native mixed critical/miss counters and secondary metadata fonts. This
slice does not claim complete battle presentation or first-fifteen-minute
acceptance.
