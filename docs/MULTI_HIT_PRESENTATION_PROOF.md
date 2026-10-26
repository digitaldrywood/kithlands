# Server hit sequence presentation

2026-10-25, branch `codex/battle-grounding-walk-lag`, draft PR #339.

## Outcome

Go already returns individual physical hits. The renderer previously ignored
that array: the showcase Warrior's 52 + 65 damage appeared as one 117-point
strike. Physical attacks now play an authored strike/contact/recovery for each
resolved hit, show its actual damage and crit/miss flag, drain displayed HP in
steps, and report the server total once in the lower message area. Defeat is
presented after the final strike. Legacy aggregate responses remain playable
as one strike. No combat math, authoritative HP, RNG, rewards or content changed.

One mixed server result is 106 critical + 63 normal = 169 damage. The critical
pose now accompanies only the 106 hit. The existing critical regression now
compares its critical cue values to the individual server hits and checks the
actual defeat/number spacing, rather than requiring an aggregate critical next
to a defeat banner belonging to a later normal hit.

Sequential numbers replace only the previous text for that target after its
independent read hold. Normal holds remain at least 1200ms, crits 1500ms; battle
speed does not shorten them. Native first/second cue intervals measured 2309ms
at desktop, 2308ms phone, 1674ms phone Fast, and 2009ms reduced motion. This is
readability acceptance, not a human judgement of overall battle pacing.

## Verification

Run with existing root worktree environment, then from `client`:

```sh
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/battle-multi-hit.spec.js e2e/warrior-critical.spec.js e2e/battle-crowded-results.spec.js --output=tmp/multi-final-native-1793011300
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

**13 passed, 7.5m**. Four real-command multi-hit cases cover keyboard 1440×900,
touch 390×844, touch 375×667 Fast/instant messages and reduced motion 800×600.
They compare contact values/flags to Go, contact frame 3, per-target HP drain,
reading intervals, final total, CSS font/field/name bounds and shadow alignment.
Warrior shadow delta remained zero across recorded frames. Four existing
three-round critical cases cover the real mixed hit outcome; five crowded
Blaze cases guard the preceding group-result work.

**824 tests / 96 files pass**, production build and full client format pass.
Logs: `client/tmp/multi-final-native-1793011300.log`,
`multi-client-1793011300.log`, `multi-build-1793011300.log`,
`multi-prettier-1793011300.log`. The existing bundle-size advisory remains.

54 multi-hit PNGs/frame captures were inspected in
`client/tmp/multi-review-1793012300-{0..4}.jpg`; originals and traces are in
`client/tmp/battle-multi-hit-1792981156758/`. Another 69 critical/crowded PNGs
were inspected in `client/tmp/multi-regression-review-1793012600-{0..5}.jpg`;
originals are `client/tmp/warrior-critical-1792981248020/` and
`client/tmp/battle-crowded-1792981085276/`. The phone second-hit candidate was
also opened full size. Four final recovery captures from the native output
were inspected in `client/tmp/multi-extra-review-1793012800.jpg` (127 final
captures/frames inspected in total). This reuses approved body/weapon/effect assets; no new
sheets or art were generated. Hosted visual CI includes the new native proof.

The baseline test in `tmp/multi-before-1793010600` failed on the exact mismatch
(expected 52 and 65; received 117), and its actual `1440-hit-1.png` was inspected
in `tmp/battle-multi-hit-1792980835380/`. Earlier fixture diagnostics included
an extra equipment-close action and a development hot reload; they are not
acceptance runs. The separate Vite test process then disabled HMR with a local
ignored config; this does not change the game's production configuration.
A unit assertion initially compared a bookkeeping object to a scalar; the
replacement test instead verifies the visible target results and preserves
another target's text. No gameplay assertion was relaxed.

## Limits and other gates

This accepts ordinary two-hit Warrior attacks and their existing mixed-critical
reference. More-than-two hits, counters, dense single-target criticals, actual
server-resolved misses and all-class attacks remain open. Unit cases preserve
miss/crit order without inventing hits. Group Blaze is a separate accepted
reference. Save/progression rules and Go/shared files are unchanged, so Go/data
validators and balance sims were not rerun for this presentation-only slice.

Hosted predecessor `24d213d` run `40257579990` has a campaign walking-helper
failure; walking, escort and interiors are green. Input diagnostics and a
separate helper fix are being tracked independently. Neither this local proof
nor prior green runs substitute for this commit's remote gate. General CI
retains the owner's self-hosted runner preference.
