# Kithlands — AI worker orientation

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
