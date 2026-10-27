# Opening XP and campaign pacing study — 2026-10-27

The seeded touch opening in `FIRST_SESSION_TOUCH_PROOF.md` finished the mill sample at level 1 and 24 XP per member, then completed a 180-XP fetch quest after one more travel battle and reached level 3 with 41 XP. The real curve in `shared/stats.json` requires 70 XP to reach level 2 and another 95 to reach level 3. Section 5.2 of the design document previously described an obsolete exponent, an incorrect level-2 requirement of 151 and a much steeper table. It is corrected to the current authoritative reference table; this changes no game data or mechanics.

A small isolated simulation compared current Act 1 quest reward 180 to a candidate 100, leaving other content unchanged. The candidate was copied to `client/tmp/quest-xp-study-20261027/candidate/`; no runtime content or owner save was edited. Each case uses 20 seeds, three strategies and two route policies. `-encounter-rolls-per-quest -1` disables the simulator's injected random encounters, but approximately 5.2 scripted battles remain per main route. These simulations use headless strategy-driven quest advancement rather than a measured human travel route, and samples are too small to establish statistical significance.

| Simulator scenario | Act 1 XP | Main mean promotion level | Main victory rates | Gate result |
|---|---:|---:|---:|---|
| Standard injected encounters | 180 | 13.00–13.35 | 100% for all three strategies | pass |
| Standard injected encounters | 100 | 12.10 across strategies | 95–100% | pass |
| No injected random encounters | 180 | 9.15 across strategies | 95–100% | fail: promotion below 10–14 band |
| No injected random encounters | 100 | 8.00 across strategies | 70–100% | fail: promotion below 10–14 band |

The standard simulator injects eight encounter actions per quest and observed about 47.2 main-route battles, much more than the three battles in the guided opening. The no-injected case is an extreme lower bound, not a claim that the game naturally has zero random encounters. The result warns against simply reducing the Act 1 reward: it lowers levels throughout that act and can worsen low-encounter progression. It does not prove the current two-level jump is good design or establish an unassisted fifteen-minute route. A future reward-redistribution candidate should preserve total campaign XP, retain existing-save reward semantics, and be assessed with normal travel/encounter evidence before adoption. Current rewards remain unchanged.

From `server/`, after copying `shared/` to the ignored candidate directory and setting only candidate `campaign.json` Act 1 reward XP to 100:

```sh
go run ./cmd/simulate -runs 20 -shared ../shared -out ../client/tmp/quest-xp-study-20261027/baseline-standard.json
go run ./cmd/simulate -runs 20 -shared ../client/tmp/quest-xp-study-20261027/candidate -out ../client/tmp/quest-xp-study-20261027/candidate-standard.json
go run ./cmd/simulate -runs 20 -encounter-rolls-per-quest -1 -shared ../shared -out ../client/tmp/quest-xp-study-20261027/baseline.json
go run ./cmd/simulate -runs 20 -encounter-rolls-per-quest -1 -shared ../client/tmp/quest-xp-study-20261027/candidate -out ../client/tmp/quest-xp-study-20261027/candidate.json
go test ./internal/character ./cmd/simulate
go run ./cmd/validate_gamedata -shared=../shared
```

Both standard cases pass all simulator assertions; both no-injected cases exit nonzero for the promotion-level assertions listed above. Exact logs and JSON reports are in `client/tmp/quest-xp-study-20261027/`. The focused tests and shared data validator pass. No gameplay, user save or local service was changed. Hosted current-head CI remains required; general CI stays self-hosted.
