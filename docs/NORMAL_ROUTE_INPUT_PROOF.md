# Native route input acknowledgement

2026-10-25, branch `codex/battle-grounding-walk-lag`, draft PR #339.

## Failure and fix

Hosted run `40257579990` (`24d213d`) failed the 390px natural campaign case in
`helpers/normal-route.js:110`, waiting for one World tile. The retained request
history ends at (46,62), with no JS errors and the player standing in the world.
The helper previously pressed and released each arrow after 40ms. World movement
samples held keys on game frames, so a press can begin and end between frames.
The remote video does not expose key-event timing: attributing that exact CI
step to this mechanism is an evidence-supported inference, not a captured
remote event. The deterministic reproduction below proves the helper failure.

The helper now holds native key input until the exact requested tile starts,
releases it in `finally`, then awaits the existing exact destination and completed
animation/authoritative arrival. Cross-scene encounters still return to the
caller normally. It never retries a lost step, skips a path tile, teleports,
turns off encounters, or relaxes destination assertions. Runtime movement,
walk sheets, pacing, server mechanics and saves are unchanged.

## Delayed-frame reproduction

`e2e/normal-route-input.spec.js` starts an ordinary seed-6 game and deliberately
pauses only the renderer loop for 250ms. Native arrow down/up events and the
resume timestamp are recorded; the game state and input queue are untouched.
Before the fix, both desktop and phone viewport tests fail: the key is released
about 203ms before the first resumed frame, and the player stays at (46,37)
instead of moving to (46,38). After the fix, the key is released after the game
acknowledges that tile, with no extra movement. Final browser timeouts use the
same 15 seconds as the campaign test; the first diagnostic used four seconds.

Baseline command (existing worktree-local browser environment, from `client`):

```sh
npx playwright test --config=e2e/playwright.config.js e2e/normal-route-input.spec.js --output=tmp/route-input-before-1793012000
```

Two expected failures, log `client/tmp/route-input-before-1793012000.log`.
Recorded originals: `client/tmp/normal-route-input-1792981313639/` and
`client/tmp/normal-route-input-1792981320774/`.

Final command:

```sh
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/normal-route-input.spec.js --output=tmp/route-input-accepted-1793014900
```

**2 pass, 5.7s**, log `client/tmp/route-input-accepted-1793014900.log`. An earlier
corrected run also passes both cases, with key-up 22ms/41ms after wake and exact
single-tile destinations. Its full-size captures were inspected in
`client/tmp/normal-route-input-1792981348281/`. The final two captures in
`client/tmp/normal-route-input-1792982338107/` were inspected in
`client/tmp/route-input-accepted-review-1793015000.jpg`. Both key-down-before-wake
and key-up-after-wake are asserted, so the fixture cannot pass by delivering
its input only after the delayed frame.

## Campaign and other gates

The unchanged campaign suite is being rerun in its normal CI configuration:

```sh
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/campaign-first-level.spec.js --output=tmp/route-input-campaign-final-1793012900
```

**3 pass, 9.3m**: desktop 82.802s, phone 421.915s (including intentional
Defend-only defeat and recovery), default 49.105s. Log
`client/tmp/route-input-campaign-final-1793012900.log`. All 38 final screenshots
in `client/tmp/campaign-first-level-1792981716596/` were inspected in
`client/tmp/route-input-campaign-review-1793014800-{0..4}.jpg` (those sheets also
contain two earlier corrected step captures). Phone natural level-up was opened
full-size. The phone route recovered at 332.473s, retried at 333.197s and won at
364.945s. These are automated timings, not human first-visit pacing estimates.
The suite keeps natural encounters,
starting money/XP, exact steps, quest defeat/retry, return/report, level-up,
reward replay and save/reload assertions.

A separate diagnostic with `--trace on` completed the desktop gameplay
assertions (92.241s) but then reported a 30000ms timeout and left an incomplete
trace ZIP. Its phone case was explicitly interrupted during the deliberate
defeat path, and 800px did not run. This is not acceptance evidence and is not
the remote walking timeout. Log: `client/tmp/route-input-campaign-1793012300.log`.
The normal CI configuration retains videos and screenshots; no CI setting or
assertion was disabled to work around that diagnostic failure.

The immediately preceding combat change passes 824 client tests, production
build, formatting and 13 native battle cases; see `MULTI_HIT_PRESENTATION_PROOF.md`.
Only tests/helpers/workflow/docs change here, so no Go/data/balance rerun is
needed. This is test-input reliability, not a new all-class movement approval.
The final hosted gate is still required. General CI remains self-hosted by the
owner's explicit preference.

Full-client formatting passes in
`client/tmp/route-input-accepted-format-1793014900.log`. Hosted predecessor
`24d213d` run `40257579990` finished with walking, gameplay, escort and interiors
passing; campaign failed at the recorded input wait. The follow-up needs its
own remote campaign/summary result before claiming remote recovery.

The main local game remains available on port 3609; the newest 9:12:21 PM CDT
autosave was restored through Continue. World proof
`client/tmp/multi-player-world-1793013700.png` was inspected. Only the separate
3610 test Vite process is stopped after the checks. Main API/client/PG and
existing player saves are preserved.
