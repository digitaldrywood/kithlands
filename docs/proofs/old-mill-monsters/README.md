# Old Mill monster pack — 2026-09-04

PR: https://github.com/digitaldrywood/kithlands/pull/303

Branch: codex/old-mill-monster-pack. No assigned issue; this is the monster
slice of the coordinated Old Mill adventure, not closure of a broader issue.
Base: origin/main at 3c81750b3ec3c616a2e1700d3b4d3558d55c2514.

## Pack contract

| ID | Tactical identity | HP | STR | AGI | Armor | Element interaction |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| mill_bat | Swift, fragile groups | 14 | 5 | 15 | 0 | Ice weakness |
| briar_spider | Stronger single attacker | 38 | 11 | 8 | 2 | Fire weakness |
| rust_beetle | Physical armor | 40 | 8 | 3 | 9 | Lightning weakness, ice resistance |
| moss_slime | Elemental matchup | 34 | 7 | 2 | 1 | Fire weakness, ice resistance |
| millroot_warden | Durable solo guardian | 160 | 13 | 5 | 5 | Fire weakness, ice resistance |

These are authored base values before existing encounter/difficulty scaling.
No poison, healing, or additional AI abilities are implied. Existing potion,
ether, ward_shard and ember_shard drops are reused. All five have world
encounter weight zero; no live global formation references them. Runtime
encounters belong to the adventure PR. The shared proof pack is deliberately
not loaded into the global formation catalog.

Catalog/registry/runtime integration commit: 4b04fe4.
Isolated simulation tests commit: 8cf05e4.

## Deterministic combat proof

Command: `cd server && go test ./api -run TestOldMill -count=1 -v`.
Full output: [balance-1788532521602.txt](balance-1788532521602.txt).

100 seeds each, normal difficulty, two-member warrior/cinder and four-member
warrior/cinder/mender/rogue. Real starter equipment, learned spells, MP costs,
turn order, loot, XP splitting and stat growth are used. The strategy attacks,
uses affordable Spark, uses potions below one-third HP and ethers at low MP.
A four-potion/two-ether cache and a living-party rest before the boss model the
agreed supply/rest points; there are no level or XP overrides.

- Two members: 96/100 route victories; four losses at the boss; no regular
  encounter wipes. Mean pre-boss warrior level 1.97. Boss mean 4.53 rounds.
- Four members: 100/100 route victories; mean pre-boss warrior level 1.00.
  Boss mean 4.27 rounds.
- Regular encounter means: 1.16–2.43 rounds across the two party sizes.
- Tests also prove supported elemental damage changes and exclusion from both
  global encounter generators at levels 1, 2, 3, 5, 10 and 99.

This is combat/attrition proof for the isolated authored sequence. Adventure
traversal, unlocks, save/resume and total play time belong to the dungeon task.
The bestiary sibling separately verified the 22-entry integrated catalog.

## Art and game inspection

The five original source PNGs, full prompts, candidates, deterministic export,
occupied bounds and contact sheet live under art-source/monsters/old-mill.
The built-in OpenAI image tool was used; no model revision or seed was exposed.
No external reference art was used. Each source and candidate was inspected.
All runtime assets are RGBA, have clear margins and binary alpha, and exactly
match their accepted candidates. Regular canvases are 128×128; the Warden is
192×192. Spider, beetle and slime feet are positioned against the existing
runtime shadow; the bat is airborne. No shadow is baked into the artwork.

Six final screenshots were opened and inspected after the boss banner faded:

- [Five enemies — 1440×900](five-enemies-1440x900-1788532521602.png)
- [Warden — 1440×900](boss-1440x900-1788532521602.png)
- [Five enemies — 800×600](five-enemies-800x600-1788532521602.png)
- [Warden — 800×600](boss-800x600-1788532521602.png)
- [Five enemies — 390×844](five-enemies-390x844-1788532521602.png)
- [Warden — 390×844](boss-390x844-1788532521602.png)

All five are recognizable without opaque backgrounds or clipped limbs. The
Warden is larger, the bat lighter, and the two insects remain distinct at phone
scale. The test starts Quick Play and uses the existing authenticated,
debug-gated server force-encounter route. It asserts distinct server enemy IDs,
rendered members, sprite bounds and no page errors, and resolves an actual boss
attack round. The five-enemy combination is a rendering stress fixture, not a
recommended early encounter. No client-only combatant injection is used.

## Validation commands

- `make test` — passed.
- `make validate-data` — passed, 22 monsters and 14 unchanged global formations.
- `make balance-sim` — passed; unchanged global pools, levels 1–20.
- `cd server && go test ./api -run TestOldMill -count=1 -v` — passed.
- `cd server && go vet ./...` and `go build ./...` — passed.
- `cd server && go test -race ./...` — passed.
- `cd server && GOTOOLCHAIN=go1.24.0 go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.1.6 run --timeout=5m ./...` — zero issues, matching CI.
- `cd client && npm ci --no-fund` — passed, no reported vulnerabilities.
- `cd client && npm test` — 55 files, 469 tests passed.
- `cd client && npm run build` — passed (existing bundle-size advisory).
- `cd client && npx prettier --check --ignore-path .gitignore .` — passed.
- `./scripts/run_playwright_local.sh e2e/old-mill-monsters.spec.js` — wrapper
  used worktree ports 8623/3543 and database kithlands_543. Initial browser
  startup/DNS trouble caused two failures; four views ran successfully.
- Final run against the same worktree server/client: `cd client && TMPDIR="$PWD/tmp" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" VITE_PORT=3543 npx playwright test --config=e2e/playwright.config.js e2e/old-mill-monsters.spec.js` — six passed.

The IAB backend was unavailable. The final run used managed terminal sessions
for the server/client because the local make-play helper requires unavailable
setsid. Browser installation/profile/cache data stayed under client/tmp.
Local golangci-lint 2.7.2 (Go 1.26) reports an unrelated G602 warning in
unchanged locality/tilemap.go:766; CI pins 2.1.6 and passes. No unrelated
locality changes were made.
