# Demo pacing proof

The raw reproducible report is
[`20260904-seed1-runs100.json`](20260904-seed1-runs100.json). It contains 100
seeds for each of three combat strategies on both the main and optional
routes, including aggregate metrics, active assertions, and zero assertion
failures. Individual runs were evaluated in memory and intentionally omitted
from the durable artifact; rerun with `-include-runs` for seed-level diagnosis.

Command:

```sh
cd server
go run ./cmd/simulate -runs 100 -seed 1 -routes main,optional \
  -shared=../shared \
  -out ../docs/proofs/demo-pacing/20260904-seed1-runs100.json
```

Before this change, the same seed range on the single mandatory route took
803.1–805.7 mean simulator turns and 190.9–200.4 battles. Victory rates were
70–100%, wipe rates were 0–30%, and promotion means were 11.79–12.39.

The shortened main route now takes 216.1–241.9 mean turns and 43.7–44.0
battles. It reaches 74–100% victories with 0–26% wipes, promotion at
11.58–11.83, and final leader levels of 20.01–22.14. It completes zero side
quests.

The optional route adds three real building quests, taking 254.1–278.2 turns
and 53.5–53.9 battles. Optional completion is 99–100%, victory is 92–100%,
wipes are 0–8%, promotion is 12.74–12.91, and final leader levels are
21.84–23.32. Its final-level lead over main-only is 1.18–1.83 levels, and its
Q12 win-rate advantage is at most 18.2 percentage points.

Every generated run had exactly 12 required quests. Main-path completion
matched victory, and Q12 remained the earned terminal encounter.

## Browser proof

The focused fresh-campaign browser test passed and produced a compact
[authoritative state snapshot](20260904-fresh-campaign-1788557198788.json).
The [desktop quest log](20260904-quest-log-desktop-1788557198788.png) visibly
shows `0 complete` and `12 main objectives remain`; the
[phone capture](20260904-quest-log-phone-1788557198788.png) verifies the same
server-owned count at the mobile viewport.

The existing final-encounter proof passed at desktop and phone after an
ordinary failed attempt, recovery, equipment preparation, winning retry,
ending save, title return, and completed-save reload. Its fixture is an older
earned checkpoint, so its quest total intentionally demonstrates save
compatibility rather than the new-campaign count. The reviewed ending captures
are [desktop](20260904-q12-ending-desktop-1788556465486.png) and
[phone](20260904-q12-ending-phone-1788556465486.png).

Commands:

```sh
./scripts/run_playwright_local.sh e2e/demo-pacing.spec.js
./scripts/run_playwright_local.sh e2e/final-encounter.spec.js
```
