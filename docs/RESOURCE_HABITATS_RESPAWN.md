# Resource habitats and saved respawns

Resources now renew instead of remaining permanently depleted. Content settings
in `shared/gathering.json` start with herbs at 180 seconds, fallen wood at 300,
iron at 600, and rare mythril at 1800. Rare gathering keeps its level-8 gate;
Old Mill's crafting core remains a once-earned quest reward.

Go records the absolute UTC Unix deadline in inventory `resource_ready_at`.
The normal JSONB save includes that map. Loading never restarts a recorded
cooldown, and time passes while the game is closed. Legacy boolean depletion
receives one deadline on first state projection; subsequent saves retain it.
No persistent browser storage or client-clock availability checks are involved.

A lightweight authenticated resource endpoint confirms idle regrowth. The
client schedules confirmation using the remaining duration supplied by Go,
retains depleted art, and restores the gather interaction only after confirmation.
Network failures retry; delayed responses cannot overwrite newer game state.

Placement retains the route-anchor IDs used by older saves while choosing nearby
reachable ground (up to four meadow tiles, twelve rocky tiles, or twenty-four
woodland tiles from a route anchor). Habitat content defines allowed ground, preferred neighboring
terrain, and bounded search/patch radii:

- Herbs use meadow ground, grass/brush/marsh adjacency, and flowering herb beds.
- Wood favors forest/tree edges, with shaded ground, fallen leaves and logs.
- Ore favors hill/rock/mountain edges, with blended foothill ground and stones.

Different resource habitats keep their centers apart. Small terrain patches make
otherwise sparse route sections legible. Patches use existing terrain blending
and never paint over roads, bridges, water, or buildings. The underlying collision
map stays authoritative; rendered foothill/undergrowth terrain remains walkable.
This is a route-scale habitat pass, not a wholesale regional map redesign.
Natural hills and forests are preferred when available; biome-specific resource
catalogues and larger authored mining districts remain future work.

## Verification

Branch: `codex/battle-grounding-walk-lag`, draft PR #339. Verification commands:

```sh
make test
make validate-data
make balance-sim
# Disposable database name/URL supplied from ignored local configuration:
make test-e2e
cd server && go vet ./...
cd server && go test -race ./api -run 'TestEveryGathering|TestResource|TestGathering|TestSupplemental|TestFieldCrafting' -count=1
cd server && golangci-lint run --new-from-rev HEAD ./...
cd client && npm test -- --run
cd client && npm run build
cd client && npx prettier --check --ignore-path .gitignore .
```

The client suite passes 765 tests in 86 files. Go tests, targeted API race checks,
semantic data validation, balance smoke simulation, and isolated database
integration pass. The new-changes lint gate reports zero issues. The build retains
its existing large-chunk warning; baseline lint findings remain documented in
the parent PR.

Targeted cases cover saved/expired deadlines, offline renewal, every resource's
individual duration, legacy migration, independent inventory clones, stable IDs,
reachability, terrain preferences, unique positions, protected ground, client
confirmation retries, and discarding stale responses.

Browser regrowth passed at 1440×900 and 390×844 using **real server elapsed time**:
normal movement → harvest → manual save/load → wait three minutes → gather again.
The save reload preserves the exact deadline and the second harvest starts a new
cooldown. No debug clock or expired-save fixture is used in these browser tests.

```sh
./scripts/run_playwright_local.sh e2e/resource-respawn.spec.js --workers=2
./scripts/run_playwright_local.sh e2e/resource-habitats.spec.js e2e/gathering-crafting.spec.js --grep 'resource habitats|gather, craft.*800x600' --workers=2
```

The initial browser harness incorrectly treated the save acknowledgement as an
ID; it now resolves the created save through the normal save list. A terrain edit
during another run triggered Vite reload, invalidating that run. Stable reruns
are used for acceptance. Gathering save assertions compare recorded deadlines,
allowing correctly expired resources to be available after a long crafting flow.

Inspected real-time regrowth proof is under
`client/tmp/resource-habitats-1791775127711/`:
`{1440,390}-meadow-{ready,depleted,regrown}.png`.
Each view's rocky and woodland screenshots were inspected as well. The final
wider terrain search and adjacent-node artwork proofs are listed below.


The final habitat/depleted-art checks passed at 1440×900, 390×844, and the
default 800×600. All 18 adjacent-node screenshots were opened and inspected:

- `client/tmp/territorial-gathering-1791775518154/{1440,390}-{rocky,woodland,meadow}-{ready,depleted}.png`
- `client/tmp/territorial-gathering-1791775699302/800-{rocky,woodland,meadow}-{ready,depleted}.png`

Wood now visibly sits at the real forest edge on the starter map. Harvesting
leaves a stump; mining leaves an exhausted rock; herbs leave cut stems. Ground
territories remain visible throughout cooldown. The existing full crafting/battle
regression exceeded its old three-minute global budget while routing to Old Mill;
its budget is now six minutes for the longer woodland detour. The rerun passed in 2.9 minutes.


```sh
./scripts/run_playwright_local.sh e2e/gathering-crafting.spec.js --grep 'gather, craft.*800x600'
```

The final default-viewport regression passed normal gathering, potion/shard/iron
crafts, socketing, equipping, save/load, walking back to Old Mill, battle use of
the crafted sword/potion, victory, and story return. Inspected proof:

- `client/tmp/gathering-1791775854436/800-Forge-Iron-Sword-ready.png`
- `client/tmp/gathering-1791775854436/800-crafted-sword-battle.png`
- `client/tmp/gathering-1791775854436/800-returned-to-story.png`

Browser logs: `resource-respawn-verified.log` (two passes),
`resource-habitats-final.log` (three habitat passes and the superseded timeout),
`resource-crafting-regression-final.log` (one pass), all under `client/tmp/`.
