# Warrior critical strike proof

2026-10-25 · branch `codex/battle-grounding-walk-lag` · PR #339.

Warrior critical attacks now have a heavier windup, committed lean and longer
recovery, selected only when Go reports a critical result. This is new
choreography using the six approved sword poses, not a newly painted atlas.
The 192px body atlas, identity, hand sockets and separate weapon/shadow contract
remain the approved source. Timing is 1020ms versus the normal 760ms, before
the existing battle speed setting. Source metadata is retained under
`art-source/characters/warrior/battle/critical-strike/metadata.json` and content
lives in `shared/battle_characters.json`.

The manifest declares `critical_attack` optional. Only Warrior installs it;
other classes retain their current physical attack. Physical abilities use the
same authoritative flag when present. No critical chance, damage or progression
rules changed. Server content validation permits declared optional states while
recipes still expand only the required vocabulary.

## Actual battle evidence

`e2e/warrior-critical.spec.js` plays three real Systems Showcase rounds against
the running Go server. Hero's actual resolved hits are 117, 145 and 169 damage;
their critical flags are false, false and true. The proof does not inject crits,
change HP, or substitute a response. A Go regression preserves this deterministic
showcase sequence so the visual proof continues exercising real crit resolution.

All three cases pass: 1440×900 desktop, 390×844 portrait, and 800×600 with reduced
motion. Captured post-render records verify frame-3 contact, critical FX at that
cue, shadow/root agreement within 0.5px, and recovery home. Full motion captures
all six frames; reduced motion retains frames 1, 3 and 5 and the existing 14px
travel limit. The harness waits for the replacement battle actor between rounds,
avoiding the interval between `animating=false` and the queued scene restart.

The initial frame review found the defeat label overlapping the second line of
a critical number. Defeat now uses a lower status lane, independent of damage
fan-out. The final real critical-kill proof checks visible text bounds throughout
their simultaneous display: minimum gap is 12.95px at desktop/portrait and
20.21px with reduced motion. No read hold was shortened.

Final unique proof directory: `client/tmp/warrior-critical-1792944017468/`.
For each width, inspected all normal and critical poses in `<width>-review.jpg`,
the full-scene `<width>-critical-labels.png`, and `<width>-recovered.png` showing
the victory result. `*-server-*.json` retains the real combat records and
`*-trace.json` retains frame/contact/shadow/recovery and label-gap observations.
The sword stays at its hand socket; the body remains recognizable and complete;
the following shadow stays at the actor; damage and defeat text are separate.
The visual CI gameplay suite now runs this spec and retains its native evidence.

## Validation

- `make test` passes, including the new showcase and content regressions.
- `make validate-data` passes (29 monsters, 26 formations).
- `cd server && go vet ./...` and `go build ./...` pass.
- `cd server && go run ./cmd/balance_sim -battles=10 -shared=../shared` passes.
- Bundled Python `skills/kithlands-visual-production/scripts/audit_battle_character_sheets.py --require-complete` passes all twelve identities (nine states for Warrior, eight for the others).
- `cd client && npm test -- --run` passes 782 tests; `npm run build` passes.
- `cd client && npx prettier --check --ignore-path .gitignore .` passes.
- With the worktree's server environment and isolated browser HOME/XDG/cache:
  `npx playwright test --config=e2e/playwright.config.js e2e/warrior-critical.spec.js --output=tmp/critical-labels-1792942900` passes all three cases.

This accepts Warrior's critical variation and text separation. It does not accept
new critical poses for other classes, all ability/spell/status choreography, or
the complete first-fifteen-minute route. Those remain on the playability tracker.
