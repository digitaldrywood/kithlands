# Warrior Defend body poses

PR #339 · `codex/battle-grounding-walk-lag` · 2026-10-26.

Warrior Defend previously translated attack-recovery frame 5 down/right. Its
sword read as a forward attack preparation rather than a compact guard. This
slice adds individually guided settle and brace body images. The original idle
image opens/closes the sequence; the accepted attack and critical assets remain
unchanged. The sword is a separate item-selected layer with authored grip
sockets. No weapon, shadow, effect or UI is baked into the new body images.

`shared/battle_characters.json` changes only Warrior's Defend presentation.
The new 576×192 RGBA atlas has three 192px cells: guard, settle, brace. Playback
is 0→1→2→2→1→0, with a brace cue preserved in reduced motion and an explicit
return to the existing idle atlas. Source boots end within one source pixel of
the existing guard baseline, using the unchanged container anchor [96,184].
No body translation moves the feet away from the ground. Guard mitigation,
initiative, resource consumption and persistence remain Go-owned and unchanged.

Source images, pose SVGs, prompts and generation/normalization metadata are in
`art-source/characters/warrior/`. Raw generations and source contact sheet are
under `client/tmp/warrior-defend-candidate-1793042700/`. The built-in image tool
did not expose its model identifier or seed; metadata records that limit.

## Actual-game evidence

- Three real guarded-round/Repeat cases pass: 1440×900 keyboard, 390×844 touch,
  800×600 reduced motion. Existing server mitigation/minimum-hit assertions
  remain. New checks require the dedicated atlas, brace frame, fixed feet
  offset, following shadow and return to the original idle texture/frame.
- Two normal fresh-account routes pass at desktop/phone: Quick start → Old
  Mill → Heron trail → optional Bramblehog fight → native Defend commands →
  usable next round → ordinary victory → Dungeon trail. Only ordinary RNG seed
  6 is selected; no position, money, equipment, XP or encounter grants.
  Phone uses touch for trail/story/Defend; the shared subsequent combat helper
  uses keyboard/pointer input. These are automated routes, not human pacing.
- Fresh-route traces show 0→1→2→1→0 with ~350ms at brace; every recorded feet
  offset and shadow delta is zero. The sword remains in the visible glove and
  the lowered body keeps helmet, plume, cape and feet in bounds.
- Four existing authoritative critical-strike cases pass, including phone,
  reduced motion and fast speed. All 54 captures inspected.
- The all-class state audit passes. Its old exactly-eight-state expectation
  failed because Warrior already authored optional `critical_attack`. The
  corrected exact expectation now renders/plays that ninth Warrior state too;
  all other classes still require exactly eight. All 109 captures inspected,
  including portrait persistent KO. This verifies structure/regression, not
  visual approval of every class's generic action poses.

Proof directories:

- Before: `client/tmp/battle-defend-1793027857160/` (26 PNGs inspected).
- Final guarded rounds: `client/tmp/battle-defend-1793028335072/` (26 PNGs).
- Fresh route: `client/tmp/warrior-defend-route-1793028530226/` (10 PNGs, traces).
- All-state captures/videos: `client/tmp/warrior-defend-state-route-1793044500/`.
- Critical regression: `client/tmp/warrior-critical-1793028430271/` (54 PNGs).
- Review index/contact sheets and native brace GIFs:
  `client/tmp/warrior-defend-review-1793044900/`.

All 199 accepted-run PNGs and all 26 baseline PNGs were inspected via contact
sheets, with source/body and representative full captures inspected separately.
The GIFs assemble the inspected actual-canvas poses; JSON traces retain actual
render timestamps. Original fresh-route videos are retained alongside tests.

## Commands and results

From `client/`, with the existing running server and worktree browser state:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/battle-defend.spec.js e2e/all-class-battle-states.spec.js e2e/warrior-critical.spec.js
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/all-class-battle-states.spec.js e2e/warrior-defend-route.spec.js --output=tmp/warrior-defend-state-route-1793044500
npm test
npm run build
npx prettier --check --ignore-path .gitignore .
```

The first combined run retained seven passes and the stale exactly-eight-state
failure; the corrected second run passes all three cases. Ten distinct final
browser cases pass across those runs. An initial route test collection error
placed worker-level video settings in a describe block; moving that setting to
file scope corrected collection without changing the game.

857 client tests, build and formatting pass. At repo root:

```sh
make test
make validate-data
python3 skills/kithlands-visual-production/scripts/audit_battle_character_sheets.py --require-complete
python3 skills/kithlands-visual-production/scripts/audit_walk_sheets.py client/public/sprites/walk --classes warrior brawler rogue mender cinder wayfarer knight champion shadow sage pyromancer wanderer --columns 6 --rows 8 --mode enforce
 git diff --check
```

All pass. No combat/progression/pacing rules changed, so no new balance tuning
or simulation was needed. Logs use `client/tmp/warrior-defend-*179304*.log`.
The Playwright wrapper is deliberately not run against occupied owner ports:
it kills listeners. Direct invocations above reuse its config and isolated
browser directories while preserving the owner's services and live session.

Hosted combat CI now includes the fresh route and all-class state audit. Its
new-head result remains a separate gate. General CI stays self-hosted. Warrior
hit/item/victory/KO body art, Cinder's full action vocabulary, wider environment
composition and unassisted opening pacing remain open.
