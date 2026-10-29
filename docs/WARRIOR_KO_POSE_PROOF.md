# Warrior grounded KO and revival

PR #339 · `codex/battle-grounding-walk-lag` · 2026-10-26.

Warrior KO previously rotated an attack-recovery body through 90°, leaving the
figure suspended diagonally with an upright sword. The new state uses the
approved recoil plus individually guided knee-buckle and settled-fall images.
The terminal body rests along the ground plane. The separately equipped sword
rests beside the empty gauntlets; neither weapon nor shadow is baked into art.

The 576×192 RGBA atlas has three 192px cells: recoil, knee buckle, settled fall.
All use the unchanged [96,184] container anchor. Source bounds end at y180
inclusive; the final 176px-wide body retains clear margins. Body translation
and rotation stay zero. `hold_last_frame` preserves frame 2 until explicit
reset/revival or scene transition. Other classes' legacy recipes are unchanged.
Go still owns damage, death, revival, inventory and saved state.

Source images, guides, exact prompts and normalization metadata are tracked in
`art-source/characters/warrior/`. Raw candidates and the source contact are under
`client/tmp/warrior-ko-candidate-1793053200/`. Built-in generation did not expose
its model identifier or seed; metadata records that limit.

## Actual-game evidence

- Three native Go-resolved surviving/lethal-hit cases pass: desktop 1440×900,
  phone 390×844 and reduced-motion 800×600. Updated assertions require the new
  terminal texture/frame, zero body rotation/feet offset, more than 200ms held
  terminal pose and no post-KO recoil. Recorded terminal holds are
  1250.2/1257.8/1533.8ms; shadow drift and feet offsets are zero.
- Two native Phoenix Down cases pass at desktop/phone. Warrior remains fallen
  through the next round's redraw and a further hold. Native item/target input
  submits the real Go revival action: HP becomes 1, exactly one Phoenix Down
  is consumed, gold stays unchanged and the actor returns to the original idle
  texture/frame. This uses an explicit disposable server fixture with one HP
  and a granted scarce item; it does not establish normal opening availability.
- Four existing defeat/save-recovery/Title-exit cases pass, including short
  phone and long-party display fixtures. They retain their saved-state checks.
- The all-class state audit and five other Warrior gold tests pass, including
  equipment layers, group spells/Inspire and authoritative Defend.
- One old gold-test assertion expected single-enemy targeting to close the
  picker. The current lower command panel correctly keeps target choices open.
  The repaired test requires both enemy buttons and no redundant All button,
  preserving the exact single/all-target action assertions. Its targeted rerun
  passes. No spell behavior changed.

Sixteen distinct browser cases pass across retained runs: the full batch has
15 passes and the stale picker assertion failure; its corrected targeted rerun
passes. All 184 current-run PNGs, plus 35 baseline/candidate PNGs, inspected via
`client/tmp/warrior-ko-review-1793054800/index.json`. The source contact and
representative full desktop/phone captures were inspected separately. The
native-collapse GIF assembles inspected actual canvas poses; JSON traces retain
actual render times. Structural playback does not approve other classes' poses.

Evidence:

- Browser batch: `client/tmp/warrior-ko-final-1793054300.log` and matching output
  directory (109 all-state PNGs plus Warrior gold captures).
- Corrected targeting: `client/tmp/warrior-ko-scope-final-1793054500.log` and
  matching output directory.
- Hit/KO trace: `client/tmp/warrior-hit-reaction-1793032139328/` (24 PNGs).
- Revival: `client/tmp/warrior-ko-revive-1793032167851/` (four PNGs/results).
- Defeat recovery: `client/tmp/defeat-responsive-1793032057384/` (24 PNGs).
- Before/candidate traces: `warrior-hit-reaction-1793031296808`,
  `warrior-hit-reaction-1793031824546`, `warrior-ko-revive-1793031944977` under
  `client/tmp/`.

## Validation

From repo root:

```sh
make test
make validate-data
python3 skills/kithlands-visual-production/scripts/audit_battle_character_sheets.py --require-complete
python3 skills/kithlands-visual-production/scripts/audit_walk_sheets.py client/public/sprites/walk --classes warrior brawler rogue mender cinder wayfarer knight champion shadow sage pyromancer wanderer --columns 6 --rows 8 --mode enforce
shasum -a 256 -c docs/walk-assets.sha256
git diff --check
```

From `client/`:

```sh
npm test
npm run build
npx prettier --check --ignore-path .gitignore .
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/warrior-hit-reaction.spec.js e2e/warrior-ko-revive.spec.js e2e/all-class-battle-states.spec.js e2e/warrior-battle-gold.spec.js e2e/defeat-receipt.spec.js --output=tmp/warrior-ko-final-1793054300
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/warrior-battle-gold.spec.js --grep 'authored spell scope' --output=tmp/warrior-ko-scope-final-1793054500
```

857 client tests, build/format, Go tests/data and asset audits pass. No gameplay
or balance rules changed, so no new simulation is claimed. Accepted walk files
and hashes are unchanged. Direct Playwright execution reuses repo config and
isolated browser state; the wrapper kills occupied ports and is not used on the
owner's live services. Server, owner session, saves and history were preserved.

Hosted combat now includes native revival coverage. New-head CI remains open;
general CI retains the chosen self-hosted labels. Warrior item/victory/ability
poses, Cinder's remaining actions, environment composition, wider UI/gem
acceptance and unassisted opening pacing remain on the full goal backlog.
