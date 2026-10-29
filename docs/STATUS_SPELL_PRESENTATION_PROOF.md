# Readable status spells and authoritative outcomes

PR #339 · branch `codex/battle-grounding-walk-lag` · base `f103bbf`.

Sleep, Mute and Slow used the same generic purple projectile, with no explicit
success/resistance metadata. Go now includes `status_effect`, `status_outcome`
(applied/resisted) and target name in its existing status receipt. The same
unchanged status-resolution branches decide the outcome. No client roll or
combat-log parsing decides success. Chance, resistance, MP, spell access and
status mechanics are unchanged.

Shared metadata selects original crescent/stars, crossed sound seal and
hourglass sigils. Release holds the authored cue pose; travel follows release;
a bounded foot-level sigil marks successful contact. Resistance breaks the
seal and shows RESISTED instead of an applied sigil. Stationary result labels
hold full opacity for 1200ms, independent of battle speed, then fade. Plain
messages say “Iron Golem resists Mute” or “Slow takes hold on Gargoyle,” with
no internal IDs. Slow now uses its existing loaded persistent status icon,
as Sleep/Mute already did. No character atlas or new class body pattern changed.

Reduced-motion release lasts at least 160ms, target cue 150ms and contact
500ms, even at Fast speed. No flying particles, rotation or travel occur.
The battlefield remains visible through open line art. The developer showcase
adds Sleep/Slow to its available slots; normal starting/saved books do not change.

## Root cause and retained intermediate failures

`go test ./api -run '^TestStatusReceiptMatchesResolvedOutcome$' -count=1`
fails all six spell/outcome combinations before implementation, because the
serialized receipt omits outcome, status and target name. After implementation
all six pass, comparing actual target status, unchanged HP and exact MP cost.
The test chooses deterministic real rolls without modifying spell chances.
Logs: `client/tmp/status-receipt-{before-1793014700,after-1793014900}.log`.

Initial native six cases pass at normal speed (`status-native-1793015700.log`),
with all 66 captures inspected via `status-review-1793016100.json`. Strengthened
Fast cases expose one reduced Slow travel sample. Removing recorder duplicate
suppression alone does not fix it: retained `status-final-1793016500.log` and
`status-final-1793016900.log` each show five pass/one fail. The complete trace
shows the cue compressed to about 40ms, only one rendered frame. Minimum
stationary cue durations fix the actual readability defect; the original
multiple-frame/no-travel requirement remains. All six then pass in 1.8m
(`status-final-1793017100.log`), with 66 inspected captures listed in
`status-final-review-1793017300.json`. Fast reduced cues retain 13/16 travel
samples spanning 142.8/142.7ms; normal travel spans roughly 382ms.

Visual review also finds raw enemy IDs in the lower status message. Structured
plain-language messages replace them; the final native cases require those
exact completed messages. Final actual-main-server proof below supersedes
intermediate caption captures.

## Final actual-game acceptance

Six native cases use the real level-12 showcase, real Go rounds and native
Defend/Spell/target commands. Cases: desktop and touch-phone Sleep; desktop and
Fast/default/reduced Mute; desktop and Fast/phone/reduced Slow. They verify:

- exact Go status type/outcome and target; unchanged enemy HP and exact MP cost;
- release frame 3 within 1px of the staff, following shadow within 0.1px;
- release → travel → impact, and result text first appearing at contact;
- stationary reduced travel under 0.5px versus normal over 200px;
- at least 16 CSS-pixel labels, clear enemy-name/HUD lanes and over 1100ms
  high-opacity reading samples; observed final holds are 1365–1383ms;
- persistent icons matching final Go enemy status, including Slow;
- plain-language receipt, no page errors and zero surviving status effects
  after ordinary round recovery.

All six pass against the actual main server in 1.7m:
`client/tmp/status-live-1793017700.log`. Sleep, Slow and one Mute apply; another
Mute is naturally resisted. All 66 final PNGs in
`cinder-statusSpell-1793014387374/` inspected through the six pages in
`status-live-review-1793018000.json`. All twelve fire/heal/lightning regression
cases pass in 3.6m (`status-regression-1793016000.log`), with all 88 PNGs inspected
via eight pages in `status-regression-review-1793016700.json`.
These advanced fixtures verify presentation, not first-session acquisition,
balance, fresh-player pacing or complete Mender body-art acceptance.

## Exact commands and local gates

Root: `make test`, `make validate-data`, `make balance-sim` all pass. Balance
smoke retains Warrior/Cinder, normal levels 1–20, 200 battles/level, seed 42
(4000 battles). Logs: `client/tmp/status-{go,data,balance}-1793015800.log`.
Server: `go vet ./...`, `go build ./...`, `golangci-lint run ./...` (zero issues),
`go test -race ./...` all pass; API race package finishes in 583.250s without
changing its timeout. Logs: `status-{vet,server-build,lint,race}-1793015800.log`.
Client: `npm test` (844 tests / 98 files), `npm run build`,
`npx prettier --check --ignore-path .gitignore .` pass after the final caption
change. Logs: `status-caption-{unit,build,prettier}-1793017500.log`.

With root worktree environment loaded, then `cd client`:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
  HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
  XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
  npx playwright test --config=e2e/playwright.config.js \
  e2e/status-spell-feedback.spec.js --output tmp/status-live-1793017700 \
  >tmp/status-live-1793017700.log 2>&1
```

Audit commands use VITE_PORT=3611 and the corresponding output/log names above.
Regression command uses the same environment and
`e2e/battle-vfx-gold-slices.spec.js e2e/cinder-lightning.spec.js`, output/log
`tmp/status-regression-1793016000`. Managed services preserve the owner ports.

## Save continuity and CI

Normal Save and exit checkpoints the owner's adventure at 06:32:25 CDT.
Only the verified API 8689 process stops gracefully. The new Go binary
`client/tmp/kithlands-status-1793015500` starts with the same DB/shared environment;
managed session `10821`, log `status-live-api-1793017700.log`, health OK.
The preferred browser connector reports no IAB backend; available CUA controls
perform normal Continue and Save. No credential extraction or player grants.

The restored/saved party, inventory, quest/world state, RNG seed, spawn node and
locality match exactly. `status-refresh-comparison-1793017900.json` records
SHA-256 `ca64c1bfa7ff492bd138b44df938047089265281d3e6da2e8316b56f54039517`.
The four level-five companions, 495 gold, 14 potions, zero Ether and tile
(23,143) are preserved. Inspected `status-owner-ready-1793017800.png` leaves
World ready to play. PostgreSQL/Vite/save history remain intact.

Icon head `e7d4d70` run 40311096004 and ice head `f103bbf` run 40312460833 pass
all nine visual suites and the protected summary. The latter combat-effects
job takes 29 minutes: browser install 12m45s, native tests 15m13s. Adding six
status cases would exhaust its 30-minute budget. Physical combat and spell
motion now have separate visual suites, preserving all 66 prior specs plus
the new status spec (67 total), all assertions/timeouts and the protected
all-suites-success gate. YAML parses; no removed/duplicate/missing specs.
Evidence: `status-prior-ci-1793018200.json`,
`status-workflow-final-1793018200.json`. Fresh head CI is required. General CI
remains self-hosted per owner instruction.

Broader melee/body choreography, environments, remaining item artwork and
legitimate first-fifteen-minute pacing remain open. The goal remains active.
