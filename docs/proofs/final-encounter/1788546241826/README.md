# Q12 phone viewport proof — 1788546241826

Run command:

```sh
./scripts/run_playwright_local.sh e2e/final-encounter.spec.js --grep 'phone:'
```

Result: one test passed in 3.9 minutes at a 390x844 viewport. `capture()` used
Playwright's viewport screenshot behavior rather than `fullPage`.

The proof imports the committed natural level-20 campaign checkpoint described
in `server/api/testdata/final-campaign-checkpoint.md`. It resumes at Q12 and does
not claim an uninterrupted new-game campaign run. It uses the ordinary
quest-arrival action and real battle commands with debug endpoints blocked. The
party deliberately loses in 10 rounds with Defend commands, opens the real
Character equipment screen, retries, wins in 10 rounds, saves the earned
ending, returns to the title, and reloads the completed save with its reward and
ending intact.

The native 390x844 screenshots were inspected after the passing run:

- `phone-boss-1788546241826.png`: the full enemy formation, party, status, and
  commands fit the viewport.
- `phone-recovery-1788546241826.png`: all recovery guidance and the preparation
  action fit without scrolling or clipping.
- `phone-prepare-1788546241826.png`: the actual equipment screen and Recommend
  Gear action are usable in the viewport.
- `phone-result-1788546241826.png`: the receipt reports +5208 total XP, +1302 XP
  for each active party member, +640 gold, and Q12 completion; Continue is
  visible.
- `phone-ending-1788546241826.png`: the conclusion, party outcome, totals, and
  both ending actions fit without scrolling or clipping.
