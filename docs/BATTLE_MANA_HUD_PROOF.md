# Authoritative mana HUD after round playback

PR #339, branch `codex/battle-grounding-walk-lag`, parent `9ca0b38`.

## Reproduction and fix

Native Cinder victory review showed MP10/10 during celebration even though Go
spent10→8. The stronger native assertion reproduces exactly10shown versus8
expected: `client/tmp/battle-mana-before-1793074600.log`. Its recorded mana audit
is retained in the corresponding uniquely named Cinder victory proof directory.
The original inspected images/traces in
`client/tmp/cinder-victory-1793040250209/` also show this mismatch.

Battle normally rebuilt the party HUD on the next combat round. A winning round
instead proceeded directly to celebration/receipt, retaining the old MP meter.
`reconcilePartyMana` now copies current/maximum MP from the final authoritative
party result after action playback and before victory. It updates existing
labels, blue MP fills and ghost widths, cancelling stale meter tweens without
rebuilding/destroying party controls or modifying HP presentation. Empty MP uses
the existing empty-meter color. No spell-cost formula, consumption or mechanics
were moved into JavaScript. This reconciles final round values; per-action MP
animation at individual spell cues is not claimed.

Two unit regressions cover spent MP, restored MP, zero MP, exact labels/fills,
blue versus health coloring, ghost/tween cleanup, missing entries and untouched
HP state. The Cinder victory native test now requires Go MP, displayed value,
maximum, label and blue fill color to agree in every sampled celebration frame.
All retained pose/reward/input/World assertions remain.

## Native cases

Direct Playwright preserves owner services and saves; wrapper would terminate
occupied listeners. From `client/`:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/cinder-victory.spec.js e2e/cinder-item-use.spec.js e2e/warrior-victory.spec.js --output=tmp/battle-mana-final-1793074900
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/cinder-item-use.spec.js --output=tmp/battle-mana-items-1793075300
```

Nine initial cases and six expanded item cases pass:12distinct cases across
retained runs (three Potion cases repeated). The item spec now has explicit
Potion/Ether desktop1440/phone390touch/reduced800 scenarios with distinct evidence
filenames. Ether uses a disposable one-item Go grant and full HP/zero MP fixture;
Potion uses starting supplies with a damaged-HP fixture. These are controlled
rendering checks, not normal opening availability or human-pacing evidence.

Cinder's real Spark wins show8/10 through celebration, with matching server MP8
retained on Continue. All new MP assertions pass at three sizes. Warrior real
wins/receipt/Continue remain unchanged. Potion/Ether native selection consumes
exactly one supply, retains gold, produces one result effect at offering frame2,
restores guard/staff, and returns to usable next-turn commands. Potion updates HP
at cue once; Ether leaves HP unhealed and restores Go MP0→10, with matching HUD
at round completion. Reduced-motion flags and fixed body/feet/shadow checks remain.

## Inspected proof and gates

All66 current PNGs inspected:

- `client/tmp/cinder-victory-1793040705248/`:15 pose/receipt/World images, Go/motion
  traces and native mana audits, every sampled HUD MP value8.
- `client/tmp/warrior-victory-1793040722890/`:15 images and reward/input traces.
- `client/tmp/cinder-item-use-1793040790962/`:24 final Potion/Ether images,
  six authoritative-result/motion traces.
- `client/tmp/cinder-item-use-1793040683053/`:12 earlier repeated Potion images.
- `client/tmp/battle-mana-review-1793075700/index.json`: all66source mappings,
  eleven reviewed native pages, `mana-before-after.png` (original rendered cards).

863tests/99files, production build and full client formatting pass:

```sh
cd client && npm test
cd client && npm run build
cd client && npx prettier --check --ignore-path .gitignore .
git diff --check
```

Logs: `client/tmp/battle-mana-{unit,build,format}-1793074900.log`,
`battle-mana-source-format-1793075500.log`, `battle-mana-final-1793074900.log`,
`battle-mana-items-1793075300.log`. Item scenarios were flattened to a six-row
fixture table after execution; inputs/assertions and execution order are identical.
No backend/shared content/asset/persistence change, so no new simulation/data or
DB gate required. Owner API/browser/session/saves remain intact; no restart/reset.
Existing combat CI runs the strengthened victory and expanded item specs and
already uploads their evidence.

Parent7cb917f hosted run40376338243 now passes all11visual suites and the required
summary. New item/victory/HUD heads still require their own remote CI; general CI
keeps the owner-selected self-hosted labels. Cinder melee, integrated combat,
environments, menu/gem/icon acceptance and human first-fifteen-minute pacing stay
open in `PLAYABILITY_TRACKER.md`.
