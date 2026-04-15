# Kithlands — AI worker orientation

`CLAUDE.md` remains the shared Claude-facing orientation file for this repo.
For broader repo workflow, validation, and agent coordination rules, also read:

1. [AGENTS.md](AGENTS.md)
2. [docs/CODEX_WORKTREE_GUIDE.md](docs/CODEX_WORKTREE_GUIDE.md)
3. [docs/CODEX_VALIDATION.md](docs/CODEX_VALIDATION.md)
4. [docs/CODEX_PR_WORKFLOW.md](docs/CODEX_PR_WORKFLOW.md)
5. [docs/CODEX_OPENCLAW_WORKFLOW.md](docs/CODEX_OPENCLAW_WORKFLOW.md)

## Claude's Role In This Repo

Claude can operate in two different modes here:

1. direct implementation
2. orchestration of Codex or OpenClaw workers

The shared repo rules still come from `AGENTS.md` and the referenced docs. The
Claude-specific difference is who should own the feature worktree and who
should stay on the control plane.

## When Claude Is Implementing Directly

If Claude is writing code itself, it should use the same worktree rules as
Codex:

- start from `origin/main`
- use a dedicated feature worktree
- derive `PORT`, `VITE_PORT`, `DB_NAME`, and `DATABASE_URL` from
  `scripts/worktree-env.sh`
- use worktree-local browser profiles under `client/tmp/`
- run the relevant validation and proof commands before claiming success
- commit and push after each coherent chunk

In direct implementation mode, the filename `docs/CODEX_WORKTREE_GUIDE.md` is
just a historical label. Its instructions still apply to Claude.

## When Claude Is Orchestrating Codex Or OpenClaw

If Claude is coordinating another worker instead of coding directly, it should
usually stay on a clean control-plane checkout and avoid sharing a dirty
feature worktree with the worker.

Default orchestration rules:

- keep Claude on clean `main` unless Claude is explicitly taking ownership of
  code changes
- tell Codex or OpenClaw to create a fresh worktree from `origin/main`
- tell the worker to derive ports from `scripts/worktree-env.sh`
- do not have Claude and Codex edit the same dirty worktree unless that is
  explicitly intended and tightly controlled
- require the worker to report exact commands run, exact tests run, proof
  filenames, commit SHA, and PR URL or blocker
- for unattended workers, use managed background processes instead of shell
  backgrounding

This keeps Claude acting as the coordinator while Codex or OpenClaw owns the
implementation worktree, ports, browser profile, and proof artifacts.

## Recommended Handoff Pattern

When Claude is delegating issue work, the instructions should be explicit:

- issue or PR number
- fresh branch and worktree from `origin/main`
- derive ports from `scripts/worktree-env.sh`
- exact validation and proof requirements
- stop conditions:
  - commit pushed
  - PR opened or updated
  - one precise blocker

For OpenClaw-specific stop rules, state tracking, and Slack control-plane
guidance, follow `docs/CODEX_OPENCLAW_WORKFLOW.md`.

## Worktree Isolation (ports + database)

Every git worktree gets its own ports and database automatically, so multiple
workers can run `make play` and `make test-e2e` in parallel without colliding
on `:8080`, `:3000`, or the shared `kithlands` database.

### How it works

1. `scripts/worktree-env.sh` hashes `$PWD` and exports:
   - `PORT`         — Go server port (`8080 + offset`)
   - `VITE_PORT`    — Phaser client port (`3000 + offset`)
   - `API_PORT`     — alias for `PORT`, used by `vite.config.js`
   - `DB_NAME`      — `kithlands_<offset>`
   - `DATABASE_URL` — `postgres://kithlands:kithlands@localhost:5432/$DB_NAME?sslmode=disable`
   - `WORKTREE_OFFSET` — the raw offset (0–999), handy for debugging
2. `.envrc` (direnv) sources that script every time you `cd` into the worktree.
3. The `Makefile` reads `$(PORT)` / `$(VITE_PORT)` / `$(DB_NAME)` / `$(DATABASE_URL)`
   with sane `main`-branch defaults, so targets still work when direnv is not
   active (e.g. in CI).
4. `client/vite.config.js` reads `VITE_PORT` and `API_PORT` from `process.env`.

The offset is derived from the first 4 hex chars of `md5("$PWD") % 1000`, so
the same worktree path always gets the same numbers.

### First-time setup in a new worktree

```sh
direnv allow                  # authorize .envrc once per worktree
cp .envrc.example .envrc.local  # optional: add secrets (TAILSCALE_HOSTNAME, GEMINI_API_KEY, ...)
make setup-db                 # create the per-worktree database + run migrations
```

`.envrc.local` is gitignored. Put only worktree-specific overrides in it.

### Daily commands

```sh
make play        # start server + client on YOUR ports, against YOUR database
make stop        # stop them
make test        # go unit tests (no DB required)
make test-e2e    # setup-db → integration tests → teardown-db
make teardown-db # drop just YOUR database (never touches other worktrees)
```

To see what you were assigned: `echo "$PORT $VITE_PORT $DB_NAME"`.

### Resetting a worktree's data

```sh
make teardown-db && make setup-db
```

That drops and re-creates only this worktree's database. Other worktrees'
databases are untouched.

### Running without direnv

All Makefile targets default to the original single-tenant values
(`kithlands`, 8080, 3000). CI and non-direnv shells work unchanged. To opt
into isolation without direnv, `source scripts/worktree-env.sh` manually or
pass `DB_NAME=... PORT=... VITE_PORT=...` on the `make` command line.
