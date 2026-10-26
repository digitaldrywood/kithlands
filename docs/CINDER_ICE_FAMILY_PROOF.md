# Chill, Iceshard and Blizzard presentation

PR #339 · `codex/battle-grounding-walk-lag` · base `e7d4d70`.

Three ice spells still used the generic effect path. Shared presentation
metadata now selects the existing original faceted release, lance and bounded
shatter: Chill tier 1, Iceshard tier 2, Blizzard tier 3. Intensity uses the
existing projectile scale contract. The two group spells launch a lance to
each authoritative target and contact together. Reduced motion retains
stationary release/target cues with no travel or flying chips. This expands
the accepted Frost family; it does not introduce a separate Blizzard storm
asset or change character body animation.

Only the three presentation objects change in `shared/spells.json`.
Removing those objects yields the exact prior JSON. Power, charges, prices,
access, targeting and combat calculations are unchanged. The developer-only
showcase adds Chill and Blizzard, filling its existing three-spell capacity at
levels two and four. Normal saved spellbooks and starting spell lists do not
change. No new runtime renderer code, paid dependency or generated art.

## Controlled before

Against the unchanged audit API, native Iceshard completes its real Go round
but fails the new presentation assertion because `action.presentation` is
undefined. Retained log: `client/tmp/ice-family-before-1793013000.log`.
The inspected `cinder-iceFamily-1793012209026/1440-iceshard-generic.png` shows
the generic staff orb; final metadata was not loaded until after this failure.

## Native acceptance and limits

Six new cases cover desktop normal Chill/Iceshard/Blizzard, default reduced
Chill, phone touch normal Iceshard and phone touch reduced Blizzard. Native
Defend/Spell/target controls produce the actual Go round. Each case requires:

- exact server family/tier and one or two expected resolved actions;
- authored frame-3 release within 1px of the live staff tip;
- ordered release, travel and impact, with group impacts in the same frame;
- rendered enemy HP first changing at/after contact and ending at the exact
  Go damage total, with matching target-specific damage text;
- over 200 logical pixels of normal travel, under 0.5 in reduced motion;
- following shadow within 0.1px and zero remaining ice-family effects after
  ordinary round recovery, with no page errors.

The fixtures deal Chill 8/11, Iceshard 14 and Blizzard 17/22 against the showcase
Iron Golem/Gargoyle. These values come from actual Go results. The showcase is
an advanced reference, not natural progression or first-visit pacing. Existing
Frost cases also retain their release/contact/recovery, reading hold and aura
layering assertions at 1440, 390, 375 and 800px.

All ten cases pass in 3.1 minutes. All 66 new PNGs and 90 Frost motion/stage
frames are inspected. Manifests under `client/tmp/`:
`ice-family-new-review-1793013700.json` (nine pages),
`ice-family-frost-review-1793013600.json` (eight pages).
Sources: `cinder-iceFamily-1793012332794/` and
`cinder-frost-1793012258302/`. Phone Blizzard damage also inspected full-size:
separate labels remain clear of enemy names and the battle HUD.

## Exact gates

Root: `make test`, `make validate-data`.
Client: `npm test` (841 tests / 98 files), `npm run build`,
`npx prettier --check --ignore-path .gitignore .`. All pass.
Logs: `client/tmp/ice-family-{go,data,unit,build,prettier}-1793013300.log`.
No mechanics/pacing changed, so no additional balance simulation was required.

```sh
source scripts/worktree-env.sh
source .envrc.local
cd client
VITE_PORT=3611 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
  HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
  XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
  npx playwright test --config=e2e/playwright.config.js \
  e2e/cinder-ice-family.spec.js e2e/cinder-frost.spec.js \
  --output tmp/ice-family-native-1793013300 \
  >tmp/ice-family-native-1793013300.log 2>&1
```

Managed audit servers avoid the wrapper stopping owner ports. Workflow YAML
parses; all 65 previous native specs remain, with this spec added (66 total).
Coverage record: `ice-family-workflow-1793013500.json`.

## Actual main server and player continuity

The owner normally saved/exited, then Continue loaded the newest 06:02:32 CDT
manual checkpoint after only API 8689 restarted with current shared content.
The existing binary and database were reused; PostgreSQL and Vite stayed up.
Current API managed session `11505`, log
`ice-refresh-live-api-1793014000.log`; health returns OK.
No player items/spells/levels were granted. Saved gameplay fields compare
exactly before/after: `ice-refresh-comparison-1793014200.json`, SHA-256
`ca64c1bfa7ff492bd138b44df938047089265281d3e6da2e8316b56f54039517`.
The same level-five party, resources, quests and tile (23,143) are preserved.
Inspected `ice-refresh-ready-1793014100.png` leaves World ready to play on 3609.

A separate disposable showcase runs the same native command against
`VITE_PORT=3609`, with `--grep 1440-blizzard`, output/log
`tmp/ice-family-live-1793014000`: one pass (19.7s). All twelve actual-server
captures in `cinder-iceFamily-1793012590104/` inspected using the two pages in
`ice-family-live-review-1793014300.json`.

Prior verification head `178ec27` passes all nine hosted visual suites and the
required summary in run 40307581281. Icon head `e7d4d70` run 40311096004 is still
in progress; this ice follow-up needs a fresh gate. General CI remains
self-hosted. Sleep/Mute/Slow identity, broader body choreography, gear artwork,
environments and human first-session pacing remain open. Goal remains active.
