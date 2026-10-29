# Warrior hit reaction and contact timing

PR #339 · branch `codex/battle-grounding-walk-lag` · 2026-10-26.

Warrior's old hit reaction translated/rotated two attack poses. It also began
only after the damage effect's 150ms wait, and the container still shook when
reduced motion was enabled. The new reaction has an individually guided recoil
body pose, followed by the accepted settle pose and original guard. Its first
pose is contact: no anticipation is added to a reaction.

The 576×192 RGBA atlas contains guard, recoil and recover cells. The equipped
sword stays separate with authored hand sockets. Source feet align with the
approved guard; runtime body translation/rotation are zero. The first generated
glove was open and was rejected. A hand-only image edit supplied a closed grip;
the actual layered grip was then inspected at enlarged runtime resolution.
Source, guides, exact prompts and normalization metadata are tracked under
`art-source/characters/warrior/`. Raw/rejected candidates remain under
`client/tmp/warrior-hit-candidate-1793046500/`. The built-in tool exposed neither
its model identifier nor seed; metadata says so.

Damage text/effects, HP-bar drain and the reaction now start together. The
renderer awaits the existing effect hold afterward; damage-number hold times
are unchanged. The same ordering is used in the party-target melee, spell and
confusion display paths. No damage/progression rules changed. Only Warrior's
hit-reaction entry changed in shared data. Existing attack, critical, Defend and
KO art remain unchanged; KO receives the lethal result instead of recoil.
Reduced motion suppresses container shake as well as the existing camera shake.

## Reproduced failures and verification

The focused test uses a disposable one-Warrior encounter against a Go-resolved
Goblin, with native Defend input. A server debug endpoint supplies one HP for
the separate lethal phase. It is an explicit presentation fixture, not an
unassisted normal opening or evidence of human pacing.

- The initial test setting did not actually activate reduced motion. Browser
  and game flags exposed the harness problem; the final test explicitly
  emulates media and asserts both flags. A controlled old-method browser
  override then reproduced 3px shake with both flags true. Its log is
  `client/tmp/warrior-hit-real-reduced-before-1793048000.log`; trace is
  `client/tmp/warrior-hit-reaction-1793029884572/800-trace.json`.
- A direct raw-source interception could not load Vite's JSON modules and was
  discarded. Only its identified Playwright processes were stopped. The valid
  controlled comparison preserved Vite imports and replaced just the old method.
  All diagnostic baseline hooks were removed from the committed spec.
- A subsequent timing assertion reproduced 149.9/151.6ms contact-to-reaction
  delays in surviving/lethal hits. See `warrior-hit-contact-before-1793051200.log`
  and `warrior-hit-reaction-1793030594052/1440-trace.json`.
- Final native cases require the new body/cue, idle recovery, following shadows,
  fixed feet offset, correct reduced-motion flags, no reduced-motion sideways
  displacement, contact-to-reaction below 40ms and no recoil overwriting KO.
- The existing all-class state audit, guarded Repeat and normal fresh Old Mill
  desktop/phone guard→win→trail routes provide regression coverage. The audit
  now selects Warrior's immediate contact pose for the hit-state capture.

## Validation commands

At repo root:

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
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/warrior-hit-reaction.spec.js e2e/all-class-battle-states.spec.js e2e/battle-defend.spec.js e2e/warrior-defend-route.spec.js --output=tmp/warrior-hit-contact-final-1793051500
```

Direct Playwright execution reuses the repo config and isolated browser state.
The wrapper kills occupied listeners, so it is not run against owner ports.
The owner server and sessions were not restarted, reset or loaded into.
Go tests/data validation, 857 client tests, build/format and asset audits pass.
No simulation was needed for this presentation-only change. Walk atlases and
hashes remain unchanged; this is not new walking acceptance.

## Scope limits

Native timing evidence covers Go-resolved physical hits; spell/confusion paths
use the same reordered display sequence but are not newly established normal
encounter content. Current KO persistence is verified, not approval of the
legacy KO body art. Item use, victory/KO poses, Cinder's remaining actions,
environment composition, human opening pacing and new-head CI remain open.

## Final inspected result

All nine browser cases pass in 3.6 minutes. Final contact-to-reaction gaps are
1.6/0.6ms desktop, 1.4/0.8ms phone and 1.6/0.7ms reduced motion (surviving/lethal).
Normal recoil retains its 3px container response; reduced motion is 0px.
Recorded feet offsets and shadow drift are zero. Terminal KO holds for
1256.8/1249.4/1533.1ms before the result UI, with no subsequent recoil.

All 168 final PNGs inspected:

- `client/tmp/warrior-hit-reaction-1793030755088/` — 23 hit/recovery/KO/result PNGs
  plus server results, media flags, frame and contact timestamps.
- `client/tmp/battle-defend-1793030660409/` — 26 guarded-round/Repeat captures.
- `client/tmp/warrior-defend-route-1793030784271/` — ten fresh Old Mill captures.
- `client/tmp/warrior-hit-contact-final-1793051500/` — 109 all-class state PNGs
  and fresh-route videos.
- `client/tmp/warrior-hit-contact-review-1793052100/index.json` maps every final
  source to its inspected contact sheet. `1440-native-hit.gif` assembles the
  inspected canvas poses; raw frame traces retain actual timestamps.

Earlier baseline/diagnostic and interim captures were inspected using
`client/tmp/warrior-hit-review-1793050400/`, including the timing-before sheet.
The source contact and enlarged actual sword-grip detail were inspected too.
Final unit/build/format/Go/data/contract logs are
`client/tmp/warrior-hit-contact-*-1793051600.log`; browser log is
`client/tmp/warrior-hit-contact-final-1793051500.log`. The hosted combat suite
now includes this hit/recovery/KO test; its new-head result is still pending.
