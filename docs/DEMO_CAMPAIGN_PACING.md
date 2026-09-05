# Demo Campaign Pacing

This document defines the short demo campaign contract. The server remains
authoritative, and the tunable counts and rewards live in
`shared/campaign.json`.

## Required route

The ordered `currentQ` route contains exactly twelve story beats:

1. three Act 1 quests;
2. the earned promotion trial;
3. four Act 2 quests;
4. three Act 3 quests; and
5. Q12, the Bellbound Regent finale.

Q12 stays last and cannot start until the first eleven beats have completed.
Promotion and transport upgrades continue to use story progress, not an
optional quest count or a browser-owned level check. The shared rewards are
larger than the old per-quest defaults because the short route intentionally
removes filler battles while preserving progression into the finale.

## Optional content

Building side quests use `building_side_quests`, their existing independent
status map. They may grant XP, gold, discoveries, and extra battles, but they
are never inserted into the ordered `quests` slice and never change
`currentQ`. A player may accept one, leave it unfinished, and still promote,
unlock every transport tier, attempt Q12, and win.

Natural-node discoveries must follow the same boundary when that work lands:
their state and rewards may enrich a route, but neither generation nor
completion can become a prerequisite for a required story beat. The campaign
simulator's optional route currently exercises three real building quests,
scheduled one per act. It does not depend on unmerged natural-node work.

Loading an older save removes legacy `IsSideQuest` entries that were inserted
into the linear quest list and remaps `currentQ` to the same required-story
position. Rewards already earned remain on the saved party and inventory.
Independent building-side-quest state is preserved.

## Simulator contract

`make simulate` runs every combat strategy through both routes using identical
seed ranges:

- `main`: required story only;
- `optional`: required story plus three building side quests.

The report includes mean turns, completed route quests, battles, promotion and
final levels, optional completion, wipes, victories, and Q12 victories. The
default eight encounter requests are a T1 travel budget; later transport tiers
scale that budget with the same shared encounter multiplier used by the game.
JSON output is aggregate-only by default; `-include-runs` is available for
seed-level diagnosis without making ordinary proof artifacts enormous.

The default regression gate enforces:

- exactly 12 required quests in every run;
- main-path completion if and only if the run reaches victory;
- no optional completions on the main route;
- exactly three attempted optional quests per optional-route run;
- at most 60 mean main-route battles;
- at least 75% completion of attempted optional quests;
- no more than a three-level optional-route lead at the end;
- no more than a 25-point optional-route advantage in Q12 win rate;
- promotion mean 12 ± 2, at least 65% victories, and at most 35% wipes for
  each route/strategy group.

Use an explicit seed and a durable output file when changing pacing:

```sh
cd server
go run ./cmd/simulate -runs 100 -seed 1 -routes main,optional \
  -shared=../shared -out ../docs/proofs/demo-pacing/report.json
```
