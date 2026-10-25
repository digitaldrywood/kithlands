# Integration migrations with trimmed source paths

2026-10-25 · branch `codex/battle-grounding-walk-lag` · PR #339.

The full integration gate reported `no migration files found` in API, authentication, database and save tests. This machine has `GOFLAGS=-trimpath`. The integration helper used `runtime.Caller` as an absolute filesystem path; trimmed builds record a module-relative source location instead.

A new `TestMigrationFilesResolveFromModule` regression fails against the original helper with the same error. Migration discovery now searches the working directory's ancestors for the server module and its SQL directory, returning sorted absolute paths. It does not depend on compiled source locations, change SQL, bypass migration errors or alter runtime database behavior. Per-test schema isolation and cleanup remain intact.

Verification:

- `cd server && go test -tags=integration ./internal/testutil -run TestMigrationFilesResolveFromModule -v`: failed before the fix, passes afterward under the existing `-trimpath` setting.
- `cd server && GOFLAGS='' go test -tags=integration ./internal/testutil -run TestMigrationFilesResolveFromModule -v`: passes without trimmed source paths too.
- `cd server && go vet -tags=integration ./internal/testutil`: passes.
- Full `make test-e2e`: passes, including API, auth, DB and save packages, with explicit Make overrides for a disposable `DB_NAME` and matching `DATABASE_URL`.

The disposable connection uses the existing local PostgreSQL host/user/port with only its database path replaced. The successful run used `kithlands_heron_e2e_1792940880`; Make teardown removed that database. The first failing run's separate database, `kithlands_heron_e2e_1792940632`, was also removed. Neither command targeted the live game database. API health still returns `{"status":"ok"}` and the client remains available at port 3609.

This closes the local integration migration-discovery failure. It does not resolve the separate remote second-Cure keyboard failure or provide a missing self-hosted CI runner.
