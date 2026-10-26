# Fresh Old Mill combat journey

Branch `codex/battle-grounding-walk-lag`, PR #339. This slice verifies the existing Warrior/Cinder choreography together in a normal opening battle and corrects resource information in item targeting. It does not introduce new combat rules or animation assets.

## User-facing correction

Potion and revival target rows show HP; Ether target rows show MP. The inspection line repeats the relevant resource beside the existing content-driven item description. Generic ally target details omit zero-capacity MP. Eligibility, amounts, item consumption and combat resolution remain unchanged and server-owned.

## Actual game flow

`reference-combat-journey.spec.js` creates a fresh account through Quick start, fixes only its random seed, and enters Old Mill → Heron Pool → the actual Reed-bank Bramblehog encounter. It gives no extra supplies, levels, vitals or rewards and does not force a combat result. Read-only renderer hooks capture frames and contacts while native commands and target buttons send ordinary Go actions.

The seven-round sequence uses guard against the announced rush, a starting Potion on an injured ally, Cinder staff melee and Spark, Warrior melee, and Mender Cure. It then retains the actual loot and acknowledges victory, returning to Heron Pool with the same party and gold. Each completed round's rendered HP/MP must equal the server party. Both reference characters remain grounded with shadows aligned, item effect occurs at frame2, staff contact at frame3, and Cinder casting reaches its release pose. Existing combat-text checks require readable size, bounds and name clearance. This combined journey does not replace the separate crit, KO/revival, counter, dense-target or spell-family tests.

The final result is120 gold,18 XP per member and an accessible supply box/rest stop. Campaign quest completion flags do not change merely for an ordinary battle. No claim of a level-up or a human fifteen-minute timing study is made.

## Commands and evidence

From `client/`, with isolated API8692 and Vite3613 already running, use:

```sh
VITE_PORT=3613 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/reference-combat-journey.spec.js
```

The standard wrapper was not used on occupied ports because it restarts listeners. Owner services, tabs and saves were preserved. Final single-viewport runs use `--grep '1440 integrated'`, `--grep '390 integrated'` and `--grep '800 integrated'`, with unique `--output` directories. Logs are `tmp/reference-combat-{desktop,phone,reduced}-20261026.log`. Desktop uses keyboard commands; phone uses actual command and target taps;800×600 uses reduced motion.

Desktop proof: `tmp/reference-combat-journey-1793057286587/`; phone: `tmp/reference-combat-journey-1793057322702/`. Reduced-motion proof: `tmp/reference-combat-journey-1793057422200/`. All three final cases pass; their54 PNGs were inspected on nine contact pages, mapped by `tmp/reference-journey-{desktop,phone,reduced}-review-20261026/index.json`. Each run records seven real rounds, exact HUD resource agreement, zero page errors and retained rewards on return. The narrow phone battlefield and compact default-size detail area remain presentation constraints; this is not blanket approval of all battle layouts.

All six current Potion/Ether gesture regressions pass in `tmp/reference-combat-final-20261026.log`. Their30 PNGs were inspected through all five pages in `tmp/reference-item-review-20261026/`; originals are `tmp/cinder-item-use-1793057081715/`. This controlled gesture fixture grants vitals/items and is not evidence of normal opening availability. The earlier18-case batch passes15 Warrior/Cinder item/revival/context cases and fails three stale Ether HP locators; corrected six-case rerun is the accepted item result.

Early integration harness failures are retained: item contacts were initially observed through the damage callback rather than `spawnSpellImpact`; its effect is `holy`, not `heal`. Touch commands are labeled `SPELL`, not `SPELLS`. Earlier target locators, victory-phase and finite finishing-round assumptions were also corrected. Go correctly uses `quest_complete` for the ordinary victory receipt before a separate advance action. Runtime timing, target eligibility and encounter difficulty were not weakened to pass these checks.

`npm test -- --run`:870 tests/100 files pass. `npm run build` and full Prettier check pass. Logs `tmp/reference-combat-{unit,build,format}-20261026.log`. Workflow YAML parses and `git diff --check` passes. No backend/shared mechanics changed; no new simulator or DB-integration claim is made. The new journey and its artifacts are registered in the hosted combat-effects suite. Parent1e58b68 hosted run40415559992 passes all12 suites and protected summary; new-head CI is still required. General CI remains self-hosted as requested.

## Remaining work

The broader goal remains active: final opening-session clarity/pacing, terrain composition, remaining environment art and wider integrated battle acceptance. The owner's individual frozen tab/save was not inspected; the separately documented save fix and current eight-case recheck remain the relevant save/exit evidence.
