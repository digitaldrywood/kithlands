# Warrior grounded victory pose

PR #339, branch `codex/battle-grounding-walk-lag`, based on `1d795cd`.
Acceptance is Warrior victory only. Other-class art, Warrior class ability,
Cinder's remaining actions, environment composition and human opening pacing
remain open in `PLAYABILITY_TRACKER.md`.

## Change and source acceptance

Old victory reused overhead attack frames with y offsets up to -9px. New victory
settles a fist against the chest, raises it beside the helmet, then returns to
guard. Boots remain planted and the sword stays low in the other glove. Existing
runtime waits for living-party victory playback before revealing the receipt;
no runtime Go/JS behavior was changed for this slice.

Shared Warrior `victory` now selects
`client/public/sprites/battle/warrior/sword-victory-body.png`: 576×192 RGBA,
three 192px cells. Playback is 0/80ms → 1/140ms → 2/380ms → 1/140ms → 0/100ms,
with cue frame 2 so reduced motion retains the salute. No body transforms.
Grip sockets: guard (-48,-7), settle (-52,-1), salute (-48,-7), all -135°.
Only this shared state differs semantically from the parent; original attack,
critical, Defend, item, hit, KO, walk and other-class data are identical.

Built-in `image_gen` created one guided frame per call from the locked original
Warrior identity. Model identifier was not returned. Exact prompts, source paths,
output filenames, normalization and approval status are retained in
`art-source/characters/warrior/battle/sword-victory/metadata.json`.
Guides are `art-source/characters/warrior/guides/sword-victory-{settle,salute}.svg`.
Source cells are `art-source/characters/warrior/battle/sword-victory/frame-00.png`
through `frame-02.png`. Raw copies/candidate/normalized review are retained in
`client/tmp/warrior-victory-candidate-1793061500/`.

Generated alpha is retained. Occupied alpha>8 bounds are cropped, uniformly
nearest-neighbor scaled to 164px high, centered in a 192px cell, bottom at y180.
The guard cell is copied unchanged. Actual source poses, normalized cells and
in-game sword/grip/ground contact were inspected before final approval.

## Validation

From `client/`:

```sh
npm test
npm run build
npx prettier --check --ignore-path .gitignore .
```

All 860 tests / 99 files, build and full client formatting pass. The build keeps
the existing chunk-size advisory. The explicit atlas-deduplication expectation
adds the new victory key while retaining existing keys and lookup assertions.

From repo root:

```sh
make test
make validate-data
python3 skills/kithlands-visual-production/scripts/audit_battle_character_sheets.py --require-complete
python3 skills/kithlands-visual-production/scripts/audit_walk_sheets.py client/public/sprites/walk --classes warrior brawler rogue mender cinder wayfarer knight champion shadow sage pyromancer wanderer --columns 6 --rows 8 --mode enforce
git diff --check
```

All pass. This shared change is presentation only; no mechanics, balance or
progression changes, so no new simulator was required. Walk atlases are unchanged.

Browser subprocess environment, from `client/`: `VITE_PORT=3609`,
`PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright"`,
`XDG_CONFIG_HOME="$PWD/tmp/xdg-config"`, `XDG_CACHE_HOME="$PWD/tmp/xdg-cache"`.
Commands:

```sh
npx playwright test --config=e2e/playwright.config.js e2e/warrior-battle-gold.spec.js --grep 'plays every authored' --output=tmp/warrior-victory-pose-1793061800
npx playwright test --config=e2e/playwright.config.js e2e/warrior-victory.spec.js e2e/warrior-defend-route.spec.js e2e/victory-receipt.spec.js --output=tmp/warrior-victory-native-1793062000
```

One authored-state case plus the ten-case native batch pass. New victory cases at
1440×900 normal, 390×844 touch normal and 800×600 reduced motion use an explicit
level-eight one-Warrior Go fixture against a real Slime. Native Attack and target
inputs produce Go victory, not a debug-force-victory result. This fixture isolates
presentation; it is not proof of naturally reaching level eight in fifteen minutes.

All three include the salute before the receipt. Traces contain 101/99/18 sampled
frames respectively; sampled container x/y delta, body angle, feet offset and
shadow distance are exactly zero. Browser/game reduced-motion flags match. The
native receipt appears after the pose. Gold goes 100→105 on Go victory and stays
105 on `battle_continue`; XP increases by 10 then remains unchanged during the
handoff. Enter and phone tap Continue return to World, with the receipt removed.
This is one handoff/reward-preservation check, not new duplicate-request proof;
the existing acknowledgement/replay evidence remains in
`VICTORY_EXPLORATION_HANDOFF_PROOF.md`.

Five retained receipt cases cover desktop/default/375px/390px/reduced motion,
long names, KO XP, tally/level-ups and usable exit. Two normal fresh-game Old Mill
routes use starter party/levels/equipment, enter Heron Pool, Defend, win with real
combat, and return to the now-cleared trail. No grants or debug victory in those
routes; combat automation uses mixed keyboard/pointer input after phone touch
entry/Defend. This verifies connected flow, not unassisted human pacing.

## Inspected evidence and service preservation

All 67 listed current captures inspected:

- `client/tmp/warrior-victory-1793035049339/`: 15 pose/receipt/World PNGs and
  three Go-result/motion `*-trace.json` files.
- `client/tmp/victory-responsive-1793035014740/`: 34 receipt/regression PNGs.
- `client/tmp/warrior-defend-route-1793035072454/`: ten fresh-route PNGs/results.
- `client/tmp/warrior-victory-pose-1793061800/`: eight state-audit PNGs.
- `client/tmp/warrior-victory-review-1793062300/index.json`: source-to-contact
  review index and twelve contact pages. An initial close-up cropped the wrong
  horizontal region; `grip-and-ground-corrected.png` uses the actual sampled home
  position and was inspected afterward. It shows the attached sword and planted
  boots across all three frames.

Source scale/identity, held salute and return to guard are consistent; no detached
weapon or drifting shadow appeared. The original pre-change victory reuse remains
visible in the earlier `warrior-item-native-1793059800` state captures. No other
class's generic victory is claimed as visually accepted by this work.

Local logs: `client/tmp/warrior-victory-{unit,build,format,go,data,walk}-1793062100.log`,
`warrior-victory-contract-1793061800.log`, `warrior-victory-pose-1793061800.log`,
`warrior-victory-native-1793062000.log`.

Owner API 8689 remains healthy. No server restart, owner browser interaction,
save/data reset, DB replacement or browser persistence was used. Direct Playwright
reuses the services because the local wrapper would kill existing listeners.

Parent `0259d75` visual run 40363809859 now completes successfully across all
eleven suites and the protected summary. Item-use run 40365978612 is live;
general CI remains queued on the owner-selected self-hosted labels. This new
chunk needs its own remote gate. No merge or deployment performed.
