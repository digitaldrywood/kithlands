# Kithlands Agent Guide

This file is the operational source of truth for future AI work in this repo. It consolidates:

- repo-local instructions from `CLAUDE.md` and `CLAUDE.local.md`
- project design constraints from `docs/KITHLANDS_DESIGN.md`
- durable project memories from `~/.claude/projects/-home-loganlanou-projects-digitaldrywood-kithlands/memory/`
- current verified project status as of 2026-04-12

If this file conflicts with the GDD, ask which one should win. Do not silently override the GDD.

## 1. First Session Checklist

Before making claims, edits, or plans:

1. Read this file.
2. Read `docs/KITHLANDS_DESIGN.md` for the relevant feature section and cite section numbers when explaining decisions.
3. Read `docs/decisions/ADR-001-demo-cut-first.md`.
4. Check current repo state with `git status --short`.
5. Verify the task against actual code and behavior. Do not trust prior chat summaries, issue status, or merged PR titles.

## 2. Non-Negotiable Product Rules

These come from the GDD and project memories.

- Server-authoritative rules only. Combat, progression, saves, quest state, and other mechanics belong in Go, not the client.
- The Phaser client is a renderer/input layer. It should not decide mechanics.
- All game content belongs in `shared/`. Do not hardcode classes, spells, items, monsters, quests, or flavor content in Go or JS.
- The game must remain playable with the LLM disabled. LLM output is flavor, never structural logic.
- No `localStorage` or `sessionStorage` for persistent game state.
- The game must be safe for minors. If generated content is borderline, reject it.
- Favor maintainability over cleverness. Cory is a strong backend engineer but is not a professional game frontend specialist.

## 3. Communication Rules

- Be direct. No fluff.
- Default to action over questions.
- If you must ask something, ask one specific question.
- State assumptions at the end, not buried in the middle.
- Reference GDD sections when explaining behavior or design choices.
- Never use emoji in code, comments, or commit messages unless Cory does first.
- Do not use the words `genuinely`, `honestly`, or `straightforward`.
- Do not add time estimates to plans.

## 4. Worktree and Environment Rules

This repo is built for parallel worktrees.

- `scripts/worktree-env.sh` derives per-worktree `PORT`, `VITE_PORT`, `DB_NAME`, `DATABASE_URL`, and `WORKTREE_OFFSET`.
- `.envrc` sources that script automatically when direnv is allowed.
- Put secrets and overrides in `.envrc.local`, not committed files.
- `GEMINI_API_KEY` should live in `.envrc.local` for this worktree.
- First-time setup in a new worktree:

```sh
direnv allow
cp .envrc.example .envrc.local
make setup-db
```

- Daily commands:

```sh
make play
make stop
make test
make test-e2e
make simulate
make balance-sim
make validate-data
```

- Reset only this worktree's data with:

```sh
make teardown-db && make setup-db
```

## 5. Repo Map

- `server/`: Go backend, authoritative game logic
- `server/internal/`: core game systems
  - `balance`, `character`, `combat`, `generator`, `inventory`, `locality`, `magic`, `progression`, `safety`, `save`, `sprites`, `transport`
- `server/internal/db/migrations/`: PostgreSQL migrations
- `server/cmd/kithlands`: main server
- `server/cmd/balance_sim`: balance smoke/sim command
- `server/cmd/simulate`: Monte Carlo progression/balance regression gate
- `server/cmd/validate_gamedata`: semantic validation for `shared/`
- `client/src/`: Phaser 3 app
  - scenes include `boot`, `title`, `wizard`, `world`, `town`, `battle`, `world_menu`, `item_menu`, `options`, `character_detail`
- `client/e2e/`: Playwright visual regression scaffold
- `shared/content/`, `shared/flavors/`: JSON content and flavor data
- `docs/KITHLANDS_DESIGN.md`: product and architecture source of truth

## 6. Required Validation Before Claiming Success

Minimum validation depends on what changed.

### Backend/data changes

- `make test`
- `make validate-data` if `shared/` changed
- `make balance-sim` or `make simulate` if combat/progression/quest math changed

### Client/UI changes

- `cd client && npm test`
- `cd client && npm run build` or `make client-build`
- Run the game and verify the actual screen flow when the change is user-visible

### DB/integration changes

- `make test-e2e`

### CI-equivalent local gate

The GitHub workflow currently runs:

- `go vet ./...`
- `go build ./...`
- `go test -race ./...`
- `golangci-lint`
- `npm ci`
- `npm run build`
- `prettier --check`
- JSON parse validation across `shared/`
- `go run ./cmd/balance_sim -battles=10 -shared=../shared`
- `go run ./cmd/validate_gamedata -shared=../shared`

If GitHub Actions is blocked by billing, run the equivalent checks locally and use those results.

## 7. Visual Verification Rules

This project already shipped broken visuals because agents trusted tests and thumbnails.

- Any sprite, animation, UI, menu, or rendering change needs visual verification before it is described as working.
- For generated sprite sheets, slice the sheet into cells and inspect each cell before shipping.
- Do not trust frame-index tests to validate art correctness.
- If a feature is user-visible, prefer running the game over reasoning from code.
- The Playwright visual suite exists but is scaffolded and not yet a complete replacement for manual review.

## 8. PR and Review Rules

- Every PR must get a Codex review before merge. No exceptions.
- Workers must not self-merge.
- Do not describe a PR as ready just because local tests passed.
- If a PR changes visible UX, verify it in-game.
- If a PR was merged without review, treat that as a process failure and verify the feature directly.

For the prior interrupted session:

- PR `#161` was merged after local CI and still needed Codex review when work was interrupted.
- Treat that review as still pending until it is actually done.

## 9. Current Verified Project State

Derived from the active audit memory updated 2026-04-12.

### Verified done

- `#99`: Auto-battle + repeat-last-round
- `#101`: Inn/tent MP restore while dead members stay dead
- `#128`: Spacebar cycles overworld leader
- `#140`: Walk sprite sheets for 12 classes
- `#152`: NPC dialogue variety
- `#158`: Larger procedural building interiors
- `#159`: Hidden items with `?` proximity icon and collection persistence

### Remaining/open follow-ups

- `#132`: Per-building side quests still needs a sub-issue and implementation follow-through
- `#142` P1 follow-ups: options bar findings
- `#153` P1s: NPC save/reload determinism, blacksmith fallback
- `#155` P1: item retarget when auto-battle chooses a dead ally
- `#160` P1s: interior seed per-node not per-save, walkway validation, NPC count tuning

### History of broken/disabled work

- Walk animation previously shipped broken and was disabled because generated sheets had incorrect directional cells.
- Never assume art-related issues are fixed unless the actual sprite frames were inspected.

## 10. Engineering Constraints

- Prefer additive, small-scope changes.
- Do not write giant speculative refactors.
- Keep code/data separation clean: mechanics in Go, content in JSON, rendering/input in Phaser.
- Use ADRs in `docs/decisions/` for decisions that affect future work.
- Demo-cut-first is the active scope policy per `ADR-001`.

## 11. Existing Commands Worth Using

```sh
make play
make stop
make test
make test-e2e
make test-scripts
make test-visual
make test-visual-update
make vet
make lint
make fmt
make pre-commit
make balance-sim
make simulate
make validate-data
make client-build
```

Client-only:

```sh
cd client
npm test
npm run build
npm run test:visual
```

Server-only:

```sh
cd server
go test ./...
go test -race ./...
go run ./cmd/balance_sim
go run ./cmd/simulate -runs 100
go run ./cmd/validate_gamedata -shared=../shared
```

## 12. What Not To Do

- Do not claim a feature works because an issue is closed, a PR merged, or a test passed.
- Do not hardcode content that belongs in `shared/`.
- Do not put game rules in the client.
- Do not rely on the LLM for required gameplay behavior.
- Do not use browser storage for persistence.
- Do not delete active worktrees just because a PR merged.
- Do not restart interrupted worker work from scratch if `/resume` is available in that workflow.

## 13. Recommended Session Pattern

For most feature or bug work:

1. Read this file and the relevant GDD section.
2. Inspect the actual code paths involved.
3. Run the smallest reproduction or validation command that proves current behavior.
4. Make the minimal coherent fix.
5. Run the relevant local validation.
6. For user-visible work, run the game and verify the actual behavior.
7. Only then report status.

## 14. Source Files Behind This Guide

- `CLAUDE.md`
- `CLAUDE.local.md`
- `docs/KITHLANDS_DESIGN.md`
- `docs/decisions/ADR-001-demo-cut-first.md`
- `client/e2e/README.md`
- `~/.claude/projects/-home-loganlanou-projects-digitaldrywood-kithlands/memory/project_active_audit.md`
- `~/.claude/projects/-home-loganlanou-projects-digitaldrywood-kithlands/memory/feedback_communication.md`
- `~/.claude/projects/-home-loganlanou-projects-digitaldrywood-kithlands/memory/feedback_visual_assets.md`
- `~/.claude/projects/-home-loganlanou-projects-digitaldrywood-kithlands/memory/feedback_codex_reviews.md`
- related memory files in the same directory

Update this file when process rules change or when the verified project state changes.
