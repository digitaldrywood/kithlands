# Trail gathering and field crafting

User-directed Game Studio work; branch `codex/battle-grounding-walk-lag`,
draft PR #339. Authoritative server/content chunk: `c3d6677`.

## Implemented slice

Resources appear along reachable footpaths to local stories and campaign
destinations. Placement is bounded and deterministic, excludes blocked/water
tiles and avoids entrance tiles. Spacing and yields live in
`shared/gathering.json`. A herb patch gives three Meadow herbs; an ember iron
outcrop gives four ore. Gather from its tile or an adjacent cardinal tile.
The server checks its approved world checkpoint, outside-battle state and
saved depletion before granting materials. Harvested patches stay depleted
across quest changes and save/load; there is no respawn timer.

Party menu → Crafting exposes material counts, costs, outputs and blocked
reasons. The three initial recipes are:

| Recipe | Cost | Result |
| --- | --- | --- |
| Brew Potion | 2 Meadow herbs | 1 Potion |
| Refine Ember Shards | 3 Ember iron ore | 3 Ember Shards |
| Forge Iron Sword | 5 Ember iron ore + 1 Meadow herb | Common Iron Sword, 12 base Power, one open socket |

Use the existing Gem Workshop to transmute three shards into an Ember Gem
and socket it into the sword (+3 Power). Compare/equip through Character.
Ingredients are consumed and outputs created on a cloned inventory before
commit. Materials and harvested-resource IDs persist in the existing saved
inventory JSON; no database schema change or browser game-state storage.

Phaser renders small herb/outcrop markers and routes input to Go. A pure
targeting model is separate from rendering; menus use the existing DOM/modal
boundary. Menus disable movement, duplicate requests are gated, and stale
harvest responses cannot replace a different game's state.

This is one playable gathering/crafting loop, not a profession skill tree,
respawning economy or complete smithing catalog.

## Validation

```sh
make test
make validate-data
make balance-sim
cd server && go test -race ./api ./internal/gamedata -run 'TestGathering|TestFieldCrafting'
cd server && go vet ./...
cd server && go build ./...
cd server && golangci-lint run ./...
cd client && npm test
cd client && npm run build
cd client && npx prettier --check --ignore-path .gitignore .
```

Full Go tests, data validation, vet/build and targeted race checks passed.
The default balance simulator completed levels 1–20 at 200 battles per level.
759 client tests passed in 84 files; production build and formatting passed.
The build retains its existing large-chunk warning. Local latest-version
lint reports the same two existing G703 warnings in unchanged dungeon-art
and dashboard path handlers; no new lint findings.

`make test-e2e` also passed with PG connection settings derived from the local
worktree configuration and a fresh database named
`kithlands_gathering_e2e_1791762054`. The gate applied migrations and dropped
only this temporary database afterward. The playable database was preserved.

## Actual-game proof

```sh
./scripts/run_playwright_local.sh e2e/gathering-crafting.spec.js e2e/old-mill-adventure.spec.js --grep 'gather, craft|entry, exploration' --output=tmp/gathering-accepted-results
./scripts/run_playwright_local.sh e2e/gathering-crafting.spec.js --grep 1440 --output=tmp/gathering-cleanup-results
./scripts/run_playwright_local.sh e2e/gathering-crafting.spec.js --grep 'keyboard harvest' --output=tmp/gathering-keyboard-results
```

Five selected tests passed: the complete loop at 1440×900, 390×844 and
800×600, plus existing desktop/mobile Old Mill entry, saved return and shared
journal flows. After separating targeting from rendering and improving stat
labels, the complete desktop loop passed again. A native Enter harvest and
Escape/menu-close/arrow movement check passed separately.

Each loop uses a normal Quick Start party and the normal starter inventory.
It walks every gathering tile through real scene movement and authoritative
world-step requests; harvests via the visible Gather control; crafts all three
recipes; transmutes and sockets a gem; equips the sword through Character;
saves/loads; returns via the world map route; enters Old Mill; uses a potion
in a real bat encounter; wins XP/gold; and continues back into the story.
Random overworld encounters are disabled for repeatability. There are no
material/gold/level grants, forced victory or enemy stat overrides.

Earlier harness failures used incorrect inventory/save fields, equipment
button labels, entrance proximity assumptions, action-control timing and
victory phase expectations. Those were corrected to follow the current game
flow. Screenshot review also prompted wider resource spacing before the final
accepted runs.

Unique screenshots were opened and inspected:

- `client/tmp/gathering-1791762028131/1440-herbs-on-trail.png`
- `client/tmp/gathering-1791762028131/390-herbs-on-trail.png`
- `client/tmp/gathering-1791762028131/390-mineral-on-trail.png`
- `client/tmp/gathering-1791762028131/390-crafted-results.png`
- `client/tmp/gathering-1791762028131/800-crafted-results.png`
- `client/tmp/gathering-1791762028131/1440-crafted-potion-used.png`
- `client/tmp/gathering-1791762028131/390-crafted-sword-battle.png`
- `client/tmp/gathering-1791762028131/390-crafted-potion-used.png`
- `client/tmp/gathering-1791762028131/1440-victory.png`
- `client/tmp/gathering-1791762028131/1440-returned-to-story.png`
- `client/tmp/gathering-1791762028131/390-returned-to-story.png`
- `client/tmp/gathering-1791762297835/1440-crafted-results.png`

Logs are `client/tmp/gathering-{go-final,data,balance,race,vet,go-build,
lint,integration,client-final,build,format-final,browser-accepted,
browser-cleanup,keyboard}.log`. Browser state and generated proof remain
worktree-local. See [First fifteen minutes](FIRST_FIFTEEN_MINUTES.md) for the
updated suggested play route; its time budget is not an unassisted timed test.
