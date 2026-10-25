# Defend and accessible battle commands

2026-10-25 · `codex/battle-grounding-walk-lag` · PR #339.

Defend previously produced a log entry without protection and had no selectable
command. It now trades a member's action for reduced physical damage during that
round. Go applies `shared/stats.json`'s `defend_damage_pct` (50) after armor and
critical calculations, per landed hit, retaining minimum damage. A conscious,
unconfused member guards before initiative so faster attackers cannot bypass the
choice. Poison and magic do not use this physical reduction. Round cleanup clears
the guard; an ambush strips it with the party's other actions.

The API reports actual `damage_prevented`. The renderer labels those hits GUARD
and preserves critical information. The command supports Tab/Enter, D and touch;
Repeat preserves Defend rather than silently substituting Attack. Native-event
replay and held-key repeats cannot multiply D selections. Delayed party-selection
callbacks cannot submit a completed plan more than once. Go rejects duplicate
member slots before a round spends items, MP or deals damage.

This reuses the existing authored defend state. No new body atlas or all-class
art approval is claimed. Showcase's audit sprite replacement now retains its
separate shadow, fixing a missing reference on the initial lead character.

## Actual game and visual acceptance

The proof plays two real server rounds; it never substitutes a combat response.
Desktop/reduced-motion cases select the first guard with Tab/Enter, subsequent
members with D, and repeat with R. Portrait uses touchscreen commands and Repeat.
All four members submit Defend each round. The first round prevents 23 damage
from Iron Golem's hit on Shade. The second round's attacks against armored Hero
reach the one-damage floor: their receipt correctly records no additional damage
prevented. The proof checks four actual guard results, minimum landed damage,
completed playback and the unchanged Repeat plan.

Frame captures inspect Warrior's guard pose, brace and return, including the two
different transforms of atlas frame 5. Actor root and shadow agree exactly in the
captured frames. GUARD text remains readable at desktop, portrait and reduced
motion. No observer errors occur in the accepted runs.

Screenshot review rejected an intermediate phone layout that fit nine commands
by shrinking buttons. The final phone layout uses three columns across the full
command width, then the message and compact party status. The nine-command
rendering-only fixture measures **46.8 CSS pixels** on the shortest target side.
It combines spells and abilities already returned by the server; this synthetic
menu is never submitted as a gameplay action. HP/MP numbers remain separate from
their meters, and meters stay inside their cards. Contextual choices occupy the
command/message union, with their bottom constrained above party status.

Inspected unique evidence:

- Desktop 1440 and reduced-motion 800: `client/tmp/battle-defend-1792946333811/`.
  Inspected each width's `*-hud-review.png`, `*-motion-review.png`, constituent
  command/focus/repeat/recovery/density screens, three guard-pose captures and
  `*-protected.png`. `*-first-server.json`, `*-repeat-server.json` and trace files
  retain authoritative receipts and measured shadow positions.
- Final portrait spacing: `client/tmp/battle-defend-1792946514041/`, including
  `390-hud-review.png`, `390-motion-review.png` and `390-layout.json` (nine buttons,
  contained, 46.8px targets, clear meter labels).
- Final portrait submenus: `client/tmp/battle-context-1792946498419/` and inspected
  `390-context-review.png`, covering attack targets, spells, spell targets, items,
  Rogue abilities, cancellation and the resolved-round HUD.
- Critical regression after the final phone layout:
  `client/tmp/warrior-critical-1792946542241/390-critical-labels.png` and
  `390-recovered.png`, inspected alongside the passing frame/contact trace.

Early proof attempts exposed the missing D listener and initial Showcase shadow.
An unguarded shadow read in the observer interrupted the render loop; it now
records a missing reference and fails its final assertion without crashing the
game. An intermediate environment invocation used the wrong derived port and was
corrected by sourcing the environment from the worktree root. Neither is counted
as successful proof. A second-round assertion was corrected after retaining the
actual one-damage-floor receipts; the first-round positive prevention assertion
and real request/guard counts remain checked.

## Validation and remaining gates

- `make test`, `make validate-data`, `make balance-sim` pass. The default simulator
  runs 200 battles per level, levels 1–20; it is a balance smoke, not proof that
  its AI chooses Defend. Forty seeded direct combat cases verify guarded crit
  multi-hits against a faster attacker, expiration, physical abilities and the
  minimum floor. API regressions verify initiative, ambush stripping, exact
  prevented damage and duplicate-input rejection without resource spending.
- `cd server && go vet ./...` and server build pass.
- `cd server && go test -race ./api -run 'TestCombatRoundDefend|TestDuplicateMemberActions|TestShowcaseWarriorCriticalProofSequence' -count=1` passes.
- `cd server && golangci-lint run --new-from-rev=e217cba ./...` reports zero issues.
- Client: 785 tests across 92 files, production build and full Prettier check pass.
- With the root worktree environment, `.envrc.local`, and isolated browser
  HOME/XDG/cache, `npx playwright test --config=e2e/playwright.config.js e2e/battle-defend.spec.js e2e/warrior-critical.spec.js e2e/battle-context-choices.spec.js --output=tmp/defend-final-1792946000` passes eleven cases before the phone reflow.
- The same files with `--grep 'Defend|battle choices|touch item|strike 390' --output=tmp/defend-accessible-1792946100` pass nine cases after reflow. The final meter-spacing and submenu-bottom checks pass all three phone cases with `--grep '390' --output=tmp/defend-phone-spacing-1792946200`.

Full `go test -race ./...` does **not** pass: the API package reaches its default
ten-minute timeout during the 1,000-seed first-encounter test. The live stack is
in initial gathering-route placement; ordinary complete tests pass. Investigate
and profile that cost without reducing coverage. Full lint also still reports
G703 in unchanged `server/api/game_dungeon.go:681` and
`server/cmd/dashboard/main.go:407`; changed-code lint is separate from this gate.

Hosted visual run `40209842181` passed the preceding pushed head `e217cba`.
The new Defend/menu commit needs its own remote run. General CI still lacks its
configured self-hosted runner. Enemy action patterns/intent, further Warrior/Cinder
choreography and the full normal fifteen-minute route remain unfinished.

The API was reloaded on 8689 using the existing saved database; Vite remains on
3609. No database reset, schema change, new paid service, merge or deployment.
