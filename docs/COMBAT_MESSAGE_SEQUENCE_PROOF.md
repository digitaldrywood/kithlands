# Multi-hit opening caption reading-time regression

PR #339, `codex/battle-grounding-walk-lag`, following `5e82ba1`.

## Reproduction and repair

Hosted run 40264231869 on `32458c3` passed walking, gameplay, interiors,
campaign and escort. Combat completed 38 cases successfully but failed all
three `combat-text-readability.spec.js` viewport cases. This was an assertion
failure, not the earlier gameplay job-budget cancellation. Combat ran for
16.9 minutes, within its 30-minute job budget. Retained failed-job log:
`client/tmp/settlement-prior-ci-1793032000.log`.

The newer per-hit presentation first called revealLine with "Hero attacks Iron
Golem!", then replaced it at contact with "Hero → Iron Golem: strike 1/2".
The opening action text lasted roughly 229/227ms in hosted desktop/phone cases,
below the unchanged 1450ms minimum. Local before-fix reproduction failed all
three cases. Retained traces measured 197.3ms desktop, 195.9ms phone and 79.1ms
reduced motion. This was an actual rapidly replaced message, not a flaky
assertion or missing runner.

For multi-hit physical actions, the first-strike caption now begins with the
animation's anticipation. First contact retains that caption rather than
replacing it. Later strikes still wait for their reading beat and show the next
strike index; the final aggregate result remains. Single-hit wording, contact
animation, damage numbers, HP drain, per-hit critical/miss outcomes and server
mechanics are unchanged. No reading-time threshold was reduced and no test was
removed. The test now writes its timing trace before asserting, retaining
useful failure evidence, and captures the rendered second-strike caption.

## Gates and inspected evidence

From the worktree, using isolated Vite 3610/API8689 and worktree-local
browser/HOME/XDG folders:

- Before: native `combat-text-readability.spec.js`, three failures.
  `client/tmp/combat-message-before-1793032200.log` and
  `client/tmp/combat-text-{1792987133091,1792987138932,1792987144732}/`.
- After: native `combat-text-readability.spec.js battle-multi-hit.spec.js`,
  seven pass in 1.9 minutes. The four authoritative multi-hit references cover
  1440, 390, 375 and 800 reduced-motion viewports, preserve per-hit server/HP
  accounting and show first/second contact, wind-up and recovery.
  Log: `client/tmp/combat-message-after-1793032600.log`.
- Final caption-capture enhancement: native `combat-text-readability.spec.js`,
  three pass in 23.9 seconds; unchanged minimum is 1450ms. Final measured
  first-caption hold is 1671.6ms desktop, 1669.3ms phone and 1552.8ms reduced.
  `client/tmp/combat-message-final-1793033400.log`.
- `cd client && npm test`: 831 tests / 97 files pass.
- `cd client && npm run build`: pass, existing bundle warning remains.
- `cd client && npx prettier --check --ignore-path .gitignore .`: pass.
  Logs: `client/tmp/combat-message-{unit,build,format}-1793033000.log`.

All 54 final multi-hit screenshots/motion samples in
`client/tmp/battle-multi-hit-1792987243386/` inspected through
`client/tmp/combat-message-multi-review-1793033600-{0,1,2}.jpg`.
All nine final readability captures in `client/tmp/combat-text-1792987411909/`
inspected through `client/tmp/combat-message-readability-review-1793033800.jpg`.
That directory retains timing and text-bound/contrast audit JSON for all three
viewports. Crit/heal/miss floating-text samples are explicitly presentation
fixtures; the action-message timing and separate multi-hit references use
Go-resolved battle results. Showcase data is not a normal level-one route or
a claim of natural first-session balance.

No Go/content/save schema changes; no new simulator or backend gates warranted
for this renderer-only timing fix. No new body atlas, class expansion, or broader
combat presentation acceptance is claimed. Full relevant hosted CI remains
required on the pushed head; general CI stays self-hosted per owner instruction.
