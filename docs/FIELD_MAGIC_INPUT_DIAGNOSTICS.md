# Repeated field-Cure input diagnostics

2026-10-25 · `codex/battle-grounding-walk-lag` · PR #339.

Remote run `40203229574` intermittently timed out waiting for a second Cure's MP deduction at 800px, after its cursor-selection checks passed. The same preceding visual suite passed. This is not yet a diagnosed or fixed runtime defect.

The unchanged 800px test passed five baseline repeats. With test-only observation it passed five six-times-CPU-throttled repeats and fifteen normal-speed repeats. All four viewports then passed (1440, 800, 645 and 390). No cast-count, MP, healed-target, rejection-recovery, pending-double-click or keyboard-confirmation assertion was removed or relaxed.

The diagnostic helper records native and Phaser keys, the selected row and disabled/busy state, HP/MP and spell-request targets. It exposes the game only through the test's intercepted development entry module; production code is unchanged. Each final run writes a unique JSON file, attaches it to Playwright output, and saves a failure screenshot if needed. `KITHLANDS_INPUT_STRESS=6` optionally throttles isolated Chromium for investigation. It never changes characters, selects a target or casts a spell itself.

Latest inspected four-viewport proof: `client/tmp/cure-all-1792941600/`, with `field-input-*.json` and `field-repeat-1792941595268-<width>-{before,after}.png` in each viewport's output directory. Inspected the 800px and phone result screenshots and all four request/key summaries. The successful 800px trace delivers ArrowUp → ArrowDown → Enter to Sparks, starts the second cast, and ends at zero MP; another Enter at zero MP sends no additional request. The three observed spell requests consist of the deliberately rejected first attempt and two accepted casts.

Commands use the existing running API/Vite and the worktree-local browser HOME/XDG/browser-cache environment from the local wrapper:

- `npx playwright test --config=e2e/playwright.config.js e2e/field-magic-repeat.spec.js --grep '800px' --repeat-each=5 --output=tmp/cure-baseline-1792941200`
- Same test with `KITHLANDS_INPUT_STRESS=6`, five repeats, output `tmp/cure-stress-1792941300`.
- Same test at normal CPU speed, fifteen repeats, output `tmp/cure-timing-1792941400`.
- `npx playwright test --config=e2e/playwright.config.js e2e/field-magic-repeat.spec.js --output=tmp/cure-all-1792941600`

Only the final trace-check and four-viewport runs retained JSON artifacts after correcting the attachment writer. Earlier repeated runs establish their reported test results, not retained per-key trace evidence. The helper now writes an actual file so the CI artifact upload can preserve it independently of reporter configuration.

Keep the CI failure open until a failing trace explains the cause or stronger evidence establishes a stable correction. Local repeated success alone does not prove the reported intermittent defect is gone.

A subsequent CI-equivalent npm audit exposed newly published Vite/Vitest advisories in the installed versions. `npm audit fix` updated only the lockfile within existing package ranges (Vite 6.4.5, Vitest/@vitest/mocker 4.1.12). `npm audit --audit-level=moderate` then reported zero vulnerabilities. All 778 unit tests, build and full formatting check pass on the patched versions. The four repeated-Cure cases and both Heron flows pass together with `--output=tmp/dependency-playability-1792941700`. This dependency repair does not establish the cause or resolution of the intermittent remote input failure.
