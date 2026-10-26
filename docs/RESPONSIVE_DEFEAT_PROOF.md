# Ordinary defeat and explicit save recovery

PR #339, branch `codex/battle-grounding-walk-lag`.

Ordinary defeat previously used fixed 800x600 canvas text, yielding tiny phone
labels. Its “LOAD LAST SAVE” button only opened Title. The new responsive receipt
reports the Go result, lists the party, and offers accurately labelled “Choose a
save” and “Title screen” actions. Save choice opens the established latest-save /
optional-history screen. It does not silently load or discard current progress.
Dungeon, quest and final-battle server recovery contracts remain unchanged.

The receipt reuses the scene-owned viewport dialog: 14px minimum secondary text,
16px primary copy, 18px names, canonical portraits, visible Alt/Esc shortcuts,
Tab/Shift+Tab, native Enter and pointer/touch. Party rows scroll while the heading
and actions remain fixed. A single-exit guard and shutdown disposal remove old
controls before Title or a subsequently loaded game. Battle result handoff now
cancels floating-text tweens, then destroys the old canvas display objects.

## Verification scope

`e2e/defeat-receipt.spec.js` creates a separate account and a real single-Warrior
manual game, saves it through Go, then uses an explicitly controlled combat
fixture: HP=1 and a forced level-10 Goblin. Native Defend commands produce a real
Go `phase=defeat` and zero HP. The actual receipt opens the actual save list;
selecting the test's pre-battle save restores exact party, gold, inventory and
quest state. A second real loss verifies native Title / Escape exit. This is
ordinary defeat recovery proof, not natural first-visit difficulty/pacing proof.

A separately labelled presentation-only fixture checks four long party names,
portrait identities and top/bottom scrolling. The authoritative single-member
Go loss is restored immediately before recovery input. The fixture does not
claim a naturally defeated four-member party or award/progression acceptance.

Coverage: 1440x900 desktop, default 800x600, 390x844 portrait and 375x667 short
portrait. The first four actual-defeat/recovery cases passed in 46.0 seconds
(`client/tmp/defeat-native-1793082600.log`). The final combined gate adds maximum
party/long-name captures and reruns victory receipts and earned-loot decisions.

Existing isolated API 8689 / Vite 3610 / local PostgreSQL services are reused;
owner port 3609 and saves are preserved. Native command:

```sh
source scripts/worktree-env.sh
source .envrc.local
cd client
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
  HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
  XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
  npx playwright test --config=e2e/playwright.config.js \
  e2e/defeat-receipt.spec.js e2e/victory-receipt.spec.js \
  e2e/post-battle-loot.spec.js e2e/save-adventures.spec.js \
  --output tmp/defeat-pool-final-1793083800 \
  > tmp/defeat-pool-final-1793083800.log 2>&1
```

Client gates: `cd client && npm test` (838 tests), `npm run build`, and
`npx prettier --check --ignore-path .gitignore .`. Logs:
`defeat-unit-1793082700.log`, `defeat-build-1793082400.log`, and
`defeat-format-check-1793082700.log`. No Go or shared rules changed; no new
simulator run is required.

The new defeat spec joins the existing hosted combat suite; save-adventure
navigation joins the hosted menu suite. Existing cases, server authority,
timeouts and protected summary gate are preserved. General CI stays self-hosted.
Fresh head CI remains required. Remaining battle choreography, dense-result
labels, secondary metadata/art/environment work and human opening pacing stay
open in `PLAYABILITY_TRACKER.md`.

## Cleanup regression and retained failures

A native before-fix assertion proves `children.removeAll(true)` left live battle
actors/controls behind (`client/tmp/defeat-cleanup-before-1793083400.log`). Phaser's
installed `Structs.List.removeAll(skipCallback)` removes list entries, not their
objects. Explicit destruction corrected that check but exposed an outstanding
floating-text fade trying to reset a destroyed Text canvas. Four defeat cases
failed while 12 victory/loot/save cases still passed in
`defeat-cleanup-final-1793083500.log`. The diagnostic stack in
`defeat-cleanup-stack-1793083700.log` identifies `FloatingTextPool.release` /
`_reset` and Phaser `Frame.updateUVs`; it is retained as failed proof.

The corrected order calls the existing floating-text pool `destroy()` first,
which kills its tweens, then destroys a snapshot of remaining children. The
native loss now requires every captured old battle object to have no live scene,
checks for page errors, and performs an actual save load and second defeat. No
readability hold, animation duration, combat rule or test timeout was shortened.

Client tests still pass (838) in `defeat-pool-unit-1793083900.log`; build and
formatting rerun in `defeat-pool-{build,prettier}-1793083900.log`.
The earlier full visual run on `c4839ad`,
https://github.com/digitaldrywood/kithlands/actions/runs/40285848001,
passed all eight suites and the required summary. This head still needs fresh CI.

## Final inspected acceptance

Final combined native gate: **16 passed (1.9m)** in
`client/tmp/defeat-pool-final-1793083800.log`. All **78 final captures** inspected
through all 13 pages of `client/tmp/defeat-final-review-1793084100.json`:

- `client/tmp/defeat-responsive-1793001496319/`: 24 defeat, maximum-party,
  save-choice, restored-World and repeated-loss Title captures.
- `client/tmp/save-adventures-1793001549550/`: 12 latest/history/two-adventure
  captures, including normal Continue and native older/newer selection.
- `client/tmp/victory-responsive-1793001575908/`: 34 natural tally, skip,
  reduced-motion, long-name/KO fixture and next-battle captures.
- `client/tmp/post-battle-loot-1793001537444/`: 8 exact-item decisions, stale
  comparison refresh and timeout/retry captures. Legacy filenames containing
  “victory-receipt” in that directory depict the loot decision, not XP receipt.

The accepted artwork/layouts and their fixture limits are unchanged in the
victory/loot regression references. This slice adds no combat capability,
progression, enemy content or production fallback mechanics. The four initial
cleanup failures remain failures in the record, superseded by the final gate.
Local game port 3609 still returns HTTP 200 after final tests.
