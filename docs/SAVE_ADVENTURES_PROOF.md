# Latest saves and adventure history — 2026-10-11

User browser feedback, tracked in draft PR #339.
Branch: `codex/battle-grounding-walk-lag`.

## Behavior

The load screen presents one latest snapshot per adventure, newest adventure first.
Manual saves and autosaves compete by `updated_at`; manual saves no longer hide a
newer autosave in a separate section. Each card identifies the save type and shows
the full local date, time (including seconds) and timezone. The newest card says
“Most recent adventure.” Autosave cards retain the latest available manual name.

Older snapshots remain available through each card's collapsed Save history.
History sorts newest first, supports native Enter/Space expansion, and scrolls
its first entry into the bounded list. Expanding it refreshes the visible Alt
shortcuts. Tab/Enter load history entries, Alt shortcuts resume latest saves,
and Escape returns to the main menu. Compact load branding gives saves more room;
shortcuts no longer stretch across the full row.

Go provides a stable `adventure_id` in save summaries, derived from the account,
locality and persistent campaign seed. Renaming a snapshot or changing party levels
cannot split its adventure. Separate campaign seeds/localities/accounts remain
separate even with identical names. Legacy rows with incomplete identity remain
separate rather than being combined by name. No migration or save deletion is
required; existing snapshots remain loadable. This changes save-list metadata and
presentation only, not the saved state, balance or gameplay rules.

## Validation

- `make test`: passes, including `TestSaveAdventureIdentity`.
- `make test-e2e`: passes against an isolated database on the worktree PostgreSQL
  instance (127.0.0.1:54706), `kithlands_save_history_1791769392`, then drops that
  test database. Environment was derived from `.envrc.local`; credentials are
  intentionally absent from proof. The first attempt used the unavailable
  default database port; the corrected worktree configuration passed.
- `cd client && npm test`: 761 tests in 85 files pass, including the mixed
  manual/autosave, separate-run and legacy-identity grouping checks.
- `cd client && npm run build`: passes (existing large-bundle warning remains).
- `cd client && npx prettier --check --ignore-path .gitignore .`: passes.
- `git diff --check`: passes.
- No shared content or gameplay/balance change; simulator is not applicable.

```sh
./scripts/run_playwright_local.sh e2e/save-adventures.spec.js e2e/title-cover.spec.js
```

Seven browser checks pass. The actual server creates eight manual saves plus a
newer autosave for one account; these collapse into one card. The tests expand
history and load a specific older save through Tab/Enter, then reload and resume
the latest snapshot via its displayed shortcut. Creating a second campaign for
the same account with the same save name yields two cards. Existing title cover,
new-game and save-load flows also pass.

After visual refinement:

```sh
./scripts/run_playwright_local.sh e2e/save-adventures.spec.js
```

Four checks pass at 1440×900, 610×837, 390×844 and 800×600. Assertions also require
the first older save to become visible and acquire its shortcut after expansion.

## Inspected screenshots

Final unique proof directory: `client/tmp/save-adventures-1791769534004/`.
Each viewport has `*-latest.png`, `*-history.png` and `*-two-adventures.png`.
Inspected the reported 610px default card, phone history, default-size history and
desktop separate-adventure view. Timestamps, latest labels, bounded history and
Back remain readable; the first older save is visible after opening history.
Earlier complete title regression proof: `client/tmp/save-adventures-1791769399853/`.
