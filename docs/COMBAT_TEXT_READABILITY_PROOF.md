# Combat text readability

2026-10-25 · branch `codex/battle-grounding-walk-lag` · draft PR #339 · no separate assigned issue.

## Change

The earlier damage text rose 44–60 pixels while fading immediately over roughly one second. Miss text was 14px and disappeared in 680ms. Critical text pulsed alpha while being read.

Numbers now use a proportional bold font, stronger 4px dark outline, larger sizes and brighter fire/ice/dark colors. Travel is limited to 16–24 pixels; full opacity holds for 1200ms before the final fade, or 1500ms for a critical. A critical explicitly says `CRITICAL`, and is lifted higher to clear the target's name. Critical text no longer flashes. Reduced-motion numbers stay still and skip the bounce. Text lifetime is not multiplied by the battle animation speed preference.

The action prompt now has a minimum reading interval between resolved log entries and after the final entry. Its interval accounts for the selected typewriter speed, so fast body animations cannot immediately replace a partially revealed line. This presentation wait does not alter turn order, damage, status or server resolution.

Critical hits already differ through gold damage text, larger bounce, extra impact sparks, critical sound and optional shake. They still use the same authored character attack poses. This change does not add a separate critical body animation, elemental character atlas, or new combat rule.

## Validation

- `cd client && npm test -- --run` — 778 tests, 91 files pass.
- `cd client && npm run build` — passes; existing large-chunk warning remains.
- `cd client && npx prettier --check --ignore-path .gitignore .`
- `cd client && npx vitest run src/ui/floating_text.test.js` — four tests: stroke/bounce, critical full-opacity hold and release, stationary reduced motion, elemental color/timing.
- `combat_read_time.test.js` checks the minimum interval, post-typewriter reading period, empty input and bounded long-line delay.

Actual Chromium proof reused the running API/Vite to avoid restarting the user's play session. The worktree environment and `.envrc.local` were sourced, with worktree-local HOME/XDG_CONFIG_HOME/XDG_CACHE_HOME/PLAYWRIGHT_BROWSERS_PATH as used by `scripts/run_playwright_local.sh`:

- `cd client && npx playwright test --config=e2e/playwright.config.js e2e/combat-text-readability.spec.js e2e/interior-templates-proof.spec.js e2e/combat-contact-polish.spec.js` — seven pass.
- `cd client && npx playwright test --config=e2e/playwright.config.js e2e/field-magic-repeat.spec.js e2e/battle-vfx-gold-slices.spec.js` — ten pass (six spell paths and repeat Cure at four widths).
- Final lifted critical-label rerun: `cd client && npx playwright test --config=e2e/playwright.config.js e2e/combat-text-readability.spec.js`.

The readability proof runs at 1440×900, 390×844 and reduced-motion 800×600, with Fast battle speed and instant messages. It injects known critical/damage/heal/miss values into the real scene's text pool for deterministic visual/timing proof without changing HP. It checks critical opacity after 1100ms and eventual release, and then submits a real authoritative attack round and verifies at least 1450ms between action messages.

Inspected first-run screenshots: `client/tmp/combat-text-1792938294351/1440-critical-held.png`, `390-critical-held.png`, `800-critical-held.png`, and the damage/heal/miss captures in the same folder. JSON timing traces and final rerun captures use unique run directories under `client/tmp/combat-text-*`. The in-app browser connector was attempted but unavailable; actual game proof used isolated Chromium.

## CI follow-up

The previously blocked walking suite now passes all 24 remote checks after the checksum/runner fixes. Two newly exposed test synchronization defects were corrected:

- Interior secret-passage proof now waits for each Town movement to complete. It still requires the exact `(3,4)` destination; it does not bypass the movement lock.
- Field-magic proof now observes menu readiness and the actual cursor label before keyboard confirmation. Previously an MP update could arrive before the rebuilt menu processed hover/cursor state. Repeated Cure passes all four viewport sizes, retaining keyboard coverage at 800px.

These are test synchronization changes, plus read-only cursor/busy fields on the development bridge. Final remote CI conclusions must be checked separately. The next exploration-event feature remains planned in `GAME_FEEL_NEXT_SLICE.md`; overall progress is recorded in `PLAYABILITY_TRACKER.md`.

Final inspected rerun: `client/tmp/combat-text-1792938443098/` (critical label raised above the target name). Actual Fast-speed action-line intervals were 1504ms at 1440px, 1502ms at 390px and 1504ms under reduced motion at 800px. All three readability flows pass, as do the final 778 client tests, build and formatting check. The local API remained healthy throughout.
