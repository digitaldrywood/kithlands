# Bounded registered asset serving

2026-10-25 · `codex/battle-grounding-walk-lag` · PR #339.

Full lint identified G703 findings in dungeon and dashboard image handlers.
Both now serve opened regular-file handles through Go 1.24's `os.OpenRoot`,
using names selected from the dungeon registry or canonical dashboard allowlist.
The helper rejects traversal and escaping symlinks while retaining GET, HEAD and
range behavior. No lint suppression or rule change was introduced.

The dashboard records canonical paths at scan time and checks that the current
resolved path still matches. A previously scanned name retargeted to an unscanned
PNG is rejected. Parent-directory aliases and their canonical paths remain valid.
Dungeon requests still require exact registration; existing unregistered PNGs are
not exposed. Existing nosniff/cache headers remain intact.

## Validation

The integrated tree passes:

- `cd server && go vet ./...`
- `cd server && go build ./...`
- `cd server && golangci-lint run ./...` (zero issues)
- `cd server && go test -race ./...` (API 519.330 seconds; unchanged timeout)
- `make test`, `make validate-data`, `make balance-sim`

Focused coverage is in `internal/httpasset/serve_test.go`,
`api/game_dungeon_art_test.go`, and `cmd/dashboard/main_test.go`: image GET/HEAD,
partial content, traversal, nonregular files, escaping symlinks, every registered
dungeon image, unlisted files, canonical aliases and retargeted allowlisted names.
All are included in the full ordinary/race runs above.

## Live game

Reloaded the API on port 8689 against the existing database, retaining Vite on
3609. All 19 unique registered dungeon image URLs returned HTTP 200, image/png,
nosniff and bytes identical to their source PNGs. Report:
`client/tmp/live-dungeon-assets-1792948035339437000.json`.

The actual desktop/phone Heron battle → crafting → equipment → save/load → mill
flow and three-viewport territorial gathering checks pass (five cases):

`npx playwright test --config=e2e/playwright.config.js e2e/resource-habitats.spec.js e2e/heron-playability-loop.spec.js --output=tmp/profiled-world-1792947400`

Inspected both fourteen-frame review sheets in
`client/tmp/heron-loop-1792947965873/` and all three habitat review sheets in
`client/tmp/territorial-gathering-1792948017942/`, including every native capture.
No images were changed. This verifies serving/integration, not completion of
meadow art polish. Existing saves were preserved. Remote CI remains a separate gate.
