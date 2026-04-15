# Codex Worktree Guide

This doc explains how to run multiple Kithlands worktrees in parallel without
port, database, or browser collisions.

Despite the filename, this guide applies to Claude, Codex, OpenClaw, and any
other agent working in this repo. `CLAUDE.md` adds the role-specific choice
between Claude implementing directly versus Claude orchestrating another worker.

## 1. Why Worktrees Matter Here

Kithlands is built for concurrent issue work. Each worktree should be able to:

- run its own Go server
- run its own Vite client
- use its own PostgreSQL database
- run Playwright without sharing browser state

That isolation is already implemented. Use it instead of inventing your own
port scheme.

## 2. Port And Database Isolation

`scripts/worktree-env.sh` hashes `$PWD` and exports:

- `PORT=$((8080 + offset))`
- `VITE_PORT=$((3000 + offset))`
- `API_PORT=$PORT`
- `DB_NAME=kithlands_<offset>`
- `DATABASE_URL=postgres://${USER}@localhost:5432/${DB_NAME}?sslmode=disable`
- `WORKTREE_OFFSET=<0-999>`

The same path always maps to the same offset.

Check the current assignment with:

```sh
echo "$WORKTREE_OFFSET $PORT $VITE_PORT $DB_NAME"
```

## 3. First-Time Setup In A New Worktree

```sh
direnv allow
cp .envrc.example .envrc.local
make setup-db
```

Notes:

- `.envrc` is committed and safe. It computes the per-worktree env.
- `.envrc.local` is gitignored. Put secrets there.
- `GEMINI_API_KEY` and similar secrets belong in `.envrc.local`.

## 4. Daily Commands

```sh
make play
make stop
make test
make test-e2e
make balance-sim
make simulate
make validate-data
make client-build
```

Useful reset:

```sh
make teardown-db && make setup-db
```

This resets only the current worktree database.

## 4.1 Managed Background Processes

For unattended agents such as OpenClaw, prefer managed background processes to
shell backgrounding.

Use these commands as the long-lived process entries:

```sh
cd server && PORT="$PORT" DATABASE_URL="$DATABASE_URL" go run ./cmd/kithlands
cd client && VITE_PORT="$VITE_PORT" API_PORT="$PORT" npx vite --host 0.0.0.0 --port "$VITE_PORT"
```

`make play` is convenient for humans. Managed processes are safer for
automation because they can be supervised and stopped explicitly.

## 5. Running Without Direnv

If direnv is unavailable:

```sh
source scripts/worktree-env.sh
make play
```

Or pass explicit values on the command line.

Without direnv, Make defaults to the shared legacy values:

- `PORT=8080`
- `VITE_PORT=3000`
- `DB_NAME=kithlands`

Use that mode carefully if multiple worktrees are active.

## 6. Logs And Process Locations

`make play` writes logs to:

- `/tmp/kithlands-server-$PORT.log`
- `/tmp/kithlands-client-$VITE_PORT.log`

Useful checks:

```sh
tail -f /tmp/kithlands-server-$PORT.log
tail -f /tmp/kithlands-client-$VITE_PORT.log
curl -fsS "http://localhost:$PORT/api/data/classes"
curl -fsS "http://localhost:$VITE_PORT" >/dev/null
```

## 7. Browser Isolation

Do not let browser automation share global profiles.

Good:

- `client/tmp/`
- worktree-local Chrome user-data dirs
- worktree-local Playwright browser caches

Bad:

- `~/.config/google-chrome`
- `~/.cache/ms-playwright`
- any implicit shared profile when multiple worktrees are active

`scripts/run_playwright_local.sh` already isolates:

- Chromium install path
- browser home/config/cache dirs
- proof screenshots under `client/tmp/`

For manual browser work, use a worktree-local user-data dir:

```sh
chromium --user-data-dir="$PWD/client/tmp/chromium-profile"
```

## 8. Worktree Creation Pattern

Always base new work on `origin/main`.

Example:

```sh
git fetch origin --prune
git worktree add -b fix/my-issue ../kithlands-my-issue origin/main
cd ../kithlands-my-issue
direnv allow
make setup-db
```

Do not branch from stale local `main` when the task explicitly needs the latest
remote base.
