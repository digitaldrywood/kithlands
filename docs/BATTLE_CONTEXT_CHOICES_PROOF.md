# Contextual battle command proof

PR #339, branch `codex/battle-grounding-walk-lag`, previous pushed commit `c1a7040`. No separate issue assigned.

Abilities, magic, items and target lists occupy the existing command/message strip. They no longer open centered overlays. Party status and character target cursors remain visible. Two-column lists scroll inside the strip, with descriptions, MP costs/counts, unavailable choices, pointer/keyboard selection and Back/Escape. Item-target Back returns to the item list; spell/ability-target Back returns to its list. Returning to commands keeps the same actor and commits no action.

The shared item availability/target helpers remain in use. Go still resolves all queued actions. The DOM list does not resize the game or create a modal lock. Canvas command callbacks are guarded while a list/target selection is active and against stale actor slots. Shutdown disposes the DOM, observers and keyboard listener.

## Commands

```sh
cd client && npm test
cd client && npm run build
cd client && npx prettier --check --ignore-path .gitignore .
./scripts/run_playwright_local.sh e2e/battle-context-choices.spec.js e2e/battle-hud-workstream.spec.js --output=tmp/battle-context-accepted-results
./scripts/run_playwright_local.sh e2e/battle-context-choices.spec.js --grep 'touch item' --output=tmp/battle-context-touch-done-results
```

759 tests in 84 files pass; build and full formatting pass. Seven browser checks pass: full command selection/cancellation/authoritative round at 1440×900, 610×837, 800×600 and 390×844, plus existing command/status separation, spell/group/victory presentation and portrait layout checks. The additional touch test passes, bringing the total to eight browser checks. It checks item targets and Back using actual taps after spending MP in a server-resolved round.

The tests explicitly use the disposable level-12 systems showcase; they do not imply this is a fresh level-1 loadout. The touch test resolves one real spell round using the existing deterministic helper and opens the item picker through a renderer helper before tapping the list; no item or MP grants are used. Other four viewport tests select every actor's action through the visible UI. Original harness errors assumed Warrior abilities and Rogue-before-Mender order; corrected to the actual content. The input guard resolves the discovered click-through hand-off issue. The touch fixture was simplified after an actor-skipping setup and round-transition assertions proved brittle.

The 24-stage contact sheet and larger detail screenshots were inspected. Inspected proof lives under `client/tmp/battle-context-1791764750264/`, including 610px and phone abilities/magic, desktop items, target-selection and resolved-round captures. Every screenshot filename includes viewport and stage. The inspected touch target proof is `client/tmp/battle-context-1791765326471/390-touch-item-targets.png`. Build keeps the existing large-chunk warning.

Client-only presentation/input change; no backend/content/balance changes. Existing backend validation is in GATHERING_CRAFTING_PROOF.md. Actual Chromium runs through the repository's isolated local wrapper, since the in-app browser automation backend was unavailable in this session.
