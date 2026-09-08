# River crossing generation

Browser report, September 8, 2026: tributaries made walking require long detours
because the map only placed bridges at selected OSM road intersections.

The server now examines short, straight river spans after existing terrain,
roads, waterways, hidden paths, and borders have been generated. A candidate
requires two usable approach tiles on each bank and at most six river tiles.
Candidates near locations are considered first, then shorter spans. A bounded
breadth-first search checks the actual walking route between the banks. A
bridge is added only when the current route exceeds 48 tiles or does not exist.
Each subsequent search includes bridges already placed, avoiding redundant
neighboring crossings. The result is deterministic and idempotent.

Only river tiles become bridge tiles. Lakes, open water, mountains, existing
locations, and broad river spans remain unchanged. This is not a guarantee that
all wilderness regions are reachable on foot: forest and transport barriers
still matter. The bridge renderer connects the existing deck texture to natural
banks as well as roads.

## Saves

Locality JSON now includes normalized OSM road and waterway segments. The
locality upsert updates the graph so new geometry survives subsequent loads.
Previously these fields were unexported and silently omitted from saved JSON.

A load accepts an exact pre-footbridge map signature as a known migration, then
validates the saved position against the new map and records its new signature.
Other mismatched signatures retain the existing checkpoint recovery behavior.
Older saves that already lost their OSM geometry cannot reconstruct that data
from the saved graph alone; this change does not invent replacement rivers or
promise recovery of data that was never saved.

## Regression proof

Branch: `codex/river-footbridges` (browser report; no issue number).

- `make test`
- `cd server && go test ./internal/locality ./api -run 'Footbridge|RiverNetwork|WorldCheckpoint' -count=1`
- `cd server && go test -race ./internal/locality ./api`
- `cd server && go vet ./... && go build ./... && golangci-lint run ./...`
- `source scripts/worktree-env.sh; make test-e2e` (isolated `kithlands_404`)
- `make balance-sim`
- `cd client && npm test -- --run` (734 tests)
- `cd client && npm run build`
- `./scripts/run_playwright_local.sh e2e/river-footbridges.spec.js` (3 tests)

The browser test seeds a unique saved river world in the worktree database,
loads it through the normal API, walks across a new bridge using keyboard input,
and asserts both the visible position and authoritative checkpoint at each
step. It opens/closes the real map overlay at 1440×900, 645×847, and 390×844.
It runs in the required CI visual suite.

All 12 screenshots from the accepted local run were inspected, including:

- `client/test-results/river-footbridges-generate-22301-isible-and-walkable-at-1440-chromium/bridge-far-bank-1440-1788869554045.png`
- `client/test-results/river-footbridges-generate-354df-visible-and-walkable-at-645-chromium/river-map-645-1788869557608.png`
- `client/test-results/river-footbridges-generate-81854-visible-and-walkable-at-390-chromium/bridge-walking-390-1788869560322.png`
