# Kithlands

Kithlands is a procedurally generated retro JRPG built from hometown data.

- Go backend for authoritative game logic
- Phaser client for rendering and input
- JSON-driven content in `shared/`
- LLM flavor text as an optional layer, never core mechanics

## Start Here

- [AGENTS.md](AGENTS.md): root operational guide for Codex and other coding
  agents
- [docs/KITHLANDS_DESIGN.md](docs/KITHLANDS_DESIGN.md): product and
  architecture source of truth
- [docs/decisions/ADR-001-demo-cut-first.md](docs/decisions/ADR-001-demo-cut-first.md):
  current scope policy

## Codex Support Docs

- [docs/CODEX_WORKTREE_GUIDE.md](docs/CODEX_WORKTREE_GUIDE.md)
- [docs/CODEX_VALIDATION.md](docs/CODEX_VALIDATION.md)
- [docs/CODEX_PR_WORKFLOW.md](docs/CODEX_PR_WORKFLOW.md)
- [docs/CODEX_OPENCLAW_WORKFLOW.md](docs/CODEX_OPENCLAW_WORKFLOW.md)

## Quickstart

```sh
direnv allow
cp .envrc.example .envrc.local
make setup-db
make play
```

## Useful Commands

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
