# Warrior victory playback readiness in CI

PR #339, branch `codex/battle-grounding-walk-lag`, parent `4a03e84`.
Hosted runs 40367882047 and 40370096065 each failed only the normal-motion
desktop/phone Warrior victory assertions. Their other ten visual suites passed.

The Go win arrives before playback and victory poses finish. The test immediately
used Playwright's default five-second dialog assertion. Downloaded run40367882047
error contexts show the correct VICTORY receipt (gold105, XP+10, Potion) in the
failure snapshot immediately after that timeout. Reduced motion passed both
hosted runs. This evidence indicates readiness timing, not lost rewards.

The test now waits up to15 seconds for the native loot/Continue handoff, processes
any loot choice, then checks the receipt. No sleep or removed assertion: pose
frames1/2, fixed body/feet/shadow, no receipt during pose, reduced-motion flags,
Go rewards, keyboard/touch Continue, preserved rewards on acknowledgement and
usable World remain checked. No runtime code or animation timing changed.

A temporary exact test copy added only Chromium CPU throttling rate4. The old
readiness assertion passed that desktop repro locally, so the hosted failure was
not reproduced locally. After the fix all six cases pass: normal and throttled
1440desktop,390touch and800reduced. The temp spec is preserved outside discovery
at `client/tmp/warrior-victory-ci-repro-1793066400.js` and not shipped.

From `client/`, using worktree-local browser/cache paths and existing services:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/warrior-victory.spec.js e2e/warrior-victory-ci-repro.spec.js --output=tmp/victory-ci-lifecycle-1793066400
```

Six pass in55.3s. Final30 PNGs (three poses, receipt, World per case) inspected in
`client/tmp/warrior-victory-1793037684557/` (throttled) and
`client/tmp/warrior-victory-1793037716524/` (normal). Review source map and five
pages: `client/tmp/victory-ci-review-1793066500/`. Logs:
`client/tmp/victory-ci-before-1793065800.log`,
`client/tmp/victory-ci-lifecycle-1793066400.log`, and parent failure logs
`client/tmp/cinder-ko-parent-ci-{40367882047,40370096065}.log`.

An extra local run was inadvertently started after a wrong-directory edit failed;
it passed six original-readiness cases, is not the final acceptance run, and is
retained as `client/tmp/victory-ci-after-1793066200.log`. The corrected final run
above is authoritative. New remote head still needs CI. Self-hosted general CI
labels and owner services/session/saves are preserved.
