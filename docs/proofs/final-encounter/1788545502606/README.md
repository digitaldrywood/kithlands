# Q12 final encounter proof — 1788545502606

Run command:

```sh
./scripts/run_playwright_local.sh e2e/final-encounter.spec.js
```

Result: two tests passed in 7.4 minutes. This directory retains the inspected
1440x900 desktop screenshots. The separately rerun, viewport-bounded phone
proof is in `../1788546241826/`.

The proof imports the committed natural level-20 campaign checkpoint described
in `server/api/testdata/final-campaign-checkpoint.md`. It resumes that save at
Q12; it does not claim an uninterrupted new-game campaign run. From the
checkpoint, the desktop case uses the ordinary quest-arrival action and real
battle commands. Requests to debug endpoints are blocked. It deliberately loses
in 10 rounds with Defend commands, dismisses the recovery dialog, opens the real
Character equipment screen, retries through ordinary combat actions, wins in 10
rounds, saves the earned ending, returns to the title, and reloads the completed
save. The reloaded state retains the victory reward and ending.

The screenshots were inspected after the passing run:

- `desktop-boss-1788545502606.png`: the Regent, two sentinels, party, status,
  and commands are visible without clipping.
- `desktop-recovery-1788545502606.png`: retry guidance and the preparation
  action are readable.
- `desktop-prepare-1788545502606.png`: the actual equipment screen and
  Recommend Gear action fit the viewport.
- `desktop-result-1788545502606.png`: the receipt reports +5208 total XP, +1302
  XP for each of four active party members, +640 gold, and Q12 completion.
- `desktop-ending-1788545502606.png`: conclusion copy, party outcome,
  quest/gold totals, save status, and both ending actions are visible without
  overflow.

The equipment-aware deterministic balance test uses seeds 1 through 50 for
each tactic from the unchanged checkpoint. Guards-first without healing wins
50/50 at 12.92 average rounds; guards-first with healing wins 50/50 at 12.86
average rounds.
