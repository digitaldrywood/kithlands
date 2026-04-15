# Codex Validation Guide

This doc explains how to prove changes in Kithlands, especially changes that
affect game balance, progression, rendering, or worktree-local Playwright
flows.

## 1. Minimum Validation Matrix

### Backend Logic

Run:

```sh
make test
```

Also run:

```sh
make validate-data
```

if `shared/` changed.

### Combat, Progression, Encounter, Or Quest Pacing

Run at least one of:

```sh
make balance-sim
make simulate
```

Use `make simulate` when the change affects full-run behavior rather than only
single-battle math.

### Client Or Visible UX

Run:

```sh
cd client
npm test
npm run build
```

Or targeted Vitest commands for a narrow fix.

Then verify the actual screen flow manually or with a Playwright proof path.

### DB Or Integration

Run:

```sh
make test-e2e
```

## 2. CI-Equivalent Local Gate

GitHub Actions currently runs the following:

```sh
cd server && go vet ./...
cd server && go build ./...
cd server && go test -race ./...
cd server && golangci-lint run ./...
cd server && go run ./cmd/balance_sim -battles=10 -shared=../shared
python3 -c 'import json,sys; json.load(open(sys.argv[1]))' <each shared json>
cd server && go run ./cmd/validate_gamedata -shared=../shared
cd client && npm ci
cd client && npm run build
cd client && npx prettier --check --ignore-path .gitignore .
```

If CI is blocked or delayed, this is the local parity target.

## 3. Balance Simulator

`server/cmd/balance_sim` is a single-battle combat smoke tool.

Help:

```sh
cd server
go run ./cmd/balance_sim -h
```

Useful examples:

```sh
cd server
go run ./cmd/balance_sim -battles=10 -shared=../shared
go run ./cmd/balance_sim -party=warrior,cinder -difficulty=normal -start=1 -end=10 -battles=100 -shared=../shared
```

Use it for:

- quick combat sanity checks
- class and encounter tuning
- spotting wipe spikes or damage cliffs

## 4. Campaign Simulator

`server/cmd/simulate` is the higher-value regression tool for progression and
quest pacing. It runs full headless campaigns directly against game logic.

Help:

```sh
cd server
go run ./cmd/simulate -h
```

Default make target:

```sh
make simulate
```

Key flags:

- `-runs`: playthroughs per strategy
- `-strategies`: `aggressive,cautious,healer_heavy`
- `-max-turns`: per-run cap
- `-encounter-rolls-per-quest`: encounter pacing between quest steps
- `-expected-promo-level` and `-promo-level-tolerance`
- `-max-wipe-rate`, `-min-wipe-rate`, `-min-victory-rate`
- `-capture-seed`, `-capture-turn`, `-capture-out` for per-turn snapshots

Useful examples:

```sh
cd server
go run ./cmd/simulate -runs 100 -shared=../shared
go run ./cmd/simulate -runs 25 -strategies=aggressive -out ./sim-report.json -shared=../shared
go run ./cmd/simulate -runs 1 -capture-seed 1 -capture-turn -1 -capture-out ./sim-capture -shared=../shared
```

Use it for:

- promotion timing regressions
- encounter pacing changes
- wipe-rate drift after combat or balance edits
- quest and transport progression behavior

## 5. Shared Data Validation

If JSON content changes, run both:

```sh
make validate-data
cd server && go run ./cmd/validate_gamedata -shared=../shared
```

`validate_gamedata` catches semantic problems, not just parse failures.

## 6. Playwright And Visual Proof

For issue-scoped local proof paths, prefer:

```sh
./scripts/run_playwright_local.sh e2e/<spec>.spec.js
```

Or:

```sh
make test-visual-local SPEC=e2e/<spec>.spec.js
```

This wrapper:

- sources the worktree env
- creates the correct per-worktree DB if needed
- starts the matching server and client
- waits for readiness
- isolates browser state under `client/tmp/`
- runs the requested Playwright spec

For OpenClaw or external attachment workflows:

1. generate proof in the worktree
2. rename screenshots to unique per-run filenames
3. copy them into `~/.openclaw/workspace/tmp/` before attaching or reporting

Do not use reused static filenames as evidence of progress.

## 7. Visual Verification Rules

Do not treat screenshots as proof unless you inspect them.

For any visible change:

- run the actual screen or proof flow
- inspect the screenshot or rendered result
- confirm the layout and content match the intended behavior
- clean generated `client/tmp/` and `client/test-results/` before committing

## 8. What To Say In PRs

Good validation notes are concrete:

- exact commands
- whether they passed
- what was visually checked
- what was not checked

Bad validation notes:

- “tested locally”
- “looks good”
- “CI should catch the rest”
