# Repeated field-Cure input diagnostics

2026-10-25 · `codex/battle-grounding-walk-lag` · PR #339.

Remote run `40203229574` intermittently timed out waiting for a second Cure's MP deduction at 800px, after its cursor-selection checks passed. The same preceding visual suite passed. Retained evidence from subsequent run `40207076015` now establishes the cause and a runtime correction, described below.

The unchanged 800px test passed five baseline repeats. With test-only observation it passed five six-times-CPU-throttled repeats and fifteen normal-speed repeats. All four viewports then passed (1440, 800, 645 and 390). No cast-count, MP, healed-target, rejection-recovery, pending-double-click or keyboard-confirmation assertion was removed or relaxed.

The diagnostic helper records native and Phaser keys, the selected row and disabled/busy state, HP/MP and spell-request targets. It exposes the game only through the test's intercepted development entry module; production code is unchanged. Each final run writes a unique JSON file, attaches it to Playwright output, and saves a failure screenshot if needed. `KITHLANDS_INPUT_STRESS=6` optionally throttles isolated Chromium for investigation. It never changes characters, selects a target or casts a spell itself.

Latest inspected four-viewport proof: `client/tmp/cure-all-1792941600/`, with `field-input-*.json` and `field-repeat-1792941595268-<width>-{before,after}.png` in each viewport's output directory. Inspected the 800px and phone result screenshots and all four request/key summaries. The successful 800px trace delivers ArrowUp → ArrowDown → Enter to Sparks, starts the second cast, and ends at zero MP; another Enter at zero MP sends no additional request. The three observed spell requests consist of the deliberately rejected first attempt and two accepted casts.

Commands use the existing running API/Vite and the worktree-local browser HOME/XDG/browser-cache environment from the local wrapper:

- `npx playwright test --config=e2e/playwright.config.js e2e/field-magic-repeat.spec.js --grep '800px' --repeat-each=5 --output=tmp/cure-baseline-1792941200`
- Same test with `KITHLANDS_INPUT_STRESS=6`, five repeats, output `tmp/cure-stress-1792941300`.
- Same test at normal CPU speed, fifteen repeats, output `tmp/cure-timing-1792941400`.
- `npx playwright test --config=e2e/playwright.config.js e2e/field-magic-repeat.spec.js --output=tmp/cure-all-1792941600`

Only the final trace-check and four-viewport runs retained JSON artifacts after correcting the attachment writer. Earlier repeated runs establish their reported test results, not retained per-key trace evidence. The helper now writes an actual file so the CI artifact upload can preserve it independently of reporter configuration.

Local repeated success alone did not establish that the reported intermittent defect was gone; retaining the actual failing remote trace was necessary.

A subsequent CI-equivalent npm audit exposed newly published Vite/Vitest advisories in the installed versions. `npm audit fix` updated only the lockfile within existing package ranges (Vite 6.4.5, Vitest/@vitest/mocker 4.1.12). `npm audit --audit-level=moderate` then reported zero vulnerabilities. All 778 unit tests, build and full formatting check pass on the patched versions. The four repeated-Cure cases and both Heron flows pass together with `--output=tmp/dependency-playability-1792941700`. This dependency repair does not establish the cause or resolution of the intermittent remote input failure.

## Native event replay: diagnosed and corrected

Run `40207076015` retained `field-input-1792942442266.json` in the gameplay artifact. The browser delivered ArrowUp and ArrowDown once each. Phaser delivered the same native ArrowUp multiple times around ArrowDown, moving the cursor past Hero to Willow. Only the first accepted cast reached the API; the second selected a full-health target, which correctly rejected spending MP.

Phaser's keyboard manager retains its native event queue until the frame ends and processes it on incoming events. Its keyboard plugin only rejects adjacent matching code/time/type entries. Interleaved down/up entries can therefore re-emit the same native key event. Field magic now wraps its registered handler with `oncePerKeyEvent`: a WeakSet ignores repeated event objects while preserving distinct presses and browser-generated repeat events. No cast or target mechanics moved out of Go.

The regression retains the real ArrowUp event and re-delivers that exact object twice through the scene keyboard emitter. Before the fix, `tmp/cure-replay-before-1792942500` fails: expected Hero, received Shade. After the fix, all four viewport cases pass in `tmp/cure-dedup-1792942700`, retaining all MP, request-count, healed-target, failure-recovery and zero-MP assertions. Inspected the 800px and 390px final screens: Sparks remains selected and the cast result is readable. An earlier attempt was interrupted by a development-server reload during unrelated source edits; it is not counted as successful proof.

Targeted unit tests exercise interleaved replay, distinct presses, native repeats, callback context and arguments. `npx vitest run src/systems/keyboard_events.test.js src/scenes/field_magic.test.js` passes 10 tests. The full working-tree client suite passes 782 tests and the production build passes. A new remote run is still required before claiming the remote gate is restored.

Five additional 800px repeats with `KITHLANDS_INPUT_STRESS=6` pass, including deliberate replay, in `tmp/cure-dedup-stress-1792942800`. Full client Prettier check passes. These runs reuse the live server with isolated worktree-local browser HOME/XDG/cache directories and do not reset saves.

Remote confirmation: visual run `40209842181` on `e217cba` passes gameplay (including all Cure viewport/replay cases), walking, interiors and the protected summary. This closes the observed Cure input failure; general CI's unavailable self-hosted runner is a separate infrastructure gate.
