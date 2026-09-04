# Riverlight Inn verification — 2026-09-04

Issue: partial #271, related context #259. Branch: `codex/cadott-inn-interior`.
PR: https://github.com/digitaldrywood/kithlands/pull/305.

## Accepted behavior

The real Cadott doorway selects `inn_gilded_steps_2f`. Both authored floors retain
their entrance, stair links, NPC identities and existing guest-chest identity.
Furniture collision leaves the counter, guests, stairs, chest and exit reachable.
The player can walk behind the counter with the correct foreground layering.
The clean authored-room header was also checked in the existing Corner Goods shop.

Go restores HP/MP through one free rest request, leaving gold unchanged. The
guest chest awards its existing 180 gold once. Wrong-interior and unknown chest
requests are rejected. The shared Innkeeper, Traveler and Guard dialogue pools
resolve while inside the inn. Saving/loading preserves the chest flag and reward;
the existing save flow resumes in the overworld, followed by re-entry in the test.

Repeated visits reuse the exact exit-reset fix from readiness PR #301, original
commit `7a479e4cab707665752fd17c675e238bbb70ddf9`, cherry-picked here as
`b2cfedf26ae655997ec4fd228033c77694e5d5aa`. Rebase after #301 lands to drop the
equivalent patch before merging. No other readiness changes are included.

## Passed commands

Commands below run from the repository root unless a working directory is given.

- `make test`
- `make validate-data`
- `source scripts/worktree-env.sh && make test-e2e`
- `make balance-sim` (default simulation, levels 1–20)
- In `server/`: `go vet ./... && go build ./... && go test -race ./api ./internal/interiors`
- In `server/`: `GOTOOLCHAIN=go1.24.0 go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.1.6 run --timeout=5m ./...` — zero issues, matching CI's pinned versions
- In `client/`: `npm test -- --run` — 472 tests in 56 files
- In `client/`: `npm run build`
- In `client/`: `npx prettier --check --ignore-path .gitignore .`
- `./scripts/run_playwright_local.sh e2e/cadott-inn.spec.js e2e/cadott-world-shop-gold.spec.js --grep 'Riverlight|800x600'` — four flows passed
- `git diff --check`

Targeted regressions in these suites include
`TestCadottInnChestRequiresLocationAndAwardsOnce`,
`TestCadottInnNPCsUseSharedDialogueWhileInside`,
`TestValidateAuthoredForegroundAndChestAssets`, `town_inn.test.js`,
`town_templates.test.js` and the repeat-visit check in `town_audio.test.js`.
The inn browser proof uses the live server, sampled animated movement and real
keyboard/touch dialogue input, including actual portrait D-pad taps.

The installed golangci-lint 2.7.2 with Go 1.26 reports a pre-existing G602 in
unchanged `server/internal/locality/tilemap.go:766`; the CI-pinned lint command
above passes. The client build retains its existing bundle-size warning.

## Inspected visual proof

Final inn run: `client/tmp/cadott-inn-1788533718940/`.
All 24 screenshots were opened and inspected, eight for each prefix
`800x600`, `1440x900` and `390x844`:

- `<prefix>-arrival.png`
- `<prefix>-reception-dialogue.png`
- `<prefix>-restored.png`
- `<prefix>-behind-counter.png`
- `<prefix>-guest-chest.png`
- `<prefix>-guest-chest-open.png`
- `<prefix>-town-return.png`
- `<prefix>-town-repeat-return.png`

Each size also has `<prefix>-state.json` with before/rested/claimed/returned
state and request evidence. The portraits show readable dialogue below the room,
touch prompts and controls without covering the traversable room. Both desktop
sizes show aligned foreground crops, unclipped actors, matching chest states,
and a continuous route back to Cadott on two visits.

Shop regression run: `client/tmp/cadott-gold-slice/proof/`.
All seven `issue-267-800x600-<stage>-1788533829588.png` files were inspected:
`overworld-before-entry`, `exterior-arrival`, `general-store-door`,
`shop-interior-arrival`, `shop-equipment-comparison`,
`exterior-return-from-shop` and `overworld-round-trip-complete`.

These local proof artifacts are intentionally ignored by Git. Source paintings,
prompts, Tiled guides and runtime PNGs are committed alongside this record.
