# Kithlands Agent Guide

This is the operational source of truth for Codex, Claude, OpenClaw, and other
coding agents working in this repository.

Read this file first. Then read the supporting docs it points to for the task
you are actually doing.

## 1. First Session Checklist

Before making claims, plans, or code changes:

1. Read this file.
2. Read the relevant section of [docs/KITHLANDS_DESIGN.md](docs/KITHLANDS_DESIGN.md).
3. Read [docs/decisions/ADR-001-demo-cut-first.md](docs/decisions/ADR-001-demo-cut-first.md).
4. Check the current repo state with `git status --short`.
5. Verify the task against the actual code and behavior. Do not trust prior
   chat summaries, issue titles, or merged PR titles.
6. For sprite, animation, map, environment, battle presentation, menu styling,
   or other visible work, read
   [skills/kithlands-visual-production/SKILL.md](skills/kithlands-visual-production/SKILL.md).

## 2. Product Rules

These are not optional.

- The server is authoritative. Combat, progression, saves, quest state, and
  mechanics belong in Go.
- The Phaser client is a renderer and input layer. Do not move game rules into
  the client.
- All content belongs in `shared/`. Do not hardcode classes, spells, monsters,
  items, quest templates, flavors, or transportation data in Go or JS.
- The game must remain playable when the LLM is disabled. LLM output is flavor,
  never structural logic.
- Do not use browser storage for persistent game state.
- Keep the game safe for minors. Reject borderline generated content.
- Prefer maintainability over cleverness.

Design basis:

- `docs/KITHLANDS_DESIGN.md` Section 1: principles and constraints
- `docs/KITHLANDS_DESIGN.md` Section 2: structure first, LLM second
- `docs/KITHLANDS_DESIGN.md` Section 18.3: demo cut scope

## 3. Branching And Base Rules

- Keep `main` clean and playable.
- Start feature work from `origin/main`, not local `main`.
- Use git worktrees for parallel work.
- Commit and push after each coherent chunk. Do not let important work sit only
  in a dirty worktree.
- If a cherry-pick or salvage pulls unrelated files, stop and port only the
  required hunks.

See [docs/CODEX_PR_WORKFLOW.md](docs/CODEX_PR_WORKFLOW.md).

## 4. OpenClaw Execution Model

If OpenClaw or any unattended worker is used on this repo, follow these rules:

- Keep heartbeat disabled. Heartbeat is not the worker and must not choose or
  continue issues on its own.
- Use Slack DM as the control plane. Start work explicitly per issue or PR.
- Work one issue at a time.
- Stay on the active issue until one of these happens:
  1. a commit is pushed
  2. a PR is opened or updated
  3. one precise blocker is reached
- Use the single state file at
  `.openclaw/workspace/memory/projects.md` as the source of truth for:
  - active issue
  - active branch/worktree
  - derived ports
  - current blocker
  - last proof produced
  - next step
- For long-lived services, use managed background processes if the agent
  runtime supports them. Do not rely on shell backgrounding for unattended
  server/client sessions.

See [docs/CODEX_OPENCLAW_WORKFLOW.md](docs/CODEX_OPENCLAW_WORKFLOW.md).

## 5. Worktree And Port Model

This repo is set up for parallel workers.

- `scripts/worktree-env.sh` derives a deterministic per-worktree:
  - `PORT`
  - `VITE_PORT`
  - `API_PORT`
  - `DB_NAME`
  - `DATABASE_URL`
  - `WORKTREE_OFFSET`
- `.envrc` sources that script automatically when direnv is allowed.
- Secrets and local overrides belong in `.envrc.local`, never committed files.
- Browser automation must use worktree-local state under `client/tmp/` instead
  of shared global Chrome or Playwright profiles.

See [docs/CODEX_WORKTREE_GUIDE.md](docs/CODEX_WORKTREE_GUIDE.md).

## 6. Priority Order

When choosing between possible tasks, use this order:

1. active PR review comments
2. merge-conflicted or broken PRs
3. the explicitly assigned active issue
4. bug or regression issues
5. audit / cleanup issues
6. features, oldest first

Do not auto-pick a new issue if the active issue or PR is still in flight.

## 7. Required Validation

Minimum validation depends on what changed.

### Backend Or Shared Data

- `make test`
- `make validate-data` if `shared/` changed
- `make balance-sim` or `make simulate` if combat, progression, quests, or
  transport pacing changed

### Client Or Visible UX

- `cd client && npm test` or targeted `vitest` command
- `cd client && npm run build` or `make client-build`
- Run the actual screen flow for user-visible changes

### DB Or Full Integration

- `make test-e2e`

### CI-Equivalent Local Gate

The current GitHub Actions CI runs:

- `cd server && go vet ./...`
- `cd server && go build ./...`
- `cd server && go test -race ./...`
- `cd server && golangci-lint run ./...`
- `cd server && go run ./cmd/balance_sim -battles=10 -shared=../shared`
- JSON parse validation across `shared/`
- `cd server && go run ./cmd/validate_gamedata -shared=../shared`
- `cd client && npm ci`
- `cd client && npm run build`
- `cd client && npx prettier --check --ignore-path .gitignore .`

See [docs/CODEX_VALIDATION.md](docs/CODEX_VALIDATION.md).

## 8. Proof Contract

Every agent status update should report:

- issue number
- branch name
- latest pushed commit SHA
- exact commands run
- exact targeted tests run
- simulator commands if gameplay or balance changed
- browser or Playwright proof if UI or visual behavior changed
- screenshot filenames
- PR URL or one precise blocker

Proof rules:

- screenshot filenames must be unique per run
- do not reuse deterministic filenames as “progress proof”
- if OpenClaw needs to attach screenshots out-of-band, copy them to
  `~/.openclaw/workspace/tmp/` first
- visual proof is mandatory for user-visible work

## 9. Visual Verification Rules

Tests are not enough for visible work.

- Any sprite, layout, animation, menu, or rendering change needs visual
  verification before you describe it as working.
- For Playwright proof paths, inspect the screenshot output. Do not treat
  “screenshot captured” as validation.
- For generated sprite sheets, inspect the actual frames.
- Prefer running the game over reasoning from code when the change is visible.

### Character Walk Animation

The accepted walk contract and production workflow are defined in
[docs/CHARACTER_ANIMATION_PRODUCTION.md](docs/CHARACTER_ANIMATION_PRODUCTION.md).
It is authoritative over older audit notes and prompt experiments. Runtime walk
sheets are native 384x512 RGBA atlases with 64x64 cells, six animation columns,
and eight direction rows. Do not reintroduce the rejected legacy 128px,
eight-column, four-row, or full-sheet conversion paths.

Before reporting a walk change as fixed, agents must:

- enforce the six-column/eight-row contract across all twelve classes;
- run `walk-all-classes.spec.js`, `world-space-cycle.spec.js`, and
  `world-walk-audit-party.spec.js`;
- inspect `/sprites.html` and the real `/?walkAudit=1&noEncounters=1` game flow;
- use Space to cycle every class and visually inspect walking, stopping, scale,
  anchors, cropping, orientation, and continuity.

Passing automation alone is not visual acceptance. Attack sheets have their
own contract in
[docs/BATTLE_CHARACTER_ANIMATION_PRODUCTION.md](docs/BATTLE_CHARACTER_ANIMATION_PRODUCTION.md)
and are not covered by walk-sheet approval.

The local Playwright wrapper already uses worktree-local ports and browser
state:

- `./scripts/run_playwright_local.sh e2e/<spec>.spec.js`

## 10. Repo Map

- `server/`: Go backend and authoritative game logic
- `server/internal/`: combat, progression, balance, locality, inventory,
  generator, save, sprites, transport, safety
- `server/cmd/kithlands`: main server
- `server/cmd/balance_sim`: combat balance smoke command
- `server/cmd/simulate`: headless Monte Carlo campaign simulator
- `server/cmd/validate_gamedata`: semantic validation for `shared/`
- `client/src/`: Phaser client
- `client/e2e/`: Playwright proof and visual test scaffolding
- `shared/`: JSON game content and flavor data
- `docs/`: design doc, ADRs, and agent workflow docs

## 11. Supporting Docs

Use these after reading `AGENTS.md`:

- [docs/CODEX_WORKTREE_GUIDE.md](docs/CODEX_WORKTREE_GUIDE.md)
  Shared worktrees, ports, databases, direnv, and browser isolation rules for
  any agent despite the filename.
- [docs/CODEX_VALIDATION.md](docs/CODEX_VALIDATION.md)
  Shared validation matrix, CI parity, simulator usage, and Playwright proof
  flow.
- [docs/CODEX_PR_WORKFLOW.md](docs/CODEX_PR_WORKFLOW.md)
  Shared branching, commit cadence, PR expectations, review, merge, and
  cleanup.
- [docs/CODEX_OPENCLAW_WORKFLOW.md](docs/CODEX_OPENCLAW_WORKFLOW.md)
  Slack-controlled one-issue-at-a-time workflow, stop conditions, and state.
- [docs/KITHLANDS_DESIGN.md](docs/KITHLANDS_DESIGN.md)
  Product and architecture source of truth.
- [skills/kithlands-visual-production/SKILL.md](skills/kithlands-visual-production/SKILL.md)
  Repo-owned art production, no-subscription tooling, asset contracts, and
  visual acceptance gates.
- [docs/VISUAL_PRODUCTION_ROADMAP_2026-08-08.md](docs/VISUAL_PRODUCTION_ROADMAP_2026-08-08.md)
  Current visual recovery sequence, exit gates, and platform direction.
- [docs/CHARACTER_ANIMATION_PRODUCTION.md](docs/CHARACTER_ANIMATION_PRODUCTION.md)
  Accepted native walk-sheet contract, production workflow, and mandatory
  all-class visual gate.
- [docs/BATTLE_CHARACTER_ANIMATION_PRODUCTION.md](docs/BATTLE_CHARACTER_ANIMATION_PRODUCTION.md)
  Content-driven battle-state contract, attachment transforms, persistent KO,
  and battle visual acceptance gate.
- [CLAUDE.md](CLAUDE.md)
  Claude-specific guidance for direct implementation versus orchestrating
  Codex/OpenClaw.

## 12. Companion Files

- `CLAUDE.md` is a first-class Claude-facing companion guide. It should follow
  the same repo rules as `AGENTS.md` while adding Claude-specific operating
  guidance.
- `CLAUDE.local.md` is for machine-local Claude notes only. Keep it untracked
  and ignored.
- If guidance overlaps, the shared repo rules in `AGENTS.md` and the
  referenced docs still define the repo behavior.
