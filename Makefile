.PHONY: play stop run test test-e2e test-scripts test-worktree-lifecycle test-visual test-walk-classes walk-previews test-visual-local test-visual-update build demo migrate setup-db teardown-db balance-sim simulate validate-data client-dev client-build lint vet fmt pre-commit docker-up docker-down dashboard dashboard-stop dashboard-status

# Per-worktree isolation: these are populated by scripts/worktree-env.sh via
# direnv. Defaults below keep the Makefile usable without direnv (for CI, or
# when running against a local kithlands database the old way).
DB_NAME      ?= kithlands
PORT         ?= 8080
VITE_PORT    ?= 3000
DATABASE_URL ?= postgres://kithlands:kithlands@localhost:5432/$(DB_NAME)?sslmode=disable
WALK_PREVIEW_VENV := client/tmp/walk-preview-venv
WALK_PREVIEW_READY := $(WALK_PREVIEW_VENV)/.ready
WALK_PREVIEW_PYTHON := $(WALK_PREVIEW_VENV)/bin/python

# Create the worktree database (if missing) and run every migration in order.
# Idempotent: safe to re-run; existing DBs and already-applied migrations no-op.
setup-db:
	@createdb $(DB_NAME) 2>/dev/null || true
	@for f in server/internal/db/migrations/*.sql; do \
		psql -d $(DB_NAME) -f "$$f" >/dev/null 2>&1 || true; \
	done
	@echo "db ready: $(DB_NAME)"

# Drop the worktree database. Only removes $(DB_NAME) — never touches other
# worktrees' DBs.
teardown-db:
	@dropdb $(DB_NAME) 2>/dev/null || true
	@echo "db dropped: $(DB_NAME)"

# Back-compat alias. New code should depend on setup-db directly.
migrate: setup-db

# Start the local stack for just this worktree. The runtime script derives
# ports and DB names from scripts/worktree-env.sh, stores logs/PIDs under
# ./tmp/runtime, and refuses to kill or reuse other worktrees' processes.
play:
	@./scripts/worktree-stack.sh play

# Stop only the server/client PIDs recorded under this worktree's ./tmp/runtime
# after re-verifying their port ownership. No broad pkill patterns.
stop:
	@./scripts/worktree-stack.sh stop

run:
	cd server && PORT=$(PORT) DATABASE_URL='$(DATABASE_URL)' go run ./cmd/kithlands

build:
	cd server && go build -o kithlands ./cmd/kithlands

demo:
	cd server && go run ./cmd/demo

test:
	cd server && go test ./...

# End-to-end tests: set up an isolated DB, run tests against it, then drop it.
# Currently runs go tests with the `integration` build tag; add e2e suites
# under that tag. Runs a teardown even when the tests fail.
test-e2e: setup-db
	@(cd server && DATABASE_URL='$(DATABASE_URL)' go test -tags=integration ./...); \
	status=$$?; \
	$(MAKE) teardown-db; \
	exit $$status

# Shell-level tests for scripts/ (currently: worktree-env.sh).
test-scripts:
	@bash scripts/worktree-env_test.sh

# End-to-end proof that two separate worktrees derive different ports/DBs,
# start without colliding, and stop without killing the other stack.
test-worktree-lifecycle:
	@bash scripts/worktree-lifecycle_test.sh

# Playwright visual regression suite (issue #145 Part D). Assumes
# server + client are already running with KITHLANDS_DEBUG=1 — start
# them with `KITHLANDS_DEBUG=1 make play` first. Requires Playwright
# browser binaries: `cd client && npx playwright install chromium`.
# Suite is currently scaffolded with test.skip markers; see
# client/e2e/README.md for the one-time baseline capture procedure.
test-visual:
	@cd client && VITE_PORT=$(VITE_PORT) npx playwright test --config=e2e/playwright.config.js

# Exhaustive walk-sheet audit: launches a fresh Playwright browser per class so
# all 12 classes are verified in both World and Town without cross-test state.
test-walk-classes:
	@./scripts/test-walk-all-classes.sh

# Strictly validate the native 64x64, 6-frame, 8-direction contract, then export
# contact sheets and animated GIFs under client/tmp/walk-previews for review.
$(WALK_PREVIEW_READY): scripts/walk-preview-requirements.txt
	@python3 -m venv $(WALK_PREVIEW_VENV)
	@$(WALK_PREVIEW_PYTHON) -m pip install --disable-pip-version-check --quiet -r $<
	@touch $@

walk-previews: $(WALK_PREVIEW_READY)
	@$(WALK_PREVIEW_PYTHON) scripts/export_walk_previews.py

# Stable local proof harness for issue-scoped Playwright checks. Boots the
# worktree stack on its derived ports, then runs the requested spec.
test-visual-local:
	@./scripts/run_playwright_local.sh $(SPEC)

# Refresh baselines after an intentional UI change. Only run this
# after visually reviewing every diff.
test-visual-update:
	@cd client && VITE_PORT=$(VITE_PORT) npx playwright test --config=e2e/playwright.config.js --update-snapshots

vet:
	cd server && go vet ./...

lint:
	cd server && golangci-lint run ./...

fmt:
	cd server && gofmt -w . && goimports -w .
	cd client && npx prettier --write --ignore-path .gitignore .

pre-commit:
	pre-commit run --all-files

balance-sim:
	cd server && go run ./cmd/balance_sim

# Monte Carlo headless game simulator. Runs N main-only and optional-content
# playthroughs per strategy, collects progression/balance metrics, and fails on
# statistical assertion violations. Regression bands live in simulate's
# DefaultAssertionConfig: 12 required beats, promotion 12 +/- 2, minimum
# victory rate 0.65, and maximum wipe rate 0.35.
simulate:
	cd server && go run ./cmd/simulate -runs 100 \
		$(if $(CAPTURE),-capture-seed $(or $(CAPTURE_SEED),1) -capture-turn $(or $(CAPTURE_TURN),-1) -capture-out $(or $(CAPTURE_OUT),./sim-capture),)

validate-data:
	cd server && go run ./cmd/validate_gamedata -shared=../shared

client-dev:
	cd client && npm run dev

client-build:
	cd client && npm run build

docker-up:
	docker compose up -d

docker-down:
	docker compose down

# PM-facing screenshot dashboard (cross-worktree). Fixed port 3999, separate
# from per-worktree `make play` stacks. Prints localhost + Tailscale URLs.
dashboard:
	@./scripts/dashboard-serve.sh start

dashboard-stop:
	@./scripts/dashboard-serve.sh stop

dashboard-status:
	@./scripts/dashboard-serve.sh status
